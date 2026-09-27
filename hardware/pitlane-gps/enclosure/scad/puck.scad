// PITLANE GPS — «Шайба» Ø62. OpenSCAD 2021+.
// part = assembly | body | cover | ring | plogo | pipes | dummies | dummy:<имя> ; ant = "A" | "B"
include <parts.scad>
part = "assembly"; ant = "B"; print = false; g = 0; explode = 0;
$fn = 128;

D = 62; R = D/2; WALL = 2; RIN = R - WALL;          // 31 / 29
COVER_T = 4; RING_H = 3.9;
ZR0 = COVER_T; ZB0 = ZR0 + RING_H;                   // 4 / 7.9
// слои (снизу вверх)
BAT0  = [-BAT_PUCK.x/2, -BAT_PUCK.y/2, COVER_T];     // 803040 на крышке, z 4..12
MID_Z = BAT0.z + BAT_PUCK.z + 0.5;                   // 12.5 — TP4056 и ESP32 на скотче поверх АКБ
GPS_Z = MID_Z + TP_H + 0.5 + GPS_UNDER;              // низ PCB GPS, 20.3
DIF_Z = GPS_Z + GPS_PCB + GPS_PATCH_H + 0.4;         // низ рассеивателя, 26.3
DIF_T = 3.0;
TOP_Z = DIF_Z + DIF_T;                               // низ верхней стенки, 29.3
TOP_T = 2.0;
H = TOP_Z + TOP_T;                                   // 31.3
CH = 0.8;

BOSS_RC = 26.0; BOSS_R = 2.5;
BOSSES = [for (a=[45:90:315]) [BOSS_RC*cos(a), BOSS_RC*sin(a)]];
CHORD_Y = GPS_W/2 + 0.4;                             // 12.9 — стенки кармана GPS
TP0  = [-sqrt(RIN*RIN - (TP_W/2)*(TP_W/2)) + 0.4, -TP_W/2, MID_Z]; // USB-C к стенке (-X)
ESP0 = [1 + ESP_USB_OVER, -ESP_W/2, MID_Z];
SW_Y = sqrt(RIN*RIN - (SW_L/2)*(SW_L/2)) - 0.4;      // передняя плоскость выключателя (+Y)
SW_Z = MID_Z + 0.3;
SMA_Z = GPS_Z + 3.8;                                 // ось SMA (вариант A), -Y
SMA_Y = sqrt(RIN*RIN - (SMA_NUT_D/2)*(SMA_NUT_D/2));
PIPES = [[-5,19],[0,19],[5,19]];
PIPE_FL = 1.6;
P_H = 22;

assert(WALL >= 1.6 && COVER_T - 2.2 >= 1.6 && TOP_T >= 1.6, "стенка < 1.6");

module P2d() {
  multmatrix([[1,0.18,0,0],[0,1,0,0],[0,0,1,0],[0,0,0,1]]) translate([0.5,0]) union() {
    translate([-7,-11]) square([4.2,22]);
    difference() {
      hull() { translate([-7,-1]) square([8,12]); translate([1,5]) circle(r=6); }
      hull() { translate([-2.8,3]) square([3.8,4]); translate([1,5]) circle(r=2); }
    }
  }
}
// перемычка «трафарета»: держит островок внутри петли P в верхней стенке
module P_bridge() { multmatrix([[1,0.18,0,0],[0,1,0,0],[0,0,1,0],[0,0,0,1]]) translate([0.5,0]) translate([-0.3,-2]) square([1.8,5.5]); }
module P_cut() { difference() { offset(delta=0.15) P2d(); P_bridge(); } }
module P_light() { difference() { P2d(); offset(delta=0.15) P_bridge(); } }

