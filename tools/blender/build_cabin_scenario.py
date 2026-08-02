"""Build Cabin Mayhem's project-owned cabin scenario.

Run with Blender 5.x:
  blender --background --python tools/blender/build_cabin_scenario.py
"""

from pathlib import Path
import math

import bpy


PROJECT_ROOT = Path(__file__).resolve().parents[2]
SOURCE_PATH = PROJECT_ROOT / "assets-src" / "blender" / "cabin-mayhem-scenario.blend"
RUNTIME_PATH = PROJECT_ROOT / "public" / "assets" / "scenarios" / "cabin-mayhem-scenario.glb"


def material(name, color, metallic=0.0, roughness=0.55, emission=None, emission_strength=0.0):
    result = bpy.data.materials.new(name)
    result.diffuse_color = (*color, 1.0)
    result.use_nodes = True
    principled = result.node_tree.nodes.get("Principled BSDF")
    principled.inputs["Base Color"].default_value = (*color, 1.0)
    principled.inputs["Metallic"].default_value = metallic
    principled.inputs["Roughness"].default_value = roughness
    if emission:
        principled.inputs["Emission Color"].default_value = (*emission, 1.0)
        principled.inputs["Emission Strength"].default_value = emission_strength
    return result


def world_location(x, y, z):
    # Blender is Z-up. glTF exports X, Z, -Y into Three.js X, Y, Z.
    return (x, -z, y)


def cube(name, size, position, mat, bevel=0.04, rotation=(0.0, 0.0, 0.0)):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=world_location(*position), rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = (size[0], size[2], size[1])
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel > 0:
        modifier = obj.modifiers.new("Soft indie edges", "BEVEL")
        modifier.width = bevel
        modifier.segments = 1
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    obj.data.materials.append(mat)
    return obj


def cylinder(name, radius, depth, position, mat, vertices=16, rotation=(math.pi / 2, 0.0, 0.0)):
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices,
        radius=radius,
        depth=depth,
        location=world_location(*position),
        rotation=rotation,
    )
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(mat)
    bevel = obj.modifiers.new("Soft indie edges", "BEVEL")
    bevel.width = min(radius * 0.18, 0.035)
    bevel.segments = 1
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=bevel.name)
    return obj


def add_seat(x, z, index, mats):
    shell = mats["seat_teal"] if index % 2 == 0 else mats["seat_blue"]
    cube(f"Seat base {index}", (0.82, 0.24, 0.78), (x, 0.46, z), shell, 0.09)
    back = cube(f"Seat back {index}", (0.84, 1.22, 0.20), (x, 1.05, z + 0.31), shell, 0.09)
    back.rotation_euler[0] = math.radians(-8)
    cube(f"Headrest {index}", (0.66, 0.34, 0.16), (x, 1.68, z + 0.40), mats["headrest"], 0.07)
    for side in (-1, 1):
        cube(
            f"Seat arm {index} {side}",
            (0.10, 0.12, 0.74),
            (x + side * 0.43, 0.72, z),
            mats["metal"],
            0.025,
        )
        cylinder(
            f"Seat leg {index} {side}",
            0.035,
            0.42,
            (x + side * 0.27, 0.22, z + 0.08),
            mats["metal"],
            8,
            (0.0, 0.0, 0.0),
        )


def join_by_material(root):
    buckets = {}
    for obj in list(bpy.context.scene.objects):
        if obj.type != "MESH" or not obj.data.materials:
            continue
        buckets.setdefault(obj.data.materials[0].name, []).append(obj)
    for material_name, objects in buckets.items():
        bpy.ops.object.select_all(action="DESELECT")
        for obj in objects:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = objects[0]
        bpy.ops.object.join()
        joined = bpy.context.object
        joined.name = f"CM_{material_name.upper().replace(' ', '_')}"
        joined.parent = root
        joined["cm_material_group"] = material_name


