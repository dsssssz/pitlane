#!/usr/bin/env python3
"""Корпус C: экспорт STL/3MF, проверка манифолдности, коллизий с болванками плат, нависаний при печати, толщины стенок.
   python3 check.py            → build/*.stl, stl/*.stl (под печать), 3mf/*.3mf, check_report.json
   Нужны: openscad, pip install trimesh manifold3d numpy (rtree для ray-теста толщины)."""
import json, os, subprocess, sys, numpy as np, trimesh, manifold3d as m3d
HERE = os.path.dirname(os.path.abspath(__file__)); B = os.path.join(HERE, "build"); os.makedirs(B, exist_ok=True)
SCAD = os.path.join(HERE, "pitlane-gps-c.scad")
PARTS = ["body", "lid", "pipe"]
DUMMIES = ["d_gps_pcb", "d_gps_under", "d_gps_patch", "d_gps_pads", "d_esp_tape", "d_esp_pcb", "d_esp_usb", "d_esp_top",
           "d_esp_wires", "d_led", "d_magnets", "d_plug"]
# у каких болванок не раздувать низ/верх (лежат на опоре / упираются по назначению)
REST = {"d_gps_pcb": "bottom", "d_esp_tape": "bottom", "d_esp_pcb": "bottom", "d_led": "top", "d_gps_pads": "bottom",
        "d_esp_wires": "bottom", "d_esp_usb": "bottom", "d_esp_top": "bottom", "d_gps_patch": "bottom"}
SKIP = {"d_magnets": "посадка в натяг (Ø10 в Ø10,3) — не проверяется на 0,3",
        "d_plug": "штекер снаружи; проверяется отдельно: литьё проходит в окно",
        "d_esp_tape": "скотч лежит на дне по определению"}
CLR = 0.3

def scad(part, out, printpos=False):
    if not os.path.exists(out) or os.path.getmtime(out) < os.path.getmtime(SCAD):
        r = subprocess.run(["openscad", "-o", out, "-D", f'part="{part}"', "-D", f"print={'true' if printpos else 'false'}", SCAD],
                           capture_output=True, text=True)
        if r.returncode or "WARNING" in r.stderr: print(r.stderr[-1500:])
    m = trimesh.load(out, force="mesh"); m.merge_vertices(); return m

def M(mesh):
    return m3d.Manifold(m3d.Mesh(vert_properties=np.asarray(mesh.vertices, np.float32), tri_verts=np.asarray(mesh.faces, np.uint32)))
def vol(man): return float(man.volume()) if hasattr(man, "volume") else float(man.get_volume())

def inflate(mesh, mode):
    lo, hi = mesh.bounds.copy()
    # болванки — коробки/цилиндры: раздуваем масштабированием вокруг центра по XY и сдвигом граней по Z
    c = (lo + hi) / 2; ext = hi - lo
    s = [(ext[0] + 2*CLR) / ext[0], (ext[1] + 2*CLR) / ext[1], 1]
    v = (mesh.vertices - c) * s + c
    z0, z1 = lo[2], hi[2]
    v[:, 2] = np.where(np.isclose(mesh.vertices[:, 2], z0), z0 - (0 if mode == "bottom" else CLR), v[:, 2])
    v[:, 2] = np.where(np.isclose(mesh.vertices[:, 2], z1), z1 + (0 if mode == "top" else CLR), v[:, 2])
    return trimesh.Trimesh(v, mesh.faces)

rep = {"clearance_mm": CLR, "parts": {}, "part_x_part": [], "dummy_x_part": [], "dummy_x_dummy": [], "skipped": SKIP, "ok": True}
asm = {p: scad(p, os.path.join(B, p + ".stl")) for p in PARTS}
dm = {d: scad(d, os.path.join(B, d + ".stl")) for d in DUMMIES}
man = {p: M(m) for p, m in asm.items()}

# 1) манифолдность/водонепроницаемость
for p, m in asm.items():
    info = {"watertight": bool(m.is_watertight), "winding_consistent": bool(m.is_winding_consistent),
            "euler": int(m.euler_number), "volume_cm3": round(m.volume / 1000, 2), "bbox_mm": np.round(m.extents, 2).tolist(),
            "manifold3d_status": str(man[p].status())}
    info["ok"] = info["watertight"] and info["winding_consistent"] and m.volume > 0 and "NoError" in info["manifold3d_status"]
    rep["parts"][p] = info; rep["ok"] &= info["ok"]

# 2) деталь × деталь
for i, a in enumerate(PARTS):
    for b in PARTS[i+1:]:
        v = vol(man[a] ^ man[b]); rep["part_x_part"].append({"a": a, "b": b, "overlap_mm3": round(v, 4)})
        rep["ok"] &= v < 1e-3
