# blender -b -P blender_scene.py -- scene.json   (Blender 4.x, Cycles)
import bpy, json, sys, math, mathutils
cfg = json.load(open(sys.argv[sys.argv.index("--") + 1]))
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
MM = 0.001

def lin(h):
    h = h.lstrip("#"); c = [int(h[i:i+2], 16) / 255 for i in (0, 2, 4)]
    return [x/12.92 if x <= 0.04045 else ((x+0.055)/1.055)**2.4 for x in c] + [1]

def principled(name, color, rough=0.5, metal=0.0, emit=0.0, emit_color=None, transm=0.0, coat=0.0, ior=1.45, noise=0.0, alpha=1.0):
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; b = nt.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = lin(color); b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal; b.inputs["IOR"].default_value = ior
    if emit: b.inputs["Emission Color"].default_value = lin(emit_color or color); b.inputs["Emission Strength"].default_value = emit
    if transm: b.inputs["Transmission Weight"].default_value = transm
    if coat: b.inputs["Coat Weight"].default_value = coat
    if alpha < 1: b.inputs["Alpha"].default_value = alpha
    if noise:   # лёгкая «печатная» шероховатость: шум в нормаль
        tex = nt.nodes.new("ShaderNodeTexNoise"); tex.inputs["Scale"].default_value = 2600; tex.inputs["Detail"].default_value = 2
        bump = nt.nodes.new("ShaderNodeBump"); bump.inputs["Strength"].default_value = noise; bump.inputs["Distance"].default_value = 0.00004
        nt.links.new(tex.outputs["Fac"], bump.inputs["Height"]); nt.links.new(bump.outputs["Normal"], b.inputs["Normal"])
    return m

MATS = {
  "graphite": principled("graphite", "#2c2e33", 0.62, noise=0.25),
  "graphite_in": principled("graphite_in", "#26282c", 0.7),
  "pipe": principled("pipe", "#fff4e6", 0.15, emit=cfg.get("pipe_emit", 9.0), emit_color="#ffefdc", transm=0.3),
  "pipe_off": principled("pipe_off", "#d9d6cf", 0.25, transm=0.6),
  "pcb_blue": principled("pcb_blue", "#1c3f86", 0.45), "patch": principled("patch", "#c7b893", 0.55),
  "pcb_black": principled("pcb_black", "#18181b", 0.4), "metal": principled("metal", "#c4c8ce", 0.22, metal=1),
  "chip": principled("chip", "#0d0d0f", 0.35), "ledmod": principled("ledmod", "#f2f2f2", 0.4),
  "magnet": principled("magnet", "#b9bdc4", 0.2, metal=1), "foam": principled("foam", "#e7e3d8", 0.9),
  "cable": principled("cable", "#1b1c1f", 0.5), "plug": principled("plug", "#1f2024", 0.45),
  "dash": principled("dash", "#2e2f33", 0.8, noise=0.6), "glass": principled("glass", "#a8b4bd", 0.02, transm=1.0, ior=1.5),
  "frit": principled("frit", "#050506", 0.6), "phone": principled("phone", "#0a0a0c", 0.12, coat=1.0),
  "phone_frame": principled("phone_frame", "#8d8f94", 0.3, metal=1), "card": principled("card", "#3b4a5a", 0.4),
  "studio": principled("studio", "#1a1c20", 0.55),
}

def import_stl(path, mat, offset=(0, 0, 0), rot=None):
    bpy.ops.wm.stl_import(filepath=path, global_scale=MM)
    ob = bpy.context.selected_objects[0]
    ob.location = [v * MM for v in offset]
    if rot: ob.rotation_euler = [math.radians(a) for a in rot]
    ob.data.materials.append(MATS[mat])
    try:
        ob.data.set_sharp_from_angle(angle=math.radians(30))
        for p in ob.data.polygons: p.use_smooth = True
    except Exception: pass
    return ob

for o in cfg["objects"]: import_stl(o["file"], o["mat"], o.get("offset", (0, 0, 0)), o.get("rot"))

def box(name, size, loc, mat, bevel=0.0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=[v * MM for v in loc]); ob = bpy.context.object; ob.name = name
    ob.scale = [v * MM for v in size]; bpy.ops.object.transform_apply(scale=True)
    if bevel:
        md = ob.modifiers.new("b", "BEVEL"); md.width = bevel * MM; md.segments = 4
    ob.data.materials.append(MATS[mat]); return ob

WIRE = {}
def wmat(c):
    if c not in WIRE: WIRE[c] = principled("w" + c, c, 0.45)
    return WIRE[c]
