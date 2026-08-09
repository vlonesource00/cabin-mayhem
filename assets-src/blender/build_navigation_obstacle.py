"""Build the authored navigation contact used by the collision-course slice.

Run with Blender 5.1 from the repository root:

    blender --background --python assets-src/blender/build_navigation_obstacle.py

The script is deterministic and writes both the editable Blender source and
the runtime GLB consumed by NavigationObstaclePresenter. The Three.js runtime
does not recreate this model; it only adds the shared distance marker and
presentation state around the authored asset.
"""

from pathlib import Path
import math

import bpy


PROJECT_ROOT = Path(__file__).resolve().parents[2]
SOURCE_PATH = PROJECT_ROOT / "assets-src" / "blender" / "navigation-obstacle-vessel.blend"
RUNTIME_PATH = PROJECT_ROOT / "public" / "assets" / "obstacles" / "navigation-vessel.glb"
ROOT_NAME = "CM_NAVIGATION_OBSTACLE_VESSEL_ROOT"


def material(name: str, color: tuple[float, float, float, float], metallic=0.0, roughness=0.55, emission=None):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = color
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get("Principled BSDF")
    if shader is not None:
        shader.inputs["Base Color"].default_value = color
        shader.inputs["Metallic"].default_value = metallic
        shader.inputs["Roughness"].default_value = roughness
        if emission is not None:
            emission_socket = shader.inputs.get("Emission Color") or shader.inputs.get("Emission")
            if emission_socket is not None:
                emission_socket.default_value = emission
            strength_socket = shader.inputs.get("Emission Strength")
            if strength_socket is not None:
                strength_socket.default_value = 3.0
    return mat


def assign(obj: bpy.types.Object, mat: bpy.types.Material):
    obj.data.materials.append(mat)
    obj.parent = bpy.data.objects[ROOT_NAME]
    obj.select_set(False)
    return obj


def cube(name, dimensions, location, mat, bevel=0.0):
    bpy.ops.mesh.primitive_cube_add(location=location)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        modifier = obj.modifiers.new("authored edge softening", "BEVEL")
        modifier.width = bevel
        modifier.segments = 2
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    return assign(obj, mat)


def cylinder(name, radius, depth, location, mat, vertices=12, rotation=(0.0, 0.0, 0.0)):
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices,
        radius=radius,
        depth=depth,
        location=location,
        rotation=rotation,
    )
    obj = bpy.context.object
    obj.name = name
    return assign(obj, mat)


def sphere(name, radius, location, mat):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=8, radius=radius, location=location)
    obj = bpy.context.object
    obj.name = name
    return assign(obj, mat)


def torus(name, major_radius, minor_radius, location, mat, rotation=(0.0, 0.0, 0.0)):
    bpy.ops.mesh.primitive_torus_add(
        major_radius=major_radius,
        minor_radius=minor_radius,
        major_segments=20,
        minor_segments=8,
        location=location,
        rotation=rotation,
    )
    obj = bpy.context.object
    obj.name = name
    return assign(obj, mat)


