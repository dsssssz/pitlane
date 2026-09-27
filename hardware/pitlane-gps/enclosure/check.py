#!/usr/bin/env python3
"""Проверка сборки PITLANE GPS: пересечения, зазоры (болванки раздуты на CLR), толщина стенок.
Запуск: python3 check.py  (нужны openscad, trimesh, manifold3d)"""
import subprocess, sys, os, json, itertools
import numpy as np, trimesh, manifold3d as m3d

HERE = os.path.dirname(os.path.abspath(__file__))
SCAD = os.path.join(HERE, "scad"); BUILD = os.path.join(HERE, "build")
CLR = 0.3          # требуемый минимальный зазор
MIN_WALL = 1.6
os.makedirs(BUILD, exist_ok=True)

FORMS = {
  "box":  {"parts": ["body", "ring", "lid", "pipes"],
           "dummies": {"A": ["gps_pcb","gps_under","gps_top","tp","tp_usb","bat","esp","sw","sw_lever","leds","strip_back","strip_left","strip_right","strip_front","sma"],
                       "B": ["gps_pcb","gps_under","gps_top","tp","tp_usb","bat","esp","sw","sw_lever","leds","strip_back","strip_left","strip_right","strip_front"]}},
  "puck": {"parts": ["body", "cover", "ring", "plogo", "pipes"],
           "dummies": {"A": ["gps_pcb","gps_under","gps_top","tp","tp_usb","bat","esp","sw","sw_lever","leds","leds_ring","leds_p","sma"],
                       "B": ["gps_pcb","gps_under","gps_top","tp","tp_usb","bat","esp","sw","sw_lever","leds","leds_ring","leds_p"]}},
}
# детали, которые касаются друг друга по замыслу (болванки): не считать пересечением
ADJ = {frozenset(p) for p in [("gps_pcb","gps_under"),("gps_pcb","gps_top"),("tp","tp_usb"),("sw","sw_lever"),("esp","bat"),("tp","bat")]}
# лепестки/плоскости, где болванка штатно опирается или проходит сквозь деталь
# (раздувание вниз уже отключено в SCAD, здесь — только проверка «сырой» болванки)

def scad(form, part, ant, out, g=0.0, print_=False):
    cmd = ["openscad", "-o", out, "-D", f'part="{part}"', "-D", f'ant="{ant}"', "-D", f"g={g}",
           "-D", f"print={'true' if print_ else 'false'}", os.path.join(SCAD, form + ".scad")]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode or not os.path.exists(out):
        sys.exit(f"openscad failed: {' '.join(cmd)}\n{r.stderr}")

def load(p):
    m = trimesh.load(p, force="mesh"); m.merge_vertices(); return m

def man(m):
    return m3d.Manifold(m3d.Mesh(vert_properties=np.asarray(m.vertices, np.float32), tri_verts=np.asarray(m.faces, np.uint32)))

def ivol(a, b):
    return (man(a) ^ man(b)).volume()

def thickness(m, n=40000, seed=1):
    """Локальная толщина: луч внутрь по нормали из случайных точек поверхности."""
    pts, fi = trimesh.sample.sample_surface(m, n, seed=seed)
    nrm = m.face_normals[fi]
    org = pts - nrm * 1e-3
    loc, ray, tri = m.ray.intersects_location(org, -nrm, multiple_hits=False)
    d = np.full(len(pts), np.inf); d[ray] = np.linalg.norm(loc - org[ray], axis=1)
    return pts, d

def main():
    report = {}; ok = True
    for form, cfg in FORMS.items():
        for ant in ("A", "B"):
            key = f"{form}-{ant}"; R = report[key] = {"errors": [], "parts": {}, "min_gap_ok": True}
            parts = {}
            for p in cfg["parts"]:
                f = os.path.join(BUILD, f"{key}_{p}.stl"); scad(form, p, ant, f); parts[p] = load(f)
                pm = parts[p]; bodies = len(pm.split(only_watertight=False))
                R["parts"][p] = {"watertight": bool(pm.is_watertight), "bodies": bodies,
                                 "bbox": np.round(pm.bounds[1] - pm.bounds[0], 2).tolist(), "volume_cm3": round(pm.volume/1000, 2)}
                if not pm.is_watertight: R["errors"].append(f"{p}: не watertight")
            dum, dumg = {}, {}
            for d in cfg["dummies"][ant]:
                f = os.path.join(BUILD, f"{key}_dummy_{d}.stl"); scad(form, "dummy:"+d, ant, f); dum[d] = load(f)
                f = os.path.join(BUILD, f"{key}_dummyg_{d}.stl"); scad(form, "dummy:"+d, ant, f, g=CLR); dumg[d] = load(f)
            # 1) деталь — деталь
            for a, b in itertools.combinations(parts, 2):
                v = ivol(parts[a], parts[b])
                if v > 0.01: R["errors"].append(f"пересечение деталей {a} x {b}: {v:.3f} мм³")
            # 2) болванка (+{CLR} мм) — деталь
            for d in dumg:
                for p in parts:
                    v = ivol(dumg[d], parts[p])
                    if v > 0.01: R["errors"].append(f"зазор < {CLR} мм: {d} x {p}: {v:.3f} мм³"); R["min_gap_ok"] = False
            # 3) болванка — болванка
            for a, b in itertools.combinations(dum, 2):
                if frozenset((a, b)) in ADJ: continue
                v = ivol(dum[a], dum[b])
                if v > 0.01: R["errors"].append(f"пересечение болванок {a} x {b}: {v:.3f} мм³")
            # 4) толщина стенок (статистика по выборке точек)
            for p, m in parts.items():
                pts, t = thickness(m)
                fin = t[np.isfinite(t)]
                thin = pts[np.isfinite(t) & (t < MIN_WALL - 0.05)]
                R["parts"][p]["wall_p1_mm"] = round(float(np.percentile(fin, 1)), 2)
                R["parts"][p]["thin_share_%"] = round(100 * len(thin) / len(pts), 2)
                if len(thin):
                    # сгруппировать тонкие точки по 3-мм ячейкам для отчёта
                    cells = {}
                    for q in thin:
                        c = tuple((q // 3).astype(int)); cells[c] = cells.get(c, 0) + 1
                    top = sorted(cells.items(), key=lambda x: -x[1])[:8]
                    R["parts"][p]["thin_cells_xyz_mm"] = [[int(c[0]*3), int(c[1]*3), int(c[2]*3), n] for c, n in top]
            ok &= not R["errors"]
            print(f"\n=== {key}: {'OK' if not R['errors'] else 'ОШИБКИ'}")
            for e in R["errors"]: print("  !", e)
            for p, info in R["parts"].items(): print(f"  {p:6s} {info}")
    json.dump(report, open(os.path.join(BUILD, "check_report.json"), "w"), ensure_ascii=False, indent=1)
    return 0 if ok else 1

if __name__ == "__main__":
    sys.exit(main())
