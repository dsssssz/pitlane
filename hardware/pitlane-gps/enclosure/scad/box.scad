// PITLANE GPS — «Коробочка» ~70x70x25. OpenSCAD 2021+.
// part = assembly | body | lid | ring | pipes | dummies | dummy:<имя> ; ant = "A" (SMA) | "B" (патч внутри)
// print = true -> деталь повёрнута в положение для печати
include <parts.scad>
part = "assembly"; ant = "B"; print = false; g = 0; explode = 0;
$fn = 64;

BX = 70; BR = 6; WALL = 2; FLOOR = 2;
HB = 20; RING_H = 3; LID_T = 2; H = HB + RING_H + LID_T;   // 25
IN = BX - 2*WALL; IR = BR - WALL;                           // 66, r4
SK_T = 1.6; SK_GAP = 0.3; SK_BOT = 18; RING_IN = WALL + SK_GAP + SK_T; // 3.9
BOSS_C = 30.6; BOSS_R = 2.5;
BOSSES = [for (sx=[-1,1], sy=[-1,1]) [sx*BOSS_C, sy*BOSS_C]];
LOGO_H = 0.8;
PIPE_FL = 1.6; // буртик световодов
CH = 0.8; // фаска

assert(WALL >= 1.6 && FLOOR >= 1.6 && LID_T >= 1.6 && SK_T >= 1.6, "стенка < 1.6");
assert(WALL <= SMA_PANEL_MAX, "стенка толще, чем допускает SMA");

// ---------- размещение деталей ----------
GPS0  = [-27.7, -31.5, FLOOR + 0.5 + GPS_UNDER];   // низ PCB, z=5.5
TP0   = [10.7, -32.6, FLOOR + 2];                  // низ PCB, z=4
TP_USB_X = TP0.x + TP_W/2;
TP_USB_Z = TP0.z + TP_PCB + USBC.z/2;
BAT0  = [-26, -4.2, FLOOR];
ESP0  = [-6, 5, BAT0.z + BAT_BOX.z + 0.5];
SW0   = [-IN/2 + 0.4, 9.6, 13.0];                  // корпус выключателя: x от стенки внутрь
SW_C  = [SW0.y + SW_L/2, SW0.z + SW_W/2];          // (y,z) центр рычага
SMA_C = [-19, 15];                                 // (y,z) на левой стенке
LEDS  = [[14,-22],[19,-22],[24,-22]];
STRIP_OFF = RING_IN + 0.4; STRIP_Z = 17.6;

module rr(s, r) { offset(r=r) square([s-2*r, s-2*r], center=true); }
module slab(s, r, z0, h) { translate([0,0,z0]) linear_extrude(h) rr(s, r); }
module rbox(c, s, r) { translate(c) linear_extrude(s.z) offset(r=r) square([s.x-2*r, s.y-2*r], center=true); }

// ---------- корпус ----------
module body() {
  difference() {
    union() {
      difference() {
        hull() { slab(BX-2*CH, BR-CH, 0, 0.01); slab(BX, BR, CH, HB-CH); }
        slab(IN, IR, FLOOR, HB);
      }
      for (p = BOSSES) translate([p.x, p.y, 0]) cylinder(r=BOSS_R, h=HB);
      // GPS: опорные рейки под длинными краями и упоры по торцам
      translate([GPS0.x+0.6, -IN/2, 0]) cube([GPS_L-1.2, (GPS0.y+GPS_UNDER_INSET-0.4)-(-IN/2), GPS0.z]);
      translate([GPS0.x+0.6, GPS0.y+GPS_W-1.6, 0]) cube([GPS_L-1.2, 1.6, GPS0.z]);
      translate([GPS0.x-0.4-1.6, GPS0.y+2.5, 0]) cube([1.6, GPS_W-5, 8.5]);
      translate([GPS0.x+GPS_L+0.4, GPS0.y+2.5, 0]) cube([1.6, GPS_W-5, 8.5]);
      // TP4056: рёбра и задний упор (держит от нажима вилки)
      for (x = [TP0.x, TP0.x+TP_W-1.6]) translate([x, TP0.y+0.4, 0]) cube([1.6, TP_L-2.4, TP0.z]);
      translate([TP0.x+2.7, TP0.y+TP_L+0.4, 0]) cube([TP_W-5.4, 1.6, 7]);
      // выключатель: опорный блок и щёчки
      translate([-IN/2-0.1, SW0.y-0.4, 0]) cube([(BAT0.x-0.4)-(-IN/2-0.1), SW_L+0.8, SW0.z-0.4]);
      for (y = [SW0.y-0.4-1.6, SW0.y+SW_L+0.4]) translate([-IN/2-0.1, y, 0]) cube([5.1, 1.6, 17.0]);
    }
    // отверстия под саморезы M2 в бобышках
    for (p = BOSSES) translate([p.x, p.y, FLOOR+1]) cylinder(d=M2_PILOT, h=HB, $fn=24);
    // окно USB-C (под корпус вилки), передняя стенка
    translate([TP_USB_X, -BX/2-1, TP_USB_Z]) rotate([-90,0,0])
      linear_extrude(WALL+2) offset(r=USB_PLUG_CUT[2]) square([USB_PLUG_CUT.x-2*USB_PLUG_CUT[2], USB_PLUG_CUT.y-2*USB_PLUG_CUT[2]], center=true);
    // паз рычага выключателя, левая стенка
    translate([-BX/2-1, SW_C[0]-(SW_LEVER_SEC+SW_TRAVEL+1)/2, SW_C[1]-(SW_LEVER_SEC+0.6)/2])
      cube([WALL+2, SW_LEVER_SEC+SW_TRAVEL+1, SW_LEVER_SEC+0.6]);
    // вариант A: SMA-гнездо, левая стенка (Ø6.5 с лыской 6.0)
    if (ant == "A") translate([-BX/2-1, SMA_C[0], SMA_C[1]]) rotate([0,90,0])
      linear_extrude(WALL+2) intersection() { circle(d=SMA_HOLE); translate([-SMA_HOLE/2, -SMA_HOLE/2]) square([SMA_FLAT, SMA_HOLE]); }
  }
}

