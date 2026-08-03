"""Passenger rebuild v4 — LOCAL parenting only (bulletproof)."""
import os
import bpy
from mathutils import Vector
from math import radians

for o in list(bpy.data.objects):
    if o.name.startswith(("A_", "B_", "C_")):
        bpy.data.objects.remove(o, do_unlink=True)
for c in list(bpy.data.collections):
    if c.name.startswith(("A_char", "B_char", "C_char")):
        bpy.data.collections.remove(c)


def hex_rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i : i + 2], 16) / 255.0 for i in (0, 2, 4))


def mat(name, color, rough=0.55):
    m = bpy.data.materials.get(name)
    if m is None:
        m = bpy.data.materials.new(name)
        m.use_nodes = True
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    bsdf.inputs["Roughness"].default_value = rough
    return m


M = {
    "eye_w": mat("CM_eye_white", (1, 1, 1), 0.2),
    "eye_b": mat("CM_eye_black", (0.02, 0.02, 0.02), 0.35),
    "mouth": mat("CM_mouth", (0.08, 0.03, 0.03), 0.6),
    "pale": mat("CM_skin_pale", hex_rgb("E8B89A")),
    "tan": mat("CM_skin_tan", hex_rgb("C68863")),
    "brown": mat("CM_skin_brown", hex_rgb("8D5A3B")),
    "dark": mat("CM_skin_dark", hex_rgb("5C3A24")),
    "hair_br": mat("CM_hair_brown", hex_rgb("3B2210")),
    "hair_bk": mat("CM_hair_black", hex_rgb("121212")),
    "hair_gy": mat("CM_hair_grey", hex_rgb("B0B0B0")),
    "hair_af": mat("CM_hair_afro", hex_rgb("1A1008")),
    "hair_rd": mat("CM_hair_red", hex_rgb("C41E3A")),
    "navy": mat("CM_navy", hex_rgb("1B2A4A")),
    "black": mat("CM_black", hex_rgb("151515")),
    "white": mat("CM_white", (0.92, 0.92, 0.92)),
    "red": mat("CM_red", hex_rgb("C62828")),
    "yellow": mat("CM_yellow", hex_rgb("F5C542")),
    "green": mat("CM_green", hex_rgb("3D9B4A")),
    "denim": mat("CM_denim", hex_rgb("4A6FA5")),
    "teal": mat("CM_teal", hex_rgb("2A9D8F")),
    "beige": mat("CM_beige", hex_rgb("C4A882")),
    "lavender": mat("CM_lavender", hex_rgb("B39DDB")),
    "grey": mat("CM_grey", hex_rgb("7A7A7A")),
    "dkgrey": mat("CM_dkgrey", hex_rgb("3A3A3A")),
    "shoe_br": mat("CM_shoe_br", hex_rgb("5C3A1E")),
    "gold": mat("CM_gold", hex_rgb("D4A017"), 0.35),
    "straw": mat("CM_straw", hex_rgb("D4B86A")),
    "pink": mat("CM_pink", hex_rgb("F48FB1")),
}

# current root while building a character
ROOT = None
COLL = None


def smooth(o):
    for p in o.data.polygons:
        p.use_smooth = True


def place(o, local_loc, material=None):
    """Parent to ROOT with identity inverse, set LOCAL location."""
    global ROOT, COLL
    for c in list(o.users_collection):
        c.objects.unlink(o)
    COLL.objects.link(o)
    o.parent = ROOT
    o.matrix_parent_inverse.identity()
    o.location = local_loc
    if material is not None:
        o.data.materials.clear()
        o.data.materials.append(material)
    smooth(o)
    bpy.ops.object.select_all(action="DESELECT")
    return o


def apply_scale_local(o):
    """Apply scale without breaking parent local location."""
    loc = o.location.copy()
    rot_mode = o.rotation_mode
    if rot_mode == "QUATERNION":
        rot = o.rotation_quaternion.copy()
    else:
        rot = o.rotation_euler.copy()
    parent = o.parent
    o.parent = None
    bpy.ops.object.select_all(action="DESELECT")
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    o.parent = parent
    o.matrix_parent_inverse.identity()
    o.location = loc
    if rot_mode == "QUATERNION":
        o.rotation_mode = "QUATERNION"
        o.rotation_quaternion = rot
    else:
        o.rotation_mode = rot_mode
        o.rotation_euler = rot
    bpy.ops.object.select_all(action="DESELECT")


