"""Build the cruise liveliness prop pack and its load-ready GLBs.

Run from the repository root with Blender 5.x:
  blender --background --python tools/blender/build_liveliness_props.py

Add ``--render-preview`` to capture a representative contact sheet after export.
The source blend keeps every prop at its own origin. Runtime files are exported
one prop at a time from their selected collection, so each GLB stays streamable.
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector


PROJECT_ROOT = Path(__file__).resolve().parents[2]
SOURCE_PATH = PROJECT_ROOT / "assets-src" / "blender" / "liveliness-props.blend"
RUNTIME_DIR = PROJECT_ROOT / "public" / "assets" / "liveliness"
PREVIEW_DIR = PROJECT_ROOT / "artifacts" / "asset-previews" / "liveliness"
FPS = 30


def token(asset_id: str) -> str:
    return asset_id.upper().replace("-", "_")


def link_to_collection(obj, collection):
    for current in list(obj.users_collection):
        current.objects.unlink(obj)
    collection.objects.link(obj)


def material(name, color, metallic=0.0, roughness=0.55, emission=None):
    result = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    result.diffuse_color = (*color, 1.0)
    result.use_nodes = True
    principled = result.node_tree.nodes.get("Principled BSDF")
    if principled is not None:
        for input_name, value in (
            ("Base Color", (*color, 1.0)),
            ("Metallic", metallic),
            ("Roughness", roughness),
        ):
            if input_name in principled.inputs:
                principled.inputs[input_name].default_value = value
        if emission is not None:
            if "Emission Color" in principled.inputs:
                principled.inputs["Emission Color"].default_value = (*emission, 1.0)
            if "Emission Strength" in principled.inputs:
                principled.inputs["Emission Strength"].default_value = 2.5
    return result


def finish_mesh(obj, collection, mat, parent, bevel=0.025):
    link_to_collection(obj, collection)
    obj.data.materials.append(mat)
    if bevel:
        modifier = obj.modifiers.new("Small production bevel", "BEVEL")
        modifier.width = bevel
        modifier.segments = 1
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        bpy.ops.object.modifier_apply(modifier=modifier.name)
        obj.select_set(False)
    obj.parent = parent
    obj["lod_role"] = "liveliness-prop-visual"
    return obj


def cube(collection, name, location, dimensions, mat, parent, bevel=0.025, rotation=(0.0, 0.0, 0.0)):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dimensions
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.select_set(False)
    return finish_mesh(obj, collection, mat, parent, bevel)


def cylinder(
    collection,
    name,
    location,
    radius,
    depth,
    mat,
    parent,
    vertices=12,
    rotation=(0.0, 0.0, 0.0),
    bevel=0.015,
):
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices,
        radius=radius,
        depth=depth,
        location=location,
        rotation=rotation,
    )
    obj = bpy.context.object
    obj.name = name
    return finish_mesh(obj, collection, mat, parent, bevel)


def sphere(collection, name, location, radius, mat, parent):
    bpy.ops.mesh.primitive_uv_sphere_add(
        segments=16,
        ring_count=8,
        radius=radius,
        location=location,
    )
    obj = bpy.context.object
    obj.name = name
    return finish_mesh(obj, collection, mat, parent, 0.0)


def torus(collection, name, location, major_radius, minor_radius, mat, parent, rotation=(0.0, 0.0, 0.0)):
    bpy.ops.mesh.primitive_torus_add(
        major_segments=24,
        minor_segments=8,
        major_radius=major_radius,
        minor_radius=minor_radius,
        location=location,
        rotation=rotation,
    )
    obj = bpy.context.object
    obj.name = name
    return finish_mesh(obj, collection, mat, parent, 0.0)


def empty(collection, name, parent=None, display_type="PLAIN_AXES"):
    obj = bpy.data.objects.new(name, None)
    collection.objects.link(obj)
    obj.empty_display_type = display_type
    if parent is not None:
        obj.parent = parent
    return obj


def add_marker_nodes(collection, root, asset_id, bounds):
    marker_prefix = f"LP_{token(asset_id)}_"
    anchor = empty(collection, f"{marker_prefix}INTERACTION_ANCHOR", root, "SPHERE")
    anchor.location = (0.0, -bounds[1] * 0.55, bounds[2] * 0.55)
    anchor.scale = (0.14, 0.14, 0.14)
    anchor["interaction_id"] = f"{asset_id}:use"
    anchor["semantic_action"] = "Use"

    collision = empty(collection, f"{marker_prefix}COLLISION_BOX", root, "CUBE")
    collision.location = (0.0, 0.0, bounds[2] * 0.5)
    collision.scale = (bounds[0], bounds[1], bounds[2])
    collision["collision_role"] = "static-prop"
    collision["collision_shape"] = "box"

    label = empty(collection, f"{marker_prefix}JOB_LABEL", root, "CIRCLE")
    label.location = (0.0, 0.0, bounds[2] + 0.18)
    label["job_id"] = asset_id
    return {"anchor": anchor, "collision": collision, "label": label}


def create_animation_driver(collection):
    armature_data = bpy.data.armatures.new("LP_SHARED_ANIMATION_DATA")
    driver = bpy.data.objects.new("LP_SHARED_ANIMATION_RIG", armature_data)
    collection.objects.link(driver)
    bpy.ops.object.select_all(action="DESELECT")
    driver.select_set(True)
    bpy.context.view_layer.objects.active = driver
    bpy.ops.object.mode_set(mode="EDIT")
    bone = armature_data.edit_bones.new("LP_ANIMATION_BONE")
    bone.head = (0.0, 0.0, 0.0)
    bone.tail = (0.0, 0.0, 0.12)
    bpy.ops.object.mode_set(mode="OBJECT")
    driver["animation_role"] = "semantic-action-driver"
    driver.select_set(False)
    return driver


def action_fcurves(action):
    if hasattr(action, "fcurves"):
        return list(action.fcurves)
    curves = []
    for layer in action.layers:
        for strip in layer.strips:
            for bag in getattr(strip, "channelbags", []):
                curves.extend(bag.fcurves)
    return curves


def bake_action(driver, action_name, frames, motion):
    action = bpy.data.actions.new(action_name)
    action.use_fake_user = True
    animation = driver.animation_data or driver.animation_data_create()
    animation.action = action
    if hasattr(animation, "action_slot") and action.slots:
        animation.action_slot = action.slots[0]

    pose_bone = driver.pose.bones[0]
    for frame, location, rotation in motion:
        pose_bone.location = location
        pose_bone.rotation_euler = rotation
        pose_bone.keyframe_insert(data_path="location", frame=frame)
        pose_bone.keyframe_insert(data_path="rotation_euler", frame=frame)

    for curve in action_fcurves(action):
        for keyframe in curve.keyframe_points:
            keyframe.interpolation = "BEZIER"
            keyframe.easing = "EASE_IN_OUT"
    animation.action = None
    return action


def add_actions(driver):
    idle = bake_action(
        driver,
        "Idle",
        60,
        [
            (0, (0.0, 0.0, 0.0), (0.0, 0.0, -0.015)),
            (30, (0.0, 0.0, 0.008), (0.0, 0.0, 0.015)),
            (60, (0.0, 0.0, 0.0), (0.0, 0.0, -0.015)),
        ],
    )
    use = bake_action(
        driver,
        "Use",
        36,
        [
            (0, (0.0, 0.0, 0.0), (0.0, 0.0, 0.0)),
            (12, (0.0, -0.025, 0.018), (math.radians(-3.0), 0.0, math.radians(2.0))),
            (36, (0.0, 0.0, 0.0), (0.0, 0.0, 0.0)),
        ],
    )
    complete = bake_action(
        driver,
        "Complete",
        42,
        [
            (0, (0.0, 0.0, 0.0), (0.0, 0.0, 0.0)),
            (18, (0.0, 0.0, 0.025), (0.0, 0.0, math.radians(-3.0))),
            (42, (0.0, 0.0, 0.0), (0.0, 0.0, 0.0)),
        ],
    )
    return {"Idle": idle, "Use": use, "Complete": complete}


def build_pool_cleaning_cart(collection, root, m):
    cube(collection, "LP_POOL_CART_BODY", (0.0, 0.0, 0.58), (1.25, 0.62, 0.72), m["teal"], root, 0.06)
    cube(collection, "LP_POOL_CART_LOWER_BIN", (0.0, -0.02, 0.42), (0.92, 0.45, 0.28), m["white"], root, 0.035)
    cube(collection, "LP_POOL_CART_TOP_TRAY", (0.0, 0.0, 1.03), (1.34, 0.68, 0.12), m["steel"], root, 0.025)
    for x in (-0.48, 0.48):
        cylinder(collection, f"LP_POOL_CART_HANDLE_POST_{x:+.2f}", (x, 0.26, 1.38), 0.035, 0.68, m["steel"], root)
    cylinder(
        collection,
        "LP_POOL_CART_HANDLE_GRIP",
        (0.0, 0.26, 1.72),
        0.045,
        1.0,
        m["orange"],
        root,
        rotation=(0.0, math.pi / 2, 0.0),
    )
    for x in (-0.48, 0.48):
        for y in (-0.25, 0.25):
            cylinder(
                collection,
                f"LP_POOL_CART_WHEEL_{x:+.2f}_{y:+.2f}",
                (x, y, 0.2),
                0.14,
                0.08,
                m["rubber"],
                root,
                vertices=12,
                rotation=(math.pi / 2, 0.0, 0.0),
            )
    cylinder(collection, "LP_POOL_CART_BUCKET", (-0.3, -0.02, 1.23), 0.2, 0.25, m["blue"], root, vertices=16)
    cylinder(
        collection,
        "LP_POOL_CART_BRUSH_POLE",
        (0.35, -0.02, 1.52),
        0.025,
        1.05,
        m["steel"],
        root,
        rotation=(0.0, math.radians(-14), 0.0),
    )
    cube(collection, "LP_POOL_CART_BRUSH_HEAD", (0.48, -0.02, 2.03), (0.34, 0.16, 0.1), m["orange"], root, 0.025)
    for x in (0.38, 0.48, 0.58):
        cube(collection, f"LP_POOL_CART_BRUSH_BRISTLE_{x:.2f}", (x, -0.02, 1.96), (0.035, 0.14, 0.11), m["navy"], root, 0.008)
    for x in (-0.42, -0.2, 0.2, 0.42):
        cube(collection, f"LP_POOL_CART_SAFETY_STRIPE_{x:+.2f}", (x, -0.326, 0.64), (0.12, 0.015, 0.09), m["yellow"], root, 0.005)


def build_mall_restock_pallet(collection, root, m):
    for x in (-0.72, 0.0, 0.72):
        cube(collection, f"LP_RESTOCK_PALLET_DECK_{x:+.2f}", (x, 0.0, 0.12), (0.58, 0.9, 0.16), m["wood"], root, 0.025)
        cube(collection, f"LP_RESTOCK_PALLET_SUPPORT_{x:+.2f}", (x, 0.0, 0.02), (0.26, 0.72, 0.12), m["wood_dark"], root, 0.015)
    for index, x in enumerate((-0.55, 0.0, 0.55), start=1):
        cube(collection, f"LP_RESTOCK_CRATE_{index}", (x, 0.0, 0.62), (0.5, 0.68, 0.8), m["orange" if index != 2 else "blue"], root, 0.035)
        cube(collection, f"LP_RESTOCK_CRATE_LID_{index}", (x, 0.0, 1.06), (0.53, 0.71, 0.08), m["wood"], root, 0.018)
        cube(collection, f"LP_RESTOCK_CRATE_LABEL_{index}", (x, -0.346, 0.65), (0.24, 0.018, 0.16), m["cream"], root, 0.006)
        cube(collection, f"LP_RESTOCK_CRATE_BAND_{index}", (x, 0.345, 0.62), (0.08, 0.02, 0.72), m["yellow"], root, 0.004)
    cube(collection, "LP_RESTOCK_SCAN_PLATE", (0.0, -0.5, 0.27), (0.72, 0.08, 0.08), m["steel"], root, 0.012)
    cylinder(
        collection,
        "LP_RESTOCK_PALLET_JACK_HANDLE",
        (0.0, 0.48, 0.75),
        0.035,
        0.82,
        m["steel"],
        root,
        rotation=(math.radians(18), 0.0, 0.0),
    )
    cylinder(
        collection,
        "LP_RESTOCK_PALLET_JACK_WHEEL",
        (0.0, 0.61, 0.15),
        0.12,
        0.08,
        m["rubber"],
        root,
        rotation=(math.pi / 2, 0.0, 0.0),
    )


def build_laundry_housekeeping_cart(collection, root, m):
    cube(collection, "LP_LAUNDRY_CART_FRAME", (0.0, 0.0, 0.5), (1.25, 0.62, 0.7), m["navy"], root, 0.05)
    cube(collection, "LP_LAUNDRY_CART_HAMPER", (0.0, -0.02, 0.92), (0.98, 0.52, 0.68), m["cream"], root, 0.045)
    cube(collection, "LP_LAUNDRY_CART_LID", (0.0, -0.02, 1.3), (1.02, 0.56, 0.1), m["teal"], root, 0.025)
    for x in (-0.46, 0.46):
        cylinder(collection, f"LP_LAUNDRY_CART_HANDLE_POST_{x:+.2f}", (x, 0.24, 1.5), 0.035, 0.5, m["steel"], root)
    cylinder(
        collection,
        "LP_LAUNDRY_CART_HANDLE",
        (0.0, 0.24, 1.75),
        0.045,
        1.0,
        m["orange"],
        root,
        rotation=(0.0, math.pi / 2, 0.0),
    )
    for x in (-0.48, 0.48):
        for y in (-0.24, 0.24):
            cylinder(
                collection,
                f"LP_LAUNDRY_CART_WHEEL_{x:+.2f}_{y:+.2f}",
                (x, y, 0.18),
                0.13,
                0.08,
                m["rubber"],
                root,
                rotation=(math.pi / 2, 0.0, 0.0),
            )
    for index, x in enumerate((-0.3, 0.0, 0.3), start=1):
        cube(collection, f"LP_LAUNDRY_CART_TOWEL_{index}", (x, -0.02, 1.4), (0.2, 0.28, 0.09), m["blue" if index != 2 else "yellow"], root, 0.015)
    for index, x in enumerate((-0.25, 0.25), start=1):
        cylinder(collection, f"LP_LAUNDRY_CART_SPRAY_BOTTLE_{index}", (x, -0.28, 1.48), 0.07, 0.25, m["green"], root, vertices=12)
        cube(collection, f"LP_LAUNDRY_CART_SPRAY_TRIGGER_{index}", (x + 0.035, -0.28, 1.65), (0.07, 0.05, 0.05), m["white"], root, 0.008)
    cube(collection, "LP_LAUNDRY_CART_ROOM_TAG", (0.0, -0.324, 0.84), (0.3, 0.018, 0.18), m["orange"], root, 0.008)


def build_medical_trolley(collection, root, m):
    cube(collection, "LP_MEDICAL_TROLLEY_CHASSIS", (0.0, 0.0, 0.55), (1.2, 0.62, 0.8), m["white"], root, 0.045)
    for index, z in enumerate((0.4, 0.68, 0.96), start=1):
        cube(collection, f"LP_MEDICAL_TROLLEY_DRAWER_{index}", (0.0, -0.325, z), (0.88, 0.035, 0.18), m["blue"], root, 0.012)
        cylinder(collection, f"LP_MEDICAL_TROLLEY_DRAWER_PULL_{index}", (0.0, -0.37, z), 0.018, 0.28, m["steel"], root, rotation=(math.pi / 2, 0.0, 0.0), bevel=0.006)
    cube(collection, "LP_MEDICAL_TROLLEY_TOP", (0.0, 0.0, 1.04), (1.3, 0.68, 0.12), m["steel"], root, 0.025)
    for x in (-0.5, 0.5):
        cylinder(collection, f"LP_MEDICAL_TROLLEY_RAIL_{x:+.2f}", (x, 0.25, 1.34), 0.03, 0.55, m["steel"], root)
    cylinder(
        collection,
        "LP_MEDICAL_TROLLEY_BACK_HANDLE",
        (0.0, 0.28, 1.62),
        0.04,
        1.0,
        m["blue"],
        root,
        rotation=(0.0, math.pi / 2, 0.0),
    )
    for x in (-0.48, 0.48):
        for y in (-0.24, 0.24):
            cylinder(
                collection,
                f"LP_MEDICAL_TROLLEY_WHEEL_{x:+.2f}_{y:+.2f}",
                (x, y, 0.16),
                0.12,
                0.08,
                m["rubber"],
                root,
                rotation=(math.pi / 2, 0.0, 0.0),
            )
    cube(collection, "LP_MEDICAL_TROLLEY_CROSS_VERTICAL", (0.0, -0.366, 1.22), (0.1, 0.02, 0.28), m["red"], root, 0.008)
    cube(collection, "LP_MEDICAL_TROLLEY_CROSS_HORIZONTAL", (0.0, -0.366, 1.22), (0.28, 0.02, 0.1), m["red"], root, 0.008)
    cylinder(collection, "LP_MEDICAL_TROLLEY_IV_POLE", (0.42, 0.0, 1.95), 0.025, 1.5, m["steel"], root)
    sphere(collection, "LP_MEDICAL_TROLLEY_IV_BAG", (0.42, 0.0, 2.64), 0.13, m["glass"], root)
    cube(collection, "LP_MEDICAL_TROLLEY_MONITOR", (-0.38, 0.18, 1.42), (0.3, 0.08, 0.25), m["navy"], root, 0.015, rotation=(math.radians(-12), 0.0, 0.0))


def build_lifebuoy_emergency_rack(collection, root, m):
    for x in (-0.48, 0.48):
        cylinder(collection, f"LP_LIFEBUOY_RACK_POST_{x:+.2f}", (x, 0.0, 1.0), 0.035, 2.0, m["steel"], root)
    for z in (0.16, 1.9):
        cylinder(
            collection,
            f"LP_LIFEBUOY_RACK_BAR_{z:.2f}",
            (0.0, 0.0, z),
            0.035,
            1.05,
            m["steel"],
            root,
            rotation=(0.0, math.pi / 2, 0.0),
        )
    cube(collection, "LP_LIFEBUOY_RACK_SHELF", (0.0, 0.12, 0.28), (1.1, 0.45, 0.08), m["red"], root, 0.02)
    torus(collection, "LP_LIFEBUOY_RING", (0.0, -0.16, 1.16), 0.48, 0.1, m["red"], root, rotation=(math.pi / 2, 0.0, 0.0))
    for index, x in enumerate((-0.28, 0.28), start=1):
        cube(collection, f"LP_LIFEBUOY_RING_BAND_{index}", (x, -0.16, 1.16), (0.12, 0.2, 0.22), m["white"], root, 0.01)
    cube(collection, "LP_LIFEBUOY_EMERGENCY_BOX", (0.0, 0.1, 1.74), (0.55, 0.32, 0.42), m["orange"], root, 0.035)
    cube(collection, "LP_LIFEBUOY_BOX_LID", (0.0, -0.08, 1.96), (0.58, 0.36, 0.07), m["white"], root, 0.012)
    cube(collection, "LP_LIFEBUOY_CROSS_VERTICAL", (0.0, -0.266, 1.74), (0.08, 0.02, 0.22), m["red"], root, 0.006)
    cube(collection, "LP_LIFEBUOY_CROSS_HORIZONTAL", (0.0, -0.266, 1.74), (0.22, 0.02, 0.08), m["red"], root, 0.006)
    cylinder(collection, "LP_LIFEBUOY_BEACON", (0.38, -0.2, 2.14), 0.09, 0.18, m["yellow"], root, vertices=16)
    sphere(collection, "LP_LIFEBUOY_BEACON_LENS", (0.38, -0.2, 2.25), 0.07, m["emission"], root)


def build_helm_radio_console(collection, root, m):
    cube(collection, "LP_HELM_CONSOLE_BASE", (0.0, 0.0, 0.35), (1.2, 0.9, 0.45), m["navy"], root, 0.06)
    cube(collection, "LP_HELM_CONSOLE_PEDESTAL", (0.0, 0.0, 0.92), (0.9, 0.68, 0.8), m["teal"], root, 0.045)
    cube(
        collection,
        "LP_HELM_CONSOLE_SLOPED_PANEL",
        (0.0, -0.02, 1.38),
        (1.0, 0.72, 0.18),
        m["steel"],
        root,
        0.025,
        rotation=(math.radians(-12), 0.0, 0.0),
    )
    cube(collection, "LP_HELM_CONSOLE_RADIO_PANEL", (0.0, -0.385, 1.02), (0.68, 0.04, 0.34), m["black"], root, 0.012)
    cube(collection, "LP_HELM_CONSOLE_RADIO_SCREEN", (0.0, -0.412, 1.09), (0.28, 0.015, 0.12), m["emission"], root, 0.004)
    for index, x in enumerate((-0.23, 0.0, 0.23), start=1):
        cylinder(collection, f"LP_HELM_CONSOLE_RADIO_KNOB_{index}", (x, -0.43, 0.92), 0.055, 0.05, m["orange"], root, vertices=12, rotation=(math.pi / 2, 0.0, 0.0), bevel=0.008)
    cylinder(collection, "LP_HELM_CONSOLE_MAST", (0.36, 0.0, 1.82), 0.025, 0.85, m["steel"], root)
    sphere(collection, "LP_HELM_CONSOLE_MAST_LAMP", (0.36, 0.0, 2.28), 0.08, m["emission"], root)
    cube(collection, "LP_HELM_CONSOLE_MIC_DOCK", (-0.34, -0.05, 1.55), (0.18, 0.2, 0.12), m["black"], root, 0.02)
    cylinder(collection, "LP_HELM_CONSOLE_MIC_HANDLE", (-0.34, -0.05, 1.78), 0.045, 0.42, m["black"], root, rotation=(math.radians(-12), 0.0, 0.0))
    sphere(collection, "LP_HELM_CONSOLE_MIC_HEAD", (-0.34, -0.1, 1.98), 0.09, m["black"], root)
    torus(collection, "LP_HELM_CONSOLE_MIC_CABLE", (-0.34, 0.08, 1.56), 0.15, 0.018, m["rubber"], root, rotation=(math.pi / 2, 0.0, 0.0))
    cylinder(collection, "LP_HELM_CONSOLE_TASK_BUTTON", (0.25, -0.42, 1.27), 0.07, 0.06, m["red"], root, vertices=12, rotation=(math.pi / 2, 0.0, 0.0), bevel=0.008)
    cube(collection, "LP_HELM_CONSOLE_TASK_LABEL", (-0.25, -0.42, 1.27), (0.18, 0.015, 0.06), m["yellow"], root, 0.004)


ASSET_SPECS = [
    {
        "id": "pool-cleaning-cart",
        "label": "Pool cleaning cart",
        "job": "pool-cleaning",
        "builder": build_pool_cleaning_cart,
        "bounds": (1.5, 0.8, 2.2),
    },
    {
        "id": "mall-restock-pallet",
        "label": "Mall restock pallet",
        "job": "mall-restock",
        "builder": build_mall_restock_pallet,
        "bounds": (2.0, 1.1, 1.6),
    },
    {
        "id": "laundry-housekeeping-cart",
        "label": "Laundry and housekeeping cart",
        "job": "laundry-housekeeping",
        "builder": build_laundry_housekeeping_cart,
        "bounds": (1.5, 0.8, 2.1),
    },
    {
        "id": "medical-trolley",
        "label": "Medical trolley",
        "job": "medical-response",
        "builder": build_medical_trolley,
        "bounds": (1.5, 0.8, 2.8),
    },
    {
        "id": "lifebuoy-emergency-rack",
        "label": "Lifebuoy emergency rack",
        "job": "emergency-response",
        "builder": build_lifebuoy_emergency_rack,
        "bounds": (1.3, 0.7, 2.5),
    },
    {
        "id": "helm-radio-task-console",
        "label": "Helm radio task console",
        "job": "helm-radio-task",
        "builder": build_helm_radio_console,
        "bounds": (1.5, 1.1, 2.5),
    },
]


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for collection in list(bpy.data.collections):
        if collection.name != "Collection" and collection.users == 0:
            bpy.data.collections.remove(collection)


def make_materials():
    return {
        "navy": material("LP Navy", (0.025, 0.07, 0.14), roughness=0.72),
        "teal": material("LP Teal", (0.03, 0.42, 0.45), roughness=0.48),
        "blue": material("LP Blue", (0.06, 0.24, 0.68), roughness=0.5),
        "orange": material("LP Safety Orange", (0.94, 0.24, 0.045), roughness=0.45),
        "yellow": material("LP Safety Yellow", (0.95, 0.72, 0.05), roughness=0.4),
        "red": material("LP Emergency Red", (0.82, 0.035, 0.035), roughness=0.42),
        "green": material("LP Cleaning Green", (0.12, 0.62, 0.25), roughness=0.48),
        "white": material("LP Warm White", (0.84, 0.9, 0.88), roughness=0.62),
        "cream": material("LP Label Cream", (0.92, 0.78, 0.52), roughness=0.72),
        "wood": material("LP Pallet Wood", (0.52, 0.25, 0.09), roughness=0.86),
        "wood_dark": material("LP Pallet Shadow", (0.22, 0.09, 0.035), roughness=0.9),
        "steel": material("LP Brushed Steel", (0.32, 0.4, 0.44), metallic=0.72, roughness=0.32),
        "rubber": material("LP Rubber", (0.018, 0.022, 0.028), roughness=0.92),
        "black": material("LP Radio Black", (0.008, 0.012, 0.018), roughness=0.44),
        "glass": material("LP Medical Glass", (0.32, 0.75, 0.82), roughness=0.2),
        "emission": material("LP Signal Glow", (0.08, 0.36, 0.9), roughness=0.25, emission=(0.08, 0.36, 1.0)),
    }


def create_assets():
    scene = bpy.context.scene
    scene.frame_start = 0
    scene.frame_end = 60
    scene.render.fps = FPS
    materials = make_materials()
    assets = []
    for spec in ASSET_SPECS:
        asset_token = token(spec["id"])
        collection = bpy.data.collections.new(f"LP_{asset_token}")
        scene.collection.children.link(collection)
        root = empty(collection, f"LP_{asset_token}_ROOT")
        root["liveliness_asset_id"] = spec["id"]
        root["job_id"] = spec["job"]
        root["interaction_action"] = "Use"
        spec["builder"](collection, root, materials)
        markers = add_marker_nodes(collection, root, spec["id"], spec["bounds"])
        assets.append(
            {
                "spec": spec,
                "collection": collection,
                "root": root,
                "markers": markers,
            }
        )
    driver = create_animation_driver(assets[0]["collection"])
    for asset in assets[1:]:
        asset["collection"].objects.link(driver)
    actions = add_actions(driver)
    for asset in assets:
        asset["driver"] = driver
        asset["actions"] = actions
    return assets


def export_asset(asset):
    for obj in bpy.context.scene.objects:
        obj.select_set(False)
    selected = list(asset["collection"].objects)
    for obj in selected:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = asset["root"]

    old_names = {label: action.name for label, action in asset["actions"].items()}
    target_actions = set(asset["actions"].values())
    for action in bpy.data.actions:
        action.use_fake_user = action in target_actions
    for label, action in asset["actions"].items():
        action.name = label
    old_marker_names = {key: marker.name for key, marker in asset["markers"].items()}
    asset["markers"]["anchor"].name = "LP_INTERACTION_ANCHOR"
    asset["markers"]["collision"].name = "LP_COLLISION_BOX"
    asset["markers"]["label"].name = "LP_JOB_LABEL"

    runtime_path = RUNTIME_DIR / f"{asset['spec']['id']}.glb"
    runtime_path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(runtime_path),
        export_format="GLB",
        export_apply=True,
        export_yup=True,
        export_materials="EXPORT",
        export_cameras=False,
        export_lights=False,
        export_extras=True,
        export_animations=True,
        export_animation_mode="ACTIONS",
        export_optimize_animation_size=False,
        export_skins=False,
        use_selection=True,
    )

    for label, action in asset["actions"].items():
        action.name = old_names[label]
    for key, marker in asset["markers"].items():
        marker.name = old_marker_names[key]
    print(f"Exported {asset['spec']['id']} to {runtime_path}")


def look_at(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def render_preview(assets):
    preview_collection = bpy.data.collections.new("LP_PREVIEW")
    bpy.context.scene.collection.children.link(preview_collection)
    bpy.ops.mesh.primitive_plane_add(size=18.0, location=(0.0, 0.0, 0.0))
    floor = bpy.context.object
    floor.name = "LP_PREVIEW_FLOOR"
    link_to_collection(floor, preview_collection)
    floor.data.materials.append(material("LP Preview Floor", (0.018, 0.025, 0.045), roughness=0.86))

    positions = [(-4.0, 1.7), (-1.35, 1.7), (1.35, 1.7), (4.0, 1.7), (-1.35, -1.7), (1.35, -1.7)]
    for asset, position in zip(assets, positions):
        asset["root"].location = (position[0], position[1], 0.0)

    bpy.ops.object.camera_add(location=(8.8, -11.5, 8.4))
    camera = bpy.context.object
    camera.name = "LP_PREVIEW_CAMERA"
    link_to_collection(camera, preview_collection)
    look_at(camera, (0.0, 0.0, 0.9))
    bpy.context.scene.camera = camera

    for name, location, energy, size in (
        ("LP_PREVIEW_KEY", (2.0, -4.0, 9.0), 1500.0, 5.0),
        ("LP_PREVIEW_FILL", (-6.0, 2.0, 5.0), 900.0, 4.0),
        ("LP_PREVIEW_RIM", (5.0, 6.0, 4.0), 1100.0, 3.0),
    ):
        bpy.ops.object.light_add(type="AREA", location=location)
        light = bpy.context.object
        light.name = name
        light.data.energy = energy
        light.data.shape = "DISK"
        light.data.size = size
        link_to_collection(light, preview_collection)
        look_at(light, (0.0, 0.0, 0.8))

    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1100
    scene.render.resolution_y = 720
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    PREVIEW_DIR.mkdir(parents=True, exist_ok=True)
    scene.render.filepath = str(PREVIEW_DIR / "liveliness-props-preview.png")
    if scene.world is None:
        scene.world = bpy.data.worlds.new("LP Preview World")
    scene.world.color = (0.008, 0.012, 0.025)
    scene.frame_set(0)
    bpy.ops.render.render(write_still=True)
    print(f"Rendered preview to {scene.render.filepath}")


def build():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.preferences.filepaths.save_version = 0
    clear_scene()
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0
    assets = create_assets()

    SOURCE_PATH.parent.mkdir(parents=True, exist_ok=True)
    RUNTIME_DIR.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE_PATH))
    for asset in assets:
        export_asset(asset)

    if "--render-preview" in sys.argv:
        render_preview(assets)
    print(f"Built {len(assets)} liveliness props")


if __name__ == "__main__":
    build()
