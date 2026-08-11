"""Build the first detailed cruise-ship defence weapon pack.

Run from the repository root with Blender 5.x:
    blender --background --python tools/blender/build_weapon_rig.py

The source file intentionally keeps all four authored weapons together. Each
runtime GLB is exported from a selected asset collection with a stable `root`
node, semantic socket nodes and four presentation-only action clips.
"""

from pathlib import Path
import math

import bpy
from mathutils import Vector


PROJECT_ROOT = Path(__file__).resolve().parents[2]
SOURCE_PATH = PROJECT_ROOT / "assets-src" / "blender" / "weapons.blend"
RUNTIME_DIR = PROJECT_ROOT / "public" / "assets" / "weapons"
RENDER_DIR = PROJECT_ROOT / "artifacts" / "asset-previews" / "weapons"
FPS = 30


def make_material(name, color, metallic=0.0, roughness=0.5, emission=None, emission_strength=0.0):
    material = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    material.diffuse_color = (*color, 1.0)
    material.use_nodes = True
    principled = material.node_tree.nodes.get("Principled BSDF")
    principled.inputs["Base Color"].default_value = (*color, 1.0)
    principled.inputs["Metallic"].default_value = metallic
    principled.inputs["Roughness"].default_value = roughness
    if emission is not None:
        principled.inputs["Emission Color"].default_value = (*emission, 1.0)
        principled.inputs["Emission Strength"].default_value = emission_strength
    return material


def material_palette():
    return {
        "metal_dark": make_material("Weapon metal dark", (0.028, 0.045, 0.060), metallic=0.82, roughness=0.26),
        "metal_mid": make_material("Weapon brushed steel", (0.16, 0.22, 0.25), metallic=0.76, roughness=0.32),
        "metal_light": make_material("Weapon edge steel", (0.42, 0.49, 0.50), metallic=0.9, roughness=0.22),
        "rubber": make_material("Weapon grip rubber", (0.018, 0.024, 0.027), roughness=0.86),
        "rubber_detail": make_material("Weapon grip texture", (0.065, 0.078, 0.078), roughness=0.72),
        "brass": make_material("Weapon brass", (0.52, 0.24, 0.055), metallic=0.74, roughness=0.3),
        "copper": make_material("Weapon copper", (0.38, 0.09, 0.035), metallic=0.72, roughness=0.31),
        "paint_blue": make_material("Weapon deck blue", (0.025, 0.13, 0.22), metallic=0.42, roughness=0.36),
        "paint_orange": make_material("Weapon safety orange", (0.78, 0.18, 0.025), metallic=0.18, roughness=0.38),
        "wood": make_material("Weapon walnut", (0.18, 0.052, 0.018), roughness=0.62),
        "glass": make_material("Weapon sight glass", (0.015, 0.12, 0.16), metallic=0.15, roughness=0.12, emission=(0.02, 0.34, 0.40), emission_strength=1.5),
        "flare": make_material("Flare charge", (0.96, 0.12, 0.012), metallic=0.12, roughness=0.32, emission=(0.9, 0.035, 0.004), emission_strength=2.0),
    }


def part_name(asset, label):
    return f"{asset['short']}__{label}"


def register_mesh(asset, obj, label, material):
    obj.name = part_name(asset, label)
    obj.parent = asset["root"]
    obj["weapon_part"] = label
    if material is not None:
        obj.data.materials.append(material)
    asset["objects"].append(obj)
    return obj


def finish_mesh(obj, bevel=0.0):
    if bevel <= 0.0:
        return
    modifier = obj.modifiers.new("Authored edge bevel", "BEVEL")
    modifier.width = bevel
    modifier.segments = 1
    modifier.limit_method = "ANGLE"
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=modifier.name)


def add_cube(asset, label, dimensions, location, material, bevel=0.025, rotation=(0.0, 0.0, 0.0)):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=location)
    obj = bpy.context.object
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.rotation_euler = rotation
    finish_mesh(obj, bevel)
    return register_mesh(asset, obj, label, material)


def add_cylinder(
    asset,
    label,
    radius,
    depth,
    location,
    material,
    vertices=16,
    rotation=(math.pi / 2, 0.0, 0.0),
    bevel=0.012,
):
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices,
        radius=radius,
        depth=depth,
        location=location,
        rotation=rotation,
    )
    obj = bpy.context.object
    finish_mesh(obj, bevel)
    return register_mesh(asset, obj, label, material)


