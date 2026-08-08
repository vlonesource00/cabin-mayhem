"""Shared authoring kit for MS Cabin Mayhem.

Every build script imports this. It owns the palette, the metric conventions,
the hull form and the export contract so that a dozen scripts cannot drift into
a dozen different ships.

Conventions, all of them load-bearing:

* Blender is Z-up, one Blender unit is one metre. Authoring coordinates in this
  kit are already Three.js-facing (x starboard, y up, z forward) and are
  converted on the way in by `world_location`.
* A compartment is authored about its own floor centre: the floor plane is
  y = 0 and the origin sits midway along x and z.
* The exterior is authored in ship space instead: origin amidships on the
  centreline at the waterline, which is the same frame `src/data/ship-layout.ts`
  anchors every compartment in.
* Everything is joined by material before export. Draw-mesh count therefore
  equals material count, not prop count, which is what lets a room hold two
  thousand authored props and still fit the budget in docs/PERFORMANCE.md.

Run through Blender, never through a bare interpreter:
  blender --background --python tools/blender/compartments/build_compartments.py
  blender --background --python tools/blender/compartments/build_exterior.py
"""

from pathlib import Path
import math

import bpy


PROJECT_ROOT = Path(__file__).resolve().parents[3]
SOURCE_DIR = PROJECT_ROOT / "assets-src" / "blender" / "compartments"
RUNTIME_DIR = PROJECT_ROOT / "public" / "assets" / "compartments"
EXTERIOR_SOURCE_DIR = PROJECT_ROOT / "assets-src" / "blender"
EXTERIOR_RUNTIME_DIR = PROJECT_ROOT / "public" / "assets"

# Deck-to-deck pitch and clear headroom, fixed by docs/SHIP_LAYOUT.md.
DECK_PITCH = 3.2
DECKHEAD = 0.4

# The hull, from src/data/ship-layout.ts. These are not decoration: the deck
# edges, the rails and the balcony faces are all cut against `hull_half_beam`,
# so the promenade rail follows the same sheer the plating does.
LOA = 290.0
BEAM = 38.0
DRAUGHT = 8.4
AIR_DRAUGHT = 45.0
DECK_ZERO_Y = -7.2
TOP_DECK = 9

# The unrolled stair-tower mapping, from src/sim/compartment-space.ts. The
# geometry below has to agree with it exactly or the crew walks through treads.
FLIGHT_RUN = 6.0
LANDING_DEPTH = 2.4
SWITCHBACK_HALF_Z = 6.0
CLIMB_RUN_Z = 5.0
WELL_CENTRE_X = 4.3
WELL_HALF_X = 1.2

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
    # Exterior-only, but shared so a balcony rail inside a cabin and the same
    # rail seen from the water batch together.
    "hull": ((0.05, 0.10, 0.21), 0.10, 0.42),
    "boot": ((0.44, 0.11, 0.09), 0.00, 0.62),
    "orange": ((0.98, 0.45, 0.06), 0.00, 0.50),
    "canvas": ((0.94, 0.92, 0.86), 0.00, 0.85),
    "water": ((0.10, 0.55, 0.72), 0.00, 0.12),
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


def deck_floor_y(deck):
    """Ship-space height of a deck's floor. Mirrors `deckFloorY`."""
    return deck * DECK_PITCH + DECK_ZERO_Y


def hull_half_beam(z):
    """Moulded half-beam at a station, metres. Mirrors `halfBeamAt` exactly."""
    t = max(-1.0, min(1.0, z / (LOA / 2)))
    parallel = 0.45
    full = BEAM / 2
    if abs(t) <= parallel:
        return full
    fraction = (abs(t) - parallel) / (1 - parallel)
    if t > 0:
        return full - (full - 2.2) * math.pow(fraction, 1.6)
    return full - (full - 9.5) * math.pow(fraction, 1.4)


def superstructure_half_beam(z, inset=1.6):
    """Half-beam of the accommodation block, inset from the plating.

    Real ships step the superstructure in from the shell so the promenade can
    run outside it. That inset is what gives the vessel a silhouette instead of
    a slab, so it is a kit function and not a magic number in one script.
    """
    return max(2.0, hull_half_beam(z) - inset)


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
    """Axis-aligned box. `size` and `position` are (x, y, z) in metres.

    `rotation` is a Blender Euler, so `(0, 0, yaw)` spins the box about the
    vertical. `yaw_towards` derives the angle that points the box's long side
    along a direction in Three space.
    """
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


