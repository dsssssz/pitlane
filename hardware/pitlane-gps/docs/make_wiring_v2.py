#!/usr/bin/env python3
"""Схема подключения PITLANE GPS v2 (коробочка, подсветка WS2812B-2020). Стиль как у pitlane-gps-wiring.png.
Выход: pitlane-gps-wiring-v2.svg + .png (cairosvg)."""
import sys, os
from html import escape as esc
W, H = 1400, 940
o = []; a = o.append
RED, GND, NEON, CYAN, AMB, ORG, PINK, VIO, WHITE = "#ff5a5a", "#9aa", "#39FF14", "#4fc3ff", "#ffc940", "#ff8a3d", "#e57", "#c9f", "#fff"
a(f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" font-family="DejaVu Sans, Arial, sans-serif">')
a('<rect width="100%" height="100%" fill="#101014"/>')
a('<text x="30" y="40" fill="#fff" font-size="22" font-weight="bold">PITLANE GPS v2 — NEO-M9N + ESP32-C3 SuperMini + TP4056 + LiPo 103040 + подсветка WS2812B-2020</text>')
def box(x, y, w, h, title, sub, color, sub2=None):
    a(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="14" fill="#1b1b22" stroke="{color}" stroke-width="3"/>')
    a(f'<text x="{x+w/2}" y="{y+30}" fill="{color}" font-size="19" font-weight="bold" text-anchor="middle">{title}</text>')
    a(f'<text x="{x+w/2}" y="{y+52}" fill="#aaa" font-size="13" text-anchor="middle">{sub}</text>')
    if sub2: a(f'<text x="{x+w/2}" y="{y+70}" fill="#aaa" font-size="13" text-anchor="middle">{sub2}</text>')
def pin(x, y, label, side, color="#ddd"):
    a(f'<circle cx="{x}" cy="{y}" r="6" fill="{color}"/>')
    tx = x+14 if side == 'r' else x-14
    a(f'<text x="{tx}" y="{y+5}" fill="#eee" font-size="15" text-anchor="{"start" if side=="r" else "end"}">{label}</text>')
def wire(pts, color, label=None, lx=None, ly=None, size=13):
    a(f'<path d="M{" L".join(f"{x},{y}" for x, y in pts)}" fill="none" stroke="{color}" stroke-width="4" stroke-linejoin="round"/>')
    if label: a(f'<text x="{lx}" y="{ly}" fill="{color}" font-size="{size}">{label}</text>')
def dot(x, y, c): a(f'<circle cx="{x}" cy="{y}" r="5" fill="{c}"/>')
def text(x, y, s, c="#aaa", size=13, anchor="start", bold=False):
    a(f'<text x="{x}" y="{y}" fill="{c}" font-size="{size}" text-anchor="{anchor}"{" font-weight=\"bold\"" if bold else ""}>{esc(s)}</text>')
def resistor_h(x0, x1, y, label, c="#ddd"):   # резистор на горизонтальном проводе
    m = (x0+x1)/2
    a(f'<rect x="{m-22}" y="{y-9}" width="44" height="18" rx="3" fill="#101014" stroke="{c}" stroke-width="2.5"/>')
    text(m, y-15, label, c, 13, "middle")

# ---------- шина VSYS (после выключателя) ----------
RAIL = 80
wire([(1300, 650), (1360, 650), (1360, RAIL), (360, RAIL)], RED)
a(f'<rect x="1130" y="{RAIL-15}" width="120" height="30" rx="6" fill="#101014" stroke="#fff" stroke-width="2"/>')
text(1190, RAIL+5, "выключатель", WHITE, 13, "middle")
text(1190, RAIL-22, "SS12D00G4 (на стенке, «O / I»)", "#aaa", 12, "middle")
text(560, RAIL-10, "VSYS = 3.0–4.2 В (OUT+ TP4056 после выключателя)", RED, 14)

# ---------- ESP32-C3 ----------
box(520, 110, 300, 425, "ESP32-C3 SuperMini", "BLE 5, USB-C (прошивка)", AMB)
for k, y in {"GPIO20 (RX)": 190, "GPIO21 (TX)": 235, "3V3": 280, "GND": 325}.items(): pin(820, y, k, 'l', AMB)
for k, y in {"5V (вход LDO)": 190, "GPIO3 (ADC)": 250, "GND": 380, "GPIO4 (данные)": 460}.items(): pin(520, y, k, 'r', AMB)
text(670, 495, "встроено: LED = GPIO8, BOOT = GPIO9", "#aaa", 13, "middle")
text(670, 513, "(BOOT коротко: 10 ↔ 25 Гц)", "#aaa", 13, "middle")
wire([(470, RAIL), (470, 190), (520, 190)], RED); dot(470, RAIL, RED)

# ---------- GNSS ----------
box(1000, 110, 300, 290, "GNSS: GY-GPSV3-M9N", "u-blox NEO-M9N, UART 3.3 В", NEON)
for k, y in {"TX": 190, "RX": 235, "VCC": 280, "GND": 325}.items(): pin(1000, y, k, 'r', NEON)
text(1150, 350, "Вариант B (основной): патч-антенна", "#6cf", 13, "middle")
text(1150, 368, "25×25 на плате, внутри корпуса", "#6cf", 13, "middle")
text(1150, 388, "Вариант A: SMA-гнездо ↔ U.FL-пигтейл", "#777", 12, "middle")
wire([(1000, 190), (820, 190)], NEON, "GPS TX → ESP RX", 850, 182)
wire([(1000, 235), (820, 235)], CYAN, "GPS RX ← ESP TX", 850, 227)
wire([(1000, 280), (820, 280)], RED, "3.3 В", 890, 272)
wire([(1000, 325), (820, 325)], GND, "GND", 895, 317)

# ---------- делитель батареи ----------
a('<rect x="380" y="200" width="120" height="100" rx="10" fill="#1b1b22" stroke="#bbb" stroke-dasharray="6 4" stroke-width="2"/>')
text(440, 220, "делитель", "#ddd", 13, "middle")
text(440, 238, "R1 100 кОм ↑", "#ddd", 12, "middle")
text(440, 256, "R2 100 кОм ↓", "#ddd", 12, "middle")
text(440, 274, "C 100 нФ ∥ R2", "#ddd", 12, "middle")
text(440, 291, "VSYS/2 ≤ 2.1 В", "#999", 11, "middle")
wire([(440, RAIL), (440, 200)], RED); dot(440, RAIL, RED)
wire([(500, 250), (520, 250)], VIO)
wire([(440, 300), (440, 380)], GND); dot(440, 380, GND)

# ---------- лента ----------
box(40, 200, 300, 650, "Лента WS2812B-2020", "5 мм, 160 LED/м, 26 LED", NEON, "одна линия данных")
pin(340, 320, "VDD (+5V)", 'l', NEON); pin(340, 380, "GND", 'l', NEON); pin(340, 460, "DIN", 'l', NEON)
wire([(360, RAIL), (360, 320), (340, 320)], RED); dot(360, RAIL, RED)
wire([(520, 380), (340, 380)], GND)
wire([(520, 460), (340, 460)], VIO)
resistor_h(380, 500, 460, "330 Ом", "#ddd")
# конденсатор 220 мкФ между VDD и GND у начала ленты
cx = 350
a(f'<line x1="{cx}" y1="320" x2="{cx}" y2="342" stroke="{RED}" stroke-width="3"/>')
a(f'<line x1="{cx-10}" y1="342" x2="{cx+10}" y2="342" stroke="#ddd" stroke-width="3"/>')
a(f'<path d="M{cx-10},352 Q{cx},346 {cx+10},352" fill="none" stroke="#ddd" stroke-width="3"/>')
a(f'<line x1="{cx}" y1="350" x2="{cx}" y2="380" stroke="{GND}" stroke-width="3"/>')
text(372, 356, "220 мкФ 10 В", "#ddd", 12)
dot(cx, 320, RED); dot(cx, 380, GND)
# цепочка
groups = [("0–2", 3, "статус под крышкой:", "GNSS · BLE · батарея", ["#39FF14", "#0040ff", "#00ff00"]),
          ("3–4", 2, "кольцо: спереди-справа", "(над TP4056)", None),
          ("5–11", 7, "кольцо: справа", "", None),
          ("12–18", 7, "кольцо: сзади", "", None),
          ("19–25", 7, "кольцо: слева", "(вариант A: 5 LED)", None)]
y = 500
text(60, y-10, "порядок в цепочке (DIN →):", "#ddd", 13)
for idx, n, t1, t2, cols in groups:
    for i in range(n):
        c = cols[i] if cols else NEON
        a(f'<rect x="{62+i*20}" y="{y}" width="14" height="14" rx="2" fill="{c}" stroke="#eee" stroke-width="1"/>')
    text(62, y+34, f"#{idx}  {t1}", "#eee", 13)
    if t2: text(62, y+51, t2, "#999", 12)
    if idx != "19–25": a(f'<path d="M{62+n*20+4},{y+7} l14,0 m-6,-5 l6,5 l-6,5" fill="none" stroke="#777" stroke-width="2"/>')
    y += 66
text(60, 842, "провода между отрезками — в открытых углах", "#777", 11)

# ---------- TP4056 + LiPo ----------
box(1000, 560, 300, 150, "TP4056 USB-C", "с защитой (DW01A + FS8205A)", ORG)
pin(1000, 610, "B+", 'r', ORG); pin(1000, 660, "B−", 'r', ORG)
pin(1300, 650, "OUT+", 'l', ORG); pin(1300, 690, "OUT−", 'l', ORG)
a('<rect x="1000" y="760" width="300" height="100" rx="12" fill="#1b1b22" stroke="#e57" stroke-width="3"/>')
text(1150, 795, "LiPo 103040, 3.7 В 1200 мА·ч", PINK, 16, "middle", True)
text(1150, 818, "с платой защиты, 10×30×40 мм", "#aaa", 13, "middle")
pin(1000, 790, "", 'r', RED); pin(1000, 830, "", 'r', GND); text(982, 782, "+", RED, 15, "middle"); text(982, 848, "−", GND, 15, "middle")
wire([(1000, 790), (960, 790), (960, 610), (1000, 610)], RED)
wire([(1000, 830), (940, 830), (940, 660), (1000, 660)], GND)
wire([(1300, 690), (1370, 690), (1370, 900), (870, 900), (870, 325)], GND); dot(870, 325, GND)
text(880, 893, "общий GND", GND, 12)

# ---------- проверка питания ----------
nx, ny = 540, 560
a(f'<rect x="{nx}" y="{ny}" width="310" height="330" rx="12" fill="#15151b" stroke="#444" stroke-width="2"/>')
lines = [("Проверка питания и уровней", WHITE, 14, True),
         ("Лента — от VSYS, не от 3V3:", "#ddd", 12, True),
         ("• WS2812B-2020: VDD 3.7–5.3 В; 3V3 мало", "#aaa", 12, False),
         ("  и перегрузит LDO платы", "#aaa", 12, False),
         ("• данные 3.3 В: VIH = 0.65·VDD = 2.73 В", "#aaa", 12, False),
         ("  при 4.2 В → сдвиг уровня не нужен", "#aaa", 12, False),
         ("• < 3.7 В лента вне спецификации: режим", "#aaa", 12, False),
         ("  «низкий заряд» — красный (Vf ~2 В)", "#aaa", 12, False),
         ("  < 3.5 В кольцо гасится прошивкой", "#aaa", 12, False),
         ("Ток (оценка по даташиту, 12 мА/канал):", "#ddd", 12, True),
         ("• неон #39FF14 на яркости 32/255:", "#aaa", 12, False),
         ("  ~2.6 мА/LED → ~60 мА на 23 LED", "#aaa", 12, False),
         ("• покой ленты ~0.6 мА × 26 ≈ 16 мА", "#aaa", 12, False),
         ("• выключатель SS12D00 — до 0.3–0.5 А ✓", "#aaa", 12, False),
         ("Делитель от VSYS: в выкл. АКБ не тратит", "#ddd", 12, True),
         ("ADC_11db: 2.1 В < 2.5 В диапазона ✓", "#aaa", 12, False)]
yy = ny + 26
for s, c, sz, b in lines:
    text(nx+14, yy, s, c, sz, "start", b); yy += 19
a('</svg>')
svg = "\n".join(o)
out = sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(os.path.abspath(__file__))
open(os.path.join(out, "pitlane-gps-wiring-v2.svg"), "w").write(svg)
import cairosvg
cairosvg.svg2png(bytestring=svg.encode(), write_to=os.path.join(out, "pitlane-gps-wiring-v2.png"), output_width=W, output_height=H)
print("ok")