def sph(name, loc, r, material, segs=18):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segs, ring_count=max(10, segs // 2), radius=r, location=(0, 0, 0))
    o = bpy.context.active_object
    o.name = name
    return place(o, loc, material)


def cyl(name, loc, r, depth, material, segs=14):
    bpy.ops.mesh.primitive_cylinder_add(vertices=segs, radius=r, depth=depth, location=(0, 0, 0))
    o = bpy.context.active_object
    o.name = name
    return place(o, loc, material)


def box(name, loc, scale, material, bevel=0.012):
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 0))
    o = bpy.context.active_object
    o.name = name
    place(o, loc, material)
    o.scale = scale
    apply_scale_local(o)
    if bevel > 0:
        m = o.modifiers.new("Bevel", "BEVEL")
        m.width = bevel
        m.segments = 2
    return o


def limb(name, a, b, radius, material):
    a, b = Vector(a), Vector(b)
    mid = (a + b) * 0.5
    d = b - a
    bpy.ops.mesh.primitive_cylinder_add(vertices=12, radius=radius, depth=max(d.length, 0.01), location=(0, 0, 0))
    o = bpy.context.active_object
    o.name = name
    place(o, tuple(mid), material)
    o.rotation_mode = "QUATERNION"
    o.rotation_quaternion = d.to_track_quat("Z", "Y")
    return o