def yaw_towards(dx, dz):
    """Blender yaw that aims a cube's `size[0]` axis along Three (dx, dz).

    Blender X is Three x and Blender Y is Three -z, so a yaw of theta about the
    vertical carries local +X to Three (cos theta, 0, -sin theta).
    """
    return math.atan2(-dz, dx)


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


def fix_normals(obj):
    """Make an authored mesh's winding consistent and outward facing.

    `from_pydata` takes the face winding it is given, and Three.js
    `MeshStandardMaterial` is single sided. A hull built with half its faces
    wound the wrong way is invisible from half the compass.
    """
    bpy.ops.object.select_all(action="DESELECT")
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode="OBJECT")
    obj.select_set(False)
    return obj


def mesh_from(name, verts, faces, mat):
    """A mesh from explicit Three-space vertices and faces."""
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata([world_location(*vert) for vert in verts], [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj.data.materials.append(mat)
    return fix_normals(obj)


def prism(name, outline, bottom, top, mat):
    """Extrude a closed (x, z) outline between two heights.

    This is how every tapered deck plate is built: a box cannot follow the
    hull's fining, and a deck that overhangs the plating is the single most
    obvious way to make a ship look like a stack of crates.
    """
    count = len(outline)
    verts = [(x, bottom, z) for (x, z) in outline] + [(x, top, z) for (x, z) in outline]
    faces = [list(range(count))[::-1], list(range(count, count * 2))]
    for index in range(count):
        following = (index + 1) % count
        faces.append([index, following, following + count, index + count])
    return mesh_from(name, verts, faces, mat)


def open_prism(name, outline, bottom, top, mat, floor=False, ceiling=True):
    """`prism`, but with the caps optional.

    A solid prism is invisible from inside except its bottom face, which
    `fix_normals` points downwards — outwards, correctly, for a solid. That face
    is a full-width horizontal slab, so a solid superstructure block sitting on
    the sheer draws a black band across every compartment that reaches above it:
    the atrium void and all three stair towers. The exterior owns the shell, not
    the air inside it, so the block that stands over occupied volume is built
    hollow and the deck underfoot is left to the compartment that owns it.
    """
    count = len(outline)
    verts = [(x, bottom, z) for (x, z) in outline] + [(x, top, z) for (x, z) in outline]
    faces = []
    if floor:
        faces.append(list(range(count))[::-1])
    if ceiling:
        faces.append(list(range(count, count * 2)))
    for index in range(count):
        following = (index + 1) % count
        faces.append([index, following, following + count, index + count])
    return mesh_from(name, verts, faces, mat)


def loft(name, sections, mat, closed=True, cap=True):
    """Skin a run of equal-length cross sections, bow to stern.

    `sections` is a list of rings; each ring is a list of Three-space points and
    every ring has the same length, so ring vertex *i* is the same feature line
    at every station. That is what turns a table of half-beams into a hull.
    """
    ring_size = len(sections[0])
    verts = [point for ring in sections for point in ring]
    faces = []
    span = ring_size if closed else ring_size - 1
    for station in range(len(sections) - 1):
        here, following = station * ring_size, (station + 1) * ring_size
        for index in range(span):
            step = (index + 1) % ring_size
            faces.append([here + index, here + step, following + step, following + index])
    if cap:
        faces.append(list(range(ring_size))[::-1])
        faces.append(list(range(len(verts) - ring_size, len(verts))))
    return mesh_from(name, verts, faces, mat)


def railing(mats, name, points, y, height=1.12, spacing=2.4, mat="steel"):
    """A guard rail following an (x, z) polyline at height `y`.

    Two rails and a post every `spacing` metres. Rails are the cheapest thing on
    a ship that reads as a ship, which is why every open edge gets one.
    """
    material = mats[mat]
    for index in range(len(points) - 1):
        (x0, z0), (x1, z1) = points[index], points[index + 1]
        dx, dz = x1 - x0, z1 - z0
        run = math.hypot(dx, dz)
        if run < 0.05:
            continue
        yaw = yaw_towards(dx, dz)
        mid_x, mid_z = (x0 + x1) / 2, (z0 + z1) / 2
        for level, tag in ((height, "top"), (height * 0.55, "mid")):
            cube(
                f"{name}_rail_{index}_{tag}",
                (run, 0.05, 0.05),
                (mid_x, y + level, mid_z),
                material,
                0.0,
                (0.0, 0.0, yaw),
            )
        posts = max(2, int(run / spacing) + 1)
        for post in range(posts):
            along = post / (posts - 1)
            cube(
                f"{name}_post_{index}_{post}",
                (0.06, height, 0.06),
                (x0 + dx * along, y + height / 2, z0 + dz * along),
                material,
                0.0,
            )


def window_band(mats, name, span, y, sill, head, fixed, vertical, thickness=0.08, mullion=2.6):
    """A run of glazing with mullions, used by `shell` and by the exterior.

    `span` is (start, end) along the wall; `fixed` is the wall's other axis.
    """
    start, end = span
    extent = end - start
    if extent < 0.3:
        return
    mid = (start + end) / 2
    centre = (head + sill) / 2
    if vertical:
        cube(f"{name}_glass", (thickness, head - sill, extent), (fixed, y + centre, mid), mats["glass"], 0.0)
    else:
        cube(f"{name}_glass", (extent, head - sill, thickness), (mid, y + centre, fixed), mats["glass"], 0.0)
    bays = max(1, int(round(extent / mullion)))
    for bay in range(bays + 1):
        at = start + extent * bay / bays
        if vertical:
            cube(
                f"{name}_mullion_{bay}",
                (thickness * 1.6, head - sill, 0.1),
                (fixed, y + centre, at),
                mats["trim"],
                0.0,
            )
        else:
            cube(
                f"{name}_mullion_{bay}",
                (0.1, head - sill, thickness * 1.6),
                (at, y + centre, fixed),
                mats["trim"],
                0.0,
            )


def shell(mats, size, portals, carpet="carpet", glaze=None, open_sides=(), deckhead=True):
    """Deck, deckhead and four bulkheads, with a hole cut where each portal is.

    Portals are not modelled as boolean cuts — that would cost geometry and
    fight the joiner. The wall carrying a portal is authored as segments with a
    gap, which is cheaper and reads the same from inside.

    `glaze` maps a side name to a `(sill, head)` pair, and turns that side's
    plating into sill wall, glazing and header. That is how the ocean gets seen
    from inside: without it a cruise ship is a windowless hotel.

    `open_sides` names sides that carry no wall at all — a lido deck's edge —
    and gets a guard rail instead, because an open edge with no rail reads as a
    hole rather than a deck.
    """
    width, height, length = size
    half_x, half_z = width / 2, length / 2
    door_w, door_h = 1.6, 2.1
    glaze = glaze or {}

    cube("ENV_Deck", (width, 0.12, length), (0, -0.06, 0), mats[carpet], 0.0)
    if deckhead:
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
        panes = glaze.get(axis_name)
        edges = [-span / 2]
        for centre in cuts:
            edges.extend([centre - door_w / 2, centre + door_w / 2])
        edges.append(span / 2)
        for index in range(0, len(edges) - 1, 2):
            start, end = edges[index], edges[index + 1]
            if end - start < 0.02:
                continue
            mid, extent = (start + end) / 2, end - start
            if panes is None:
                bands = [(0.0, height)]
            else:
                sill, head = panes
                bands = [(0.0, sill), (head, height)]
                window_band(
                    mats,
                    f"ENV_Window_{axis_name}_{index}",
                    (start + 0.06, end - 0.06),
                    0.0,
                    sill,
                    head,
                    fixed,
                    vertical,
                )
            for band_index, (low, high) in enumerate(bands):
                if high - low < 0.05:
                    continue
                if vertical:
                    cube(
                        f"ENV_Bulkhead_{axis_name}_{index}_{band_index}",
                        (thickness, high - low, extent),
                        (fixed, (low + high) / 2, mid),
                        mats["bulkhead"],
                    )
                else:
                    cube(
                        f"ENV_Bulkhead_{axis_name}_{index}_{band_index}",
                        (extent, high - low, thickness),
                        (mid, (low + high) / 2, fixed),
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

    sides = {
        "fore": (width, 0.14, half_z, False),
        "aft": (width, 0.14, -half_z, False),
        "port": (length, 0.14, -half_x, True),
        "starboard": (length, 0.14, half_x, True),
    }
    for side, (span, thickness, fixed, vertical) in sides.items():
        if side in open_sides:
            if vertical:
                rail = [(fixed, -span / 2), (fixed, span / 2)]
            else:
                rail = [(-span / 2, fixed), (span / 2, fixed)]
            railing(mats, f"ENV_Rail_{side}", rail, 0.0)
            continue
        segmented(side, span, thickness, fixed, vertical, gaps[side])


def stair_tower(mats, size, portals, landings):
    """A tower's real geometry: landing plates, flights and well rails.

    This is the counterpart of the unrolled mapping in
    `src/sim/compartment-space.ts`, and the two have to agree to the
    centimetre. Landings span the shaft at each deck; the flights climb in a
    well hard to starboard that the plates are notched around, so a flight is
    never buried under the plate it is climbing to.

    A tower cannot use `shell`. Its ten doorways sit at ten different heights,
    and a wall built in one piece would have to be slotted from the deck to the
    deckhead to clear them. The shaft is instead plated one deck band at a time,
    which is also how it is built in a yard.
    """
    width, height, length = size
    half_x, half_z = width / 2, length / 2
    well_x0, well_x1 = WELL_CENTRE_X - WELL_HALF_X, WELL_CENTRE_X + WELL_HALF_X
    well_z0 = SWITCHBACK_HALF_Z - CLIMB_RUN_Z
    door_w, door_h = 1.6, 2.1

    cube("ENV_Deckhead", (width, 0.12, length), (0, height + 0.06, 0), mats["bulkhead"], 0.0)

    sides = {
        "fore": (width, half_z, False),
        "aft": (width, -half_z, False),
        "port": (length, -half_x, True),
        "starboard": (length, half_x, True),
    }

    def band(name, low, high, start, end, fixed, vertical):
        if high - low < 0.05 or end - start < 0.05:
            return
        mid, extent, thickness = (start + end) / 2, end - start, 0.14
        if vertical:
            cube(name, (thickness, high - low, extent), (fixed, (low + high) / 2, mid), mats["bulkhead"])
        else:
            cube(name, (extent, high - low, thickness), (mid, (low + high) / 2, fixed), mats["bulkhead"])

    for side, (span, fixed, vertical) in sides.items():
        for level, base in enumerate(landings):
            top = min(height, base + DECK_PITCH)
            doors = []
            for portal in portals:
                px, py, pz = portal["position"]
                if abs(py - base) > 1e-6:
                    continue
                if side == "fore" and pz >= half_z - 0.5:
                    doors.append(px)
                elif side == "aft" and pz <= -half_z + 0.5:
                    doors.append(px)
                elif side == "port" and px <= -half_x + 0.5:
                    doors.append(pz)
                elif side == "starboard" and px >= half_x - 0.5 and pz > -half_z + 0.5 and pz < half_z - 0.5:
                    doors.append(pz)
            edges = [-span / 2]
            for centre in sorted(doors):
                edges.extend([centre - door_w / 2, centre + door_w / 2])
            edges.append(span / 2)
            for index in range(0, len(edges) - 1, 2):
                band(
                    f"ENV_Shaft_{side}_{level}_{index}",
                    base,
                    top,
                    edges[index],
                    edges[index + 1],
                    fixed,
                    vertical,
                )
            for centre in doors:
                band(
                    f"ENV_Header_{side}_{level}_{centre}",
                    base + door_h,
                    top,
                    centre - door_w / 2,
                    centre + door_w / 2,
                    fixed,
                    vertical,
                )

    treads_per_flight = 16
    for index, level in enumerate(landings):
        # Plate aft of the well, spanning the full shaft.
        cube(
            f"ENV_Landing_{index}_aft",
            (width, 0.12, half_z + well_z0),
            (0, level - 0.06, (-half_z + well_z0) / 2),
            mats["deck"],
            0.0,
        )
        # Plate alongside the well, inboard of it.
        cube(
            f"ENV_Landing_{index}_inboard",
            (half_x + well_x0, 0.12, half_z - well_z0),
            ((-half_x + well_x0) / 2, level - 0.06, (well_z0 + half_z) / 2),
            mats["deck"],
            0.0,
        )
        if half_x - well_x1 > 0.05:
            cube(
                f"ENV_Landing_{index}_outboard",
                (half_x - well_x1, 0.12, half_z - well_z0),
                ((well_x1 + half_x) / 2, level - 0.06, (well_z0 + half_z) / 2),
                mats["deck"],
                0.0,
            )
        # Rail along the inboard edge of the well, so the opening reads as a
        # stairwell rather than a missing floor. The forward edge is left clear:
        # that is where the flight from below arrives.
        railing(
            mats,
            f"ENV_WellRail_{index}",
            [(well_x0, well_z0), (well_x0, half_z)],
            level,
            mat="brass",
        )

        if index + 1 >= len(landings):
            continue
        rise = (landings[index + 1] - level) / treads_per_flight
        run = CLIMB_RUN_Z / treads_per_flight
        for tread in range(treads_per_flight):
            top = level + rise * (tread + 1)
            cube(
                f"ENV_Tread_{index}_{tread}",
                (well_x1 - well_x0, rise + 0.06, run),
                (
                    WELL_CENTRE_X,
                    top - (rise + 0.06) / 2,
                    half_z - run * (tread + 0.5),
                ),
                mats["deck"],
                0.0,
            )


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


def join_by_material(root, group=None):
    """Collapse every loose prop into one mesh per material.

    This is technique 4 in docs/PERFORMANCE.md and the reason a compartment can
    hold hundreds of props inside a 40-draw-mesh budget.

    `group` tags the result, and is how the exterior keeps its structure and its
    dressing in separate meshes: the X1 tier in docs/PERFORMANCE.md hides the
    dressing by name when the crew is inside looking out of a window. Meshes
    already joined by an earlier call are left alone, so a script can build its
    structure, join it, then build its dressing and join that.
    """
    buckets = {}
    for obj in list(bpy.context.scene.objects):
        if obj.type != "MESH" or not obj.data.materials:
            continue
        if obj.get("cm_joined"):
            continue
        buckets.setdefault(obj.data.materials[0].name, []).append(obj)
    for material_name, objects in buckets.items():
        bpy.ops.object.select_all(action="DESELECT")
        for obj in objects:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = objects[0]
        bpy.ops.object.join()
        joined = bpy.context.object
        prefix = f"CM_{group}_" if group else "CM_"
        joined.name = f"{prefix}{material_name.upper()}"
        # The mesh datablock keeps whatever name the first object in the bucket
        # happened to have, and that is the name glTF writes for the mesh. Rename
        # it too, so the asset describes itself to the validator and to anyone
        # opening the GLB, not just to the runtime walking the scene graph.
        joined.data.name = joined.name
        joined.parent = root
        joined["cm_material_group"] = material_name
        joined["cm_static_visual"] = True
        joined["cm_joined"] = True
        if group:
            joined["cm_lod_group"] = group
    return len(buckets)


def new_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.preferences.filepaths.save_version = 0
    scene = bpy.context.scene
    # EEVEE's identifier moved to BLENDER_EEVEE_NEXT for the 4.2-4.5 series and
    # back again in 5.0. Nothing here renders, so take whichever this build has
    # rather than pinning a name and failing at scene setup.
    engines = scene.render.bl_rna.properties["engine"].enum_items.keys()
    for engine in ("BLENDER_EEVEE", "BLENDER_EEVEE_NEXT"):
        if engine in engines:
            scene.render.engine = engine
            break
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


def exterior_root():
    root = bpy.data.objects.new("CM_SHIP_EXTERIOR_ROOT", None)
    root["cm_asset_version"] = 1
    root["cm_compartment_id"] = "ship-exterior"
    root["cm_coordinate_system"] = "Three.js Y-up ship space, amidships on the waterline"
    bpy.context.scene.collection.objects.link(root)
    return root


def write_asset(asset_id, root, source_dir, runtime_dir, max_meshes, max_bytes, draw_meshes):
    source_dir.mkdir(parents=True, exist_ok=True)
    runtime_dir.mkdir(parents=True, exist_ok=True)
    source_path = source_dir / f"{asset_id}.blend"
    runtime_path = runtime_dir / f"{asset_id}.glb"
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
    print(f"  {asset_id}: {draw_meshes} draw meshes, {size / 1024:.1f} kB")
    if draw_meshes > max_meshes:
        raise SystemExit(f"{asset_id} exceeds the {max_meshes}-draw-mesh budget ({draw_meshes}).")
    if size > max_bytes:
        raise SystemExit(f"{asset_id} exceeds the {max_bytes / 1048576:.0f} MB budget ({size} bytes).")
    return draw_meshes, size


def export(compartment_id, root, portals):
    portal_markers(root, portals)
    draw_meshes = join_by_material(root)
    return write_asset(
        compartment_id,
        root,
        SOURCE_DIR,
        RUNTIME_DIR,
        320,
        24 * 1024 * 1024,
        draw_meshes,
    )


def export_exterior(root, draw_meshes):
    """The exterior is one always-resident asset, so it carries its own budget."""
    return write_asset(
        "ship-exterior",
        root,
        EXTERIOR_SOURCE_DIR,
        EXTERIOR_RUNTIME_DIR,
        640,
        48 * 1024 * 1024,
        draw_meshes,
    )


def grid(count, span):
    """Evenly spaced centres across `span`, inset half a step from each end."""
    if count <= 0:
        return []
    step = span / count
    return [-span / 2 + step * (index + 0.5) for index in range(count)]


TAU = math.tau