def cable(points, r=2.0, color=None):
    cu = bpy.data.curves.new("cable", "CURVE"); cu.dimensions = "3D"; cu.bevel_depth = r * MM; cu.bevel_resolution = 6
    sp = cu.splines.new("BEZIER"); sp.bezier_points.add(len(points) - 1)
    for bp, p in zip(sp.bezier_points, points):
        bp.co = [v * MM for v in p]; bp.handle_left_type = bp.handle_right_type = "AUTO"
    ob = bpy.data.objects.new("cable", cu); sc.collection.objects.link(ob); ob.data.materials.append(wmat(color) if color else MATS["cable"]); return ob

env = cfg.get("env", "studio")
if env == "studio":
    # бесконечный фон-«циклорама»
    bpy.ops.mesh.primitive_plane_add(size=3, location=(0, 0.3, 0)); fl = bpy.context.object; fl.data.materials.append(MATS["studio"])
    bpy.ops.mesh.primitive_plane_add(size=3, location=(0, 0.9, 0.6), rotation=(math.radians(90), 0, 0)); wl = bpy.context.object; wl.data.materials.append(MATS["studio"])
elif env == "car":
    # торпедо: широкая плита с лёгким наклоном к стеклу; лобовое стекло под 27°; фритта по краю
    bpy.ops.mesh.primitive_plane_add(size=1, location=(0, 0, -0.0005)); d = bpy.context.object; d.scale = (1.4, 0.7, 1); d.data.materials.append(MATS["dash"])
    md = d.modifiers.new("s", "SUBSURF"); md.levels = 2
for o in cfg.get("props", []):
    ob = box(o["name"], o["size"], o["loc"], o["mat"], o.get("bevel", 0)); ob.rotation_euler = [math.radians(a) for a in o.get("rot", (0, 0, 0))]
    if o.get("noshadow"): ob.visible_shadow = False

for c in cfg.get("cables", []): cable(c["points"], c.get("r", 2.0), c.get("color"))

w = bpy.data.worlds.new("w"); sc.world = w; w.use_nodes = True
bg = w.node_tree.nodes["Background"]; bg.inputs[0].default_value = lin(cfg.get("world", "#0a0b0d")); bg.inputs[1].default_value = cfg.get("world_strength", 0.6)

tgt = mathutils.Vector([v * MM for v in cfg["target"]])
def light(loc, energy, size, color="#ffffff", kind="AREA"):
    L = bpy.data.lights.new("L", kind); L.energy = energy; L.color = lin(color)[:3]
    if kind == "AREA": L.size = size
    o = bpy.data.objects.new("L", L); sc.collection.objects.link(o); o.location = loc
    o.rotation_euler = (tgt - mathutils.Vector(loc)).to_track_quat("-Z", "Y").to_euler(); return o
for l in cfg.get("lights", [[(-0.25, -0.30, 0.42), 9.0, 0.45, "#fff6ee"], [(0.35, -0.05, 0.22), 3.0, 0.35, "#dfe8ff"], [(0.05, 0.40, 0.30), 6.0, 0.3, "#ffffff"]]):
    light(*l)
if cfg.get("sun"):
    s = cfg["sun"]; L = bpy.data.lights.new("sun", "SUN"); L.energy = s[0]; L.angle = math.radians(2); L.color = lin(s[2])[:3]
    o = bpy.data.objects.new("sun", L); sc.collection.objects.link(o); o.rotation_euler = [math.radians(a) for a in s[1]]

cam = bpy.data.cameras.new("c"); cam.lens = cfg.get("lens", 85)
if cfg.get("dof"):
    cam.dof.use_dof = True; cam.dof.focus_distance = (mathutils.Vector([v * MM for v in cfg["cam"]]) - tgt).length; cam.dof.aperture_fstop = cfg["dof"]
co = bpy.data.objects.new("c", cam); sc.collection.objects.link(co); sc.camera = co
co.location = [v * MM for v in cfg["cam"]]; co.rotation_euler = (tgt - co.location).to_track_quat("-Z", "Y").to_euler()

sc.render.engine = "CYCLES"; sc.cycles.samples = cfg.get("samples", 384); sc.cycles.use_denoising = False; sc.cycles.use_adaptive_sampling = True; sc.cycles.adaptive_threshold = 0.01; sc.render.threads_mode = "AUTO"
sc.cycles.filter_width = 1.2
sc.render.resolution_x, sc.render.resolution_y = cfg.get("res", (1800, 1200)); sc.render.film_transparent = False
sc.view_settings.view_transform = "AgX"; sc.view_settings.look = cfg.get("look", "AgX - Medium High Contrast")
sc.view_settings.exposure = cfg.get("exposure", 0.0)
sc.render.filepath = cfg["out"]; bpy.ops.render.render(write_still=True)
