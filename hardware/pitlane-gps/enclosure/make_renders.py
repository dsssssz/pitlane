#!/usr/bin/env python3
"""Превью: сборка 3/4, разрез, разнесённый вид. Использует STL из build/ (их создаёт check.py)."""
import json, os, subprocess, sys, numpy as np, trimesh
HERE = os.path.dirname(os.path.abspath(__file__)); B = os.path.join(HERE, "build")
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "renders"); os.makedirs(OUT, exist_ok=True)
MATS = {
 "shell": {"color": "#111114", "rough": 0.42, "coat": 0.15},
 "neon":  {"color": "#39FF14", "rough": 0.3, "emit": 3.5},
 "neon_dim": {"color": "#39FF14", "rough": 0.3, "emit": 1.2},
 "pcb_gps": {"color": "#1d3f8c", "rough": 0.5}, "patch": {"color": "#c9b98f", "rough": 0.6},
 "pcb": {"color": "#1f6b3a", "rough": 0.5}, "pcb_tp": {"color": "#2458b0", "rough": 0.5},
 "esp": {"color": "#2a2a2e", "rough": 0.4}, "metal": {"color": "#c0c4ca", "rough": 0.25, "metal": 1},
 "bat": {"color": "#a9aeb8", "rough": 0.35, "metal": 0.6}, "gold": {"color": "#d4a53a", "rough": 0.25, "metal": 1},
 "sw": {"color": "#3a3a3a", "rough": 0.5}, "led": {"color": "#e8ffe0", "rough": 0.2, "emit": 2.0},
 "strip": {"color": "#f0f0f0", "rough": 0.4},
}
DMAT = {"gps_pcb": "pcb_gps", "gps_under": "metal", "gps_top": "patch", "tp": "pcb_tp", "tp_usb": "metal",
        "bat": "bat", "esp": "esp", "sw": "sw", "sw_lever": "sw", "leds": "led", "leds_ring": "led", "leds_p": "led",
        "sma": "gold", "strip_back": "strip", "strip_left": "strip", "strip_right": "strip", "strip_front": "strip"}
PMAT = {"body": "shell", "lid": "shell", "cover": "shell", "ring": "neon", "pipes": "neon", "plogo": "neon"}

def dummies(key):
    return [f[len(key)+7:-4] for f in sorted(os.listdir(B)) if f.startswith(key + "_dummy_")]

def section(src, dst, origin, normal):
    import manifold3d as m3d
    m = trimesh.load(src, force="mesh"); m.merge_vertices()
    M = m3d.Manifold(m3d.Mesh(vert_properties=np.asarray(m.vertices, np.float32), tri_verts=np.asarray(m.faces, np.uint32)))
    n = np.asarray(normal, float); n /= np.linalg.norm(n)
    r = M.trim_by_plane(n.tolist(), float(np.dot(n, origin))).to_mesh()
    trimesh.Trimesh(np.asarray(r.vert_properties)[:, :3], np.asarray(r.tri_verts)).export(dst); return dst

def job(name, objs, cam, target, lens=70, samples=96, exposure=0.0, floor_z=0):
    cfg = {"objects": objs, "materials": MATS, "cam": cam, "target": target, "lens": lens,
           "samples": samples, "exposure": exposure, "floor_z": floor_z, "out": os.path.join(OUT, name)}
    jf = os.path.join(B, name + ".json"); json.dump(cfg, open(jf, "w"))
    r = subprocess.run(["blender", "-b", "-P", os.path.join(HERE, "blender_render.py"), "--", jf], capture_output=True, text=True)
    ok = os.path.exists(os.path.join(OUT, name))
    print(name, "OK" if ok else "FAIL"); 
    if not ok: print(r.stdout[-2000:], r.stderr[-2000:])

def objs_for(key, parts, with_dummies=False, offsets=None, cut=None, mat_over=None):
    offsets = offsets or {}; o = []
    for p in parts:
        f = os.path.join(B, f"{key}_{p}.stl")
        if cut: f = section(f, os.path.join(B, f"{key}_{p}_cut.stl"), *cut)
        o.append({"file": f, "mat": (mat_over or {}).get(p, PMAT[p]), "offset": offsets.get(p, [0, 0, 0])})
    if with_dummies:
        for d in dummies(key):
            o.append({"file": os.path.join(B, f"{key}_dummy_{d}.stl"), "mat": DMAT[d], "offset": offsets.get("dummies", [0, 0, 0])})
    return o

only = set(sys.argv[2:])
def want(n): return not only or n in only

BOX = ["body", "ring", "lid", "pipes"]; PUCK = ["body", "cover", "ring", "plogo", "pipes"]
if want("box_A_34"):  job("box_A_assembly_34.png", objs_for("box-A", BOX), [-125, 28, 330], [0, 0, 11])
if want("box_B_34"):  job("box_B_assembly_34.png", objs_for("box-B", BOX), [-60, 38, 330], [0, 0, 11])
if want("box_B_sec"): job("box_B_section.png", objs_for("box-B", BOX, True, cut=([0, -19, 0], [0, 1, 0])), [-100, 26, 230], [0, -5, 10], exposure=0.9)
if want("box_A_exp"): job("box_A_exploded.png", objs_for("box-A", BOX, True, offsets={"ring": [0, 0, 22], "lid": [0, 0, 44], "pipes": [0, 0, 44]}), [-120, 30, 420], [0, 0, 28])
if want("puck_A_34"):  job("puck_A_assembly_34.png", objs_for("puck-A", PUCK), [-115, 28, 290], [0, 0, 14])
if want("puck_B_34"):  job("puck_B_assembly_34.png", objs_for("puck-B", PUCK), [-60, 40, 290], [0, 0, 14])
if want("puck_B_sec"): job("puck_B_section.png", objs_for("puck-B", PUCK, True, cut=([0, 0, 0], [0, 1, 0])), [-112, 22, 215], [0, 5, 15], exposure=0.9)
if want("puck_A_exp"): job("puck_A_exploded.png", objs_for("puck-A", PUCK, True, offsets={"ring": [0, 0, 14], "body": [0, 0, 30], "plogo": [0, 0, 52], "pipes": [0, 0, 52]}), [-115, 26, 400], [0, 0, 30])