def build(prefix, x, y, skin_key, spec):
    global ROOT, COLL
    skin = M[skin_key]
    top = M[spec["top"]]
    pants = M[spec["pants"]]
    shoes = M[spec["shoes"]]
    short = spec.get("short", False)

    COLL = bpy.data.collections.new(prefix)
    bpy.context.scene.collection.children.link(COLL)
    ROOT = bpy.data.objects.new(prefix + "_root", None)
    ROOT.empty_display_type = "PLAIN_AXES"
    ROOT.empty_display_size = 0.04
    ROOT.location = (x, y, 0)
    COLL.objects.link(ROOT)

    # LOCAL coords only from here
    torso = sph(prefix + "_torso", (0, 0.02, 0.56), 0.23, top, 22)
    torso.scale = (0.92, 0.7, 1.2)
    apply_scale_local(torso)
    torso.rotation_euler = (radians(4), 0, 0)

    hips = sph(prefix + "_hips", (0, 0, 0.28), 0.19, pants, 18)
    hips.scale = (1.15, 1.05, 0.9)
    apply_scale_local(hips)

    cyl(prefix + "_neck", (0, 0, 0.86), 0.06, 0.1, skin, 12)
    head = sph(prefix + "_head", (0, 0, 1.06), 0.26, skin, 22)
    head.scale = (1.0, 0.93, 1.12)
    apply_scale_local(head)

    # face
    eye_y, eye_z = -0.22, 1.09
    shades = spec.get("shades", False)
    for side, sx in (("L", -0.115), ("R", 0.115)):
        sph(prefix + f"_eye{side}", (sx, eye_y, eye_z), 0.125, M["eye_w"], 18)
        if not shades:
            pupil = sph(prefix + f"_pupil{side}", (sx + (0.012 if side == "L" else -0.01), eye_y - 0.105, eye_z), 0.042, M["eye_b"], 10)
            pupil.scale = (1.0, 0.45, 1.0)
            apply_scale_local(pupil)
            lid = sph(prefix + f"_lid{side}", (sx, eye_y + 0.02, eye_z + 0.095), 0.115, skin, 12)
            lid.scale = (1.05, 0.7, 0.2)
            apply_scale_local(lid)

    if not shades:
        brow_mat = M[spec.get("brow", "hair_br")]
        ang = spec.get("brow_ang", 0)
        for side, sx in (("L", -0.115), ("R", 0.115)):
            brow = box(prefix + f"_brow{side}", (sx, eye_y - 0.03, eye_z + 0.16), (0.12, 0.045, 0.04), brow_mat, 0.012)
            brow.rotation_euler = (radians(-10), 0, radians(ang if side == "L" else -ang))

    sph(prefix + "_nose", (0, -0.27, 0.98), 0.028, skin, 10)
    mouth = box(prefix + "_mouth", (0, -0.25, 0.88), (0.1, 0.018, 0.014), M["mouth"], 0.006)
    mouth.rotation_euler = (radians(-12 if not spec.get("smile") else 12), 0, 0)

    # arms
    for side, sx in (("L", -1), ("R", 1)):
        sh = (sx * 0.20, 0.02, 0.70)
        el = (sx * 0.25, -0.15, 0.47)
        wr = (sx * 0.22, -0.36, 0.31)
        pa = (sx * 0.22, -0.42, 0.29)

        sph(prefix + f"_shoulder{side}", sh, 0.06, top, 12)
        limb(prefix + f"_uparm{side}", sh, el, 0.058, top)
        fmat = skin if short else top
        sph(prefix + f"_elbow{side}", el, 0.05, fmat, 10)
        limb(prefix + f"_forearm{side}", el, wr, 0.05, fmat)

        # sleeve end cap (cylinder, not torus)
        if short:
            end = Vector(sh).lerp(Vector(el), 0.85)
            direction = Vector(el) - Vector(sh)
            sleeve = cyl(prefix + f"_sleeve{side}", tuple(end), 0.062, 0.03, top, 12)
        else:
            end = Vector(wr)
            direction = Vector(wr) - Vector(el)
            sleeve = cyl(prefix + f"_sleeve{side}", tuple(end), 0.052, 0.03, top, 12)
        sleeve.rotation_mode = "QUATERNION"
        sleeve.rotation_quaternion = direction.to_track_quat("Z", "Y")

        box(prefix + f"_palm{side}", pa, (0.09, 0.06, 0.03), skin, 0.012)
        for i, fl in enumerate([0.09, 0.105, 0.1, 0.08]):
            fx = pa[0] + sx * (-0.034 + i * 0.025)
            fy = pa[1] - 0.02 - fl * 0.4
            fz = pa[2]
            fing = sph(prefix + f"_finger{side}{i}", (fx, fy, fz), 0.015, skin, 8)
            fing.scale = (0.95, fl / 0.03, 0.95)
            apply_scale_local(fing)
            fing.rotation_euler = (radians(32), 0, 0)
        th = sph(prefix + f"_thumb{side}", (pa[0] - sx * 0.05, pa[1] - 0.015, pa[2] + 0.012), 0.016, skin, 8)
        th.scale = (1, 0.06 / 0.032, 1)
        apply_scale_local(th)
        th.rotation_euler = (radians(40), radians(sx * 50), radians(sx * 20))

    # legs
    stock = spec.get("stock")
    for side, sx in (("L", -1), ("R", 1)):
        hip = (sx * 0.09, 0.02, 0.28)
        knee = (sx * 0.10, -0.33, 0.24)
        ankle = (sx * 0.10, -0.34, 0.05)
        limb(prefix + f"_thigh{side}", hip, knee, 0.075, pants)
        sph(prefix + f"_knee{side}", knee, 0.055, pants, 10)
        limb(prefix + f"_calf{side}", knee, ankle, 0.058, M[stock] if stock else pants)
        sph(prefix + f"_heel{side}", (sx * 0.10, -0.32, 0.03), 0.05, shoes, 10)
        toe = box(prefix + f"_shoe{side}", (sx * 0.10, -0.42, 0.03), (0.07, 0.11, 0.045), shoes, 0.014)
        toe.rotation_euler = (radians(-6), 0, radians(sx * 6))

    spec["hair"](prefix, skin, top)
    return prefix


# ---- hair (LOCAL coords) ----
def hair_gym(prefix, skin, top):
    h = sph(prefix + "_hair", (0, 0.04, 1.18), 0.22, M["hair_br"], 16)
    h.scale = (1.15, 1.05, 0.7)
    apply_scale_local(h)
    q = box(prefix + "_quiff", (0, -0.14, 1.30), (0.2, 0.16, 0.14), M["hair_br"], 0.04)
    q.rotation_euler = (radians(-30), 0, 0)
    box(prefix + "_strapL", (-0.1, 0, 0.78), (0.05, 0.08, 0.12), M["black"], 0.01)
    box(prefix + "_strapR", (0.1, 0, 0.78), (0.05, 0.08, 0.12), M["black"], 0.01)


