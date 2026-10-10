#!/usr/bin/env python3
"""Рендеры корпуса C (Blender Cycles). Нужны build/*.stl из check.py.  python3 render.py [hero exploded section open car]"""
import json, os, subprocess, sys, numpy as np, trimesh
HERE = os.path.dirname(os.path.abspath(__file__)); B = os.path.join(HERE, "build"); OUT = os.path.join(HERE, "renders"); os.makedirs(OUT, exist_ok=True)
F = lambda n: os.path.join(B, n + ".stl")
DM = {"d_gps_pcb": "pcb_blue", "d_gps_under": "chip", "d_gps_patch": "patch", "d_esp_tape": "foam", "d_esp_pcb": "pcb_black",
      "d_esp_usb": "metal", "d_esp_top": "chip", "d_led": "ledmod", "d_magnets": "magnet"}
HB = 13.0

def cut(name, normal=(0, 1, 0), off=0.0):
    import manifold3d as m3d
    m = trimesh.load(F(name), force="mesh"); m.merge_vertices()
    M = m3d.Manifold(m3d.Mesh(vert_properties=np.asarray(m.vertices, np.float32), tri_verts=np.asarray(m.faces, np.uint32)))
    r = M.trim_by_plane(list(normal), off).to_mesh(); dst = os.path.join(B, name + "_cut.stl")
    trimesh.Trimesh(np.asarray(r.vert_properties)[:, :3], np.asarray(r.tri_verts)).export(dst); return dst

def objs(parts=("body", "lid", "pipe"), dummies=False, off=None, cutp=False, pipe_on=True):
    off = off or {}; o = []
    for p in parts:
        o.append({"file": cut(p) if cutp else F(p), "mat": "graphite" if p != "pipe" else ("pipe" if pipe_on else "pipe_off"), "offset": off.get(p, (0, 0, 0))})
    if dummies:
        for d, m in DM.items(): o.append({"file": cut(d) if cutp else F(d), "mat": m, "offset": off.get(d, off.get("dummies", (0, 0, 0)))})
    return o

PLUG = [{"file": F("d_plug"), "mat": "plug"}]
def cable_from_plug(extra):
    return [{"points": [(-84, 0, 6.6)] + extra, "r": 2.1}]

# провода в корпусе (как на схеме): ESP-пятаки — ряды y = ±7,62, шаг 2,54 от USB (x = −31,23 + 2,54·i); GPS — пятаки у края x ≈ 0,4
def ep(row, i, z=5.6): return (-31.23 + 2.54 * i, 7.62 if row == "R" else -7.62, z)
def gp(i, z=8.4): return (0.6, -5.08 + 2.54 * i, z)
LEDP = lambda dy: (-24 + 1.2, dy, 10.2)
WIRES = [
  ("#d23a2e", ep("L", 2), gp(0)),               # 3V3 → GPS VCC (красный)
  ("#151515", ep("L", 1), gp(1)),               # GND → GPS GND (чёрный)
  ("#e3c22c", gp(2), ep("R", 6)),               # GPS TX → GPIO20 (жёлтый)
  ("#2f62c9", gp(3), ep("R", 7)),               # GPS RX ← GPIO21 (синий)
  ("#efefef", ep("L", 0), LEDP(-2.2)),          # 5V → 1N4148 → LED +5V (белый)
  ("#151515", ep("L", 1), LEDP(0)),             # GND → LED GND (чёрный)
  ("#2f9d55", ep("L", 3), LEDP(2.2)),           # GPIO4 → 330 Ом → LED DIN (зелёный)
]
def wires(lift=4.5):
    out = []
    for col, a, b in WIRES:
        mid = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, max(a[2], b[2]) + lift)
        out.append({"points": [a, (a[0], a[1], a[2] + 1.5), mid, (b[0], b[1], b[2] + 1.2), b], "r": 0.55, "color": col})
    return out

def run(name, cfg):
    cfg.setdefault("target", (0, 0, 7)); cfg["out"] = os.path.join(OUT, name)
    jf = os.path.join(B, name + ".json"); json.dump(cfg, open(jf, "w"))
    r = subprocess.run(["blender", "-b", "-P", os.path.join(HERE, "blender_scene.py"), "--", jf], capture_output=True, text=True)
    ok = os.path.exists(cfg["out"]); print(name, "OK" if ok else "FAIL")
    if not ok: print(r.stdout[-3000:], r.stderr[-2000:])

want = set(sys.argv[1:]) or {"hero", "exploded", "section", "open", "car", "top"}
if "hero" in want:
    run("C_hero_34.png", {"objects": objs() + PLUG, "cables": cable_from_plug([(-112, 0, 4), (-170, 40, 2.1), (-260, 90, 2.1)]),
        "cam": (-128, -205, 150), "target": (-4, 0, 6), "lens": 80, "exposure": -0.15})
if "top" in want:
    run("C_top.png", {"objects": objs() + PLUG, "cables": cable_from_plug([(-120, 0, 2.1), (-200, 0, 2.1)]),
        "cam": (0, -60, 330), "target": (-4, 0, 7), "lens": 85, "exposure": 0.25})
if "exploded" in want:
    off = {"lid": (0, 0, 64), "pipe": (0, 0, 40), "d_led": (0, 0, 26), "d_magnets": (0, 0, -16)}
    run("C_exploded.png", {"objects": objs(dummies=True, off=off), "cam": (-150, -255, 215), "target": (0, 0, 24), "lens": 64, "exposure": 0.45})
if "section" in want:
    run("C_section.png", {"objects": objs(dummies=True, cutp=True), "cam": (-30, -175, 70), "target": (-2, 0, 7), "lens": 70, "exposure": 0.55, "pipe_emit": 5})
if "open" in want:
    run("C_open_wiring.png", {"objects": objs(parts=("body",), dummies=True) + PLUG, "cables": wires() + cable_from_plug([(-115, 0, 3), (-170, -30, 2.1)]),
        "cam": (-40, -120, 185), "target": (-6, 0, 5), "lens": 60, "exposure": 0.5})
if "car" in want:
    tilt = 153; import math
    d = (0, -math.cos(math.radians(27)), math.sin(math.radians(27)))
    gl = lambda t: (0, 160 + d[1] * t, d[2] * t)
    props = [
      {"name": "windshield", "size": (1600, 1000, 5), "loc": gl(500), "rot": (tilt, 0, 0), "mat": "glass", "noshadow": True},
      {"name": "frit", "size": (1600, 60, 1.5), "loc": tuple(np.add(gl(30), (0, 0, 2.6))), "rot": (tilt, 0, 0), "mat": "frit", "noshadow": True},
      {"name": "phone", "size": (147.6, 71.6, 7.8), "loc": (125, -40, 3.95), "rot": (0, 0, 12), "mat": "phone", "bevel": 6},
    ]
    run("C_in_car.png", {"env": "car", "objects": objs(off={}) + PLUG, "props": props,
        "cables": cable_from_plug([(-115, 0, 3), (-190, -60, 2.1), (-330, -160, 2.1)]),
        "sun": (4.5, (48, 0, 150), "#fff2e0"), "world": "#c4d2e0", "world_strength": 1.1,
        "lights": [[(-0.3, -0.5, 0.35), 4.0, 0.8, "#ffffff"], [(0.2, -0.3, 0.25), 2.0, 0.5, "#e6eeff"]],
        "cam": (-170, -300, 150), "target": (20, 30, 6), "lens": 45, "exposure": 0.55, "dof": 4.0, "pipe_emit": 7})
