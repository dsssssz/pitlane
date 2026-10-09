#include "netbuf.h"
#include <string.h>

size_t fmtI64(char* out, int64_t v) {
  char tmp[24]; size_t k = 0; bool neg = v < 0;
  uint64_t u = neg ? (uint64_t)(-(v + 1)) + 1 : (uint64_t)v;
  do { tmp[k++] = (char)('0' + (u % 10)); u /= 10; } while (u);
  size_t o = 0;
  if (neg) out[o++] = '-';
  while (k) out[o++] = tmp[--k];
  out[o] = 0;
  return o;
}

uint32_t NetBuf::push(const NetPt& p) {
  uint32_t seq = next++;
  ring[seq % NET_BUF_POINTS] = p;
  if (n < NET_BUF_POINTS) n++;
  else {
    int64_t gone = (int64_t)seq - NET_BUF_POINTS;   // самая старая выпала
    if (gone > ack) lost++;
  }
  clampCursor();
  return seq;
}

bool NetBuf::get(uint32_t seq, NetPt& out) const {
  if (!n || (int64_t)seq < oldest() || (int64_t)seq > newest()) return false;
  out = ring[seq % NET_BUF_POINTS];
  return true;
}

void NetBuf::clampCursor() {
  if (n && cur < oldest()) cur = oldest();
  if (cur < ack + 1) cur = ack + 1;
}

void NetBuf::onAck(int64_t seq) {
  if (seq > newest()) seq = newest();
  if (seq > ack) ack = seq;
  clampCursor();
}

void NetBuf::onHello(int64_t serverAck) {
  // сервер помнит этот запуск (bid) до serverAck; -1 — ничего. Начинаем с первого, чего у него нет.
  if (serverAck > newest()) serverAck = newest();
  ack = serverAck;
  cur = ack + 1;
  clampCursor();
}

uint32_t NetBuf::unacked() const {
  if (!n) return 0;
  int64_t from = ack + 1 > oldest() ? ack + 1 : oldest();
  return newest() >= from ? (uint32_t)(newest() - from + 1) : 0;
}

static size_t put(char* buf, size_t cap, size_t o, const char* s) {
  size_t l = strlen(s);
  if (o + l + 1 > cap) return (size_t)-1;
  memcpy(buf + o, s, l); buf[o + l] = 0;
  return o + l;
}

size_t NetBuf::nextBatch(char* buf, size_t cap, int maxPts) {
  if (!n || cur > newest()) return 0;
  NetPt first;
  if (!get((uint32_t)cur, first)) return 0;
  char num[24]; size_t o = 0;
  o = put(buf, cap, o, "{\"b\":"); if (o == (size_t)-1) return 0;
  fmtI64(num, cur); o = put(buf, cap, o, num); if (o == (size_t)-1) return 0;
  o = put(buf, cap, o, ",\"t0\":"); if (o == (size_t)-1) return 0;
  fmtI64(num, first.t); o = put(buf, cap, o, num); if (o == (size_t)-1) return 0;
  o = put(buf, cap, o, ",\"p\":["); if (o == (size_t)-1) return 0;
  int k = 0;
  int64_t s = cur;
  for (; s <= newest() && k < maxPts; s++, k++) {
    NetPt p; get((uint32_t)s, p);
    int64_t dt = p.t - first.t; if (dt < 0) dt = 0; if (dt > 60000) break;  // дыра во времени — следующей пачкой
    char row[112]; size_t r = 0;
    row[r++] = k ? ',' : '['; if (k) row[r++] = '[';
    r += fmtI64(row + r, dt); row[r++] = ',';
    r += fmtI64(row + r, p.lat); row[r++] = ',';
    r += fmtI64(row + r, p.lon); row[r++] = ',';
    r += fmtI64(row + r, p.v_cms); row[r++] = ',';
    r += fmtI64(row + r, p.hAcc_cm); row[r++] = ',';
    r += fmtI64(row + r, p.sAcc_cms); row[r++] = ',';
    r += fmtI64(row + r, p.numSV); row[r++] = ',';
    r += fmtI64(row + r, p.fix); row[r++] = ']'; row[r] = 0;
    size_t o2 = put(buf, cap, o, row);
    if (o2 == (size_t)-1) break;
    o = o2;
  }
  if (!k) return 0;
  o = put(buf, cap, o, "]}"); if (o == (size_t)-1) return 0;
  cur = s;
  return o;
}