def add_cone(asset, label, radius1, radius2, depth, location, material, vertices=16, rotation=(math.pi / 2, 0.0, 0.0)):
    bpy.ops.mesh.primitive_cone_add(
        vertices=vertices,
        radius1=radius1,
        radius2=radius2,
        depth=depth,
        location=location,
        rotation=rotation,
    )
    obj = bpy.context.object
    finish_mesh(obj, 0.01)
    return register_mesh(asset, obj, label, material)


def add_uv_sphere(asset, label, scale, location, material, segments=16, rings=8):
    bpy.ops.mesh.primitive_uv_sphere_add(
        segments=segments,
        ring_count=rings,
        radius=1.0,
        location=location,
    )
    obj = bpy.context.object
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return register_mesh(asset, obj, label, material)


def add_torus(asset, label, major_radius, minor_radius, location, material, rotation=(math.pi / 2, 0.0, 0.0)):
    bpy.ops.mesh.primitive_torus_add(
        major_segments=16,
        minor_segments=8,
        location=location,
        major_radius=major_radius,
        minor_radius=minor_radius,
        rotation=rotation,
    )
    return register_mesh(asset, bpy.context.object, label, material)


def add_rod(asset, label, start, end, radius, material, vertices=10):
    start_vector = Vector(start)
    end_vector = Vector(end)
    delta = end_vector - start_vector
    midpoint = (start_vector + end_vector) * 0.5
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices,
        radius=radius,
        depth=delta.length,
        location=midpoint,
        rotation=delta.to_track_quat("Z", "Y").to_euler(),
    )
    return register_mesh(asset, bpy.context.object, label, material)


def add_socket(asset, name, location, role=None):
    obj = bpy.data.objects.new(part_name(asset, f"socket_{name}"), None)
    bpy.context.scene.collection.objects.link(obj)
    obj.parent = asset["root"]
    obj.location = location
    obj.empty_display_type = "ARROWS"
    obj.empty_display_size = 0.12
    obj["weapon_socket"] = role or name
    asset["objects"].append(obj)
    asset["sockets"].append({"object": obj, "name": name})
    return obj


def create_root(spec):
    armature = bpy.data.armatures.new(f"{spec['short']}__root")
    root = bpy.data.objects.new(f"{spec['short']}__root", armature)
    bpy.context.scene.collection.objects.link(root)
    root.rotation_mode = "XYZ"
    bpy.ops.object.select_all(action="DESELECT")
    root.select_set(True)
    bpy.context.view_layer.objects.active = root
    bpy.ops.object.mode_set(mode="EDIT")
    bone = armature.edit_bones.new("weapon_root")
    bone.head = (0.0, 0.0, 0.0)
    bone.tail = (0.0, 0.0, 0.28)
    bpy.ops.object.mode_set(mode="OBJECT")
    root["weapon_id"] = spec["id"]
    root["asset_version"] = 1
    root["coordinate_system"] = "Blender Z-up; muzzle points -Y; glTF Y-up export"
    root["presentation_only"] = True
    return {
        **spec,
        "root": root,
        "objects": [root],
        "sockets": [],
        "actions": [],
    }