def hair_old(prefix, skin, top):
    for name, loc, sc in [
        ("_hairL", (-0.2, 0.02, 1.08), (0.12, 0.2, 0.22)),
        ("_hairR", (0.2, 0.02, 1.08), (0.12, 0.2, 0.22)),
        ("_hairB", (0.0, 0.16, 1.08), (0.22, 0.12, 0.2)),
    ]:
        h = sph(prefix + name, loc, 0.14, M["hair_gy"], 14)
        h.scale = sc
        apply_scale_local(h)


def hair_beanie(prefix, skin, top):
    hat = sph(prefix + "_beanie", (0, 0, 1.24), 0.27, M["green"], 18)
    hat.scale = (1.08, 1.05, 0.72)
    apply_scale_local(hat)
    sph(prefix + "_bumpL", (-0.07, 0, 1.40), 0.055, M["green"], 10)
    sph(prefix + "_bumpR", (0.07, 0, 1.40), 0.055, M["green"], 10)
    box(prefix + "_seam", (0, -0.16, 0.55), (0.012, 0.02, 0.36), M["navy"], 0.002)
    box(prefix + "_tee", (0, -0.15, 0.62), (0.09, 0.02, 0.14), M["white"], 0.01)
    sph(prefix + "_sideL", (-0.22, 0, 1.05), 0.07, M["hair_br"], 10)
    sph(prefix + "_sideR", (0.22, 0, 1.05), 0.07, M["hair_br"], 10)


def hair_hoodie(prefix, skin, top):
    for i, (ox, oy, oz, r) in enumerate([
        (0, 0.02, 1.22, 0.2), (-0.12, 0, 1.18, 0.12), (0.12, 0, 1.18, 0.12),
        (0, 0.1, 1.2, 0.12), (-0.08, -0.05, 1.2, 0.1), (0.08, -0.05, 1.2, 0.1),
    ]):
        sph(prefix + f"_hair{i}", (ox, oy, oz), r, M["hair_br"], 12)
    sph(prefix + "_hoodL", (-0.12, 0.14, 0.95), 0.12, M["grey"], 12)
    sph(prefix + "_hoodR", (0.12, 0.14, 0.95), 0.12, M["grey"], 12)
    sph(prefix + "_hoodB", (0, 0.18, 1.05), 0.14, M["grey"], 12)


def hair_suit(prefix, skin, top):
    h = sph(prefix + "_hair", (0, 0.02, 1.22), 0.24, M["hair_bk"], 16)
    h.scale = (1.1, 1.05, 0.6)
    apply_scale_local(h)
    for side, sx in (("L", -1), ("R", 1)):
        lap = box(prefix + f"_lapel{side}", (sx * 0.07, -0.15, 0.68), (0.06, 0.025, 0.2), M["navy"], 0.01)
        lap.rotation_euler = (0, 0, radians(sx * 22))
    box(prefix + "_shirt", (0, -0.16, 0.72), (0.07, 0.02, 0.16), M["white"], 0.008)
    box(prefix + "_tie", (0, -0.17, 0.60), (0.035, 0.02, 0.24), M["red"], 0.008)


def hair_afro(prefix, skin, top):
    sph(prefix + "_afro", (0, 0.02, 1.2), 0.32, M["hair_af"], 18)
    for i, (ox, oy, oz) in enumerate([(-0.2, 0, 1.15), (0.2, 0, 1.15), (0, 0.18, 1.22), (-0.12, 0.12, 1.32), (0.12, -0.08, 1.3)]):
        sph(prefix + f"_afro{i}", (ox, oy, oz), 0.12, M["hair_af"], 10)
    sph(prefix + "_earL", (-0.3, -0.04, 1.05), 0.035, M["gold"], 8)
    sph(prefix + "_earR", (0.3, -0.04, 1.05), 0.035, M["gold"], 8)