// ---------- световодное кольцо (прозрачный PETG) ----------
module ring() {
  difference() {
    union() {
      translate([0,0,HB]) linear_extrude(RING_H) difference() { rr(BX, BR); rr(BX-2*RING_IN, BR-RING_IN); }
      difference() {
        translate([0,0,SK_BOT]) linear_extrude(HB-SK_BOT+0.01) difference() { rr(BX-2*(WALL+SK_GAP), BR-WALL-SK_GAP); rr(BX-2*RING_IN, BR-RING_IN); }
        for (sx=[-1,1], sy=[-1,1]) translate([sx>0 ? 26.5 : -BX/2-1, sy>0 ? 26.5 : -BX/2-1, SK_BOT-1]) cube([BX/2-26.5+1, BX/2-26.5+1, HB-SK_BOT+1]);
        translate([-BX/2, SMA_C[0]-5.5, SK_BOT-1]) cube([10, 11, HB-SK_BOT+1]);   // проход гайки SMA
      }
      for (p = BOSSES) translate([p.x, p.y, HB]) cylinder(r=2.8, h=RING_H);
    }
    for (p = BOSSES) translate([p.x, p.y, HB-1]) cylinder(d=M2_CLR, h=RING_H+2, $fn=24);
  }
}

// ---------- крышка ----------
module logo2d() {
  translate([0, 6]) text("PITLANE", size=8.2, font="Liberation Sans:style=Bold Italic", halign="center", valign="center");
  translate([0, -4.5]) text("GPS", size=4, font="Liberation Sans:style=Bold Italic", halign="center", valign="center", spacing=1.3);
  for (i=[0:2]) translate([-24+i*1.5, -0.4-i*1.6]) square([12-i*3, 0.9]);          // «линии скорости»
  for (i=[0:2]) translate([12+i*1.5, -0.4-i*1.6]) square([12-i*3, 0.9]);
}
module lid() {
  z0 = HB + RING_H;
  difference() {
    union() {
      hull() { slab(BX, BR, z0, LID_T-0.6); slab(BX-1.2, BR-0.6, z0+LID_T-0.01, 0.01); }
      translate([0,0,z0+LID_T-0.01]) linear_extrude(LOGO_H+0.01) logo2d();
    }
    for (p = BOSSES) {
      translate([p.x, p.y, z0-1]) cylinder(d=M2_CLR, h=LID_T+2, $fn=24);
      translate([p.x, p.y, z0+LID_T-(M2_CSK-M2_CLR)/2]) cylinder(d1=M2_CLR, d2=M2_CSK, h=(M2_CSK-M2_CLR)/2+0.01, $fn=24);
    }
    for (l = LEDS) translate([l.x, l.y, z0-1]) cylinder(d=3.3, h=LID_T+2, $fn=24);
  }
}

