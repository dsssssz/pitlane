#!/usr/bin/env python3
"""Схема подключения комплекта C (вид сверху, как лежит в корпусе) → pitlane-gps-kit-wiring.svg (+ .png через Chrome).
Данные — pinout.json (тот же файл сверяет test/kit.test.mjs с platformio.ini)."""
import json, os, subprocess
HERE = os.path.dirname(os.path.abspath(__file__))
P = json.load(open(os.path.join(HERE, "pinout.json")))
W = {w["n"]: w for w in P["wires"]}
FONT = "Inter, 'Inter Display', 'DejaVu Sans', Arial, sans-serif"
o = []
def add(s): o.append(s)
def text(x, y, s, size=18, w=500, fill="#1d1f24", anchor="start", extra=""):
    s = s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    add(f'<text x="{x}" y="{y}" font-size="{size}" font-weight="{w}" fill="{fill}" text-anchor="{anchor}" {extra}>{s}</text>')
def path(d, color, width=6, extra=""):
    if color.lower() in ("#efefef", "#ffffff"):   # белый провод — с тёмной окантовкой
        add(f'<path d="{d}" fill="none" stroke="#6b6f78" stroke-width="{width + 3}" stroke-linejoin="round" stroke-linecap="round"/>')
    add(f'<path d="{d}" fill="none" stroke="{color}" stroke-width="{width}" stroke-linejoin="round" stroke-linecap="round" {extra}/>')
def badge(x, y, n, color):
    tc = "#111" if color.lower() in ("#efefef", "#e3c22c") else "#fff"
    add(f'<circle cx="{x}" cy="{y}" r="15" fill="{color}" stroke="#1d1f24" stroke-width="2"/>'); text(x, y + 6, str(n), 16, 700, tc, "middle")
def pad(x, y, used=True, label=None, lx=0, ly=0, anchor="middle", size=15):
    add(f'<circle cx="{x}" cy="{y}" r="9" fill="{"#d9a441" if used else "#c9ccd2"}" stroke="#5b4a1f" stroke-width="2"/>'
        f'<circle cx="{x}" cy="{y}" r="3.2" fill="#3a2f12"/>')
    if label: text(x + lx, y + ly, label, size, 600, "#f4f5f7" if used else "#aab0ba", anchor)

add('<svg xmlns="http://www.w3.org/2000/svg" width="1700" height="1060" viewBox="0 0 1700 1060">')
add(f'<style>text{{font-family:{FONT};}}</style>')
add('<rect width="1700" height="1060" fill="#ffffff"/>')
text(40, 58, "PITLANE GPS · комплект C · схема подключения", 32, 700)
text(40, 92, "Вид сверху, как платы лежат в корпусе. Прошивка 2.1.0, env esp32c3kit. Пайка проводами прямо в пятаки, без штырей.", 18, 400, "#4a4f59")

# ---------- ESP32-C3 SuperMini ----------
add('<rect x="160" y="260" width="400" height="320" rx="14" fill="#1b1c20" stroke="#000" stroke-width="2"/>')
add('<rect x="122" y="378" width="62" height="84" rx="10" fill="#c4c8ce" stroke="#6b6f78" stroke-width="2"/>')
text(153, 425, "USB-C", 13, 700, "#2a2c31", "middle")
add('<rect x="300" y="370" width="100" height="100" rx="6" fill="#2b2c31" stroke="#45474e" stroke-width="2"/>')
text(350, 415, "ESP32-C3", 15, 600, "#cfd2d8", "middle"); text(350, 437, "SuperMini", 13, 400, "#9aa0aa", "middle")
add('<rect x="470" y="372" width="70" height="96" rx="4" fill="none" stroke="#6b6f78" stroke-width="2" stroke-dasharray="5 4"/>')
text(505, 492, "антенна", 13, 400, "#9aa0aa", "middle")
text(205, 395, "BOOT", 12, 600, "#9aa0aa"); text(205, 455, "RST", 12, 600, "#9aa0aa")
X = [202 + 45.1 * i for i in range(8)]
TOP_Y, BOT_Y = 290, 550
for i, nm in enumerate(P["esp_rows"]["right"]):
    used = nm in ("GPIO20", "GPIO21")
    pad(X[i], TOP_Y, used, nm.replace("GPIO", ""), 0, 30, "middle", 14)
for i, nm in enumerate(P["esp_rows"]["left"]):
    used = nm in ("5V", "GND", "3V3", "GPIO4")
    pad(X[i], BOT_Y, used, nm.replace("GPIO", ""), 0, -18, "middle", 14)
text(160, 222, "ESP32-C3 SuperMini · детали вверх", 15, 700, "#1d1f24")
text(160, 244, "номера пинов подписаны на обороте платы", 13, 400, "#4a4f59")

