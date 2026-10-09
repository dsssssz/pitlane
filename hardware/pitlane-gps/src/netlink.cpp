#include "netlink.h"
#include <Arduino.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <WebServer.h>
#include <DNSServer.h>
#include <Preferences.h>
#include <WebSocketsClient.h>
#include <ArduinoJson.h>
#include <sys/time.h>
#include "certs.h"
#include "marks.h"
#include "netbuf.h"

namespace netlink {

static Preferences prefs;
static String ssid, pass, code, token;
static char devName[24] = "PITLANE-GPS", fwVer[16] = "2.0.0", bid[10] = "";
static WebServer* http = nullptr;
static DNSServer* dns = nullptr;
static bool portalOn = false, portalSaved = false;
static uint32_t portalUntil = 0, portalStopAt = 0;
static WebSocketsClient ws;
static bool wsStarted = false, wsOpen = false, gotHello = false;
static bool pairErr = false, tokenErr = false, timeSet = false;
static uint32_t lastBatch = 0, lastStatus = 0, claimAt = 0, claimBackoff = 4000;
static NetBuf buf;
static marks::Tracker tracker;
static uint8_t stRate = 0, stPct = 0, stPvt = 0, stSv = 0, stFix = 0;
static uint16_t stBatt = 0;
static char out[4096];

struct QEv { uint32_t id; uint32_t lastSend; bool used, acked; char json[192]; };
static QEv evq[12];
static uint32_t evNext = 1;

static String scanHtml;   // кэш списка сетей для формы

// ———————————————— события ————————————————
static void enqueue(const char* json, uint32_t id) {
  int slot = -1;
  for (int i = 0; i < 12; i++) if (!evq[i].used || evq[i].acked) { slot = i; break; }
  if (slot < 0) {  // очередь полна: вытесняем самое старое
    uint32_t mn = UINT32_MAX; for (int i = 0; i < 12; i++) if (evq[i].id < mn) { mn = evq[i].id; slot = i; }
  }
  QEv& q = evq[slot];
  q.id = id; q.used = true; q.acked = false; q.lastSend = 0;
  strlcpy(q.json, json, sizeof(q.json));
}
static void onEvent(const marks::Event& e) {
  char j[192], a[24];
  uint32_t id = evNext++;
  fmtI64(a, e.at);
  if (e.kind == marks::EV_LAUNCH) snprintf(j, sizeof j, "{\"e\":\"launch\",\"id\":%lu,\"at\":%s}", (unsigned long)id, a);
  else if (e.kind == marks::EV_ABORT) snprintf(j, sizeof j, "{\"e\":\"abort\",\"id\":%lu,\"at\":%s}", (unsigned long)id, a);
  else if (e.kind == marks::EV_MARK) {
    snprintf(j, sizeof j, "{\"e\":\"mark\",\"id\":%lu,\"k\":\"%s\",\"ms\":%ld,\"at\":%s}", (unsigned long)id, e.key, (long)e.ms, a);
    Serial.printf("[pitlane-gps] %s: %.2f с\n", e.key, e.ms / 1000.0);
  } else if (e.kind == marks::EV_END) {
    char m[96] = ""; size_t o = 0;
    for (int i = 0; i < marks::NGATES; i++) if (e.m[i] > 0) o += snprintf(m + o, sizeof(m) - o, "%s\"%s\":%ld", o ? "," : "", marks::GATE_KEYS[i], (long)e.m[i]);
    snprintf(j, sizeof j, "{\"e\":\"end\",\"id\":%lu,\"at\":%s,\"vmax\":%.1f,\"marks\":{%s}}", (unsigned long)id, a, e.vmax, m);
    Serial.printf("[pitlane-gps] итог: vmax %.1f км/ч\n", e.vmax);
  } else return;
  enqueue(j, id);
  if (wsOpen && gotHello) { ws.sendTXT(j); for (auto& q : evq) if (q.used && q.id == id) q.lastSend = millis(); }
}

// ———————————————— captive portal ————————————————
static String esc(const String& s) {
  String o; o.reserve(s.length() + 8);
  for (size_t i = 0; i < s.length(); i++) {
    char c = s[i];
    if (c == '<') o += "&lt;"; else if (c == '>') o += "&gt;"; else if (c == '&') o += "&amp;"; else if (c == '"') o += "&quot;"; else if (c == '\'') o += "&#39;";
    else if ((uint8_t)c < 0x20) continue; else o += c;
  }
  return o;
}
static const char PAGE_HEAD[] PROGMEM =
  "<!doctype html><html lang=ru><head><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'>"
  "<title>PITLANE GPS</title><style>body{font:16px -apple-system,system-ui,sans-serif;background:#0c0c0c;color:#f2f2f2;margin:0;padding:18px}"
  "h1{font-size:20px;letter-spacing:.12em;margin:0 0 4px}p,li{color:#a3a3a3;font-size:14px;line-height:1.45}label{display:block;margin:14px 0 6px;font-size:13px;color:#b5b5b5}"
  "input{width:100%;box-sizing:border-box;padding:12px;border-radius:12px;border:1px solid #333;background:#141414;color:#f2f2f2;font-size:16px}"
  "button{width:100%;margin-top:18px;padding:14px;border:0;border-radius:14px;background:#39FF14;color:#000;font-weight:800;font-size:16px}"
  ".st{border:1px solid #2a2a2a;border-radius:14px;padding:10px 12px;margin:12px 0}.ok{color:#39FF14}.bad{color:#ff8a7a}.sec{background:#1c1c1c;color:#f2f2f2}</style></head><body>";

static void sendPage(const String& body) {
  String html = FPSTR(PAGE_HEAD);
  html += body;
  html += "</body></html>";
  http->sendHeader("Cache-Control", "no-store");
  http->send(200, "text/html; charset=utf-8", html);
}
static void handleRoot() {
  String b = "<h1>PITLANE GPS</h1><p>" + esc(String(devName)) + " · прошивка " + esc(String(fwVer)) + "</p><div class=st>";
  b += ssid.length() ? ("Сеть: <b>" + esc(ssid) + "</b><br>") : "Сеть ещё не задана<br>";
  b += token.length() ? "<span class=ok>Чип привязан к аккаунту</span>" : (code.length() ? "Код привязки сохранён — привяжется, когда появится интернет" : "<span class=bad>Чип не привязан</span>");
  if (pairErr) b += "<br><span class=bad>Код не подошёл или истёк — получите новый в PITLANE</span>";
  if (tokenErr) b += "<br><span class=bad>Привязка отозвана — нужен новый код</span>";
  b += "</div><form method=post action=/save>"
       "<label>Имя хотспота (iPhone: Настройки → Основные → Об этом устройстве → Имя)</label>"
       "<input name=ssid list=nets autocomplete=off autocapitalize=off value=\"" + esc(ssid) + "\" required maxlength=32>"
       "<datalist id=nets>" + scanHtml + "</datalist>"
       "<label>Пароль хотспота (Режим модема → Пароль Wi-Fi)</label>"
       "<input name=pass type=password maxlength=63 placeholder='" + String(pass.length() ? "оставьте пустым, чтобы не менять" : "") + "'>"
       "<label>Код привязки из PITLANE (Замер → Внешний GPS (Wi-Fi) → «Привязать чип»)</label>"
       "<input name=code maxlength=6 autocapitalize=characters autocomplete=off placeholder='" + String(token.length() ? "не нужен — уже привязан" : "например K7P2QX") + "'>"
       "<button type=submit>Сохранить</button></form>"
       "<p>После «Сохранить» выйдите из этой сети и включите Режим модема с «Разрешать другим» и «Максимальная совместимость». "
       "Индикатор связи станет голубым, когда поток пойдёт в PITLANE.</p>";
  if (token.length()) b += "<form method=post action=/forget><button class=sec type=submit>Забыть привязку на чипе</button></form>";
  sendPage(b);
}
static void handleSave() {
  String s = http->arg("ssid"); s.trim();
  String p = http->arg("pass");
  String c = http->arg("code"); c.trim(); c.toUpperCase();
  if (!s.length() || s.length() > 32) { sendPage("<h1>Нужно имя сети</h1><p><a href=/>Назад</a></p>"); return; }
  bool codeOk = c.length() == 6;
  for (size_t i = 0; codeOk && i < c.length(); i++) { char ch = c[i]; codeOk = (ch >= 'A' && ch <= 'Z' && ch != 'I' && ch != 'O') || (ch >= '2' && ch <= '9'); }
  if (c.length() && !codeOk) { sendPage("<h1>Код — 6 символов</h1><p>Буквы и цифры из PITLANE, без I/O/0/1. <a href=/>Назад</a></p>"); return; }
  if (s != ssid || p.length()) { ssid = s; if (p.length() || s != prefs.getString("ssid", "")) pass = p; prefs.putString("ssid", ssid); prefs.putString("pass", pass); }
  if (codeOk) { code = c; prefs.putString("code", code); token = ""; prefs.remove("token"); pairErr = tokenErr = false; buf.clear(); }
  sendPage("<h1>Сохранено ✓</h1><div class=st>Сеть: <b>" + esc(ssid) + "</b>" + (codeOk ? "<br>Код: <b>" + esc(code) + "</b>" : "") + "</div>"
           "<p>1. Выйдите из сети PITLANE-GPS.<br>2. iPhone: Настройки → Режим модема → «Разрешать другим» (и «Максимальная совместимость»). Держите этот экран открытым, пока чип не подключится.<br>"
           "3. Индикатор связи: голубой мигает — Wi-Fi есть, горит — поток идёт в PITLANE.</p>");
  portalSaved = true;
  portalStopAt = millis() + 6000;
}
static void handleForget() {
  token = ""; prefs.remove("token"); code = ""; prefs.remove("code"); buf.clear();
  sendPage("<h1>Привязка забыта</h1><p>Отвяжите чип и в PITLANE (Замер → Внешний GPS (Wi-Fi)). Новый код — там же. <a href=/>Назад</a></p>");
}
static void handleRedirect() {
  http->sendHeader("Location", "http://192.168.4.1/", true);
  http->send(302, "text/plain", "");
}
static void buildScan() {
  int n = WiFi.scanComplete();
  if (n < 0) return;
  scanHtml = "";
  for (int i = 0; i < n && i < 20; i++) { String s = WiFi.SSID(i); if (s.length()) scanHtml += "<option value=\"" + esc(s) + "\">"; }
  WiFi.scanDelete();
}

void startPortal(uint32_t minutes) {
  if (portalOn) { portalUntil = minutes ? millis() + minutes * 60000UL : 0; return; }
  if (wsStarted) { ws.disconnect(); wsStarted = false; wsOpen = false; gotHello = false; buf.rewind(); }
  WiFi.disconnect(false, false);
  WiFi.mode(WIFI_AP_STA);
  WiFi.softAPConfig(IPAddress(192, 168, 4, 1), IPAddress(192, 168, 4, 1), IPAddress(255, 255, 255, 0));
  WiFi.softAP(devName, PL_AP_PASS);
  WiFi.scanNetworks(true);
  if (!dns) dns = new DNSServer();
  dns->start(53, "*", IPAddress(192, 168, 4, 1));
  if (!http) {
    http = new WebServer(80);
    http->on("/", HTTP_GET, handleRoot);
    http->on("/save", HTTP_POST, handleSave);
    http->on("/forget", HTTP_POST, handleForget);
    http->on("/hotspot-detect.html", handleRoot);   // iOS: не «Success» → открывается окно настройки
    http->on("/generate_204", handleRedirect);       // Android
    http->onNotFound(handleRedirect);
  }
  http->begin();
  portalOn = true; portalSaved = false; portalStopAt = 0;
  portalUntil = minutes ? millis() + minutes * 60000UL : 0;
  Serial.printf("[pitlane-gps] настройка Wi-Fi: сеть %s, пароль %s, http://192.168.4.1\n", devName, PL_AP_PASS);
}
static void stopPortal() {
  if (!portalOn) return;
  http->stop(); dns->stop();
  WiFi.softAPdisconnect(true);
  portalOn = false;
  WiFi.mode(WIFI_STA);
  if (ssid.length()) WiFi.begin(ssid.c_str(), pass.c_str());
  Serial.println("[pitlane-gps] настройка Wi-Fi закрыта");
}

// ———————————————— привязка ————————————————
static void tryClaim(uint32_t now) {
  if (now - claimAt < claimBackoff) return;
  claimAt = now;
  WiFiClientSecure cli; cli.setCACert(PL_CA_BUNDLE); cli.setTimeout(8);
  HTTPClient hc;
  if (!hc.begin(cli, "https://" PL_API_HOST "/gps/claim")) return;
  hc.addHeader("Content-Type", "application/json");
  char body[160];
  snprintf(body, sizeof body, "{\"code\":\"%s\",\"name\":\"%s\",\"fw\":\"%s\"}", code.c_str(), devName, fwVer);
  int st = hc.POST((uint8_t*)body, strlen(body));
  if (st == 200) {
    JsonDocument d;
    if (!deserializeJson(d, hc.getString()) && d["token"].is<const char*>()) {
      token = d["token"].as<const char*>();
      prefs.putString("token", token); prefs.remove("code"); code = "";
      pairErr = false; tokenErr = false; claimBackoff = 4000;
      Serial.println("[pitlane-gps] чип привязан к аккаунту");
    }
  } else if (st == 400 || st == 404 || st == 409) {
    pairErr = true; code = ""; prefs.remove("code");   // код не подошёл — нужен новый (через настройку)
    Serial.printf("[pitlane-gps] привязка не удалась: HTTP %d\n", st);
  } else {
    claimBackoff = min<uint32_t>(claimBackoff * 2, 60000);   // нет интернета / лимит — повторим
    Serial.printf("[pitlane-gps] привязка: нет ответа (%d), повтор через %lu с\n", st, (unsigned long)(claimBackoff / 1000));
  }
  hc.end();
}

// ———————————————— WebSocket ————————————————
static void wsEvent(WStype_t type, uint8_t* payload, size_t len) {
  if (type == WStype_CONNECTED) {
    wsOpen = true; gotHello = false;
    char j[128];
    snprintf(j, sizeof j, "{\"h\":1,\"bid\":\"%s\",\"fw\":\"%s\",\"name\":\"%s\"}", bid, fwVer, devName);
    ws.sendTXT(j);
    Serial.println("[pitlane-gps] сервер: подключено");
  } else if (type == WStype_DISCONNECTED) {
    if (wsOpen) Serial.println("[pitlane-gps] сервер: связь потеряна — копим точки в буфере");
    wsOpen = false; gotHello = false;
    buf.rewind();
    for (auto& q : evq) if (q.used && !q.acked) q.lastSend = 0;
  } else if (type == WStype_TEXT) {
    JsonDocument d;
    if (deserializeJson(d, payload, len)) return;
    if (d["err"].is<const char*>()) {
      if (strcmp(d["err"].as<const char*>(), "token") == 0) {
        tokenErr = true; token = ""; prefs.remove("token");
        ws.disconnect(); wsStarted = false; wsOpen = false;
        Serial.println("[pitlane-gps] токен отозван — привяжите чип заново");
      }
      return;
    }
    if (!d["ack"].isNull()) {
      int64_t a = d["ack"].as<int64_t>();
      if (!gotHello) { buf.onHello(a); gotHello = true; } else buf.onAck(a);
    }
    if (!d["eack"].isNull()) {
      int64_t e = d["eack"].as<int64_t>();
      for (auto& q : evq) if (q.used && (int64_t)q.id <= e) q.acked = true;
    }
  }
}
static void startWs() {
  String hdr = "Authorization: Bearer " + token;
  ws.beginSslWithCA(PL_API_HOST, 443, "/gps/ws", PL_CA_BUNDLE, "");
  ws.setExtraHeaders(hdr.c_str());
  ws.onEvent(wsEvent);
  ws.setReconnectInterval(2500);
  ws.enableHeartbeat(15000, 5000, 2);
  wsStarted = true;
}

// ———————————————— API ————————————————
void begin(const char* name, const char* fw) {
  strlcpy(devName, name, sizeof devName);
  strlcpy(fwVer, fw, sizeof fwVer);
  static const char* A = "abcdefghijklmnopqrstuvwxyz0123456789";
  for (int i = 0; i < 8; i++) bid[i] = A[esp_random() % 36];
  bid[8] = 0;
  prefs.begin("plnet", false);
  ssid = prefs.getString("ssid", ""); pass = prefs.getString("pass", "");
  code = prefs.getString("code", ""); token = prefs.getString("token", "");
  WiFi.persistent(false);
  WiFi.setHostname(devName);
  if (!ssid.length()) { startPortal(0); return; }   // первый запуск: сразу режим настройки
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.begin(ssid.c_str(), pass.c_str());
  Serial.printf("[pitlane-gps] Wi-Fi: ищем «%s»\n", ssid.c_str());
}

void onPvt(const NavPvt& p, uint32_t now) {
  int64_t t = pvtEpochMs(p);
  if (t < 0) return;   // время ещё не решено — в сеть не шлём
  if (!timeSet) { struct timeval tv{(time_t)(t / 1000), (suseconds_t)((t % 1000) * 1000)}; settimeofday(&tv, nullptr); timeSet = true; } // TLS: даты сертификатов
  uint16_t vcm = (uint16_t)min<int32_t>(max<int32_t>((p.gSpeed + 5) / 10, 0), 15000);
  bool fixOk = p.gnssFixOK && p.fixType >= 3;
  stSv = p.numSV; stFix = (p.fixType & 7) | (p.gnssFixOK ? 8 : 0);
  marks::Event ev[4];
  int n = tracker.feed(t, vcm * 0.036f, fixOk, ev, 4);
  for (int i = 0; i < n; i++) if (token.length()) onEvent(ev[i]);
  if (!token.length() || !(p.gnssFixOK && p.fixType >= 2)) return;
  NetPt q{};
  q.t = t; q.lat = p.lat; q.lon = p.lon; q.v_cms = vcm;
  q.hAcc_cm = (uint16_t)min<uint32_t>(p.hAcc / 10, 65535); q.sAcc_cms = (uint16_t)min<uint32_t>(p.sAcc / 10, 65535);
  q.numSV = p.numSV; q.fix = stFix;
  buf.push(q);
}

void setStatus(uint8_t rateHz, uint16_t battmV, uint8_t battPct, uint8_t pvtRate) { stRate = rateHz; stBatt = battmV; stPct = battPct; stPvt = pvtRate; }

void loop(uint32_t now) {
  if (portalOn) {
    dns->processNextRequest();
    http->handleClient();
    if (WiFi.scanComplete() >= 0) buildScan();
    if ((portalStopAt && now > portalStopAt) || (portalUntil && now > portalUntil && ssid.length())) stopPortal();
    return;
  }
  if (!ssid.length()) return;
  bool wifi = WiFi.status() == WL_CONNECTED;
  if (wifi && !token.length() && code.length()) tryClaim(now);
  if (wifi && token.length() && !wsStarted) startWs();
  if (wsStarted) ws.loop();
  if (!(wsOpen && gotHello)) return;
  if (now - lastBatch >= PL_BATCH_MS) {
    lastBatch = now;
    for (int k = 0; k < 4 && buf.unacked() && (buf.cursor() - buf.acked()) < 800; k++) {
      size_t l = buf.nextBatch(out, sizeof out, 40);
      if (!l) break;
      ws.sendTXT(out, l);
    }
  }
  for (auto& q : evq) if (q.used && !q.acked && now - q.lastSend > 1500) { ws.sendTXT(q.json); q.lastSend = now; }
  if (now - lastStatus >= 1000) {
    lastStatus = now;
    char j[200];
    snprintf(j, sizeof j, "{\"s\":{\"hz\":%u,\"bat\":%u,\"pct\":%u,\"sv\":%u,\"rssi\":%d,\"buf\":%lu,\"fix\":%u,\"fw\":\"%s\"}}",
             stPvt, stBatt, stPct, stSv, (int)WiFi.RSSI(), (unsigned long)buf.unacked(), stFix, fwVer);
    ws.sendTXT(j);
  }
}

Net state() {
  if (portalOn) return NET_PORTAL;
  if (!ssid.length()) return NET_OFF;
  if (pairErr || tokenErr) return NET_ERROR;
  if (WiFi.status() != WL_CONNECTED) return NET_SEARCH;
  return (wsOpen && gotHello) ? NET_ONLINE : NET_WIFI;
}
bool online() { return state() == NET_ONLINE; }
bool measuring() { return tracker.launched(); }
uint32_t bufferedPoints() { return buf.unacked(); }
uint32_t droppedPoints() { return buf.dropped(); }
const char* stateName(Net n) {
  switch (n) {
    case NET_PORTAL: return "настройка";
    case NET_SEARCH: return "ищем хотспот";
    case NET_WIFI: return "Wi-Fi, нет сервера";
    case NET_ONLINE: return "онлайн";
    case NET_ERROR: return "нужна привязка";
    default: return "выкл";
  }
}

}  // namespace netlink
