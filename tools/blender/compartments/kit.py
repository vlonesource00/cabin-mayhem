"""Shared authoring kit for MS Cabin Mayhem compartments.

Every compartment build script imports this. It owns the palette, the metric
conventions and the export contract so that four scripts cannot drift into four
different ships.

Conventions, all of them load-bearing:

* Blender is Z-up, one Blender unit is one metre. Authoring coordinates in this
  kit are already Three.js-facing (x right, y up, z forward) and are converted
  on the way in by `world_location`.
* A compartment is authored about its own floor centre: the floor plane is
  y = 0 and the origin sits midway along x and z.
* Everything is joined by material before export. Draw-mesh count therefore
  equals material count, not prop count, which is what makes a dense room fit
  inside the 40-draw-mesh budget in docs/PERFORMANCE.md.

Run through Blender, never through a bare interpreter:
  blender --background --python tools/blender/compartments/build_compartments.py
"""

from pathlib import Path
import math

import bpy


PROJECT_ROOT = Path(__file__).resolve().parents[3]
SOURCE_DIR = PROJECT_ROOT / "assets-src" / "blender" / "compartments"
RUNTIME_DIR = PROJECT_ROOT / "public" / "assets" / "compartments"

# Deck-to-deck pitch and clear headroom, fixed by docs/SHIP_LAYOUT.md.
DECK_PITCH = 3.2
DECKHEAD = 0.4

# The shared palette. Colourful, exaggerated, low-poly, neon: the look the
# project committed to. Keep this list short — every entry is a draw call in
# every compartment that uses it.
PALETTE = {
    "deck": ((0.16, 0.20, 0.26), 0.0, 0.72),
    "carpet": ((0.24, 0.14, 0.30), 0.0, 0.90),
    "bulkhead": ((0.86, 0.88, 0.92), 0.0, 0.58),
    "trim": ((0.10, 0.13, 0.18), 0.1, 0.50),
    "wood": ((0.52, 0.32, 0.18), 0.0, 0.62),
    "brass": ((0.86, 0.66, 0.24), 0.85, 0.30),
    "steel": ((0.58, 0.62, 0.68), 0.80, 0.38),
    "teal": ((0.09, 0.62, 0.65), 0.0, 0.48),
    "coral": ((0.94, 0.36, 0.42), 0.0, 0.52),
    "glass": ((0.42, 0.72, 0.86), 0.0, 0.14),
}

# Emissive accents. Signage and instrument glow are how a low-poly room reads as
# alive without spending meshes on it.
EMISSIVE = {
    "neon_cyan": ((0.20, 0.95, 1.00), (0.20, 0.95, 1.00), 3.5),
    "neon_pink": ((1.00, 0.28, 0.68), (1.00, 0.28, 0.68), 3.2),
    "neon_amber": ((1.00, 0.70, 0.18), (1.00, 0.70, 0.18), 2.8),
    "screen": ((0.30, 0.85, 0.70), (0.30, 0.85, 0.70), 2.0),
}


def world_location(x, y, z):
    """Three.js-facing (x, y, z) to Blender Z-up (x, y, z)."""
    # glTF export with export_yup maps Blender (x, y, z) to glTF (x, z, -y).
    return (x, -z, y)


def build_materials():
    mats = {}
    for name, (color, metallic, roughness) in PALETTE.items():
        mat = bpy.data.materials.new(name)
        mat.diffuse_color = (*color, 1.0)
        mat.use_nodes = True
        bsdf = mat.node_tree.nodes.get("Principled BSDF")
        bsdf.inputs["Base Color"].default_value = (*color, 1.0)
        bsdf.inputs["Metallic"].default_value = metallic
        bsdf.inputs["Roughness"].default_value = roughness
        mats[name] = mat
    for name, (color, emission, strength) in EMISSIVE.items():
        mat = bpy.data.materials.new(name)
        mat.diffuse_color = (*color, 1.0)
        mat.use_nodes = True
        bsdf = mat.node_tree.nodes.get("Principled BSDF")
        bsdf.inputs["Base Color"].default_value = (*color, 1.0)
        bsdf.inputs["Roughness"].default_value = 0.35
        bsdf.inputs["Emission Color"].default_value = (*emission, 1.0)
        bsdf.inputs["Emission Strength"].default_value = strength
        mats[name] = mat
    return mats


def cube(name, size, position, mat, bevel=0.03, rotation=(0.0, 0.0, 0.0)):
    """Axis-aligned box. `size` and `position` are (x, y, z) in metres."""
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


def cylinder(name, radius, depth, position, mat, vertices=14, rotation=(0.0, 0.0, 0.0)):
    """Upright by default: `rotation` (0, 0, 0) stands the cylinder on the deck."""
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
    modifier = obj.modifiers.new("Soft indie edges", "BEVEL")
    modifier.width = min(radius * 0.16, 0.03)
    modifier.segments = 1
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    return obj