def hair_tourist(prefix, skin, top):
    dome = sph(prefix + "_hat", (0, 0, 1.24), 0.26, M["straw"], 16)
    dome.scale = (1.15, 1.1, 0.55)
    apply_scale_local(dome)
    cyl(prefix + "_brim", (0, 0, 1.10), 0.34, 0.025, M["straw"], 20)
    box(prefix + "_shades", (0, -0.30, 1.09), (0.3, 0.045, 0.09), M["black"], 0.012)
    for i, (ox, oz) in enumerate([(-0.08, 0.62), (0.07, 0.54), (-0.03, 0.46), (0.1, 0.42), (-0.1, 0.38)]):
        sph(prefix + f"_flower{i}", (ox, -0.17, oz), 0.03, M["pink" if i % 2 == 0 else "white"], 8)


def hair_teen(prefix, skin, top):
    cap = sph(prefix + "_cap", (0, 0.02, 1.22), 0.24, M["red"], 16)
    cap.scale = (1.1, 1.05, 0.58)
    apply_scale_local(cap)
    brim = box(prefix + "_brim", (0, 0.20, 1.12), (0.18, 0.12, 0.025), M["red"], 0.01)
    brim.rotation_euler = (radians(12), 0, 0)
    sph(prefix + "_tuft", (0, -0.14, 1.16), 0.09, M["hair_br"], 10)


def hair_attendant(prefix, skin, top):
    h = sph(prefix + "_hair", (0, 0.02, 1.20), 0.24, M["hair_bk"], 16)
    h.scale = (1.1, 1.05, 0.58)
    apply_scale_local(h)
    sph(prefix + "_bun", (0, 0.18, 1.16), 0.1, M["hair_bk"], 12)
    cyl(prefix + "_scarf", (0, -0.02, 0.86), 0.085, 0.04, M["red"], 14)
    box(prefix + "_tag", (0.09, -0.17, 0.62), (0.05, 0.012, 0.03), M["gold"], 0.004)


def hair_grandma(prefix, skin, top):
    h = sph(prefix + "_hair", (0, 0.02, 1.20), 0.24, M["hair_gy"], 16)
    h.scale = (1.1, 1.05, 0.58)
    apply_scale_local(h)
    sph(prefix + "_bun", (0, 0, 1.34), 0.11, M["hair_gy"], 12)
    for side, sx in (("L", -0.115), ("R", 0.115)):
        box(prefix + f"_glass{side}", (sx, -0.30, 1.09), (0.12, 0.02, 0.1), M["black"], 0.004)
    box(prefix + "_bridge", (0, -0.30, 1.09), (0.05, 0.015, 0.02), M["black"], 0.002)
    skirt = sph(prefix + "_skirt", (0, -0.05, 0.22), 0.24, M["dkgrey"], 16)
    skirt.scale = (1.25, 1.35, 0.7)
    apply_scale_local(skirt)
    for i, z in enumerate([0.70, 0.58, 0.46]):
        sph(prefix + f"_btn{i}", (0, -0.17, z), 0.018, M["white"], 8)


def hair_headphones(prefix, skin, top):
    for i, (ox, oz) in enumerate([(-0.07, 1.24), (0.07, 1.26), (0, 1.32), (-0.05, 1.28), (0.06, 1.22)]):
        sp = sph(prefix + f"_spike{i}", (ox, 0, oz), 0.05, M["hair_bk"], 8)
        sp.scale = (0.7, 0.7, 1.7)
        apply_scale_local(sp)
    for side, sx in (("L", -1), ("R", 1)):
        cup = cyl(prefix + f"_cup{side}", (sx * 0.30, 0, 1.08), 0.09, 0.06, M["black"], 12)
        cup.rotation_euler = (0, radians(90), 0)
    box(prefix + "_band", (0, 0, 1.30), (0.55, 0.04, 0.035), M["black"], 0.01)
    topb = sph(prefix + "_bandTop", (0, 0, 1.32), 0.08, M["black"], 10)
    topb.scale = (2.2, 0.5, 0.5)
    apply_scale_local(topb)


