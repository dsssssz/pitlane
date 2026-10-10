// PITLANE GPS — корпус C «USB от машины» (комплект v3, прошивка env esp32c3kit).
// GNSS GY-GPSV3-M9N (NEO-M9N, патч 25×25 вверх) + ESP32-C3 SuperMini + 1 LED WS2812B под световодом.
// Габарит 76 × 46 × 15,2 мм. Печать без поддержек: основание — дном вниз, крышка — лицом вниз, световод — фланцем вниз.
//
//   openscad -o body.stl -D 'part="body"' -D print=true pitlane-gps-c.scad
//   part = body | lid | pipe | assembly | exploded | d_<болванка>   (болванки — для проверки и рендеров)
//
// Система координат: центр габарита, z = 0 — дно. +X — сторона GPS (патч), −X — сторона ESP32 и USB-C.
// [ДОП] — допущение, не из даташита: померьте свою деталь штангенциркулем и поправьте здесь.

use <fonts/InterDisplay-SemiBold.ttf>

part  = "assembly";
print = false;
$fn = 64;

/* ---------- корпус ---------- */
L   = 76;      // длина
W   = 46;      // ширина
R   = 8;       // радиус углов в плане
T   = 2.2;     // стенка
FL  = 3.0;     // дно (магниты Ø10×2 заглублены снизу, под ними остаётся 0,8)
HB  = 13.0;    // высота основания (= z нижней плоскости крышки)
TL  = 2.2;     // крышка
CH_TOP = 1.2;  // фаска верхней кромки крышки
CH_BOT = 0.8;  // фаска нижней кромки основания
SEAM   = 0.45; // фаски по шву основание/крышка (V-образный «теневой» шов)
LIP_H = 1.6; LIP_T = 1.2; LIP_GAP = 0.2;   // центрирующий буртик крышки

Li = L - 2*T; Wi = W - 2*T; Ri = R - T;

/* ---------- GNSS: GY-GPSV3-M9N ---------- */
// 36 × 25 мм (TinyTronics; у части продавцов 35 × 25), PCB 1,6 [ДОП], патч 25 × 25 × 4 (Taoglas CGGP.25.4 — типоразмер) [ДОП],
// детали снизу ≤ 3,0 (модуль NEO-M9N 2,4 max 2,6 по даташиту UBX-19014285, бэкап-батарейка) [ДОП],
// полосы по 1,6 мм вдоль длинных краёв снизу свободны (плата лежит на рейках) [ДОП].
GL = 36; GW = 25; GPCB = 1.6; GPATCH = 4.0; GUNDER = 3.0; GCLR = 0.4;
GX0 = -1.6;                       // левый (к ESP) край платы; патч — на правом конце (+X)
G_LEDGE = FL + GUNDER + 0.4;      // верх реек = низ платы (6,4)
G_TOP   = G_LEDGE + GPCB;         // верх платы (8,0)
G_PATCH0 = GX0 + GL - 25;         // патч занимает 25 мм у +X

/* ---------- ESP32-C3 SuperMini ---------- */
// PCB 22,52 × 18 (espboards.dev, даташит SuperMini), USB-C выступает за плату ~2 мм (sigmdel.ca: огибающая 24 × 18),
// PCB 1,2 [ДОП], высота USB-C над платой 3,2 [ДОП], прочие детали ≤ 1,5 [ДОП].
EL = 22.52; EW = 18; EPCB = 1.2; EUSB_H = 3.2; EUSB_W = 9.0; EUSB_OUT = 2.0; ETAPE = 0.8;
E_USB_FACE = -Li/2 + 0.2;         // торец гнезда USB-C на 0,2 мм внутри стенки
E_X0 = E_USB_FACE + EUSB_OUT;     // край платы со стороны USB
E_X1 = E_X0 + EL;
E_Z0 = FL + ETAPE;                // низ платы (на вспененном скотче 0,8)
E_Z1 = E_Z0 + EPCB;
USB_ZC = E_Z1 + EUSB_H/2;         // ось гнезда
USB_CUT = [12.8, 7.0, 2.2];       // окно под литьё штекера (типовое 12,2 × 6,5) [ДОП]

/* ---------- статусный LED + световод ---------- */
// WS2812B 5050 на круглой плате Ø10 × 3 мм (с диодом) [ДОП: бывают Ø9,5–10,2 и 2,5–3,5 мм]
LX = -24; LED_D = 10.0; LED_H = 3.0; LED_RING_R = 5.35;
SLIT = [1.6, 8.4];                // щель световода в крышке (стадион)
FLANGE = [4.6, 10.0, 1.0];        // фланец световода (стадион) в выемке крышки снизу
PIPE_FIT = 0.12;                  // посадка фланца в выемку (на сторону)