# ---------- GPS GY-GPSV3-M9N ----------
add('<rect x="900" y="200" width="640" height="444" rx="12" fill="#1c3f86" stroke="#0f2457" stroke-width="2"/>')
add('<rect x="1096" y="200" width="444" height="444" rx="8" fill="#cdbf98" stroke="#8d7f58" stroke-width="2"/>')
add('<rect x="1236" y="340" width="164" height="164" rx="8" fill="#d8ccab" stroke="#8d7f58" stroke-width="2"/>')
add('<circle cx="1318" cy="422" r="10" fill="#c4c8ce" stroke="#6b6f78" stroke-width="2"/>')
text(1318, 290, "патч-антенна 25×25", 20, 700, "#3d3523", "middle")
text(1318, 316, "ВВЕРХ · над ней ничего металлического", 16, 600, "#3d3523", "middle")
text(1318, 560, "GY-GPSV3-M9N · u-blox NEO-M9N", 18, 700, "#3d3523", "middle")
text(1318, 586, "модуль NEO-M9N и батарейка — снизу платы", 14, 500, "#5d5440", "middle")
GP = {"TX": 300, "RX": 350, "VCC": 450, "GND": 500, "PPS": 570}
for k, y in GP.items(): pad(935, y, k != "PPS", k, 22, 6, "start", 16)
text(957, GP["PPS"] + 26, "не подключать", 13, 500, "#aab0ba")

# ---------- провода ----------
def hop_v(x, y0, y1, hops):   # вертикаль с «мостиками» через горизонтали
    d = f"M{x},{y0}"
    for h in sorted(hops):
        d += f" L{x},{h - 9} A9,9 0 0 1 {x},{h + 9}"
    return d + f" L{x},{y1}"
w = W[3]; path(f"M{X[6]},{TOP_Y} L{X[6]},230 L730,230 L730,{GP['TX']} L935,{GP['TX']}", w["hex"]); badge(640, 230, 3, w["hex"])
w = W[4]; path(f"M{X[7]},{TOP_Y} L{X[7]},248 L700,248 L700,{GP['RX']} L935,{GP['RX']}", w["hex"]); badge(820, GP['RX'], 4, w["hex"])
w = W[1]; path(f"M{X[2]},{BOT_Y} L{X[2]},690 L800,690 L800,{GP['VCC']} L935,{GP['VCC']}", w["hex"]); badge(640, 690, 1, w["hex"])
w = W[2]; path(f"M{X[1]},{BOT_Y} L{X[1]},730 L840,730 L840,{GP['GND']} L935,{GP['GND']}", w["hex"]); badge(640, 730, 2, w["hex"])
add(f'<circle cx="{X[1]}" cy="730" r="7" fill="#151515"/>')
# LED (в крышке над ESP32; нарисован ниже)
LX0, LY = 170, 880
add(f'<rect x="{LX0}" y="{LY - 20}" width="200" height="120" rx="60" fill="#f2f2f2" stroke="#8a8f99" stroke-width="2"/>')
add(f'<rect x="{LX0 + 78}" y="{LY + 18}" width="44" height="44" rx="4" fill="#ffffff" stroke="#8a8f99" stroke-width="2"/>')
text(LX0 + 100, LY + 92, "", 12)
LP = {"+5V": X[0], "GND": X[1], "DOUT": X[2], "DIN": X[3]}
for k, x in LP.items(): pad(x, LY, k != "DOUT", None)
for k, x in LP.items(): text(x, LY + 32, k, 13, 700, "#1d1f24" if k != "DOUT" else "#9aa0aa", "middle")
text(LX0 + 100, LY + 132, "LED WS2812B 5050 (круглая плата Ø10)", 15, 700, "#1d1f24", "middle")
text(LX0 + 100, LY + 154, "в гнезде крышки под световодом, диодом вверх", 14, 400, "#4a4f59", "middle")
w = W[5]; path(f"M{X[0]},{BOT_Y} L{X[0]},{LY}", w["hex"]); badge(X[0] - 32, 655, 5, w["hex"])
w = W[6]; path(f"M{X[1]},730 L{X[1]},{LY}", w["hex"]); badge(X[1] + 30, 800, 6, w["hex"])
w = W[7]; path(hop_v(X[3], BOT_Y, LY, [690, 730]), w["hex"]); badge(X[3] + 30, 655, 7, w["hex"])
# диод 1N4148 на белом проводе (катод/полоска — к LED)
dx, dy = X[0], 780
add(f'<rect x="{dx - 13}" y="{dy - 26}" width="26" height="52" rx="5" fill="#e9b25a" stroke="#6b4b14" stroke-width="2"/>'
    f'<rect x="{dx - 13}" y="{dy + 12}" width="26" height="8" fill="#1d1f24"/>')