def sidearm(asset, m):
    add_cube(asset, "frame", (0.48, 0.98, 0.30), (0.0, -0.28, 1.30), m["metal_dark"], 0.045)
    add_cube(asset, "slide", (0.42, 1.24, 0.28), (0.0, -0.72, 1.58), m["metal_mid"], 0.035)
    add_cube(asset, "slide_top", (0.30, 0.92, 0.07), (0.0, -0.77, 1.74), m["metal_light"], 0.018)
    add_cylinder(asset, "barrel", 0.075, 1.18, (0.0, -1.13, 1.58), m["metal_light"], 16, bevel=0.009)
    add_cylinder(asset, "muzzle_collar", 0.115, 0.12, (0.0, -1.73, 1.58), m["metal_dark"], 16, bevel=0.009)
    add_cone(asset, "muzzle_bevel", 0.11, 0.075, 0.11, (0.0, -1.84, 1.58), m["metal_light"], 16)
    add_cube(asset, "grip_core", (0.34, 0.62, 0.70), (0.0, 0.20, 0.91), m["rubber"], 0.045, (math.radians(-10), 0.0, 0.0))
    add_cube(asset, "grip_panel_left", (0.035, 0.49, 0.55), (-0.19, 0.20, 0.91), m["paint_blue"], 0.012, (math.radians(-10), 0.0, 0.0))
    add_cube(asset, "grip_panel_right", (0.035, 0.49, 0.55), (0.19, 0.20, 0.91), m["paint_blue"], 0.012, (math.radians(-10), 0.0, 0.0))
    add_cube(asset, "magazine", (0.24, 0.38, 0.60), (0.0, 0.20, 0.61), m["metal_dark"], 0.022)
    add_cube(asset, "magazine_base", (0.31, 0.43, 0.08), (0.0, 0.20, 0.30), m["metal_light"], 0.014)
    add_torus(asset, "trigger_guard", 0.15, 0.035, (0.0, -0.03, 1.19), m["metal_light"])
    add_cube(asset, "trigger", (0.055, 0.10, 0.18), (0.0, -0.10, 1.19), m["brass"], 0.012, (math.radians(-12), 0.0, 0.0))
    add_cube(asset, "ejection_port", (0.018, 0.27, 0.10), (0.22, -0.63, 1.61), m["metal_dark"], 0.008)
    add_cube(asset, "rear_sight", (0.12, 0.10, 0.10), (0.0, -0.18, 1.78), m["metal_dark"], 0.012)
    add_cube(asset, "front_sight", (0.07, 0.08, 0.13), (0.0, -1.42, 1.79), m["brass"], 0.01)
    for index, y in enumerate((-0.52, -0.68, -0.84)):
        add_cube(asset, f"slide_serration_{index + 1}", (0.44, 0.035, 0.09), (0.0, y, 1.73), m["metal_dark"], 0.006)
    add_cylinder(asset, "manual_safety", 0.045, 0.08, (0.255, -0.05, 1.41), m["paint_orange"], 12, rotation=(0.0, math.pi / 2, 0.0), bevel=0.006)
    add_uv_sphere(asset, "hammer", (0.07, 0.06, 0.08), (0.0, -0.02, 1.72), m["metal_dark"])
    sockets = {
        "grip": (0.0, 0.23, 0.75),
        "muzzle": (0.0, -1.88, 1.58),
        "magazine": (0.0, 0.20, 0.29),
        "sight": (0.0, -0.70, 1.80),
        "ejection_port": (0.24, -0.62, 1.61),
    }
    return sockets


