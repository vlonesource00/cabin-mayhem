"""Bulletproof passenger factory — local parenting, no lids, brows in front of eyes."""
import bpy
from mathutils import Vector
from math import radians


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
    "hair_bl": mat("CM_hair_blond", hex_rgb("D4B06A")),
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
    "orange": mat("CM_orange", hex_rgb("E67E22")),
    "purple": mat("CM_purple", hex_rgb("7E57C2")),
    "mint": mat("CM_mint", hex_rgb("80CBC4")),
    "cardigan": mat("CM_cardigan", hex_rgb("612E24")),
    "grey": mat("CM_grey", hex_rgb("7A7A7A")),
    "dkgrey": mat("CM_dkgrey", hex_rgb("3A3A3A")),
    "shoe_br": mat("CM_shoe_br", hex_rgb("5C3A1E")),
    "gold": mat("CM_gold", hex_rgb("D4A017"), 0.35),
    "straw": mat("CM_straw", hex_rgb("D4B86A")),
    "pink": mat("CM_pink", hex_rgb("F48FB1")),
    "cap_red": mat("CM_cap_red", hex_rgb("BF1E1E")),
}

ROOT = None
COLL = None


def smooth(o):
    for p in o.data.polygons:
        p.use_smooth = True


def place(o, local_loc, material=None):
    """Parent to ROOT with identity inverse, set LOCAL location. Mesh stays at origin."""
    for c in list(o.users_collection):
        c.objects.unlink(o)
    COLL.objects.link(o)
    o.parent = ROOT
    o.matrix_parent_inverse.identity()
    o.location = Vector(local_loc)
    if material is not None:
        o.data.materials.clear()
        o.data.materials.append(material)
    smooth(o)
    bpy.ops.object.select_all(action="DESELECT")
    return o


def apply_scale_local(o):
    loc = o.location.copy()
    rot_mode = o.rotation_mode
    rot = o.rotation_quaternion.copy() if rot_mode == "QUATERNION" else o.rotation_euler.copy()
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
    bpy.ops.mesh.primitive_uv_sphere_add(
        segments=segs, ring_count=max(10, segs // 2), radius=r, location=(0, 0, 0)
    )
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
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=12, radius=radius, depth=max(d.length, 0.01), location=(0, 0, 0)
    )
    o = bpy.context.active_object
    o.name = name
    place(o, tuple(mid), material)
    o.rotation_mode = "QUATERNION"
    o.rotation_quaternion = d.to_track_quat("Z", "Y")
    return o


def delete_prefix(prefix):
    for o in list(bpy.data.objects):
        if o.name.startswith(prefix + "_") or o.name == prefix:
            bpy.data.objects.remove(o, do_unlink=True)
    c = bpy.data.collections.get(prefix)
    if c:
        bpy.data.collections.remove(c)


def start_char(prefix, x, y):
    global ROOT, COLL
    delete_prefix(prefix)
    COLL = bpy.data.collections.new(prefix)
    bpy.context.scene.collection.children.link(COLL)
    ROOT = bpy.data.objects.new(prefix + "_root", None)
    ROOT.empty_display_type = "PLAIN_AXES"
    ROOT.empty_display_size = 0.04
    ROOT.hide_viewport = True
    ROOT.hide_render = True
    ROOT.location = (x, y, 0)
    COLL.objects.link(ROOT)
    return ROOT, COLL