/* ---------- текст ---------- */
TXT = "PITLANE"; TX = 9; TSIZE = 4.0; TSPACE = 1.32; TDEPTH = 0.5;
FONT = "Inter Display:style=SemiBold";

/* ---------- крепёж и магниты ---------- */
PX = 31.2; PY = 17.0; POST_R = 3.0; PILOT_R = 0.95; PILOT_H = 9.0;   // саморез ST2,2×9,5 DIN 7982 (потай)
SCREW_D = 2.5; CSK_D = 4.6;
MAG = [[24, 11], [24, -11], [-24, 11], [-24, -11]]; MAG_D = 10.3; MAG_H = 2.2;   // магнит Ø10×2 N52

/* ---------- вентиляция ---------- */
VENT_W = 1.5; VENT_Z = [4.6, 9.6]; VENT_N = 13; VENT_STEP = 3.4;

/* ===================== примитивы ===================== */
module rr(l, w, r) { offset(r = r) square([l - 2*r, w - 2*r], center = true); }
module slab(l, w, r, z0, z1, cb, ct) {
  e = 0.01;
  hull() {
    translate([0, 0, z0]) linear_extrude(e) rr(l - 2*cb, w - 2*cb, r - cb);
    translate([0, 0, z0 + cb]) linear_extrude(z1 - z0 - cb - ct) rr(l, w, r);
    translate([0, 0, z1 - e]) linear_extrude(e) rr(l - 2*ct, w - 2*ct, r - ct);
  }
}
module stadium(l, w) { hull() { for (s = [-1, 1]) translate([0, s*(w/2 - l/2)]) circle(d = l); } }   // l — ширина, w — длина (по Y)
module box(p0, p1) { translate(p0) cube([p1[0]-p0[0], p1[1]-p0[1], p1[2]-p0[2]]); }

/* ===================== основание ===================== */
module body() {
  difference() {
    union() {
      difference() {
        slab(L, W, R, 0, HB, CH_BOT, SEAM);
        translate([0, 0, FL]) linear_extrude(HB) rr(Li, Wi, Ri);
      }
      // рейки GPS вдоль длинных краёв платы + боковые направляющие
      for (s = [-1, 1]) {
        box([GX0 + 1, s > 0 ? GW/2 - 1.4 : -GW/2 - GCLR - 0.8, FL - 0.01], [GX0 + GL - 1, s > 0 ? GW/2 + GCLR + 0.8 : -GW/2 + 1.4, G_LEDGE]);
        box([GX0 + 1, s > 0 ? GW/2 + GCLR : -GW/2 - GCLR - 0.8, FL - 0.01], [26, s > 0 ? GW/2 + GCLR + 0.8 : -GW/2 - GCLR, G_LEDGE + 1.2]);
        // упор платы GPS со стороны ESP
        box([GX0 - GCLR - 1.2, s > 0 ? GW/2 - 4 : -GW/2, FL - 0.01], [GX0 - GCLR, s > 0 ? GW/2 : -GW/2 + 4, G_LEDGE + 1.2]);
      }
      // карман ESP32: боковые стенки и задний упор (USB-C упирается в стенку корпуса плечами платы)
      for (s = [-1, 1]) box([E_X0 + 1, s > 0 ? EW/2 + 0.4 : -EW/2 - 1.6, FL - 0.01], [E_X1 - 3, s > 0 ? EW/2 + 1.6 : -EW/2 - 0.4, E_Z0 + 0.8]);
      box([E_X1 + 0.35, -6, FL - 0.01], [E_X1 + 1.55, 6, E_Z1 + 0.4]);
    }
    // окно USB-C: под литьё штекера, с наружной фаской
    translate([-L/2 - 1, 0, USB_ZC]) rotate([0, 90, 0]) linear_extrude(T + 2) rotate(90) rr(USB_CUT[0], USB_CUT[1], USB_CUT[2]);
    translate([-L/2 - 0.01, 0, USB_ZC]) rotate([0, 90, 0]) linear_extrude(0.6, scale = [(USB_CUT[1])/(USB_CUT[1]+1.2), (USB_CUT[0])/(USB_CUT[0]+1.2)]) rotate(90) rr(USB_CUT[0] + 1.2, USB_CUT[1] + 1.2, USB_CUT[2] + 0.6);
    // вентиляция: вертикальные щели в длинных стенках (вход снизу, выход сверху за счёт высоты щели)
    for (i = [0 : VENT_N - 1], s = [-1, 1]) {
      x = -((VENT_N - 1) * VENT_STEP)/2 + i * VENT_STEP;
      translate([x, s * (W/2 - T/2), 0]) hull() for (z = [VENT_Z[0] + VENT_W/2, VENT_Z[1] - VENT_W/2]) translate([0, 0, z]) rotate([90, 0, 0]) cylinder(d = VENT_W, h = T + 2, center = true, $fn = 24);
    }
    // магниты снизу
    for (m = MAG) translate([m[0], m[1], -0.01]) cylinder(d = MAG_D, h = MAG_H + 0.01);
    // винты снизу: сквозное + потай 90°
    for (sx = [-1, 1], sy = [-1, 1]) translate([sx*PX, sy*PY, 0]) {
      translate([0, 0, -1]) cylinder(d = SCREW_D, h = FL + 2);
      translate([0, 0, -0.01]) cylinder(d1 = CSK_D, d2 = SCREW_D - 0.1, h = (CSK_D - SCREW_D + 0.1)/2);
    }
    // надпись снизу: модель и прошивка (гравировка 0,4)
    translate([0, -5.5, -0.01]) linear_extrude(0.4) mirror([1, 0]) text("PITLANE GPS · C · esp32c3kit", size = 2.4, font = FONT, halign = "center", valign = "center");
    translate([0, 0.5, -0.01]) linear_extrude(0.4) mirror([1, 0]) text("5 V USB · NEO-M9N 25 Hz", size = 2.0, font = FONT, halign = "center", valign = "center");
  }
}