text(dx - 22, dy - 2, "1N4148", 14, 700, "#1d1f24", "end"); text(dx - 22, dy + 18, "полоска → LED", 13, 500, "#4a4f59", "end")
# резистор 330 Ом на зелёном
rx_, ry = X[3], 800
add(f'<rect x="{rx_ - 11}" y="{ry - 26}" width="22" height="52" rx="6" fill="#d9c7a3" stroke="#6b5a35" stroke-width="2"/>'
    f'<rect x="{rx_ - 11}" y="{ry - 14}" width="22" height="5" fill="#f08a24"/><rect x="{rx_ - 11}" y="{ry - 4}" width="22" height="5" fill="#f08a24"/><rect x="{rx_ - 11}" y="{ry + 6}" width="22" height="5" fill="#7a4a1d"/>')
text(rx_ + 20, ry + 6, "330 Ом", 14, 700, "#1d1f24")

# USB-C питание
add('<path d="M40,420 L112,420" stroke="#1d1f24" stroke-width="4" marker-end="url(#ar)"/>')
add('<defs><marker id="ar" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#1d1f24"/></marker></defs>')
text(40, 160, "Питание 5 В — только через USB-C платы ESP32:", 17, 700)
text(40, 184, "ЗУ в прикуриватель (порт USB-A) → кабель USB-A → USB-C", 16, 400, "#4a4f59")
text(40, 360, "к ЗУ", 14, 600, "#4a4f59")

# ---------- таблица ----------
tx, ty = 900, 690
add(f'<rect x="{tx}" y="{ty}" width="760" height="{40 + 34 * len(P["wires"])}" rx="10" fill="#f5f6f8" stroke="#d5d8de"/>')
cols = [(tx + 18, "№"), (tx + 60, "откуда"), (tx + 210, "куда"), (tx + 360, "провод"), (tx + 470, "в разрыв"), (tx + 650, "длина")]
for x, h in cols: text(x, ty + 28, h, 15, 700, "#4a4f59")
for i, w in enumerate(P["wires"]):
    y = ty + 62 + 34 * i
    add(f'<circle cx="{tx + 26}" cy="{y - 5}" r="10" fill="{w["hex"]}" stroke="#1d1f24" stroke-width="1.5"/>')
    text(tx + 26, y, str(w["n"]), 12, 700, "#111" if w["hex"] in ("#efefef", "#e3c22c") else "#fff", "middle")
    for x, s in ((tx + 60, w["from"]), (tx + 210, w["to"]), (tx + 360, w["color"]), (tx + 470, w["via"].split(" (")[0] or "—"), (tx + 650, f'~{w["len_mm"]} мм')):
        text(x, y, s, 15, 500)
# заметки
nx, ny = 460, 860
notes = ["TX и RX — накрест: TX GPS → GPIO20 (RX ESP), RX GPS ← GPIO21.",
         "GPS — от 3V3, LED — от 5V через диод. 5V на GPS не подавать.",
         "Батарейку бэкапа на плате GPS не трогать — она своя и заряжается.",
         "PPS, SDA/SCL, DOUT не подключать. Над патчем проводов нет."]
add(f'<rect x="{nx - 20}" y="{ny - 34}" width="440" height="190" rx="10" fill="#fff7e8" stroke="#e7c27a"/>')
text(nx, ny - 8, "Важно", 17, 700, "#7a4b00")
for i, s in enumerate(notes):
    words, line, lines = s.split(), "", []
    for wd in words:
        if len(line + " " + wd) > 46: lines.append(line); line = wd
        else: line = (line + " " + wd).strip()
    lines.append(line)
    for j, l in enumerate(lines): text(nx, ny + 22 + i * 36 + j * 17, ("• " if j == 0 else "  ") + l, 14, 500, "#3d2a00")
add("</svg>")
svg = "\n".join(o)
open(os.path.join(HERE, "pitlane-gps-kit-wiring.svg"), "w").write(svg)

# PNG через headless Chrome (со шрифтом Inter из enclosure/kit/fonts)
font = os.path.abspath(os.path.join(HERE, "../../enclosure/kit/fonts/InterVariable.ttf"))
html = os.path.join(HERE, "_wiring.html")
open(html, "w").write(f'<html><head><style>@font-face{{font-family:Inter;src:url("file://{font}");font-weight:100 900}}'
                      f'body{{margin:0}}</style></head><body>{svg}</body></html>')
subprocess.run(["google-chrome", "--headless=new", "--no-sandbox", "--hide-scrollbars", "--force-device-scale-factor=2",
                "--window-size=1700,1060", f"--screenshot={os.path.join(HERE, 'pitlane-gps-kit-wiring.png')}", "file://" + html],
               capture_output=True)
os.remove(html)
print("ok")
