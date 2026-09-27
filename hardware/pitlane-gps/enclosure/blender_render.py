# blender -b -P blender_render.py -- scene.json
import bpy, json, sys, math, mathutils
cfg = json.load(open(sys.argv[sys.argv.index("--") + 1]))
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene

def hexrgb(h):
    h = h.lstrip("#"); c = [int(h[i:i+2], 16) / 255 for i in (0, 2, 4)]
    return [x/12.92 if x <= 0.04045 else ((x+0.055)/1.055)**2.4 for x in c] + [1]

MATS = {}
def mat(name):
    if name in MATS: return MATS[name]
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; b = nt.nodes["Principled BSDF"]
    spec = cfg["materials"][name]
    b.inputs["Base Color"].default_value = hexrgb(spec.get("color", "#808080"))
    b.inputs["Roughness"].default_value = spec.get("rough", 0.5)
    b.inputs["Metallic"].default_value = spec.get("metal", 0.0)
    if "emit" in spec:
        b.inputs["Emission Color"].default_value = hexrgb(spec["color"])
        b.inputs["Emission Strength"].default_value = spec["emit"]
    if "transmission" in spec:
        b.inputs["Transmission Weight"].default_value = spec["transmission"]
    if "coat" in spec:
        b.inputs["Coat Weight"].default_value = spec["coat"]
    MATS[name] = m; return m

for o in cfg["objects"]:
    bpy.ops.wm.stl_import(filepath=o["file"], global_scale=0.001)
    ob = bpy.context.selected_objects[0]
    ob.location = [v * 0.001 for v in o.get("offset", [0, 0, 0])]
    ob.data.materials.append(mat(o["mat"]))
    if o.get("smooth", True):
        # автосглаживание по углу
        for p in ob.data.polygons: p.use_smooth = False
        try:
            ob.data.set_sharp_from_angle(angle=math.radians(35))
            for p in ob.data.polygons: p.use_smooth = True
        except Exception: pass

# пол
bpy.ops.mesh.primitive_plane_add(size=4, location=(0, 0, cfg.get("floor_z", 0) * 0.001))
fl = bpy.context.object; m = bpy.data.materials.new("floor"); m.use_nodes = True
b = m.node_tree.nodes["Principled BSDF"]; b.inputs["Base Color"].default_value = hexrgb("#0b0d11")
b.inputs["Roughness"].default_value = 0.45; fl.data.materials.append(m)

# мир
w = bpy.data.worlds.new("w"); sc.world = w; w.use_nodes = True
w.node_tree.nodes["Background"].inputs[0].default_value = hexrgb("#06080b")
w.node_tree.nodes["Background"].inputs[1].default_value = 1.0

tgt = [v * 0.001 for v in cfg["target"]]
def light(loc, energy, size, color="#ffffff"):
    L = bpy.data.lights.new("L", "AREA"); L.energy = energy; L.size = size; L.color = hexrgb(color)[:3]
    o = bpy.data.objects.new("L", L); sc.collection.objects.link(o); o.location = loc; o.visible_glossy = False; o.visible_camera = False
    d = mathutils.Vector(tgt) - mathutils.Vector(loc); o.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
light((-0.18, -0.22, 0.30), 4.0, 0.25)
light((0.25, 0.10, 0.18), 1.5, 0.3, "#cfe0ff")
light((0.05, 0.30, 0.10), 2.5, 0.2, "#ffffff")

cam = bpy.data.cameras.new("C"); cam.lens = cfg.get("lens", 70)
co = bpy.data.objects.new("C", cam); sc.collection.objects.link(co); sc.camera = co
az, el, dist = [math.radians(cfg["cam"][0]), math.radians(cfg["cam"][1]), cfg["cam"][2] * 0.001]
co.location = (tgt[0] + dist*math.cos(el)*math.cos(az), tgt[1] + dist*math.cos(el)*math.sin(az), tgt[2] + dist*math.sin(el))
co.rotation_euler = (mathutils.Vector(tgt) - co.location).to_track_quat("-Z", "Y").to_euler()

sc.render.engine = "CYCLES"; sc.cycles.device = "CPU"; sc.cycles.samples = cfg.get("samples", 96)
try:
    sc.cycles.use_denoising = True; sc.cycles.denoiser = "OPENIMAGEDENOISE"
except Exception: sc.cycles.use_denoising = False
sc.render.resolution_x, sc.render.resolution_y = cfg.get("res", [1600, 1200])
sc.view_settings.view_transform = "Standard"; sc.view_settings.look = "None"
sc.view_settings.exposure = cfg.get("exposure", 0.0)
sc.render.film_transparent = False
# свечение неона
sc.use_nodes = True; nt = sc.node_tree
for n in list(nt.nodes): nt.nodes.remove(n)
rl = nt.nodes.new("CompositorNodeRLayers"); gl = nt.nodes.new("CompositorNodeGlare"); cp = nt.nodes.new("CompositorNodeComposite")
gl.glare_type = "FOG_GLOW"; gl.quality = "HIGH"; gl.threshold = 0.9; gl.size = 7
nt.links.new(rl.outputs["Image"], gl.inputs["Image"]); nt.links.new(gl.outputs["Image"], cp.inputs["Image"])
sc.render.filepath = cfg["out"]; sc.render.image_settings.file_format = "PNG"
bpy.ops.render.render(write_still=True)