/* ===================== крышка ===================== */
module lid() {
  difference() {
    union() {
      slab(L, W, R, HB, HB + TL, SEAM, CH_TOP);
      // центрирующий буртик внутри стенок (над патчем GPS у торца +X не идёт)
      intersection() {
        translate([0, 0, HB - LIP_H]) linear_extrude(LIP_H + 0.01) difference() {
          rr(Li - 2*LIP_GAP, Wi - 2*LIP_GAP, Ri - LIP_GAP);
          rr(Li - 2*LIP_GAP - 2*LIP_T, Wi - 2*LIP_GAP - 2*LIP_T, max(0.5, Ri - LIP_GAP - LIP_T));
        }
        translate([-L/2, -W/2, 0]) cube([L/2 + 30, W, 40]);
      }
      // стойки под саморезы (доходят до дна, стягивают корпус)
      for (sx = [-1, 1], sy = [-1, 1]) translate([sx*PX, sy*PY, FL]) cylinder(r = POST_R, h = HB - FL + 0.01);
      // прижимы платы GPS по углам у края без патча (провода к пятакам идут посередине)
      for (s = [-1, 1]) box([GX0 + 0.4, s > 0 ? GW/2 - 2.6 : -GW/2 + 0.2, G_TOP + 0.4], [GX0 + 3.6, s > 0 ? GW/2 - 0.2 : -GW/2 + 2.6, HB + 0.01]);
      // прижим ESP32 сверху на корпус гнезда USB-C
      box([E_USB_FACE + 0.6, -3, E_Z1 + EUSB_H + 0.35], [E_X0 + 3.2, 3, HB + 0.01]);
      // гнездо статусного LED
      translate([LX, 0, HB - LED_H + 0.5]) difference() {
        cylinder(r = LED_RING_R + 1.0, h = LED_H - 0.5 + 0.01);
        translate([0, 0, -0.01]) cylinder(r = LED_RING_R, h = LED_H + 1);
        // прорезь под провода LED (к ESP)
        translate([0, -2.5, -0.01]) cube([LED_RING_R + 2, 5, 1.6]);
      }
    }
    // световод: щель насквозь + выемка под фланец снизу
    translate([LX, 0, HB - 0.01]) linear_extrude(TL + 1) stadium(SLIT[0] + 2*PIPE_FIT, SLIT[1] + 2*PIPE_FIT);
    translate([LX, 0, HB - 0.01]) linear_extrude(FLANGE[2] + 0.01) stadium(FLANGE[0] + 2*PIPE_FIT, FLANGE[1] + 2*PIPE_FIT);
    // тиснение (вдавленная надпись) на лицевой стороне
    translate([TX, 0, HB + TL - TDEPTH]) linear_extrude(TDEPTH + 1) text(TXT, size = TSIZE, font = FONT, halign = "center", valign = "center", spacing = TSPACE);
    // отверстия под саморезы в стойках
    for (sx = [-1, 1], sy = [-1, 1]) translate([sx*PX, sy*PY, FL - 0.01]) cylinder(r = PILOT_R, h = PILOT_H);
  }
}