def pump_shotgun(asset, m):
    add_cube(asset, "receiver", (0.56, 0.85, 0.43), (0.0, -0.22, 1.45), m["metal_dark"], 0.055)
    add_cube(asset, "receiver_top", (0.42, 0.53, 0.10), (0.0, -0.37, 1.71), m["metal_mid"], 0.018)
    add_cylinder(asset, "barrel", 0.105, 2.55, (0.0, -1.56, 1.58), m["metal_light"], 20, bevel=0.01)
    add_cylinder(asset, "magazine_tube", 0.115, 1.45, (0.0, -1.00, 1.25), m["metal_dark"], 20, bevel=0.01)
    add_cylinder(asset, "muzzle_ring", 0.145, 0.13, (0.0, -2.86, 1.58), m["metal_mid"], 20, bevel=0.01)
    add_cone(asset, "muzzle_choke", 0.14, 0.095, 0.16, (0.0, -3.00, 1.58), m["metal_light"], 20)
    add_cube(asset, "stock", (0.39, 1.18, 0.36), (0.0, 0.66, 1.47), m["wood"], 0.05, (math.radians(4), 0.0, 0.0))
    add_cube(asset, "butt_pad", (0.44, 0.12, 0.42), (0.0, 1.25, 1.47), m["rubber"], 0.028, (math.radians(4), 0.0, 0.0))
    add_cube(asset, "pistol_grip", (0.36, 0.48, 0.70), (0.0, 0.25, 0.99), m["rubber"], 0.045, (math.radians(-13), 0.0, 0.0))
    add_cube(asset, "pump_foregrip", (0.42, 0.52, 0.25), (0.0, -1.18, 1.12), m["paint_blue"], 0.042)
    add_cube(asset, "pump_texture", (0.46, 0.36, 0.06), (0.0, -1.18, 1.26), m["rubber_detail"], 0.012)
    add_torus(asset, "trigger_guard", 0.17, 0.038, (0.0, 0.01, 1.28), m["metal_light"])
    add_cube(asset, "trigger", (0.06, 0.10, 0.20), (0.0, -0.06, 1.28), m["brass"], 0.012, (math.radians(-9), 0.0, 0.0))
    add_cube(asset, "shell_ejection", (0.025, 0.26, 0.15), (0.29, -0.22, 1.48), m["metal_mid"], 0.008)
    add_cube(asset, "front_bead", (0.06, 0.08, 0.08), (0.0, -2.54, 1.72), m["brass"], 0.01)
    add_cube(asset, "rear_sight", (0.18, 0.13, 0.08), (0.0, -0.38, 1.79), m["metal_light"], 0.012)
    add_cube(asset, "safety_button", (0.08, 0.16, 0.08), (0.31, -0.02, 1.62), m["paint_orange"], 0.012, (0.0, math.pi / 2, 0.0))
    add_cylinder(asset, "tube_cap", 0.14, 0.08, (0.0, -1.70, 1.25), m["metal_light"], 20, bevel=0.008)
    add_cylinder(asset, "shell_1", 0.045, 0.19, (-0.33, -0.08, 1.23), m["brass"], 12, rotation=(math.pi / 2, 0.0, 0.0), bevel=0.005)
    add_cylinder(asset, "shell_2", 0.045, 0.19, (-0.33, -0.32, 1.23), m["brass"], 12, rotation=(math.pi / 2, 0.0, 0.0), bevel=0.005)
    add_cylinder(asset, "shell_3", 0.045, 0.19, (-0.33, -0.56, 1.23), m["brass"], 12, rotation=(math.pi / 2, 0.0, 0.0), bevel=0.005)
    sockets = {
        "grip": (0.0, 0.27, 0.77),
        "muzzle": (0.0, -3.08, 1.58),
        "stock": (0.0, 1.31, 1.47),
        "pump": (0.0, -1.18, 1.16),
        "shell_port": (0.31, -0.22, 1.48),
        "sight": (0.0, -0.39, 1.80),
    }
    return sockets


def compact_smg(asset, m):
    add_cube(asset, "receiver", (0.52, 1.00, 0.40), (0.0, -0.27, 1.43), m["paint_blue"], 0.05)
    add_cube(asset, "receiver_top", (0.43, 0.66, 0.10), (0.0, -0.44, 1.69), m["metal_dark"], 0.018)
    add_cube(asset, "handguard", (0.43, 0.72, 0.31), (0.0, -1.06, 1.43), m["metal_mid"], 0.045)
    add_cylinder(asset, "barrel", 0.075, 1.34, (0.0, -1.72, 1.43), m["metal_light"], 16, bevel=0.008)
    add_cylinder(asset, "flash_hider", 0.13, 0.30, (0.0, -2.45, 1.43), m["metal_dark"], 16, bevel=0.008)
    for index, y in enumerate((-2.34, -2.43, -2.52)):
        add_cube(asset, f"flash_hider_slot_{index + 1}", (0.20, 0.035, 0.055), (0.0, y, 1.43), m["metal_light"], 0.005)
    add_cube(asset, "pistol_grip", (0.34, 0.46, 0.68), (0.0, 0.24, 0.95), m["rubber"], 0.045, (math.radians(-13), 0.0, 0.0))
    add_cube(asset, "magazine", (0.29, 0.48, 0.68), (0.0, -0.18, 0.86), m["metal_dark"], 0.032, (math.radians(-5), 0.0, 0.0))
    add_cube(asset, "magazine_base", (0.33, 0.50, 0.08), (0.0, -0.21, 0.50), m["metal_light"], 0.012, (math.radians(-5), 0.0, 0.0))
    add_torus(asset, "trigger_guard", 0.16, 0.035, (0.0, 0.01, 1.20), m["metal_light"])
    add_cube(asset, "trigger", (0.055, 0.10, 0.18), (0.0, -0.06, 1.20), m["brass"], 0.01, (math.radians(-10), 0.0, 0.0))
    add_cube(asset, "charging_handle", (0.16, 0.10, 0.07), (0.27, -0.51, 1.75), m["metal_light"], 0.012)
    add_cube(asset, "ejection_port", (0.025, 0.28, 0.11), (0.27, -0.31, 1.56), m["metal_dark"], 0.008)
    add_cube(asset, "top_rail", (0.18, 0.65, 0.06), (0.0, -0.49, 1.78), m["metal_dark"], 0.008)
    for index, y in enumerate((-0.25, -0.40, -0.55, -0.70)):
        add_cube(asset, f"rail_lug_{index + 1}", (0.23, 0.035, 0.09), (0.0, y, 1.83), m["metal_light"], 0.006)
    add_cube(asset, "front_sight", (0.07, 0.08, 0.18), (0.0, -1.39, 1.72), m["brass"], 0.01)
    add_cube(asset, "rear_sight", (0.12, 0.10, 0.16), (0.0, -0.16, 1.84), m["metal_light"], 0.012)
    add_rod(asset, "stock_left", (-0.16, 0.18, 1.58), (-0.16, 0.82, 1.58), 0.035, m["metal_light"])
    add_rod(asset, "stock_right", (0.16, 0.18, 1.58), (0.16, 0.82, 1.58), 0.035, m["metal_light"])
    add_cube(asset, "stock_butt", (0.42, 0.12, 0.29), (0.0, 0.86, 1.58), m["rubber"], 0.022)
    add_cylinder(asset, "selector", 0.045, 0.08, (0.27, 0.04, 1.37), m["paint_orange"], 12, rotation=(0.0, math.pi / 2, 0.0), bevel=0.006)
    add_uv_sphere(asset, "status_lamp", (0.035, 0.035, 0.035), (-0.27, -0.01, 1.57), m["glass"], segments=12, rings=6)
    sockets = {
        "grip": (0.0, 0.27, 0.76),
        "muzzle": (0.0, -2.62, 1.43),
        "stock": (0.0, 0.91, 1.58),
        "magazine": (0.0, -0.18, 0.50),
        "sight": (0.0, -0.50, 1.84),
        "bolt": (0.27, -0.52, 1.76),
    }
    return sockets