// ---------- корпус (боковая стенка + верх) ----------
module body() {
  difference() {
    union() {
      difference() {
        hull() { translate([0,0,ZB0]) cylinder(r=R, h=H-ZB0-CH); translate([0,0,H-0.01]) cylinder(r=R-CH, h=0.01); }
        translate([0,0,ZB0-1]) cylinder(r=RIN, h=TOP_Z-ZB0+1);
      }
      // бобышки: колонна до крышки + косынка 45° к стенке (печать верхом вниз без поддержек)
      for (a=[45:90:315]) rotate(a) {
        translate([BOSS_RC,0,ZR0]) cylinder(r=BOSS_R, h=14-ZR0, $fn=40);
        hull() {
          translate([BOSS_RC,0,ZB0+2]) cylinder(r=BOSS_R, h=14-ZB0-2, $fn=40);
          translate([28.9,-BOSS_R,ZB0+2]) cube([0.8, 2*BOSS_R, 14+(29.7-(BOSS_RC-BOSS_R))-ZB0-2]);
        }
      }
      intersection() {
        cylinder(r=RIN+0.5, h=H);
        union() {
          // стенки кармана GPS + торцевые упоры (плата вставляется снизу; патч клеится к рассеивателю скотчем 0.4 мм)
          for (s=[-1,1]) {
            translate([-R, s>0 ? CHORD_Y : -CHORD_Y-1.6, MID_Z+TP_H+0.5]) cube([D, 1.6, TOP_Z-(MID_Z+TP_H+0.5)+0.01]);
            for (sx=[-1,1]) translate([sx>0 ? GPS_L/2+0.4 : -GPS_L/2-2.0, s>0 ? CHORD_Y-1.6 : -CHORD_Y, GPS_Z]) cube([1.6, 1.6, TOP_Z-GPS_Z+0.01]);
          }
          // щёчки выключателя (+Y)
          for (sx=[-1,1]) translate([sx>0 ? SW_L/2+0.4 : -SW_L/2-2.0, SW_Y-SW_D+0.3, SW_Z-0.4]) cube([1.6, 10, TOP_Z-SW_Z+0.5]);
        }
      }
      // вариант A: плоская площадка под гайку SMA
      if (ant=="A") intersection() {
        cylinder(r=RIN+0.1, h=H);
        translate([0,-SMA_Y,SMA_Z]) rotate([90,0,0]) cylinder(d=SMA_NUT_D+1.6, h=2);
      }
    }
    for (p = BOSSES) translate([p.x, p.y, ZR0-1]) cylinder(d=M2_PILOT, h=14-ZR0, $fn=24);
    // P в верхней стенке
    translate([0,0,TOP_Z-1]) linear_extrude(TOP_T+2) P_cut();
    for (l = PIPES) translate([l.x, l.y, TOP_Z-1]) cylinder(d=3.3, h=TOP_T+2, $fn=24);
    // USB-C (-X)
    translate([-R-1, 0, MID_Z+TP_PCB+USBC.z/2]) rotate([0,90,0]) rotate(90)
      linear_extrude(WALL+3) offset(r=USB_PLUG_CUT[2]) square([USB_PLUG_CUT.x-2*USB_PLUG_CUT[2], USB_PLUG_CUT.y-2*USB_PLUG_CUT[2]], center=true);
    // паз выключателя (+Y)
    translate([-(SW_LEVER_SEC+SW_TRAVEL+1)/2, RIN-1.5, SW_Z+SW_W/2-(SW_LEVER_SEC+0.6)/2]) cube([SW_LEVER_SEC+SW_TRAVEL+1, WALL+3, SW_LEVER_SEC+0.6]);
    // SMA (-Y)
    if (ant=="A") translate([0,-SMA_Y+1,SMA_Z]) rotate([90,0,0]) linear_extrude(WALL+3)
      intersection() { circle(d=SMA_HOLE); translate([-SMA_HOLE/2,-SMA_HOLE/2]) square([SMA_FLAT, SMA_HOLE]); }
  }
}

// ---------- нижняя крышка (магнит / присоска) ----------
module cover() {
  difference() {
    union() {
      hull() { cylinder(r=R-CH, h=0.01); translate([0,0,CH]) cylinder(r=R, h=COVER_T-CH); }
      // упоры аккумулятора
      for (sx=[-1,1], sy=[-1,1]) {
        translate([sx>0 ? BAT_PUCK.x/2+0.4 : -BAT_PUCK.x/2-2.0, sy*10-2, COVER_T]) cube([1.6, 4, 3]);
        translate([sx*12-2, sy>0 ? BAT_PUCK.y/2+0.4 : -BAT_PUCK.y/2-2.0, COVER_T]) cube([4, 1.6, 3]);
      }
    }
    translate([0,0,-1]) cylinder(d=20.4, h=1+2.2);                         // магнит Ø20x2 / силиконовая присоска-диск
    for (p = BOSSES) {
      translate([p.x, p.y, -1]) cylinder(d=M2_CLR, h=COVER_T+2, $fn=24);
      translate([p.x, p.y, -0.01]) cylinder(d1=M2_CSK+0.2, d2=M2_CLR, h=(M2_CSK+0.2-M2_CLR)/2, $fn=24);
    }
  }
}

// ---------- нижнее неоновое кольцо (прозрачный PETG) ----------
module ring() {
  difference() {
    rotate_extrude($fn=160) polygon([[31,ZR0],[31,ZB0],[28.7,ZB0],[28.7,ZB0+2],[27.1,ZB0+2],[27.1,ZR0+2.5],[29,ZR0+0.6],[29,ZR0]]);
    for (a=[45:90:315]) rotate(a) translate([0,0,ZR0-1]) linear_extrude(RING_H+4)
      polygon([[0,0],[29*cos(7),-29*sin(7)],[29,-29*sin(7)],[29,29*sin(7)],[29*cos(7),29*sin(7)]]);
  }
}