/* ===================== световод (прозрачный PETG) ===================== */
module pipe() {
  translate([LX, 0, HB]) {
    linear_extrude(FLANGE[2]) stadium(FLANGE[0], FLANGE[1]);
    linear_extrude(TL - 0.02) stadium(SLIT[0], SLIT[1]);   // заподлицо с лицом крышки (−0,02)
  }
}

/* ===================== болванки электроники ===================== */
module d_gps_pcb()   box([GX0, -GW/2, G_LEDGE], [GX0 + GL, GW/2, G_TOP]);
module d_gps_under() box([GX0 + 1.8, -GW/2 + 1.8, G_LEDGE - GUNDER], [GX0 + GL - 1.8, GW/2 - 1.8, G_LEDGE]);
module d_gps_patch() box([G_PATCH0, -GW/2, G_TOP], [GX0 + GL, GW/2, G_TOP + GPATCH]);
module d_gps_pads()  box([GX0 + 0.3, -8, G_TOP], [GX0 + 4.0, 8, G_TOP + 2.2]);            // пайка + изгиб проводов
module d_esp_tape()  box([E_X0 + 2, -EW/2 + 1, FL], [E_X1 - 2, EW/2 - 1, E_Z0]);
module d_esp_pcb()   box([E_X0, -EW/2, E_Z0], [E_X1, EW/2, E_Z1]);
module d_esp_usb()   box([E_USB_FACE, -EUSB_W/2, E_Z1], [E_USB_FACE + 7.3, EUSB_W/2, E_Z1 + EUSB_H]);
module d_esp_top()   box([E_X0 + 6, -6.2, E_Z1], [E_X1 - 0.5, 6.2, E_Z1 + 1.5]);
module d_esp_wires() for (s = [-1, 1]) box([E_X0 + 1.5, s > 0 ? 6.4 : -8.8, E_Z1], [E_X1 - 0.5, s > 0 ? 8.8 : -6.4, E_Z1 + 2.6]);
module d_led()       translate([LX, 0, HB - LED_H]) cylinder(d = LED_D, h = LED_H);
module d_magnets()   for (m = MAG) translate([m[0], m[1], 0.1]) cylinder(d = 10, h = 2.0);
module d_plug()      translate([-L/2 - 0.01, 0, USB_ZC]) rotate([0, -90, 0]) {   // штекер USB-C (для рендера)
                       linear_extrude(16) rotate(90) rr(12.2, 6.5, 2.4);
                       translate([0, 0, 16]) cylinder(d = 4.2, h = 30, $fn = 32);
                     }

module dummies() {
  color("royalblue") d_gps_pcb(); color("gray") d_gps_under(); color("tan") d_gps_patch();
  color("dimgray") d_esp_pcb(); color("silver") d_esp_usb(); color("black") d_esp_top();
  color("white") d_led(); color("silver") d_magnets();
}

/* ===================== вывод ===================== */
if (part == "body") body();
else if (part == "lid") { if (print) translate([0, 0, HB + TL]) rotate([180, 0, 0]) lid(); else lid(); }
else if (part == "pipe") { if (print) translate([0, 0, -HB]) pipe(); else pipe(); }
else if (part == "assembly") { color("#2b2d31") body(); color("#2b2d31") lid(); color("white") pipe(); dummies(); }
else if (part == "exploded") { color("#2b2d31") body(); translate([0, 0, 30]) color("#2b2d31") lid(); translate([0, 0, 22]) color("white") pipe(); dummies(); }
else if (part == "d_gps_pcb") d_gps_pcb(); else if (part == "d_gps_under") d_gps_under(); else if (part == "d_gps_patch") d_gps_patch();
else if (part == "d_gps_pads") d_gps_pads(); else if (part == "d_esp_tape") d_esp_tape(); else if (part == "d_esp_pcb") d_esp_pcb();
else if (part == "d_esp_usb") d_esp_usb(); else if (part == "d_esp_top") d_esp_top(); else if (part == "d_esp_wires") d_esp_wires();
else if (part == "d_led") d_led(); else if (part == "d_magnets") d_magnets(); else if (part == "d_plug") d_plug();