def hair_punk(prefix, skin, top):
    for i, oy in enumerate([-0.14, -0.07, 0.0, 0.07, 0.14]):
        spike = sph(prefix + f"_mohawk{i}", (0, oy, 1.32), 0.055, M["hair_rd"], 8)
        spike.scale = (0.45, 0.55, 2.0)
        apply_scale_local(spike)
    for side, sx in (("L", -1), ("R", 1)):
        lap = box(prefix + f"_lapel{side}", (sx * 0.07, -0.15, 0.68), (0.06, 0.025, 0.2), M["black"], 0.01)
        lap.rotation_euler = (0, 0, radians(sx * 22))
    box(prefix + "_tee", (0, -0.16, 0.65), (0.09, 0.02, 0.2), M["white"], 0.01)
    for i, (ox, oz) in enumerate([(0.1, 0.38), (0.14, 0.34), (0.16, 0.30), (0.14, 0.26), (0.1, 0.22)]):
        sph(prefix + f"_chain{i}", (ox, -0.08, oz), 0.015, M["gold"], 6)


SPECS = [
    ("A_char1", 0, 0, "tan", dict(top="black", pants="grey", shoes="grey", short=True, brow="hair_br", brow_ang=5, hair=hair_gym)),
    ("A_char2", 2, 0, "pale", dict(top="beige", pants="shoe_br", shoes="shoe_br", brow="hair_gy", brow_ang=-10, hair=hair_old)),
    ("A_char3", 4, 0, "tan", dict(top="denim", pants="navy", shoes="shoe_br", brow="hair_br", hair=hair_beanie)),
    ("A_char4", 6, 0, "dark", dict(top="grey", pants="navy", shoes="white", brow="hair_br", hair=hair_hoodie)),
    ("B_char1", 0, 3, "pale", dict(top="navy", pants="grey", shoes="black", brow="hair_bk", brow_ang=14, hair=hair_suit)),
    ("B_char2", 2, 3, "dark", dict(top="red", pants="navy", shoes="red", brow="hair_af", hair=hair_afro)),
    ("B_char3", 4, 3, "brown", dict(top="teal", pants="beige", shoes="shoe_br", short=True, shades=True, hair=hair_tourist)),
    ("B_char4", 6, 3, "dark", dict(top="yellow", pants="black", shoes="red", short=True, brow="hair_br", brow_ang=8, hair=hair_teen)),
    ("C_char1", 0, 6, "pale", dict(top="navy", pants="navy", shoes="black", brow="hair_bk", smile=True, hair=hair_attendant)),
    ("C_char2", 2, 6, "tan", dict(top="lavender", pants="dkgrey", shoes="black", brow="hair_gy", brow_ang=-6, stock="dkgrey", hair=hair_grandma)),
    ("C_char3", 4, 6, "brown", dict(top="green", pants="black", shoes="white", short=True, brow="hair_bk", hair=hair_headphones)),
    ("C_char4", 6, 6, "dark", dict(top="black", pants="black", shoes="black", brow="hair_bk", brow_ang=18, hair=hair_punk)),
]

for s in SPECS:
    print("building", s[0])
    build(*s)

# VERIFY nothing collapsed
bad = []
for o in bpy.data.objects:
    if o.type != "MESH" or not o.name.startswith(("A_", "B_", "C_")):
        continue
    root_name = "_".join(o.name.split("_")[:2]) + "_root"
    root = bpy.data.objects.get(root_name)
    if not root:
        continue
    w = o.matrix_world.translation
    # should be near root xy
    if abs(w.x - root.location.x) > 1.5 or abs(w.y - root.location.y) > 1.5:
        bad.append((o.name, list(w), list(root.location)))
print("bad positions:", bad[:10], "count", len(bad))
print("A_char3 head", list(bpy.data.objects["A_char3_head"].matrix_world.translation))
print("A_char3 beanie", list(bpy.data.objects["A_char3_beanie"].matrix_world.translation))
print("A_char3 browL", list(bpy.data.objects["A_char3_browL"].matrix_world.translation))
print("A_char3 palmL", list(bpy.data.objects["A_char3_palmL"].matrix_world.translation))

for window in bpy.context.window_manager.windows:
    for area in window.screen.areas:
        if area.type == "VIEW_3D":
            for space in area.spaces:
                if space.type == "VIEW_3D":
                    space.shading.type = "MATERIAL"
                    space.overlay.show_relationship_lines = False
                    space.overlay.show_extras = False

_blend_out = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "blender", "passengers.blend")
)
bpy.ops.wm.save_as_mainfile(filepath=_blend_out)
print("DONE", _blend_out)