def body_core(prefix, skin, top, pants, shoes, pose="sit", short=False, shades=False, brow="hair_br", brow_ang=0, smile=False, stock=None):
    """Shared body. pose: 'sit' or 'tpose'."""
    torso = sph(prefix + "_torso", (0, 0.02, 0.56 if pose == "sit" else 1.05), 0.23, top, 22)
    torso.scale = (0.92, 0.7, 1.2)
    apply_scale_local(torso)
    if pose == "sit":
        torso.rotation_euler = (radians(4), 0, 0)

    hip_z = 0.28 if pose == "sit" else 0.78
    hips = sph(prefix + "_hips", (0, 0, hip_z), 0.19, pants, 18)
    hips.scale = (1.15, 1.05, 0.9)
    apply_scale_local(hips)

    neck_z = 0.86 if pose == "sit" else 1.35
    head_z = 1.06 if pose == "sit" else 1.55
    cyl(prefix + "_neck", (0, 0, neck_z), 0.06, 0.1, skin, 12)
    head = sph(prefix + "_head", (0, 0, head_z), 0.26, skin, 22)
    head.scale = (1.0, 0.93, 1.12)
    apply_scale_local(head)

    # Face — brows ALWAYS in front of eyes (more negative Y). NO lids.
    eye_y, eye_z = -0.22, head_z + 0.03
    for side, sx in (("L", -0.115), ("R", 0.115)):
        sph(prefix + f"_eye{side}", (sx, eye_y, eye_z), 0.125, M["eye_w"], 18)
        if not shades:
            pupil = sph(
                prefix + f"_pupil{side}",
                (sx + (0.012 if side == "L" else -0.01), eye_y - 0.105, eye_z),
                0.042,
                M["eye_b"],
                10,
            )
            pupil.scale = (1.0, 0.45, 1.0)
            apply_scale_local(pupil)

    if not shades:
        brow_mat = M[brow]
        for side, sx in (("L", -0.115), ("R", 0.115)):
            brow_o = box(
                prefix + f"_brow{side}",
                (sx, -0.34, eye_z + 0.13),
                (0.14, 0.05, 0.045),
                brow_mat,
                0.01,
            )
            brow_o.rotation_euler = (radians(-8), 0, radians(brow_ang if side == "L" else -brow_ang))

    sph(prefix + "_nose", (0, -0.27, head_z - 0.08), 0.028, skin, 10)
    mouth = box(prefix + "_mouth", (0, -0.25, head_z - 0.18), (0.1, 0.018, 0.014), M["mouth"], 0.006)
    mouth.rotation_euler = (radians(-12 if not smile else 12), 0, 0)

    if pose == "sit":
        _arms_sit(prefix, skin, top, short)
        _legs_sit(prefix, pants, shoes, stock)
    else:
        _arms_tpose(prefix, skin, top, short)
        _legs_tpose(prefix, pants, shoes, stock)

    return {"head_z": head_z, "eye_y": eye_y, "eye_z": eye_z}


def _arms_sit(prefix, skin, top, short):
    for side, sx in (("L", -1), ("R", 1)):
        sh = (sx * 0.20, 0.02, 0.70)
        el = (sx * 0.25, -0.15, 0.47)
        wr = (sx * 0.22, -0.36, 0.31)
        pa = (sx * 0.22, -0.42, 0.29)
        _arm_chain(prefix, side, sx, sh, el, wr, pa, skin, top, short)


def _arms_tpose(prefix, skin, top, short):
    # Arms straight out to sides
    for side, sx in (("L", -1), ("R", 1)):
        sh = (sx * 0.22, 0.0, 1.20)
        el = (sx * 0.48, 0.0, 1.20)
        wr = (sx * 0.72, 0.0, 1.20)
        pa = (sx * 0.82, 0.0, 1.20)
        _arm_chain(prefix, side, sx, sh, el, wr, pa, skin, top, short, tpose=True)


def _arm_chain(prefix, side, sx, sh, el, wr, pa, skin, top, short, tpose=False):
    sph(prefix + f"_shoulder{side}", sh, 0.06, top, 12)
    limb(prefix + f"_uparm{side}", sh, el, 0.058, top)
    fmat = skin if short else top
    sph(prefix + f"_elbow{side}", el, 0.05, fmat, 10)
    limb(prefix + f"_forearm{side}", el, wr, 0.05, fmat)
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

    if tpose:
        box(prefix + f"_palm{side}", pa, (0.03, 0.06, 0.09), skin, 0.012)
        for i, fl in enumerate([0.09, 0.105, 0.1, 0.08]):
            fx = pa[0] + sx * (0.02 + fl * 0.35)
            fy = pa[1] + (-0.034 + i * 0.025)
            fz = pa[2]
            fing = sph(prefix + f"_finger{side}{i}", (fx, fy, fz), 0.015, skin, 8)
            fing.scale = (fl / 0.03, 0.95, 0.95)
            apply_scale_local(fing)
        th = sph(prefix + f"_thumb{side}", (pa[0] + sx * 0.02, pa[1] - sx * 0.05, pa[2] + 0.02), 0.016, skin, 8)
        th.scale = (0.06 / 0.032, 1, 1)
        apply_scale_local(th)
    else:
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