# 3) болванка (+0,3 мм) × деталь
for d, m in dm.items():
    if d in SKIP: continue
    md = M(inflate(m, REST.get(d, "")))
    for p in PARTS:
        v = vol(md ^ man[p]); rep["dummy_x_part"].append({"dummy": d, "part": p, "overlap_mm3": round(v, 4)})
        rep["ok"] &= v < 1e-3
# 4) болванка × болванка (без раздутия; провода и пайка — «мягкие», не проверяются друг с другом)
keys = [d for d in DUMMIES if d not in ("d_plug",)]
for i, a in enumerate(keys):
    for b in keys[i+1:]:
        v = vol(M(dm[a]) ^ M(dm[b]))
        if v > 1e-3: rep["dummy_x_dummy"].append({"a": a, "b": b, "overlap_mm3": round(v, 4)})
rep["ok"] &= not rep["dummy_x_dummy"]
# 5) штекер USB-C: литьё 12,2×6,5 проходит в окно стенки (штекер × основание)
v = vol(M(dm["d_plug"]) ^ man["body"]); rep["plug_x_body_mm3"] = round(v, 4); rep["ok"] &= v < 1e-3

# 6) печать: STL в положении печати + нависания
os.makedirs(os.path.join(HERE, "stl"), exist_ok=True); os.makedirs(os.path.join(HERE, "3mf"), exist_ok=True)
rep["print"] = {}
NAMES = {"body": "pitlane-gps-C_body", "lid": "pitlane-gps-C_lid", "pipe": "pitlane-gps-C_lightpipe"}
pm = {}
for p in PARTS:
    m = scad(p, os.path.join(B, p + "_print.stl"), printpos=True)
    m.apply_translation([0, 0, -m.bounds[0][2]]); pm[p] = m
    m.export(os.path.join(HERE, "stl", NAMES[p] + ".stl"))
    n = m.face_normals; c = m.triangles_center
    down = (n[:, 2] < -0.7072) & (c[:, 2] > 0.05)         # круче 45° и не на столе
    info = {"downfacing_area_mm2": round(float(m.area_faces[down].sum()), 2)}
    spans = []
    if down.any():
        sub = m.submesh([np.where(down)[0]], append=True)
        for comp in sub.split(only_watertight=False):
            e = comp.extents; spans.append(round(float(min(e[0], e[1])), 2))
    info["max_bridge_span_mm"] = max(spans) if spans else 0.0
    info["n_overhang_islands"] = len(spans)
    info["first_layer_area_mm2"] = round(float(m.area_faces[(n[:, 2] < -0.99) & (c[:, 2] < 0.05)].sum()), 1)
    info["ok"] = info["max_bridge_span_mm"] <= 14.0     # только короткие мосты, поддержки не нужны
    info["mass_g_ASA_100pct"] = round(m.volume / 1000 * 1.07, 1)
    rep["print"][p] = info; rep["ok"] &= info["ok"]

# 7) толщина стенок: лучи внутрь от случайных точек поверхности
try:
    for p in ("body", "lid"):
        m = asm[p]; pts, fi = trimesh.sample.sample_surface_even(m, 20000, seed=1)
        d = -m.face_normals[fi]; o = pts + d * 1e-3
        loc, ri, _ = m.ray.intersects_location(o, d, multiple_hits=False)
        th = np.linalg.norm(loc - o[ri], axis=1)
        rep["parts"][p]["thickness_p01_mm"] = round(float(np.percentile(th, 1)), 2)
        rep["parts"][p]["thickness_p05_mm"] = round(float(np.percentile(th, 5)), 2)
        rep["parts"][p]["thickness_median_mm"] = round(float(np.median(th)), 2)
except Exception as e:
    rep["thickness_error"] = str(e)

# 8) 3MF: каждая деталь + общий стол (body + lid + pipe рядом)
for p in PARTS: pm[p].export(os.path.join(HERE, "3mf", NAMES[p] + ".3mf"))
sc = trimesh.Scene()
xs = {"body": 0, "lid": 85, "pipe": 140}
for p in PARTS:
    mm = pm[p].copy(); c = mm.bounds.mean(axis=0); mm.apply_translation([xs[p] - c[0], -c[1], 0]); sc.add_geometry(mm, node_name=NAMES[p], geom_name=NAMES[p])
sc.export(os.path.join(HERE, "3mf", "pitlane-gps-C_plate.3mf"))

json.dump(rep, open(os.path.join(HERE, "check_report.json"), "w"), ensure_ascii=False, indent=1)
print(json.dumps({k: rep[k] for k in ("ok", "parts", "print", "dummy_x_dummy", "plug_x_body_mm3")}, ensure_ascii=False, indent=1))
bad = [x for x in rep["part_x_part"] + rep["dummy_x_part"] if x["overlap_mm3"] > 1e-3]
print("коллизии:", bad if bad else "нет")
sys.exit(0 if rep["ok"] else 1)