def flare_gun(asset, m):
    add_cube(asset, "action_body", (0.48, 0.68, 0.42), (0.0, -0.18, 1.43), m["metal_dark"], 0.055)
    add_cylinder(asset, "flare_barrel", 0.17, 1.22, (0.0, -0.95, 1.57), m["metal_mid"], 20, bevel=0.012)
    add_cylinder(asset, "barrel_muzzle_ring", 0.20, 0.13, (0.0, -1.58, 1.57), m["paint_orange"], 20, bevel=0.01)
    add_cone(asset, "barrel_muzzle_bevel", 0.19, 0.15, 0.15, (0.0, -1.72, 1.57), m["metal_light"], 20)
    add_cylinder(asset, "inner_flare", 0.105, 0.30, (0.0, -1.78, 1.57), m["flare"], 16, bevel=0.006)
    add_cube(asset, "break_hinge_block", (0.50, 0.28, 0.34), (0.0, 0.28, 1.42), m["metal_light"], 0.035)
    add_cylinder(asset, "break_hinge", 0.09, 0.60, (0.0, 0.30, 1.42), m["metal_dark"], 16, rotation=(0.0, math.pi / 2, 0.0), bevel=0.008)
    add_cube(asset, "grip_core", (0.36, 0.52, 0.68), (0.0, 0.48, 0.92), m["wood"], 0.05, (math.radians(-15), 0.0, 0.0))
    add_cube(asset, "grip_backstrap", (0.12, 0.48, 0.54), (0.0, 0.67, 0.93), m["rubber"], 0.025, (math.radians(-15), 0.0, 0.0))
    add_cube(asset, "grip_panel_left", (0.035, 0.35, 0.46), (-0.19, 0.47, 0.93), m["paint_orange"], 0.012, (math.radians(-15), 0.0, 0.0))
    add_cube(asset, "grip_panel_right", (0.035, 0.35, 0.46), (0.19, 0.47, 0.93), m["paint_orange"], 0.012, (math.radians(-15), 0.0, 0.0))
    add_torus(asset, "trigger_guard", 0.16, 0.035, (0.0, 0.18, 1.20), m["metal_light"])
    add_cube(asset, "trigger", (0.055, 0.10, 0.18), (0.0, 0.10, 1.20), m["brass"], 0.01, (math.radians(-12), 0.0, 0.0))
    add_cube(asset, "hammer", (0.12, 0.18, 0.22), (0.0, 0.37, 1.72), m["metal_dark"], 0.025, (math.radians(-18), 0.0, 0.0))
    add_cube(asset, "hammer_spur", (0.16, 0.09, 0.08), (0.0, 0.43, 1.84), m["metal_light"], 0.012)
    add_cube(asset, "top_latch", (0.13, 0.24, 0.09), (0.0, -0.02, 1.73), m["brass"], 0.012)
    add_cube(asset, "front_sight", (0.07, 0.08, 0.16), (0.0, -1.28, 1.78), m["brass"], 0.01)
    add_cube(asset, "rear_sight", (0.13, 0.09, 0.10), (0.0, 0.02, 1.80), m["metal_light"], 0.01)
    add_cylinder(asset, "lanyard_loop", 0.08, 0.06, (0.0, 0.78, 0.67), m["metal_light"], 12, rotation=(0.0, math.pi / 2, 0.0), bevel=0.006)
    add_uv_sphere(asset, "safety_indicator", (0.035, 0.035, 0.035), (0.26, 0.08, 1.56), m["flare"], segments=12, rings=6)
    sockets = {
        "grip": (0.0, 0.50, 0.71),
        "muzzle": (0.0, -1.80, 1.57),
        "stock": (0.0, 0.82, 0.86),
        "chamber": (0.0, -0.52, 1.57),
        "sight": (0.0, -0.20, 1.80),
        "hammer": (0.0, 0.39, 1.78),
    }
    return sockets