def _legs_sit(prefix, pants, shoes, stock):
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


def _legs_tpose(prefix, pants, shoes, stock):
    for side, sx in (("L", -1), ("R", 1)):
        hip = (sx * 0.09, 0.0, 0.78)
        knee = (sx * 0.10, 0.0, 0.42)
        ankle = (sx * 0.10, 0.0, 0.08)
        limb(prefix + f"_thigh{side}", hip, knee, 0.075, pants)
        sph(prefix + f"_knee{side}", knee, 0.055, pants, 10)
        limb(prefix + f"_calf{side}", knee, ankle, 0.058, M[stock] if stock else pants)
        sph(prefix + f"_heel{side}", (sx * 0.10, 0.02, 0.04), 0.05, shoes, 10)
        toe = box(prefix + f"_shoe{side}", (sx * 0.10, -0.08, 0.04), (0.07, 0.11, 0.045), shoes, 0.014)


def qa_character(prefix):
    """Return list of issue strings. Empty = OK."""
    issues = []
    root = bpy.data.objects.get(prefix + "_root")
    if not root:
        return ["NO_ROOT"]
    objs = [o for o in bpy.data.objects if o.name.startswith(prefix + "_") and o.type == "MESH"]
    need = ["head", "torso", "eyeL", "eyeR"]
    names = {o.name.replace(prefix + "_", "") for o in objs}
    for n in need:
        if n not in names:
            issues.append(f"missing_{n}")
    if "browL" not in names and "shades" not in names:
        # tourist-style may skip brows if shades
        if not any("shades" in n or "shade" in n for n in names):
            issues.append("missing_brows")
    fingers = [n for n in names if n.startswith("finger") or n.startswith("thumb")]
    if len(fingers) < 8:
        issues.append(f"fingers_{len(fingers)}")
    lids = [n for n in names if "lid" in n]
    if lids:
        issues.append(f"lids_{lids}")
    # mesh/origin mismatch = floater risk
    for o in objs:
        corners = [o.matrix_world @ Vector(c) for c in o.bound_box]
        center = sum(corners, Vector()) / 8
        dist = (center - o.matrix_world.translation).length
        if dist > 0.35:
            issues.append(f"offset_{o.name.split('_')[-1]}:{dist:.2f}")
        if o.parent is None:
            issues.append(f"orphan_{o.name}")
        d = (o.matrix_world.translation - root.matrix_world.translation).length
        if d > 2.5:
            issues.append(f"far_{o.name}:{d:.2f}")
    # brows in front
    for side in ("L", "R"):
        eye = bpy.data.objects.get(f"{prefix}_eye{side}")
        brow = bpy.data.objects.get(f"{prefix}_brow{side}")
        if eye and brow and brow.location.y > -0.28:
            issues.append(f"brow{side}_behind")
    return issues


def build_character(prefix, x, y, skin_key, spec, pose="sit"):
    """
    spec keys: top, pants, shoes, hair(fn), short?, shades?, brow?, brow_ang?, smile?, stock?
    hair(fn) signature: hair(prefix, skin, top, head_z)
    """
    skin = M[skin_key]
    top = M[spec["top"]]
    pants = M[spec["pants"]]
    shoes = M[spec["shoes"]]
    start_char(prefix, x, y)
    info = body_core(
        prefix,
        skin,
        top,
        pants,
        shoes,
        pose=pose,
        short=spec.get("short", False),
        shades=spec.get("shades", False),
        brow=spec.get("brow", "hair_br"),
        brow_ang=spec.get("brow_ang", 0),
        smile=spec.get("smile", False),
        stock=spec.get("stock"),
    )
    # hair helpers receive head_z so accessories sit correctly in sit vs tpose
    hair_fn = spec["hair"]
    hair_fn(prefix, skin, top, info["head_z"])
    bpy.context.view_layer.update()
    return qa_character(prefix)