// ---------- световод «P» с рассеивателем (торцевая подсветка) ----------
module plogo() {
  difference() {
    translate([-21, -GPS_W/2, DIF_Z]) cube([42, GPS_W, DIF_T]);
    for (sx=[-1,1], sy=[-1,1]) translate([sx>0 ? GPS_L/2 : -22, sy>0 ? CHORD_Y-2.0 : -CHORD_Y-0.1, DIF_Z-1]) cube([22-GPS_L/2, 2.1, DIF_T+2]);
  }
  translate([0,0,TOP_Z-0.01]) linear_extrude(TOP_T+0.01) P_light();
}

module pipes() {
  translate([0,0,TOP_Z-PIPE_FL]) linear_extrude(PIPE_FL) hull() for (l = PIPES) translate([l.x, l.y]) circle(d=4.6, $fn=32);
  for (l = PIPES) translate([l.x, l.y, TOP_Z-0.01]) cylinder(d=3.0, h=TOP_T+0.01, $fn=24);
}

DUMMIES = concat(["gps_pcb","gps_under","gps_top","tp","tp_usb","bat","esp","sw","sw_lever","leds","leds_ring","leds_p"], ant=="A" ? ["sma"] : []);
module dummy(n, g=0) {
  if (n=="gps_pcb")   gbox([-GPS_L/2, -GPS_W/2, GPS_Z], [GPS_L, GPS_W, GPS_PCB], g);
  if (n=="gps_under") gbox([-GPS_L/2+0.5, -GPS_W/2+GPS_UNDER_INSET, GPS_Z-GPS_UNDER], [GPS_L-1, GPS_W-2*GPS_UNDER_INSET, GPS_UNDER], g, false);
  if (n=="gps_top")   gbox([-GPS_L/2, -GPS_W/2, GPS_Z+GPS_PCB], [GPS_L, GPS_W, ant=="B" ? GPS_PATCH_H : GPS_TOP_A], g, false);
  if (n=="tp")        gbox(TP0, [TP_L, TP_W, TP_H-0.8], g);
  if (n=="tp_usb")    gbox([TP0.x-TP_USB_OVER, -USBC.x/2, MID_Z+TP_PCB], [USBC.y, USBC.x, USBC.z], g, false);
  if (n=="bat")       gbox(BAT0, BAT_PUCK, g);
  if (n=="esp")       gbox([ESP0.x-ESP_USB_OVER, ESP0.y, ESP0.z], [ESP_L+ESP_USB_OVER, ESP_W, ESP_H], g);
  if (n=="sw")        gbox([-SW_L/2, SW_Y-SW_D, SW_Z], [SW_L, SW_D, SW_W], g, false);
  if (n=="sw_lever")  gbox([-(SW_LEVER_SEC+SW_TRAVEL)/2, SW_Y, SW_Z+SW_W/2-SW_LEVER_SEC/2], [SW_LEVER_SEC+SW_TRAVEL, SW_LEVER, SW_LEVER_SEC], g, false);
  if (n=="leds")      for (l = PIPES) gcyl_z(l, LED_D, TOP_Z-PIPE_FL-0.4-LED_H, LED_H, g, false);
  if (n=="leds_ring") for (a=[0:90:270]) rotate(a) gbox([24.4,-4,ZR0+0.3], [1.6, 8, 3.3], g, false);
  if (n=="leds_p")    for (sx=[-1,1]) gbox([sx>0 ? 21.4 : -23.0, -3, TOP_Z-4.3], [1.6, 6, 4], g, false);
  if (n=="sma")       translate([0,-SMA_Y,SMA_Z]) rotate([-90,0,0]) rotate(30) cylinder(d=SMA_NUT_D+2*g, h=SMA_IN+g, $fn=6);
}

module place(n) {
  if (!print) children();
  else if (n=="body")  translate([0,0,H]) rotate([180,0,0]) children();
  else if (n=="ring")  translate([0,0,-ZR0]) children();
  else if (n=="plogo") translate([0,0,-DIF_Z]) children();
  else if (n=="pipes") translate([0,0,-(TOP_Z-PIPE_FL)]) children();
  else children();
}

if (part=="body")  place("body") body();
if (part=="cover") place("cover") cover();
if (part=="ring")  place("ring") ring();
if (part=="plogo") place("plogo") plogo();
if (part=="pipes") place("pipes") pipes();
if (part=="dummies") for (n = DUMMIES) dummy(n, g);
for (n = DUMMIES) if (part==str("dummy:", n)) dummy(n, g);
if (part=="assembly") {
  color("#222") translate([0,0,2*explode]) body();
  color("#222") cover();
  color("#39FF14", 0.7) translate([0,0,explode]) ring();
  color("#39FF14") translate([0,0,3*explode]) { plogo(); pipes(); }
  color("#c80") for (n = DUMMIES) dummy(n);
}