ACTION_KEYS = {
    "Idle": [
        (1, (0.0, 0.0, 0.0), (0.0, 0.0, 0.0)),
        (19, (0.0, 0.0, 0.012), (math.radians(0.25), 0.0, 0.0)),
        (37, (0.0, 0.0, 0.0), (0.0, 0.0, 0.0)),
    ],
    "Fire": [
        (1, (0.0, 0.0, 0.0), (0.0, 0.0, 0.0)),
        (4, (0.0, 0.055, -0.01), (math.radians(-2.5), 0.0, 0.0)),
        (8, (0.0, 0.11, -0.025), (math.radians(-5.5), 0.0, 0.0)),
        (18, (0.0, 0.0, 0.0), (0.0, 0.0, 0.0)),
    ],
    "Reload": [
        (1, (0.0, 0.0, 0.0), (0.0, 0.0, 0.0)),
        (12, (0.0, 0.08, 0.025), (math.radians(-3.0), 0.0, math.radians(-2.0))),
        (24, (0.0, 0.13, 0.0), (math.radians(-5.0), 0.0, math.radians(-6.0))),
        (42, (0.0, 0.0, 0.0), (0.0, 0.0, 0.0)),
    ],
    "Inspect": [
        (1, (0.0, 0.0, 0.0), (0.0, 0.0, 0.0)),
        (18, (0.0, 0.0, 0.02), (math.radians(-3.0), math.radians(5.0), math.radians(-8.0))),
        (36, (0.0, 0.0, 0.04), (math.radians(-5.0), math.radians(11.0), math.radians(-14.0))),
        (55, (0.0, 0.0, 0.0), (0.0, 0.0, 0.0)),
    ],
}


def action_fcurves(action):
    if hasattr(action, "fcurves"):
        return list(action.fcurves)
    curves = []
    for layer in action.layers:
        for strip in layer.strips:
            for bag in getattr(strip, "channelbags", []):
                curves.extend(bag.fcurves)
    return curves