// ---------- световоды светодиодов статуса ----------
module pipes() {
  z0 = HB + RING_H;
  translate([0,0,z0-PIPE_FL]) linear_extrude(PIPE_FL) hull() for (l = LEDS) translate([l.x, l.y]) circle(d=4.6, $fn=32);
  for (l = LEDS) translate([l.x, l.y, z0-0.01]) cylinder(d=3.0, h=LID_T+0.01, $fn=24);
}

// ---------- болванки ----------
DUMMIES = concat(["gps_pcb","gps_under","gps_top","tp","tp_usb","bat","esp","sw","sw_lever","leds",
                  "strip_back","strip_left","strip_right","strip_front"], ant=="A" ? ["sma"] : []);
module dummy(n, g=0) {
  if (n=="gps_pcb")   gbox(GPS0, [GPS_L, GPS_W, GPS_PCB], g);
  if (n=="gps_under") gbox([GPS0.x+0.5, GPS0.y+GPS_UNDER_INSET, GPS0.z-GPS_UNDER], [GPS_L-1, GPS_W-2*GPS_UNDER_INSET, GPS_UNDER], g, false);
  if (n=="gps_top")   gbox([GPS0.x, GPS0.y, GPS0.z+GPS_PCB], [GPS_L, GPS_W, ant=="B" ? GPS_PATCH_H : GPS_TOP_A], g, false);
  if (n=="tp")        gbox(TP0, [TP_W, TP_L, TP_H-0.8], g);
  if (n=="tp_usb")    gbox([TP_USB_X-USBC.x/2, TP0.y-TP_USB_OVER, TP0.z+TP_PCB], [USBC.x, USBC.y, USBC.z], g, false);
  if (n=="bat")       gbox(BAT0, BAT_BOX, g);
  if (n=="esp")       gbox([ESP0.x-ESP_USB_OVER, ESP0.y, ESP0.z], [ESP_L+ESP_USB_OVER, ESP_W, ESP_H], g, false);
  if (n=="sw")        gbox(SW0, [SW_D, SW_L, SW_W], g, false);
  if (n=="sw_lever")  gbox([SW0.x-SW_LEVER, SW_C[0]-(SW_LEVER_SEC+SW_TRAVEL)/2, SW_C[1]-SW_LEVER_SEC/2], [SW_LEVER, SW_LEVER_SEC+SW_TRAVEL, SW_LEVER_SEC], g, false);
  if (n=="leds")      for (l = LEDS) gcyl_z(l, LED_D, HB+RING_H-PIPE_FL-0.4-LED_H, LED_H, g, false);
  if (n=="sma")       translate([-IN/2, SMA_C[0], SMA_C[1]]) rotate([0,90,0]) cylinder(d=SMA_NUT_D+2*g, h=SMA_IN+g, $fn=6);
  // лента: 4 отрезка по периметру, в варианте B над платой GPS ленты нет
  if (n=="strip_back")  gbox([-24, BX/2-STRIP_OFF-STRIP_T, STRIP_Z], [48, STRIP_T, STRIP_W], g, false);
  if (n=="strip_right") gbox([BX/2-STRIP_OFF-STRIP_T, -24, STRIP_Z], [STRIP_T, 48, STRIP_W], g, false);
  if (n=="strip_left")  gbox([-BX/2+STRIP_OFF, ant=="A" ? -12.5 : -24, STRIP_Z], [STRIP_T, ant=="A" ? 36.5 : 48, STRIP_W], g, false);
  if (n=="strip_front") gbox([ant=="A" ? -24 : 9, -BX/2+STRIP_OFF, STRIP_Z], [ant=="A" ? 48 : 15, STRIP_T, STRIP_W], g, false);
}

module place(n) {
  if (!print) children();
  else if (n=="lid")   translate([0,0,-(HB+RING_H)]) children();
  else if (n=="ring")  translate([0,0,HB+RING_H]) rotate([180,0,0]) children();
  else if (n=="pipes") translate([0,0,-(HB+RING_H-PIPE_FL)]) children();
  else children();
}

if (part=="body")  place("body") body();
if (part=="lid")   place("lid") lid();
if (part=="ring")  place("ring") ring();
if (part=="pipes") place("pipes") pipes();
if (part=="dummies") for (n = DUMMIES) dummy(n, g);
for (n = DUMMIES) if (part==str("dummy:", n)) dummy(n, g);
if (part=="assembly") {
  color("#222") body();
  color("#39FF14", 0.7) translate([0,0,explode]) ring();
  color("#222") translate([0,0,2*explode]) lid();
  color("#39FF14") translate([0,0,2*explode]) pipes();
  color("#c80") for (n = DUMMIES) dummy(n);
}