def shell(mats, size, portals, carpet="carpet"):
    """Deck, deckhead and four bulkheads, with a hole cut where each portal is.

    Portals are not modelled as boolean cuts — that would cost geometry and
    fight the joiner. The wall carrying a portal is authored as segments with a
    gap, which is cheaper and reads the same from inside.
    """
    width, height, length = size
    half_x, half_z = width / 2, length / 2
    door_w, door_h = 1.6, 2.1

    cube("ENV_Deck", (width, 0.12, length), (0, -0.06, 0), mats[carpet], 0.0)
    cube("ENV_Deckhead", (width, 0.12, length), (0, height + 0.06, 0), mats["bulkhead"], 0.0)

    gaps = {"fore": [], "aft": [], "port": [], "starboard": []}
    for portal in portals:
        px, _, pz = portal["position"]
        if pz >= half_z - 0.5:
            gaps["fore"].append(px)
        elif pz <= -half_z + 0.5:
            gaps["aft"].append(px)
        elif px <= -half_x + 0.5:
            gaps["port"].append(pz)
        else:
            gaps["starboard"].append(pz)

    def segmented(axis_name, span, thickness, fixed, vertical, openings):
        """Emit wall pieces along `span`, leaving a doorway at each opening."""
        cuts = sorted(openings)
        edges = [-span / 2]
        for centre in cuts:
            edges.extend([centre - door_w / 2, centre + door_w / 2])
        edges.append(span / 2)
        for index in range(0, len(edges) - 1, 2):
            start, end = edges[index], edges[index + 1]
            if end - start < 0.02:
                continue
            mid, extent = (start + end) / 2, end - start
            if vertical:
                cube(
                    f"ENV_Bulkhead_{axis_name}_{index}",
                    (thickness, height, extent),
                    (fixed, height / 2, mid),
                    mats["bulkhead"],
                )
            else:
                cube(
                    f"ENV_Bulkhead_{axis_name}_{index}",
                    (extent, height, thickness),
                    (mid, height / 2, fixed),
                    mats["bulkhead"],
                )
        # Header above each doorway, so the gap reads as a door and not as a
        # missing wall.
        for centre in cuts:
            if vertical:
                cube(
                    f"ENV_Header_{axis_name}_{centre}",
                    (thickness, height - door_h, door_w),
                    (fixed, door_h + (height - door_h) / 2, centre),
                    mats["trim"],
                )
            else:
                cube(
                    f"ENV_Header_{axis_name}_{centre}",
                    (door_w, height - door_h, thickness),
                    (centre, door_h + (height - door_h) / 2, fixed),
                    mats["trim"],
                )

    segmented("fore", width, 0.14, half_z, False, gaps["fore"])
    segmented("aft", width, 0.14, -half_z, False, gaps["aft"])
    segmented("port", length, 0.14, -half_x, True, gaps["port"])
    segmented("starboard", length, 0.14, half_x, True, gaps["starboard"])


def portal_markers(root, portals):
    """One empty per portal, named CM_PORTAL_<TARGET> in upper snake case.

    The streaming system binds the graph through these, so the names must match
    the targets declared in src/data/ship-layout.ts exactly.
    """
    for portal in portals:
        name = f"CM_PORTAL_{portal['target'].upper().replace('-', '_')}"
        empty = bpy.data.objects.new(name, None)
        empty.empty_display_type = "ARROWS"
        empty.empty_display_size = 0.6
        empty.location = world_location(*portal["position"])
        empty["cm_portal_target"] = portal["target"]
        bpy.context.scene.collection.objects.link(empty)
        empty.parent = root


def join_by_material(root):
    """Collapse every prop into one mesh per material.

    This is technique 4 in docs/PERFORMANCE.md and the reason a compartment can
    hold hundreds of props inside a 40-draw-mesh budget.
    """
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
        joined.name = f"CM_{material_name.upper()}"
        joined.parent = root
        joined["cm_material_group"] = material_name
        joined["cm_static_visual"] = True
    return len(buckets)


def new_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.preferences.filepaths.save_version = 0
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0
    return scene


def compartment_root(compartment_id, deck):
    name = f"CM_{compartment_id.upper().replace('-', '_')}_ROOT"
    root = bpy.data.objects.new(name, None)
    root["cm_asset_version"] = 1
    root["cm_compartment_id"] = compartment_id
    root["cm_deck"] = deck
    root["cm_coordinate_system"] = "Three.js Y-up compartment-local, floor centre origin"
    bpy.context.scene.collection.objects.link(root)
    return root


def export(compartment_id, root, portals):
    portal_markers(root, portals)
    draw_meshes = join_by_material(root)
    SOURCE_DIR.mkdir(parents=True, exist_ok=True)
    RUNTIME_DIR.mkdir(parents=True, exist_ok=True)
    source_path = SOURCE_DIR / f"{compartment_id}.blend"
    runtime_path = RUNTIME_DIR / f"{compartment_id}.glb"
    bpy.ops.wm.save_as_mainfile(filepath=str(source_path))
    bpy.ops.export_scene.gltf(
        filepath=str(runtime_path),
        export_format="GLB",
        export_apply=True,
        export_yup=True,
        export_materials="EXPORT",
        export_cameras=False,
        export_lights=False,
        export_extras=True,
    )
    size = runtime_path.stat().st_size
    print(f"  {compartment_id}: {draw_meshes} draw meshes, {size / 1024:.1f} kB")
    if draw_meshes > 40:
        raise SystemExit(f"{compartment_id} exceeds the 40-draw-mesh budget ({draw_meshes}).")
    if size > 3 * 1024 * 1024:
        raise SystemExit(f"{compartment_id} exceeds the 3 MB budget ({size} bytes).")
    return draw_meshes, size


def grid(count, span):
    """Evenly spaced centres across `span`, inset half a step from each end."""
    if count <= 0:
        return []
    step = span / count
    return [-span / 2 + step * (index + 0.5) for index in range(count)]


TAU = math.tau