def tapered_hull(name, mat):
    # Vessel axes match the runtime: X abeam, Y up, Z fore/aft. The pointed
    # fore section makes the silhouette readable before cabin detail resolves.
    vertices = [
        (-1.65, 0.0, -3.2),
        (1.65, 0.0, -3.2),
        (-1.65, 0.0, 1.7),
        (1.65, 0.0, 1.7),
        (-0.52, 0.0, 3.25),
        (0.52, 0.0, 3.25),
        (-1.35, 0.78, -2.8),
        (1.35, 0.78, -2.8),
        (-1.35, 0.78, 1.55),
        (1.35, 0.78, 1.55),
        (-0.38, 0.78, 3.05),
        (0.38, 0.78, 3.05),
    ]
    faces = [
        (0, 1, 3, 2),
        (2, 3, 5, 4),
        (6, 8, 9, 7),
        (8, 10, 11, 9),
        (0, 6, 7, 1),
        (0, 2, 8, 6),
        (2, 4, 10, 8),
        (1, 7, 9, 3),
        (3, 9, 11, 5),
        (4, 5, 11, 10),
    ]
    mesh = bpy.data.meshes.new(name + " mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    return assign(obj, mat)


def build():
    bpy.ops.wm.read_factory_settings(use_empty=True)

    root = bpy.data.objects.new(ROOT_NAME, None)
    root.empty_display_type = "PLAIN_AXES"
    root["cm_asset_kind"] = "navigation-obstacle"
    root["cm_obstacle_kind"] = "vessel"
    root["cm_runtime_contract"] = "NavigationObstaclePresenter"
    bpy.context.collection.objects.link(root)

    hull = material("Navigation Vessel Hull", (0.055, 0.12, 0.19, 1.0), metallic=0.72, roughness=0.32)
    stripe = material("Navigation Vessel Safety Stripe", (0.95, 0.23, 0.08, 1.0), metallic=0.15, roughness=0.42)
    deck = material("Navigation Vessel Deck", (0.42, 0.46, 0.48, 1.0), metallic=0.45, roughness=0.5)
    cabin = material("Navigation Vessel Cabin", (0.78, 0.82, 0.79, 1.0), metallic=0.08, roughness=0.4)
    window = material("Navigation Vessel Windows", (0.015, 0.24, 0.33, 1.0), metallic=0.45, roughness=0.18)
    beacon = material(
        "Navigation Vessel Beacon",
        (1.0, 0.12, 0.02, 1.0),
        metallic=0.05,
        roughness=0.25,
        emission=(1.0, 0.03, 0.0, 1.0),
    )
    white = material("Navigation Vessel Markings", (0.94, 0.94, 0.84, 1.0), roughness=0.42)

    tapered_hull("CM_NAVIGATION_VESSEL_HULL", hull)
    cube("CM_NAVIGATION_VESSEL_DECK", (2.45, 0.12, 5.65), (0.0, 0.88, -0.05), deck, 0.05)
    cube("CM_NAVIGATION_VESSEL_STRIPE", (3.33, 0.09, 4.85), (0.0, 0.53, -0.15), stripe, 0.025)
    cube("CM_NAVIGATION_VESSEL_CABIN", (1.85, 1.15, 1.85), (0.0, 1.42, 0.10), cabin, 0.09)
    cube("CM_NAVIGATION_VESSEL_BRIDGE_WINDOW", (1.92, 0.38, 0.10), (0.0, 1.62, 1.05), window, 0.025)
    cube("CM_NAVIGATION_VESSEL_PORT_WINDOW", (0.10, 0.42, 1.18), (-0.94, 1.55, 0.20), window, 0.02)
    cube("CM_NAVIGATION_VESSEL_STARBOARD_WINDOW", (0.10, 0.42, 1.18), (0.94, 1.55, 0.20), window, 0.02)
    cube("CM_NAVIGATION_VESSEL_BOW_MARKING", (0.68, 0.03, 0.42), (0.0, 0.94, 2.48), white, 0.01)
    cylinder("CM_NAVIGATION_VESSEL_MAST", 0.055, 3.2, (0.0, 2.75, -0.75), deck, 10)
    cylinder("CM_NAVIGATION_VESSEL_RADAR", 0.07, 1.35, (0.0, 3.55, -0.75), deck, 10, (0.0, math.pi / 2, 0.0))
    sphere("CM_NAVIGATION_VESSEL_BEACON", 0.20, (0.0, 4.25, -0.75), beacon)
    torus("CM_NAVIGATION_VESSEL_LIFE_RING", 0.42, 0.075, (1.02, 1.16, -0.85), white, (math.pi / 2, 0.0, 0.0))
    cube("CM_NAVIGATION_VESSEL_LIFE_RING_STRIPE", (0.06, 0.08, 0.82), (1.02, 1.16, -0.85), stripe, 0.01)

    for obj in list(bpy.context.scene.objects):
        if obj.type == "MESH":
            obj["cm_authored_obstacle_part"] = True
            obj.select_set(False)

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