def build_actions(asset):
    root = asset["root"]
    pose_bone = root.pose.bones["weapon_root"]
    pose_bone.rotation_mode = "XYZ"
    for name, keys in ACTION_KEYS.items():
        action = bpy.data.actions.new(name)
        action.use_fake_user = True
        animation = root.animation_data or root.animation_data_create()
        animation.action = action
        if hasattr(animation, "action_slot") and action.slots:
            animation.action_slot = action.slots[0]
        for frame, location, rotation in keys:
            root.location = location
            root.rotation_euler = rotation
            root.keyframe_insert("location", frame=frame - 1)
            root.keyframe_insert("rotation_euler", frame=frame - 1)
            pose_bone.location = location
            pose_bone.rotation_euler = rotation
            pose_bone.keyframe_insert("location", frame=frame - 1)
            pose_bone.keyframe_insert("rotation_euler", frame=frame - 1)
        for curve in action_fcurves(action):
            for keyframe in curve.keyframe_points:
                keyframe.interpolation = "BEZIER"
                keyframe.easing = "EASE_IN_OUT"
        animation.action = None
        asset["actions"].append({"name": name, "action": action})
    pose_bone.location = (0.0, 0.0, 0.0)
    pose_bone.rotation_euler = (0.0, 0.0, 0.0)
    root.location = (0.0, 0.0, 0.0)
    root.rotation_euler = (0.0, 0.0, 0.0)
    root["action_contract"] = "Idle,Fire,Reload,Inspect"


def create_asset(spec, builder, materials):
    asset = create_root(spec)
    socket_locations = builder(asset, materials)
    add_socket(asset, "root", (0.0, 0.0, 0.0), "root")
    for name, location in socket_locations.items():
        add_socket(asset, name, location, name)
    build_actions(asset)
    asset["root"]["socket_contract"] = ",".join(socket["name"] for socket in asset["sockets"])
    return asset


def rename_for_export(asset):
    original_names = [(obj, obj.name) for obj in asset["objects"]]
    asset["root"].name = "root"
    for socket in asset["sockets"]:
        socket["object"].name = socket["name"]
    return original_names


def restore_names(original_names):
    for obj, name in original_names:
        obj.name = name


def select_asset(asset):
    bpy.ops.object.select_all(action="DESELECT")
    for obj in asset["objects"]:
        if obj.name in bpy.context.scene.objects:
            obj.hide_viewport = False
            obj.hide_render = False
            obj.select_set(True)
    bpy.context.view_layer.objects.active = asset["root"]


def export_asset(asset):
    RUNTIME_DIR.mkdir(parents=True, exist_ok=True)
    original_names = rename_for_export(asset)
    animation = asset["root"].animation_data or asset["root"].animation_data_create()
    nla_tracks = []
    try:
        for clip in asset["actions"]:
            action = clip["action"]
            name = clip["name"]
            track = animation.nla_tracks.new()
            track.name = name
            strip = track.strips.new(name, 0, action)
            strip.action_frame_start = action.frame_range[0]
            strip.action_frame_end = action.frame_range[1]
            strip.frame_start = 0
            strip.frame_end = action.frame_range[1] - action.frame_range[0]
            nla_tracks.append(track)
        select_asset(asset)
        bpy.ops.export_scene.gltf(
            filepath=str(RUNTIME_DIR / asset["file"]),
            export_format="GLB",
            export_apply=True,
            export_yup=True,
            export_materials="EXPORT",
            export_cameras=False,
            export_lights=False,
            export_extras=True,
            export_animations=True,
            export_animation_mode="NLA_TRACKS",
            export_optimize_animation_size=False,
            export_skins=True,
            use_selection=True,
        )
    finally:
        for track in nla_tracks:
            animation.nla_tracks.remove(track)
        restore_names(original_names)


def look_at(obj, target):
    direction = Vector(target) - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def add_render_setup(scene):
    try:
        scene.render.engine = "BLENDER_EEVEE_NEXT"
    except TypeError:
        scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1400
    scene.render.resolution_y = 820
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    if scene.world is None:
        scene.world = bpy.data.worlds.new("Weapon render world")
    scene.world.color = (0.004, 0.008, 0.014)

    deck_material = make_material("Weapon render deck", (0.012, 0.024, 0.036), metallic=0.25, roughness=0.42)
    bpy.ops.mesh.primitive_plane_add(size=24.0, location=(0.0, 0.0, 0.0))
    deck = bpy.context.object
    deck.name = "RENDER_DECK"
    deck.data.materials.append(deck_material)

    bpy.ops.object.camera_add(location=(6.0, -11.0, 5.0))
    camera = bpy.context.object
    camera.name = "RENDER_CAMERA"
    camera.data.lens = 58
    look_at(camera, (0.0, 0.0, 1.0))
    scene.camera = camera

    lights = [
        ("RENDER_KEY", "AREA", (4.5, -4.0, 7.5), 1100, 5.0),
        ("RENDER_FILL", "AREA", (-5.5, -1.5, 4.0), 700, 4.0),
        ("RENDER_RIM", "AREA", (1.5, 5.0, 5.5), 1300, 3.0),
    ]
    for name, light_type, location, energy, size in lights:
        bpy.ops.object.light_add(type=light_type, location=location)
        light = bpy.context.object
        light.name = name
        light.data.energy = energy
        light.data.shape = "DISK"
        light.data.size = size
        look_at(light, (0.0, 0.0, 1.0))


