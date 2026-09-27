#!/usr/bin/env python3
"""STL для печати (деталь уже повёрнута в положение печати, низ на z=0), бинарный формат."""
import os, subprocess, trimesh
HERE = os.path.dirname(os.path.abspath(__file__)); OUT = os.path.join(HERE, "stl"); TMP = os.path.join(HERE, "build")
SETS = {
  "box":  {"body": "body", "lid": "lid", "lightring": "ring", "ledpipes": "pipes"},
  "puck": {"body": "body", "cover": "cover", "lightring": "ring", "P-lightguide": "plogo", "ledpipes": "pipes"},
}
for form, parts in SETS.items():
    for ant in "AB":
        d = os.path.join(OUT, f"{form}-{ant}"); os.makedirs(d, exist_ok=True)
        for name, part in parts.items():
            tmp = os.path.join(TMP, f"print_{form}_{ant}_{part}.stl")
            subprocess.run(["openscad", "-o", tmp, "-D", f'part="{part}"', "-D", f'ant="{ant}"', "-D", "print=true",
                            os.path.join(HERE, "scad", form + ".scad")], check=True, capture_output=True)
            m = trimesh.load(tmp, force="mesh"); assert m.is_watertight, tmp
            m.apply_translation([0, 0, -m.bounds[0][2]])
            f = os.path.join(d, f"pitlane-{form}-{ant}_{name}.stl"); m.export(f)
            print(f"{os.path.relpath(f, HERE):45s} {' x '.join(f'{v:.1f}' for v in m.extents)} мм")