def build():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.preferences.filepaths.save_version = 0
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0

    mats = {
        "carpet": material("Carpet", (0.018, 0.070, 0.125), roughness=0.95),
        "shell": material(
            "Warm shell",
            (0.68, 0.76, 0.78),
            metallic=0.05,
            roughness=0.62,
            emission=(0.26, 0.31, 0.34),
            emission_strength=0.42,
        ),
        "trim": material("Metal trim", (0.22, 0.29, 0.35), metallic=0.72, roughness=0.28),
        "seat_teal": material("Seat teal", (0.018, 0.22, 0.31), roughness=0.78),
        "seat_blue": material("Seat blue", (0.025, 0.12, 0.28), roughness=0.76),
        "headrest": material("Headrest violet", (0.30, 0.12, 0.52), roughness=0.7),
        "metal": material("Seat metal", (0.32, 0.38, 0.42), metallic=0.82, roughness=0.27),
        "cyan": material(
            "Neon cyan", (0.02, 0.42, 0.48), metallic=0.12, roughness=0.3, emission=(0.03, 0.88, 0.78), emission_strength=2.2
        ),
        "pink": material(
            "Neon pink", (0.52, 0.03, 0.24), metallic=0.08, roughness=0.34, emission=(1.0, 0.06, 0.42), emission_strength=1.8
        ),
        "yellow": material(
            "Warning yellow", (0.70, 0.55, 0.03), metallic=0.05, roughness=0.42, emission=(1.0, 0.76, 0.03), emission_strength=1.0
        ),
        "dark": material("Galley dark", (0.025, 0.035, 0.075), metallic=0.46, roughness=0.38),
        "glass": material(
            "Window glow", (0.02, 0.17, 0.28), metallic=0.18, roughness=0.2, emission=(0.04, 0.42, 0.72), emission_strength=1.0
        ),
    }

    root = bpy.data.objects.new("CM_SCENARIO_ROOT", None)
    root["cm_asset_version"] = 1
    root["cm_coordinate_system"] = "Three.js Y-up cabin-local"
    scene.collection.objects.link(root)

    cube("Floor", (8.4, 0.16, 20.5), (0, -0.08, 7.25), mats["carpet"], 0.02)
    for x in (-4.08, 4.08):
        cube(f"Lower wall {x}", (0.16, 2.30, 20.5), (x, 1.15, 7.25), mats["shell"], 0.04)
    cube("Ceiling spine", (3.7, 0.14, 20.5), (0, 3.05, 7.25), mats["shell"], 0.05)
    cube(
        "Left roof shell",
        (2.2, 0.14, 20.5),
        (-3.0, 2.82, 7.25),
        mats["shell"],
        0.05,
    )
    cube(
        "Right roof shell",
        (2.2, 0.14, 20.5),
        (3.0, 2.82, 7.25),
        mats["shell"],
        0.05,
    )
    for x in (-2.7, -1.35, 1.35, 2.7):
        cube(f"Ceiling contour {x}", (1.18, 0.12, 20.5), (x, 2.84 - abs(x) * 0.08, 7.25), mats["shell"], 0.045)

    for z in [0.9 + step * 2.25 for step in range(8)]:
        for x in (-4.0, 4.0):
            cube(f"Window {x} {z}", (0.08, 0.62, 0.78), (x, 1.72, z), mats["glass"], 0.09)
        cube(f"Floor rib {z}", (8.16, 0.025, 0.055), (0, 0.02, z), mats["cyan"], 0.012)

    seat_xs = (-2.85, -1.65, 1.65, 2.85)
    seat_index = 0
    for row in range(8):
        z = 2.1 + row * 1.38
        for x in seat_xs:
            add_seat(x, z, seat_index, mats)
            seat_index += 1
        for x in (-3.18, 3.18):
            cube(f"Overhead bin {x} {row}", (1.25, 0.62, 1.12), (x, 2.48, z), mats["shell"], 0.12)
            cube(f"Bin accent {x} {row}", (0.035, 0.14, 0.78), (x - (0.61 if x > 0 else -0.61), 2.45, z), mats["pink"], 0.02)

    cube("Cockpit bulkhead", (8.0, 2.9, 0.18), (0, 1.45, 0.55), mats["dark"], 0.03)
    cube("Cockpit opening", (1.62, 2.4, 0.22), (0, 1.2, 0.45), mats["dark"], 0.10)
    cube("Cargo bulkhead", (8.0, 2.85, 0.16), (0, 1.42, 13.25), mats["dark"], 0.03)
    cube("Cargo opening", (1.85, 2.38, 0.20), (0, 1.19, 13.16), mats["dark"], 0.08)

    # Rear galley: chunky silhouettes, readable color groups, and an angry coffee face.
    for side in (-1, 1):
        x = side * 3.25
        cube(f"Galley tower {side}", (1.35, 2.55, 2.8), (x, 1.27, 11.25), mats["dark"], 0.10)
        cube(f"Galley counter {side}", (1.55, 0.18, 2.8), (x, 1.08, 11.25), mats["metal"], 0.05)
    cube("Coffee machine", (1.2, 1.18, 0.68), (-3.25, 1.60, 10.88), mats["trim"], 0.10)
    cube("Coffee screen", (0.62, 0.34, 0.055), (-3.25, 1.83, 10.52), mats["pink"], 0.04)
    for eye_x in (-3.42, -3.08):
        cube(f"Coffee eye {eye_x}", (0.11, 0.07, 0.04), (eye_x, 1.84, 10.48), mats["yellow"], 0.02)
    cube("Coffee mouth", (0.38, 0.055, 0.04), (-3.25, 1.70, 10.48), mats["pink"], 0.02)
    cube("Fire station frame", (1.28, 1.32, 0.16), (3.22, 1.45, 10.72), mats["yellow"], 0.05)

    for z in (3.0, 7.0, 11.0):
        cube(f"Aisle light {z}", (0.18, 0.025, 2.2), (0, 2.96, z), mats["cyan"], 0.015)
    for z in (1.05, 13.0):
        cube(f"Exit slash {z}", (1.1, 0.20, 0.05), (0, 2.63, z), mats["pink"], 0.02)

    join_by_material(root)
    for obj in root.children:
        if obj.type == "MESH":
            obj["cm_static_visual"] = True

    SOURCE_PATH.parent.mkdir(parents=True, exist_ok=True)
    RUNTIME_PATH.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE_PATH))
    bpy.ops.export_scene.gltf(
        filepath=str(RUNTIME_PATH),
        export_format="GLB",
        export_apply=True,
        export_yup=True,
        export_materials="EXPORT",
        export_cameras=False,
        export_lights=False,
        export_extras=True,
    )
    print(f"Built {SOURCE_PATH}")
    print(f"Built {RUNTIME_PATH}")


if __name__ == "__main__":
    build()