def render_static_overview(scene, assets):
    RENDER_DIR.mkdir(parents=True, exist_ok=True)
    offsets = (-3.9, -1.3, 1.3, 3.9)
    for asset, offset in zip(assets, offsets):
        asset["root"].location = (offset, 0.0, 0.0)
        asset["root"].rotation_euler = (0.0, 0.0, math.radians(90.0))
    scene.camera.location = (4.8, -13.5, 4.6)
    look_at(scene.camera, (0.0, 0.0, 1.0))
    scene.render.filepath = str(RENDER_DIR / "arsenal-three-quarter.png")
    bpy.ops.render.render(write_still=True)

    scene.camera.location = (0.0, -14.5, 3.3)
    look_at(scene.camera, (0.0, 0.0, 1.0))
    scene.render.filepath = str(RENDER_DIR / "arsenal-front.png")
    bpy.ops.render.render(write_still=True)


def render_action(scene, assets):
    RENDER_DIR.mkdir(parents=True, exist_ok=True)
    for asset in assets:
        asset["root"].location = (0.0, 0.0, 0.0)
        asset["root"].rotation_euler = (0.0, 0.0, math.radians(90.0))
        asset["root"].hide_render = asset["id"] != "deck-pump-shotgun"
    shotgun = next(asset for asset in assets if asset["id"] == "deck-pump-shotgun")
    animation = shotgun["root"].animation_data or shotgun["root"].animation_data_create()
    fire_action = next(clip["action"] for clip in shotgun["actions"] if clip["name"] == "Fire")
    animation.action = fire_action
    if hasattr(animation, "action_slot") and fire_action is not None and fire_action.slots:
        animation.action_slot = fire_action.slots[0]
    scene.frame_set(7)
    scene.camera.location = (4.2, -7.8, 3.5)
    scene.camera.data.lens = 66
    look_at(scene.camera, (0.0, -0.5, 1.2))
    scene.render.filepath = str(RENDER_DIR / "deck-pump-shotgun-fire.png")
    bpy.ops.render.render(write_still=True)
    animation.action = None
    scene.frame_set(1)
    for asset in assets:
        asset["root"].hide_render = False


def build():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.preferences.filepaths.save_version = 0
    scene = bpy.context.scene
    scene.render.fps = FPS
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0
    add_render_setup(scene)
    materials = material_palette()
    specs = [
        {
            "id": "defense-sidearm",
            "short": "sidearm",
            "file": "defense-sidearm.glb",
            "builder": sidearm,
        },
        {
            "id": "deck-pump-shotgun",
            "short": "shotgun",
            "file": "deck-pump-shotgun.glb",
            "builder": pump_shotgun,
        },
        {
            "id": "compact-boarder-smg",
            "short": "smg",
            "file": "compact-boarder-smg.glb",
            "builder": compact_smg,
        },
        {
            "id": "maritime-flare-gun",
            "short": "flare",
            "file": "maritime-flare-gun.glb",
            "builder": flare_gun,
        },
    ]
    assets = [create_asset(spec, spec["builder"], materials) for spec in specs]
    for asset in assets:
        export_asset(asset)
    render_static_overview(scene, assets)
    render_action(scene, assets)

    for asset in assets:
        asset["root"].location = (0.0, 0.0, 0.0)
        asset["root"].rotation_euler = (0.0, 0.0, 0.0)
        asset["root"].hide_render = False
    SOURCE_PATH.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE_PATH))
    print(f"Built {SOURCE_PATH}")
    for asset in assets:
        print(f"Built {RUNTIME_DIR / asset['file']}")
    print(f"Rendered {RENDER_DIR / 'arsenal-three-quarter.png'}")
    print(f"Rendered {RENDER_DIR / 'arsenal-front.png'}")
    print(f"Rendered {RENDER_DIR / 'deck-pump-shotgun-fire.png'}")


if __name__ == "__main__":
    build()
