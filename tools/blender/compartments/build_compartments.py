"""Author every compartment of MS Cabin Mayhem as a streamable GLB.

  blender --background --python tools/blender/compartments/build_compartments.py

Fourteen compartments, one GLB each, deterministic from source. Sizes, anchors
and portal positions here are copies of the table in `src/data/ship-layout.ts`
and must stay copies: `pnpm validate:assets` compares the two and fails on drift.

Every room is authored dense on purpose, because a cruise ship that reads as a
cruise ship is furniture, not architecture. An accommodation deck runs to well
over a thousand authored props. Density is paid for by joining per material at
export — the draw-mesh count in docs/PERFORMANCE.md is a material count, not a
prop count — and never by deleting content.

Scale note: one authored unit is one metre and `CABIN_SCALE` in
src/three/coordinates.ts is 1, so the numbers here are the numbers the
simulation clamps against.
"""

from pathlib import Path
import math
import sys

# Blender does not put the script's own directory on sys.path.
sys.path.insert(0, str(Path(__file__).resolve().parent))

import kit  # noqa: E402
from kit import (  # noqa: E402
    DECK_PITCH,
    cube,
    cylinder,
    grid,
    hull_half_beam,
    railing,
    window_band,
    yaw_towards,
)


def portal(target, x, y, z):
    return {"target": target, "position": (x, y, z)}


def wall_segments(start, end, doors, door_w=1.6):
    """`start`..`end` split into the pieces left over between doorways."""
    edges = [start]
    for centre in sorted(doors):
        edges.extend([centre - door_w / 2, centre + door_w / 2])
    edges.append(end)
    return [
        (edges[index], edges[index + 1])
        for index in range(0, len(edges) - 1, 2)
        if edges[index + 1] - edges[index] > 0.05
    ]


# ---------------------------------------------------------------------------
# Working spaces — the parts every service room is built out of
#
# The public rooms have their own vocabulary further down (slab, bench,
# planter, shop_unit and friends). These are the other half of the ship: the
# counters, shelving, machinery and access ladders that make a galley read as a
# galley and an engine room read as an engine room. Each one returns the height
# of whatever surface it just made, so the next thing up can be placed against a
# number this helper decided rather than a number copied by hand.
# ---------------------------------------------------------------------------


def counter(mats, name, x, z, width, depth, y=0.0, height=0.90,
            top="steel", body="steel", kick=True, lip=0):
    """A work counter: recessed toe kick, carcass, and an overhanging top.

    `lip` is 0, -1 or +1: the side of the counter that gets a raised splash
    upstand, which is how you tell at a glance which face is worked from.
    """
    surface = y + height
    if kick:
        cube(f"{name}_kick", (width - 0.18, 0.14, depth - 0.18), (x, y + 0.07, z),
             mats["trim"], 0.0)
        cube(f"{name}_body", (width, height - 0.20, depth),
             (x, y + 0.14 + (height - 0.20) / 2, z), mats[body], 0.02)
    else:
        cube(f"{name}_body", (width, height - 0.06, depth),
             (x, y + (height - 0.06) / 2, z), mats[body], 0.02)
    cube(f"{name}_top", (width + 0.06, 0.06, depth + 0.06), (x, surface - 0.03, z),
         mats[top], 0.0)
    if lip:
        cube(f"{name}_upstand", (width + 0.06, 0.10, 0.05),
             (x, surface + 0.05, z + lip * (depth + 0.01) / 2), mats[top], 0.0)
    return surface


def shelf_unit(mats, name, x, z, width, depth, y, height, shelves=4,
               frame="steel", plank="steel"):
    """Open shelving — four legs and a stack of decks, so the stock shows.

    Returns the y of every deck, because a rack whose contents are placed by
    hand always ends up with one tin floating and one buried.
    """
    for tag, sx in (("p", -1), ("s", 1)):
        for end, sz in (("a", -1), ("f", 1)):
            cylinder(f"{name}_leg_{tag}{end}", 0.035, height,
                     (x + sx * (width / 2 - 0.07), y + height / 2,
                      z + sz * (depth / 2 - 0.07)), mats[frame], 8)
    pitch = (height - 0.24) / max(1, shelves - 1)
    levels = [y + 0.14 + index * pitch for index in range(shelves)]
    for index, level in enumerate(levels):
        cube(f"{name}_deck_{index}", (width, 0.04, depth), (x, level, z), mats[plank], 0.0)
    return levels


def ladder(mats, name, x, z, y_foot, y_head, facing=1, width=0.62, mat="steel"):
    """A vertical access ladder with a hoop cage and a grab rail at the top.

    `facing` is the z direction you climb it from. Nothing in this ship is
    reachable only by jumping, so every raised walkway gets one of these.
    """
    rise = y_head - y_foot
    for tag, sx in (("p", -1), ("s", 1)):
        cylinder(f"{name}_stile_{tag}", 0.035, rise + 0.20,
                 (x + sx * width / 2, y_foot + (rise + 0.20) / 2, z), mats[mat], 8)
    rungs = max(2, int(rise / 0.30))
    for index in range(rungs):
        cylinder(f"{name}_rung_{index}", 0.022, width,
                 (x, y_foot + 0.22 + index * (rise - 0.30) / max(1, rungs - 1), z),
                 mats[mat], 6, (0.0, math.pi / 2, 0.0))
    for index in range(max(1, int(rise / 0.80))):
        hoop_y = y_foot + 1.20 + index * 0.80
        if hoop_y > y_head - 0.30:
            break
        cube(f"{name}_hoop_{index}_back", (width + 0.5, 0.05, 0.05),
             (x, hoop_y, z + facing * 0.36), mats[mat], 0.0)
        for tag, sx in (("p", -1), ("s", 1)):
            cube(f"{name}_hoop_{index}_{tag}", (0.05, 0.05, 0.44),
                 (x + sx * (width + 0.45) / 2, hoop_y, z + facing * 0.16), mats[mat], 0.0)
    for tag, sx in (("p", -1), ("s", 1)):
        cylinder(f"{name}_grab_{tag}", 0.032, 1.10,
                 (x + sx * width / 2, y_head + 0.55, z), mats["brass"], 8)
    return y_head


def pipe_run(mats, name, x, y, z_from, z_to, radius, mat="steel", brackets=6,
             bracket_to=None):
    """A pipe along the ship's length, carried on brackets that reach a surface.

    `bracket_to` is the y the brackets land on. A pipe hanging off nothing is
    the fastest way to make a machinery space look like a screensaver.
    """
    length = abs(z_to - z_from)
    cylinder(name, radius, length, (x, y, (z_from + z_to) / 2), mats[mat], 8,
             (math.pi / 2, 0.0, 0.0))
    if bracket_to is None:
        return
    for index in range(brackets):
        z = z_from + (z_to - z_from) * (index + 0.5) / brackets
        cube(f"{name}_hanger_{index}", (0.06, abs(bracket_to - y), 0.06),
             (x, (bracket_to + y) / 2, z), mats["trim"], 0.0)
        cube(f"{name}_clip_{index}", (radius * 2.6, 0.07, 0.10), (x, y + radius + 0.02, z),
             mats["trim"], 0.0)


def gauge_panel(mats, name, x, y, z, width, height, face, dials=4, mat="trim"):
    """An instrument board on a bulkhead: backplate, dials and a label strip.

    `face` is the axis-aligned outward normal as (dx, dz); everything mounted on
    the board is pushed out along it so nothing sinks into the plate.
    """
    fx, fz = face
    cube(f"{name}_plate", (width if fz else 0.08, height, 0.08 if fz else width),
         (x, y, z), mats[mat], 0.02)
    for index in range(dials):
        offset = (index - (dials - 1) / 2) * (width / dials)
        cylinder(f"{name}_dial_{index}", width / dials * 0.30, 0.05,
                 (x + fz * offset + fx * 0.07, y + height * 0.14, z + fx * offset + fz * 0.07),
                 mats["glass"], 10, (0.0, math.pi / 2, 0.0) if fx else (math.pi / 2, 0.0, 0.0))
    cube(f"{name}_label", (width * 0.7 if fz else 0.04, height * 0.16,
                           0.04 if fz else width * 0.7),
         (x + fx * 0.06, y - height * 0.30, z + fz * 0.06), mats["neon_amber"], 0.0)


def hazard_lane(mats, name, x, z_from, z_to, width=1.90, mat="teal"):
    """A painted traffic lane. Whatever it crosses, nothing is allowed to stand in."""
    cube(name, (width, 0.02, abs(z_to - z_from)), (x, 0.02, (z_from + z_to) / 2), mats[mat], 0.0)
    for tag, side in (("p", -1), ("s", 1)):
        cube(f"{name}_edge_{tag}", (0.10, 0.02, abs(z_to - z_from)),
             (x + side * (width / 2 + 0.05), 0.02, (z_from + z_to) / 2), mats["neon_amber"], 0.0)


# ---------------------------------------------------------------------------
# Deck 0 — machinery
# ---------------------------------------------------------------------------


def build_engine_room(mats):
    """The machinery space, read the way an engineer walks it.

    Two levels. The sole carries the two main engines on their bedplates, the
    shafts running aft from them, and the auxiliaries forward. A gallery at
    2.60 runs outboard of both engines at cylinder-head height, joined across
    the ship at both ends so it is a loop and not two dead-end shelves, and
    reached by four caged ladders — there is nothing up here you can only get
    to by jumping.

    The centreline is a painted lane from the door aft to the shaft alley,
    because that is the one clear run through the room, and everything on the
    sole is set outboard of it.
    """
    kit.shell(mats, (26, 6.4, 44), [portal("stairwell-aft", 0, 0, 22)], carpet="deck")

    GALLERY = 2.60          # walking surface of the outboard gallery
    GALLERY_IN = 9.70       # its inboard edge
    GALLERY_OUT = 12.74     # its outboard edge, hard against the frames

    # --- the shell itself: frames and deckhead beams ------------------------
    for side, sign in (("port", -1), ("stbd", 1)):
        for index in range(14):
            z = -20.0 + index * 3.10
            cube(f"frame_{side}_{index}", (0.12, 6.30, 0.34), (sign * 12.80, 3.15, z),
                 mats["steel"], 0.0)
            cube(f"frame_{side}_{index}_bracket", (0.46, 0.46, 0.30),
                 (sign * 12.55, 0.24, z), mats["steel"], 0.0)
    for index in range(15):
        cube(f"deckbeam_{index}", (25.60, 0.26, 0.22), (0.0, 6.27, -21.0 + index * 3.00),
             mats["steel"], 0.0)

    # --- circulation, painted before anything is allowed to stand on it -----
    hazard_lane(mats, "lane_aft", 0.0, -19.00, 10.30)
    hazard_lane(mats, "lane_fwd", 0.0, 12.90, 20.60)
    cube("lane_cross", (23.80, 0.02, 2.60), (0.0, 0.02, 11.60), mats["teal"], 0.0)
    for tag, sz in (("a", -1), ("f", 1)):
        cube(f"lane_cross_edge_{tag}", (23.80, 0.02, 0.10),
             (0.0, 0.02, 11.60 + sz * 1.35), mats["neon_amber"], 0.0)

    # --- main engines, shafts and uptakes -----------------------------------
    for side, sign, tint in (("port", -1, "neon_cyan"), ("stbd", 1, "neon_pink")):
        base_x = sign * 6.60
        cube(f"bedplate_{side}", (5.60, 0.24, 16.60), (base_x, 0.12, -2.00), mats["trim"], 0.0)
        cube(f"engine_{side}", (5.00, 2.60, 16.00), (base_x, 1.42, -2.00), mats["steel"], 0.03)
        cube(f"engine_{side}_crankcase", (5.20, 0.90, 15.40), (base_x, 0.80, -2.00),
             mats["trim"], 0.02)
        # Eight cylinders, all of them over the block and all of them clear of
        # the turbocharger that stands on the forward end of it.
        for index in range(8):
            z = -8.60 + index * 1.70
            cube(f"engine_{side}_door_{index}", (0.08, 0.66, 1.30), (base_x - sign * 2.62, 0.80, z),
                 mats["brass"], 0.02)
            cylinder(f"engine_{side}_head_{index}", 0.62, 1.40, (base_x, 3.42, z),
                     mats["steel"], 10)
            cube(f"engine_{side}_cover_{index}", (1.44, 0.26, 1.44), (base_x, 4.25, z),
                 mats["brass"], 0.02)
            cylinder(f"engine_{side}_lead_{index}", 0.06, 1.30,
                     (base_x + sign * 1.28, 3.60, z), mats["brass"], 6, (0.0, math.pi / 2, 0.0))
            cube(f"engine_{side}_manifold_{index}", (0.70, 0.70, 1.60),
                 (base_x + sign * 1.90, 3.30, z), mats["coral"], 0.06)
        cube(f"engine_{side}_number", (0.06, 0.60, 1.60), (base_x + sign * 2.53, 2.10, -6.00),
             mats[tint], 0.0)
        # Turbocharger, its pedestal, and the uptake trunk it discharges into.
        cube(f"turbo_{side}_pedestal", (0.90, 0.18, 1.60), (base_x, 2.81, 5.20), mats["trim"], 0.0)
        cylinder(f"turbo_{side}", 0.95, 2.20, (base_x, 3.80, 5.20), mats["steel"], 12,
                 (0.0, math.pi / 2, 0.0))
        cylinder(f"turbo_{side}_intake", 0.55, 0.90, (base_x - sign * 1.50, 3.80, 5.20),
                 mats["trim"], 10, (0.0, math.pi / 2, 0.0))
        cube(f"uptake_{side}", (1.50, 1.39, 1.50), (base_x, 5.445, 5.20), mats["trim"], 0.03)
        cube(f"uptake_{side}_lagging", (1.66, 0.20, 1.66), (base_x, 5.20, 5.20), mats["canvas"], 0.0)
        # Gearbox aft, then the shaft line to the stern gland.
        cube(f"gearbox_{side}", (3.40, 2.20, 3.20), (base_x, 1.10, -11.60), mats["steel"], 0.03)
        cube(f"gearbox_{side}_cooler", (1.10, 0.80, 2.20), (base_x + sign * 2.20, 0.60, -11.60),
             mats["brass"], 0.03)
        cylinder(f"shaft_{side}", 0.28, 8.60, (base_x, 0.95, -17.50), mats["brass"], 10,
                 (math.pi / 2, 0.0, 0.0))
        for index, z in enumerate((-14.60, -17.00, -19.40)):
            cube(f"shaft_{side}_bearing_{index}", (1.20, 1.20, 0.80), (base_x, 0.95, z),
                 mats["trim"], 0.03)
            cube(f"shaft_{side}_bearing_{index}_seat", (1.60, 0.36, 1.10), (base_x, 0.18, z),
                 mats["steel"], 0.0)
        cube(f"gland_{side}", (1.40, 1.40, 0.90), (base_x, 0.95, -21.40), mats["steel"], 0.03)
        cylinder(f"gland_{side}_ring", 0.50, 0.20, (base_x, 0.95, -20.85), mats["brass"], 12,
                 (math.pi / 2, 0.0, 0.0))
        # A guard rail either side of the turning shaft.
        for tag, sx in (("i", -1), ("o", 1)):
            railing(mats, f"shaft_{side}_guard_{tag}",
                    [(base_x + sign * sx * 0.95, -13.20), (base_x + sign * sx * 0.95, -20.90)],
                    0.0, height=1.00, spacing=1.90)

    # --- the gallery: two runs, two crossings, four ladders -----------------
    for side, sign in (("port", -1), ("stbd", 1)):
        cube(f"gallery_{side}", (GALLERY_OUT - GALLERY_IN, 0.12, 30.10),
             (sign * (GALLERY_IN + GALLERY_OUT) / 2, GALLERY - 0.06, -4.95), mats["steel"], 0.0)
        cube(f"gallery_{side}_toe", (0.08, 0.16, 30.10),
             (sign * (GALLERY_IN + 0.04), GALLERY + 0.08, -4.95), mats["neon_amber"], 0.0)
        railing(mats, f"gallery_{side}_rail",
                [(sign * GALLERY_IN, -20.00), (sign * GALLERY_IN, 7.50)], GALLERY,
                height=1.06, spacing=2.20)
        for index, z in enumerate((-19.00, -14.00, -9.00, -4.00, 1.00, 6.00, 9.40)):
            cube(f"gallery_{side}_post_{index}", (0.14, GALLERY - 0.12, 0.14),
                 (sign * 11.22, (GALLERY - 0.12) / 2, z), mats["steel"], 0.0)
            cube(f"gallery_{side}_knee_{index}", (0.90, 0.14, 0.14),
                 (sign * 12.30, GALLERY - 0.20, z), mats["steel"], 0.0)
        ladder(mats, f"gallery_{side}_ladder_fwd", sign * 11.22, 10.35, 0.0, GALLERY, facing=1)
        ladder(mats, f"gallery_{side}_ladder_aft", sign * 11.22, -20.65, 0.0, GALLERY, facing=-1)
    for tag, z in (("fwd", 8.40), ("aft", -19.10)):
        cube(f"cross_{tag}", (2 * GALLERY_IN, 0.12, 1.80), (0.0, GALLERY - 0.06, z),
             mats["steel"], 0.0)
        for edge, sz in (("a", -1), ("f", 1)):
            railing(mats, f"cross_{tag}_rail_{edge}",
                    [(-GALLERY_IN, z + sz * 0.90), (GALLERY_IN, z + sz * 0.90)], GALLERY,
                    height=1.06, spacing=2.20)
        for index, x in enumerate((-8.60, -3.60, 3.60, 8.60)):
            cube(f"cross_{tag}_post_{index}", (0.14, GALLERY - 0.12, 0.14),
                 (x, (GALLERY - 0.12) / 2, z), mats["steel"], 0.0)

    # --- auxiliaries, forward of the mains ----------------------------------
    for side, sign in (("port", -1), ("stbd", 1)):
        base_x = sign * 7.20
        cube(f"genset_{side}_skid", (2.80, 0.20, 4.60), (base_x, 0.10, 8.80), mats["trim"], 0.0)
        cube(f"genset_{side}", (2.60, 1.30, 2.60), (base_x, 0.85, 7.80), mats["steel"], 0.03)
        cylinder(f"genset_{side}_alt", 0.80, 2.00, (base_x, 1.00, 10.10), mats["brass"], 12,
                 (math.pi / 2, 0.0, 0.0))
        cube(f"genset_{side}_rad", (2.20, 1.60, 0.40), (base_x, 1.00, 6.75), mats["trim"], 0.0)
        cube(f"genset_{side}_label", (1.60, 0.30, 0.05), (base_x, 1.20, 6.51),
             mats["neon_amber"], 0.0)
        # The exhaust leaves the skid clear of the alternator and clear of the
        # transverse catwalk overhead, then turns outboard under the deckhead.
        cylinder(f"genset_{side}_riser", 0.20, 5.96, (base_x + sign * 1.05, 3.18, 10.20),
                 mats["canvas"], 10)
        cylinder(f"genset_{side}_bend", 0.20, 1.40, (base_x + sign * 1.75, 6.16, 10.20),
                 mats["canvas"], 10, (0.0, math.pi / 2, 0.0))
        gauge_panel(mats, f"genset_{side}_panel", base_x - sign * 1.42, 1.60, 8.80,
                    1.80, 0.70, (-sign, 0), dials=4)

    # Air compressors and their receivers, kept aft of the control-room bulkhead.
    for index, x in enumerate((6.60, 9.40)):
        cube(f"compressor_{index}", (2.40, 1.40, 1.80), (x, 0.70, 14.20), mats["steel"], 0.03)
        cube(f"compressor_{index}_motor", (0.90, 0.60, 1.00), (x, 1.70, 14.20),
             mats["coral"], 0.03)
        gauge_panel(mats, f"compressor_{index}_gauges", x, 2.00, 13.25, 1.20, 0.50,
                    (0, -1), dials=3)
    for index, z in enumerate((13.60, 14.80)):
        cylinder(f"receiver_{index}", 0.50, 2.60, (11.70, 1.30, z), mats["teal"], 12)
        cylinder(f"receiver_{index}_cap", 0.52, 0.16, (11.70, 2.68, z), mats["brass"], 12)
        cube(f"receiver_{index}_foot", (1.10, 0.10, 1.10), (11.70, 0.05, z), mats["trim"], 0.0)

    for index, x in enumerate((-8.20, -5.60)):
        cube(f"purifier_{index}_skid", (2.30, 0.18, 2.60), (x, 0.09, 14.20), mats["trim"], 0.0)
        cylinder(f"purifier_{index}_bowl", 0.60, 1.30, (x, 0.83, 13.70), mats["steel"], 12)
        cylinder(f"purifier_{index}_cap", 0.44, 0.40, (x, 1.68, 13.70), mats["brass"], 12)
        cube(f"purifier_{index}_drive", (1.10, 0.90, 0.90), (x, 0.63, 14.90), mats["steel"], 0.03)
        cube(f"purifier_{index}_label", (0.90, 0.26, 0.05), (x, 2.05, 13.70), mats["neon_cyan"], 0.0)

    for index, (x, z) in enumerate(((-2.60, -6.00), (2.60, -6.00), (-2.60, 2.00), (2.60, 2.00))):
        cube(f"bilge_pump_{index}", (1.30, 0.90, 1.30), (x, 0.45, z), mats["steel"], 0.03)
        cylinder(f"bilge_motor_{index}", 0.38, 1.00, (x, 1.40, z), mats["coral"], 10)
        cylinder(f"bilge_suction_{index}", 0.12, 1.60, (x, 0.80, z + 0.80), mats["brass"], 8)
        cube(f"bilge_plate_{index}", (1.60, 0.03, 1.60), (x, 0.04, z), mats["trim"], 0.0)

    # --- the engine control room, starboard forward -------------------------
    #
    # Its outboard and forward walls are the shell, so it does not leave a
    # useless slot behind it. The door faces aft, onto the machinery it watches.
    ECR_IN, ECR_AFT = 4.40, 15.40
    for lower, upper, mat, tag in ((0.0, 0.95, "bulkhead", "dado"),
                                   (0.95, 2.35, "glass", "glass"),
                                   (2.35, 2.60, "trim", "cornice")):
        thick = 0.12
        # The inboard run starts where the aft run stops, so the corner is a
        # join and not two boxes sharing the same cubic metre.
        cube(f"ecr_inboard_{tag}", (thick, upper - lower, 21.86 - ECR_AFT - thick),
             (ECR_IN + thick / 2, (lower + upper) / 2, (ECR_AFT + thick + 21.86) / 2),
             mats[mat], 0.0)
        if tag == "cornice":
            cube(f"ecr_aft_{tag}", (12.86 - ECR_IN, upper - lower, thick),
                 ((ECR_IN + 12.86) / 2, (lower + upper) / 2, ECR_AFT + thick / 2),
                 mats[mat], 0.0)
            continue
        for start, end in wall_segments(ECR_IN, 12.86, [6.40]):
            cube(f"ecr_aft_{tag}_{start:.0f}", (end - start, upper - lower, thick),
                 ((start + end) / 2, (lower + upper) / 2, ECR_AFT + thick / 2), mats[mat], 0.0)
    # The doorway is lined rather than plugged: two jambs inside the opening, a
    # head across it, and the leaf hung between the jambs.
    for tag, sx in (("p", -1), ("s", 1)):
        cube(f"ecr_jamb_{tag}", (0.13, 2.10, 0.16), (6.40 + sx * 0.735, 1.05, ECR_AFT + 0.06),
             mats["steel"], 0.0)
    cube("ecr_door_head", (1.60, 0.12, 0.16), (6.40, 2.16, ECR_AFT + 0.06), mats["steel"], 0.0)
    cube("ecr_header", (1.60, 0.13, 0.12), (6.40, 2.285, ECR_AFT + 0.06), mats["trim"], 0.0)
    cube("ecr_door", (1.30, 2.02, 0.09), (6.40, 1.01, ECR_AFT + 0.06), mats["teal"], 0.02)
    cylinder("ecr_door_handle", 0.04, 0.22, (6.90, 1.05, ECR_AFT + 0.06), mats["brass"], 8,
             (math.pi / 2, 0.0, 0.0))
    cube("ecr_door_light", (0.70, 0.20, 0.05), (6.40, 2.44, ECR_AFT - 0.04),
         mats["neon_cyan"], 0.0)
    cube("ecr_roof", (12.86 - ECR_IN, 0.16, 21.86 - ECR_AFT),
         ((ECR_IN + 12.86) / 2, 2.68, (ECR_AFT + 21.86) / 2), mats["bulkhead"], 0.0)

    console_top = counter(mats, "ecr_console", 8.60, 17.60, 5.60, 1.40, height=0.78,
                          top="trim", body="trim", lip=1)
    for index in range(5):
        cube(f"ecr_screen_{index}", (0.94, 0.62, 0.06), (6.40 + index * 1.10, console_top + 0.41,
                                                         18.22), mats["screen"], 0.0)
        cube(f"ecr_keys_{index}", (0.70, 0.04, 0.30), (6.40 + index * 1.10, console_top + 0.03,
                                                       17.30), mats["steel"], 0.0)
    for index, x in enumerate((6.90, 8.60, 10.30)):
        cube(f"ecr_chair_{index}", (0.62, 0.12, 0.58), (x, 0.60, 16.40), mats["coral"], 0.04)
        cube(f"ecr_chair_{index}_back", (0.60, 0.62, 0.12), (x, 0.96, 16.12), mats["coral"], 0.04)
        cylinder(f"ecr_chair_{index}_stem", 0.06, 0.54, (x, 0.27, 16.40), mats["steel"], 8)
        cube(f"ecr_chair_{index}_base", (0.56, 0.06, 0.56), (x, 0.03, 16.40), mats["trim"], 0.0)
    for index in range(3):
        gauge_panel(mats, f"ecr_board_{index}", 6.20 + index * 2.30, 1.70, 21.82,
                    2.00, 0.90, (0, -1), dials=5)
    cube("ecr_alarm", (1.20, 0.36, 0.06), (11.60, 2.36, 21.82), mats["neon_amber"], 0.0)
    plan_top = counter(mats, "ecr_plan_table", 11.40, 20.20, 1.60, 2.40, height=0.86,
                       top="wood", body="trim", lip=0)
    cube("ecr_plan", (1.30, 0.02, 2.00), (11.40, plan_top + 0.02, 20.20), mats["bulkhead"], 0.0)
    for index, level in enumerate(shelf_unit(mats, "ecr_manuals", 5.20, 20.40, 0.90, 1.80,
                                             0.0, 1.90, shelves=4, frame="trim", plank="trim")):
        for slot in range(6):
            cube(f"ecr_manual_{index}_{slot}", (0.60, 0.28, 0.07),
                 (5.20, level + 0.16, 19.65 + slot * 0.28),
                 mats[("coral", "teal", "orange")[(index + slot) % 3]], 0.0)

    # --- switchboard along the forward bulkhead, port ------------------------
    for index in range(5):
        x = -10.80 + index * 1.60
        cube(f"switchboard_{index}", (1.52, 2.20, 0.90), (x, 1.10, 21.41), mats["trim"], 0.02)
        cube(f"switchboard_{index}_face", (1.30, 1.10, 0.06), (x, 1.55, 20.93),
             mats["steel"], 0.0)
        for lamp in range(3):
            cube(f"switchboard_{index}_lamp_{lamp}", (0.26, 0.14, 0.05),
                 (x - 0.42 + lamp * 0.42, 2.02, 20.93),
                 mats[("neon_amber", "neon_cyan", "neon_pink")[lamp]], 0.0)
        for dial in range(2):
            cylinder(f"switchboard_{index}_dial_{dial}", 0.16, 0.05,
                     (x - 0.34 + dial * 0.68, 1.70, 20.93), mats["glass"], 10,
                     (math.pi / 2, 0.0, 0.0))
        for lever in range(3):
            cylinder(f"switchboard_{index}_lever_{lever}", 0.04, 0.26,
                     (x - 0.42 + lever * 0.42, 1.06, 20.93), mats["brass"], 6,
                     (math.pi / 2, 0.0, 0.0))
        cube(f"switchboard_{index}_label", (1.20, 0.18, 0.05), (x, 0.62, 20.93),
             mats["neon_cyan"], 0.0)
    # The insulating mat is the width of the boards and no wider — it is what
    # tells you where you are allowed to stand while the doors are open.
    cube("switchboard_mat", (8.00, 0.03, 1.10), (-7.60, 0.03, 20.40), mats["canvas"], 0.0)
    cube("switchboard_hood", (8.00, 0.20, 1.00), (-7.60, 2.30, 21.36), mats["steel"], 0.0)

    # --- workshop, port ------------------------------------------------------
    bench_top = counter(mats, "workbench", -11.50, 16.60, 2.20, 6.00, height=0.92,
                        top="wood", body="steel", lip=0)
    for index, z in enumerate((14.20, 16.00, 17.80, 19.20)):
        cube(f"vice_{index}" if index == 0 else f"bench_kit_{index}",
             (0.44, 0.34, 0.40), (-11.20, bench_top + 0.17, z),
             mats["brass" if index == 0 else "steel"], 0.03)
    cube("tool_board", (0.06, 1.50, 5.20), (-12.68, 1.90, 16.60), mats["trim"], 0.0)
    for index in range(14):
        cube(f"tool_{index}", (0.05, 0.46, 0.12),
             (-12.62, 1.86 + (index % 2) * 0.56, 14.30 + index * 0.34), mats["steel"], 0.0)
    cube("lathe_bed", (1.00, 0.30, 2.60), (-8.60, 0.95, 18.60), mats["steel"], 0.02)
    for tag, sz in (("a", -1), ("f", 1)):
        cube(f"lathe_leg_{tag}", (0.90, 0.80, 0.60), (-8.60, 0.40, 18.60 + sz * 0.90),
             mats["trim"], 0.02)
    cylinder("lathe_head", 0.34, 0.90, (-8.60, 1.44, 17.50), mats["brass"], 12,
             (math.pi / 2, 0.0, 0.0))
    cylinder("lathe_stock", 0.10, 1.40, (-8.60, 1.44, 18.90), mats["steel"], 8,
             (math.pi / 2, 0.0, 0.0))
    # Spares are inboard of the lathe, clear of the purifier skids and of the
    # mat you have to stand on to work the switchboard.
    for index, z in enumerate((17.20, 18.90)):
        levels = shelf_unit(mats, f"spares_{index}", -5.20, z, 2.20, 1.00, 0.0, 2.10, shelves=5)
        for level_index, level in enumerate(levels):
            for slot in range(3):
                cube(f"spares_{index}_box_{level_index}_{slot}", (0.60, 0.30, 0.70),
                     (-5.90 + slot * 0.70, level + 0.17, z),
                     mats[("teal", "orange", "coral", "canvas")[(slot + level_index) % 4]], 0.02)

    # --- deckhead services ---------------------------------------------------
    for side, sign in (("port", -1), ("stbd", 1)):
        for lane, (offset, radius, mat) in enumerate(((0.0, 0.22, "brass"),
                                                      (0.85, 0.17, "steel"),
                                                      (1.60, 0.13, "coral"),
                                                      (2.30, 0.10, "teal"))):
            pipe_run(mats, f"pipe_{side}_{lane}", sign * (10.40 - offset), 5.60 - lane * 0.10,
                     -21.00, 21.00, radius, mat=mat, brackets=9, bracket_to=6.16)
        # Handwheels sit between the deckbeams, and their stems rise into the
        # valve rather than dangling under it.
        for index in range(7):
            cylinder(f"valve_{side}_{index}", 0.30, 0.12,
                     (sign * 10.40, 5.60, -16.50 + index * 6.00), mats["brass"], 10,
                     (0.0, math.pi / 2, 0.0))
            cylinder(f"valve_{side}_{index}_stem", 0.05, 0.44,
                     (sign * 10.40, 5.90, -16.50 + index * 6.00), mats["brass"], 6)
        cube(f"cable_tray_{side}", (0.60, 0.12, 42.00), (sign * 2.40, 6.02, 0.0),
             mats["trim"], 0.0)
        for index in range(11):
            cube(f"cable_tray_{side}_hanger_{index}", (0.06, 0.32, 0.06),
                 (sign * 2.40, 6.24, -20.00 + index * 4.00), mats["steel"], 0.0)
        for index in range(11):
            cube(f"deckhead_light_{side}_{index}", (1.60, 0.10, 0.44),
                 (sign * 5.00, 6.06, -20.00 + index * 4.00), mats["screen"], 0.0)
        for index in range(6):
            cube(f"gallery_light_{side}_{index}", (0.90, 0.08, 0.36),
                 (sign * 11.22, 4.20, -18.00 + index * 5.60), mats["neon_amber"], 0.0)

    # --- safety kit, all of it beside the one door --------------------------
    cube("fire_station", (1.20, 1.70, 0.60), (3.20, 0.85, 21.50), mats["coral"], 0.03)
    cube("fire_station_glass", (1.00, 1.10, 0.06), (3.20, 1.10, 21.18), mats["glass"], 0.0)
    cube("fire_station_sign", (1.10, 0.30, 0.05), (3.20, 1.88, 21.18), mats["neon_amber"], 0.0)
    # Bottles go on the port side of the doorway, off the painted lane, and well
    # clear of the switchboard cubicles that start at x -3.64.
    for index in range(4):
        cylinder(f"extinguisher_{index}", 0.15, 0.72, (-1.80 - index * 0.42, 0.85, 21.62),
                 mats["coral"], 8)
        cube(f"extinguisher_{index}_bracket", (0.24, 0.10, 0.24),
             (-1.80 - index * 0.42, 1.16, 21.74), mats["steel"], 0.0)
    # Warning boards go on the shell between frames, at gallery eye height.
    for index, (side_x, z) in enumerate(((-12.83, -12.00), (-12.83, 3.20),
                                         (12.83, -12.00), (12.83, 3.20))):
        cube(f"warning_{index}", (0.06, 0.80, 1.50), (side_x, 3.40, z),
             mats["neon_amber"], 0.0)
    for index, (x, z) in enumerate(((12.40, 12.00), (-12.40, 12.00), (-12.40, -4.00))):
        sign = 1 if x > 0 else -1
        cube(f"eyewash_{index}", (0.50, 0.80, 0.50), (x, 1.30, z), mats["teal"], 0.03)
        cylinder(f"eyewash_{index}_spout", 0.05, 0.40, (x - sign * 0.30, 1.90, z),
                 mats["brass"], 6, (0.0, math.pi / 2, 0.0))


# ---------------------------------------------------------------------------
# Deck 1 — crew
# ---------------------------------------------------------------------------


def build_crew_corridor(mats):
    """The crew alleyway, laid out around the one thing that matters here: the run.

    This is the spine of the working ship, and everything about it follows from
    the fact that laundry carts and provision trolleys have to get from the after
    stair to the midships stair without stopping. So the centre 2.20 m is painted
    and permanently clear, every fixture is set back outboard of the paint, and
    the doors on the two sides are staggered rather than faced off against each
    other so two of them can stand open without blocking the run.

    The rest of it is bookkeeping: the wall stretches left over between the doors
    are what the linen bank, the provision cage, the switch panels and the mess
    servery are cut into, and the stretches left over after *that* get the dado
    and the kick rail. Nothing here is placed at a round number for its own sake.
    """
    kit.shell(
        mats,
        (4.86, 2.8, 45.86),
        [portal("stairwell-aft", 0, 0, -23), portal("stairwell-mid", 0, 0, 23)],
        carpet="deck",
    )

    # `shell` centres each bulkhead on the half-width it is given, so a wall is
    # half its thickness inboard of that. The size above is chosen so the two
    # faces land on round numbers the fittings can be set out from.
    FACE = 2.36             # interior face of either side bulkhead
    END = 22.86             # interior face of either end bulkhead
    LANE_HALF = 1.20        # outer edge of the painted run, paint included

    # Everything standing against a wall records the z it occupies, so the dado
    # and the kick rail can be drawn afterwards in what is genuinely left.
    blocked = {-1: [], 1: []}

    def occupy(sign, z_from, z_to):
        blocked[sign].append((z_from, z_to))

    # -- the run --------------------------------------------------------------
    hazard_lane(mats, "run", 0.0, -22.30, 22.30, width=2.20)
    for tag, sz in (("aft", -1), ("fwd", 1)):
        # The two end doorways are lined, and the threshold bar sits clear of the
        # painted run so the two never fight over the same square metre.
        for jamb, sx in (("p", -1), ("s", 1)):
            cube(f"end_{tag}_jamb_{jamb}", (0.13, 2.10, 0.16),
                 (sx * 0.865, 1.05, sz * (END - 0.08)), mats["steel"], 0.0)
        cube(f"end_{tag}_head", (1.86, 0.12, 0.16), (0.0, 2.16, sz * (END - 0.08)),
             mats["steel"], 0.0)
        cube(f"end_{tag}_sign", (1.00, 0.24, 0.05), (0.0, 2.42, sz * (END - 0.025)),
             mats["neon_cyan"], 0.0)
        cube(f"end_{tag}_threshold", (1.90, 0.02, 0.24), (0.0, 0.02, sz * 22.50),
             mats["neon_amber"], 0.0)

    def bay_outline(name, x_lo, x_hi, z_aft, z_fwd, mat="neon_amber"):
        """A parking bay marked as an outline, not a filled rectangle.

        Filled paint under a cart puts a horizontal surface through the wheels;
        an outline keeps the marking clear of everything that stands in it.
        """
        cube(f"{name}_a", (x_hi - x_lo, 0.02, 0.12), ((x_lo + x_hi) / 2, 0.02, z_aft + 0.06),
             mats[mat], 0.0)
        cube(f"{name}_f", (x_hi - x_lo, 0.02, 0.12), ((x_lo + x_hi) / 2, 0.02, z_fwd - 0.06),
             mats[mat], 0.0)
        for tag, x in (("o", x_lo + 0.06), ("i", x_hi - 0.06)):
            cube(f"{name}_{tag}", (0.12, 0.02, z_fwd - z_aft - 0.24),
                 (x, 0.02, (z_aft + z_fwd) / 2), mats[mat], 0.0)

    # -- doors ----------------------------------------------------------------
    # Port and starboard are offset by roughly half a pitch. Two crew can open
    # facing doors on a real alleyway and wedge it shut; here they cannot.
    PORT_DOORS = (
        (-19.4, "linen_store", "neon_cyan"), (-13.0, "laundry", "neon_cyan"),
        (-6.6, "crew_mess", "neon_amber"), (0.2, "provisions", "neon_cyan"),
        (7.0, "cold_room", "neon_pink"), (13.8, "crew_office", "neon_cyan"),
        (20.0, "deck_store", "neon_cyan"),
    )
    STBD_DOORS = (
        (-16.2, "gash", "neon_pink"), (-9.8, "refrigeration", "neon_pink"),
        (-3.4, "galley_lift", "neon_amber"), (3.8, "dry_stores", "neon_cyan"),
        (10.4, "heads", "neon_cyan"), (17.2, "changing", "neon_cyan"),
    )

    def alley_door(name, sign, z, label):
        """A crew door in its opening: two jambs, a head, a leaf hung between."""
        for tag, sz in (("a", -1), ("f", 1)):
            cube(f"{name}_jamb_{tag}", (0.10, 2.06, 0.10),
                 (sign * 2.31, 1.03, z + sz * 0.50), mats["trim"], 0.0)
        cube(f"{name}_head", (0.10, 0.10, 1.10), (sign * 2.31, 2.11, z), mats["trim"], 0.0)
        cube(f"{name}_leaf", (0.06, 2.02, 0.86), (sign * 2.33, 1.01, z), mats["teal"], 0.02)
        cube(f"{name}_port", (0.05, 0.30, 0.24), (sign * 2.315, 1.62, z), mats["glass"], 0.0)
        cylinder(f"{name}_handle", 0.04, 0.20, (sign * 2.26, 1.05, z + 0.28),
                 mats["brass"], 8, (math.pi / 2, 0.0, 0.0))
        cube(f"{name}_kickplate", (0.04, 0.34, 0.80), (sign * 2.29, 0.22, z),
             mats["steel"], 0.0)
        cube(f"{name}_plate", (0.04, 0.20, 0.70), (sign * 2.32, 2.32, z), mats[label], 0.0)
        occupy(sign, z - 0.62, z + 0.62)

    for z, name, label in PORT_DOORS:
        alley_door(f"door_{name}", -1, z, label)
    for z, name, label in STBD_DOORS:
        alley_door(f"door_{name}", 1, z, label)

    # -- rolling stock --------------------------------------------------------
    def linen_cart(name, x, z, inboard, tint):
        cube(f"{name}_body", (0.86, 0.90, 1.16), (x, 0.60, z), mats[tint], 0.03)
        cube(f"{name}_liner", (0.70, 0.10, 1.00), (x, 1.10, z), mats["canvas"], 0.0)
        for wheel in range(4):
            cylinder(f"{name}_wheel_{wheel}", 0.075, 0.06,
                     (x - 0.30 + (wheel % 2) * 0.60, 0.075, z - 0.45 + (wheel // 2) * 0.90),
                     mats["trim"], 6, (0.0, math.pi / 2, 0.0))
        for tag, sz in (("a", -1), ("f", 1)):
            cylinder(f"{name}_stanchion_{tag}", 0.02, 0.18,
                     (x + inboard * 0.40, 1.09, z + sz * 0.45), mats["steel"], 6)
        cylinder(f"{name}_rail", 0.025, 1.02, (x + inboard * 0.40, 1.16, z),
                 mats["steel"], 6, (math.pi / 2, 0.0, 0.0))

    def trolley(name, x, z, inboard, crates=("teal", "orange")):
        cube(f"{name}_deck", (0.90, 0.10, 1.30), (x, 0.34, z), mats["steel"], 0.02)
        for wheel in range(4):
            cylinder(f"{name}_castor_{wheel}", 0.10, 0.06,
                     (x - 0.32 + (wheel % 2) * 0.64, 0.10, z - 0.50 + (wheel // 2) * 1.00),
                     mats["trim"], 6, (0.0, math.pi / 2, 0.0))
            cube(f"{name}_fork_{wheel}", (0.06, 0.14, 0.06),
                 (x - 0.32 + (wheel % 2) * 0.64, 0.25, z - 0.50 + (wheel // 2) * 1.00),
                 mats["steel"], 0.0)
        for index, tint in enumerate(crates):
            cube(f"{name}_crate_{index}", (0.70, 0.40, 1.00),
                 (x, 0.59 + index * 0.40, z), mats[tint], 0.03)
        cylinder(f"{name}_handle", 0.03, 0.86, (x, 1.05, z + inboard * 0.0 - 0.62),
                 mats["steel"], 6, (0.0, math.pi / 2, 0.0))
        for tag, sx in (("p", -1), ("s", 1)):
            cylinder(f"{name}_handle_post_{tag}", 0.025, 0.72,
                     (x + sx * 0.40, 0.72, z - 0.62), mats["steel"], 6)

    # -- port side ------------------------------------------------------------
    # Aft end: the deck plan, because this is the door you come in by from the
    # after stair and the first thing a new hand needs is to know where they are.
    cube("plan_board", (0.06, 1.30, 2.00), (-2.33, 1.60, -21.20), mats["trim"], 0.0)
    cube("plan_sheet", (0.02, 1.06, 1.72), (-2.29, 1.60, -21.20), mats["bulkhead"], 0.0)
    for index in range(4):
        cube(f"plan_deck_{index}", (0.01, 0.14, 1.50),
             (-2.275, 1.02 + index * 0.34, -21.20), mats["neon_cyan"], 0.0)
    cube("plan_light", (0.16, 0.08, 1.60), (-2.28, 2.58, -21.20), mats["screen"], 0.0)
    occupy(-1, -22.30, -20.10)

    # Laundry bay: marked out, and sized for three carts and nothing else. Carts
    # left anywhere but here are in the run, which is the point of the paint.
    # The bay is deliberately *not* recorded as occupied: rolling stock moves,
    # so the dado and the kick rail run on behind it.
    bay_outline("laundry_bay", -2.32, -1.24, -18.50, -13.90)
    for index, z in enumerate((-17.60, -16.20, -14.80)):
        linen_cart(f"linen_cart_{index}", -1.82, z, 1, ("canvas", "teal", "canvas")[index])

    # Linen bank: closed lockers, flush to the shell, top well under the pipes.
    cube("linen_bank", (0.60, 1.85, 5.10), (-2.06, 1.025, -9.80), mats["trim"], 0.02)
    cube("linen_bank_plinth", (0.52, 0.10, 5.06), (-2.10, 0.05, -9.80), mats["steel"], 0.0)
    for index in range(6):
        z = -11.925 + index * 0.85
        cube(f"linen_door_{index}", (0.04, 1.75, 0.78), (-1.74, 1.02, z), mats["wood"], 0.0)
        cylinder(f"linen_handle_{index}", 0.03, 0.16, (-1.70, 1.02, z + 0.30),
                 mats["brass"], 6)
        cube(f"linen_label_{index}", (0.02, 0.12, 0.36), (-1.71, 1.74, z),
             mats["neon_cyan"], 0.0)
    occupy(-1, -12.45, -7.15)

    # Notice boards, on the one long stretch of bare wall the doors leave.
    for index, z in enumerate((-4.60, -1.70)):
        cube(f"notice_board_{index}", (0.06, 1.10, 2.40), (-2.33, 1.55, z), mats["wood"], 0.0)
        for sheet in range(6):
            cube(f"notice_sheet_{index}_{sheet}", (0.02, 0.42, 0.30),
                 (-2.29, 1.28 + (sheet % 2) * 0.52, z - 0.80 + (sheet // 2) * 0.80),
                 mats["bulkhead"], 0.0)
        cube(f"notice_rail_{index}", (0.08, 0.06, 2.40), (-2.32, 2.13, z), mats["brass"], 0.0)
    occupy(-1, -5.90, -0.45)

    # Fountain and the stretcher cabinet, both on the mess side of the alleyway.
    cube("fountain_body", (0.36, 1.00, 0.50), (-2.18, 0.50, 1.60), mats["steel"], 0.03)
    cube("fountain_basin", (0.42, 0.10, 0.56), (-2.15, 1.05, 1.60), mats["steel"], 0.0)
    cylinder("fountain_spout", 0.03, 0.16, (-2.10, 1.14, 1.60), mats["brass"], 6,
             (0.0, math.pi / 2, 0.0))
    cube("fountain_button", (0.04, 0.08, 0.14), (-1.99, 1.14, 1.60), mats["neon_cyan"], 0.0)
    cube("stretcher_case", (0.30, 2.00, 0.90), (-2.21, 1.00, 4.60), mats["coral"], 0.03)
    cube("stretcher_glass", (0.04, 1.60, 0.76), (-2.04, 1.05, 4.60), mats["glass"], 0.0)
    cube("stretcher_sign", (0.04, 0.22, 0.70), (-2.03, 2.14, 4.60), mats["neon_amber"], 0.0)
    occupy(-1, 1.20, 5.15)

    # Provisions bay, mirrored logic to the laundry bay: paint first, stock after.
    bay_outline("provisions_bay", -2.32, -1.24, 7.90, 12.90)
    for index, z in enumerate((8.80, 10.40, 12.00)):
        trolley(f"trolley_{index}", -1.80, z, 1,
                (("teal", "orange"), ("orange", "coral"), ("coral", "teal"))[index])

    # Pigeonholes and the muster list, outside the crew office door.
    for index, level in enumerate(shelf_unit(mats, "pigeonholes", -1.90, 16.90, 0.90, 4.40,
                                             0.0, 2.00, shelves=5, frame="trim", plank="trim")):
        for slot in range(7):
            cube(f"pigeonhole_{index}_{slot}", (0.60, 0.26, 0.52),
                 (-1.90, level + 0.15, 15.00 + slot * 0.62),
                 mats[("bulkhead", "canvas", "wood")[(index + slot) % 3]], 0.0)
    occupy(-1, 14.60, 19.20)

    # Fire station, hard by the forward door where the run ends.
    cube("fire_case", (0.34, 1.70, 0.70), (-2.19, 0.85, 22.20), mats["coral"], 0.03)
    cube("fire_case_glass", (0.04, 1.10, 0.56), (-2.00, 1.00, 22.20), mats["glass"], 0.0)
    cube("fire_case_sign", (0.04, 0.24, 0.60), (-1.99, 1.82, 22.20), mats["neon_amber"], 0.0)
    for index in range(2):
        cylinder(f"alley_extinguisher_{index}", 0.14, 0.68,
                 (-2.18, 0.80, 21.00 + index * 0.44), mats["coral"], 8)
        cube(f"alley_extinguisher_{index}_bracket", (0.22, 0.10, 0.22),
             (-2.24, 1.08, 21.00 + index * 0.44), mats["steel"], 0.0)
    occupy(-1, 20.70, 22.60)

    # -- starboard side -------------------------------------------------------
    # Hose reel and bottles at the after end, in sight of the stair door.
    cube("hose_plate", (0.06, 0.90, 0.90), (2.33, 1.30, -20.60), mats["coral"], 0.0)
    cylinder("hose_reel", 0.32, 0.20, (2.20, 1.30, -20.60), mats["steel"], 14,
             (0.0, math.pi / 2, 0.0))
    cylinder("hose_hub", 0.09, 0.26, (2.17, 1.30, -20.60), mats["brass"], 8,
             (0.0, math.pi / 2, 0.0))
    cube("hose_sign", (0.04, 0.22, 0.80), (2.32, 2.00, -20.60), mats["neon_amber"], 0.0)
    for index in range(2):
        cylinder(f"hose_bottle_{index}", 0.14, 0.68, (2.18, 0.80, -18.60 + index * 0.44),
                 mats["coral"], 8)
        cube(f"hose_bottle_{index}_bracket", (0.22, 0.10, 0.22),
             (2.24, 1.08, -18.60 + index * 0.44), mats["steel"], 0.0)
    occupy(1, -21.20, -17.90)

    # The provision cage: a locked wire store, because bonded stock on a ship
    # lives behind mesh and everybody can see through it to know it is there.
    CAGE_AFT, CAGE_FWD, CAGE_FRONT = -15.30, -10.70, 1.70
    for tag, z in (("a", CAGE_AFT), ("f", CAGE_FWD)):
        for edge, x in (("in", CAGE_FRONT), ("out", 2.28)):
            cylinder(f"cage_post_{tag}_{edge}", 0.05, 2.30, (x, 1.15, z), mats["steel"], 8)
        cylinder(f"cage_rail_{tag}", 0.04, 0.58, (1.99, 2.25, z), mats["steel"], 8,
                 (0.0, math.pi / 2, 0.0))
        for index in range(3):
            cylinder(f"cage_bar_{tag}_{index}", 0.02, 2.14, (1.85 + index * 0.15, 1.19, z),
                     mats["steel"], 6)
    cylinder("cage_rail_front", 0.04, 4.60, (CAGE_FRONT, 2.25, -13.00), mats["steel"], 8,
             (math.pi / 2, 0.0, 0.0))
    # The kick rail stops either side of the gate. Running it straight through
    # would put a bar across the opening at shin height, which is exactly the
    # thing a kick rail exists to keep clear of.
    for tag, z_mid in (("a", -14.50), ("f", -11.50)):
        cylinder(f"cage_kick_front_{tag}", 0.04, 1.60, (CAGE_FRONT, 0.12, z_mid),
                 mats["steel"], 8, (math.pi / 2, 0.0, 0.0))
    for index in range(19):
        z = -15.20 + index * 0.24
        if -13.62 < z < -12.38:
            continue
        cylinder(f"cage_bar_{index}", 0.02, 2.14, (CAGE_FRONT, 1.19, z), mats["steel"], 6)
    for tag, z in (("a", -13.60), ("f", -12.40)):
        cylinder(f"cage_gatepost_{tag}", 0.045, 2.20, (CAGE_FRONT, 1.10, z), mats["steel"], 8)
    cube("cage_gate", (0.05, 2.10, 1.04), (1.705, 1.13, -13.00), mats["steel"], 0.0)
    for index in range(7):
        cylinder(f"cage_gate_bar_{index}", 0.018, 1.90, (1.68, 1.13, -13.44 + index * 0.145),
                 mats["steel"], 6)
    cube("cage_padlock", (0.08, 0.12, 0.06), (1.66, 1.10, -12.51), mats["brass"], 0.0)
    cube("cage_sign", (0.04, 0.24, 1.00), (1.66, 1.80, -14.40), mats["neon_pink"], 0.0)
    for index, z in enumerate((-14.30, -11.80)):
        levels = shelf_unit(mats, f"cage_rack_{index}", 2.05, z, 0.56, 1.80, 0.0, 2.00,
                            shelves=4, frame="steel", plank="steel")
        for level_index, level in enumerate(levels):
            for slot in range(2):
                cube(f"cage_case_{index}_{level_index}_{slot}", (0.44, 0.30, 0.74),
                     (2.05, level + 0.17, z - 0.45 + slot * 0.90),
                     mats[("canvas", "orange", "teal", "wood")[(slot + level_index) % 4]], 0.02)
    occupy(1, -15.40, -10.60)

    # Group starters and the section board. They go on the one stretch of wall
    # with no traffic parked against it, which is what the cage aisle leaves.
    for index, z in enumerate((-8.20, -6.60, -5.00)):
        gauge_panel(mats, f"starter_{index}", 2.32, 1.60, z, 1.30, 0.80, (-1, 0), dials=4)
        cube(f"starter_{index}_box", (0.24, 1.10, 1.30), (2.24, 0.55, z), mats["trim"], 0.02)
        cylinder(f"starter_{index}_isolator", 0.05, 0.18, (2.06, 0.90, z - 0.50),
                 mats["brass"], 6, (0.0, math.pi / 2, 0.0))
    cube("starter_mat", (0.50, 0.03, 4.40), (1.85, 0.03, -6.60), mats["canvas"], 0.0)
    occupy(1, -9.10, -4.10)

    # The mess servery hatch: the one thing on this deck people queue at, so it
    # sits mid-length where both stairs are the same distance away.
    for tag, sz in (("a", -1), ("f", 1)):
        cube(f"servery_jamb_{tag}", (0.10, 1.30, 0.10), (2.31, 1.65, 0.20 + sz * 1.55),
             mats["steel"], 0.0)
    cube("servery_head", (0.10, 0.14, 3.20), (2.31, 2.37, 0.20), mats["steel"], 0.0)
    cube("servery_shutter", (0.06, 1.10, 3.00), (2.33, 1.65, 0.20), mats["trim"], 0.0)
    for index in range(8):
        cube(f"servery_batten_{index}", (0.03, 0.06, 3.00), (2.295, 1.18 + index * 0.13, 0.20),
             mats["brass"], 0.0)
    cube("servery_ledge", (0.50, 0.08, 3.00), (2.11, 1.06, 0.20), mats["steel"], 0.0)
    for index in range(3):
        cube(f"servery_bracket_{index}", (0.30, 0.30, 0.08), (2.21, 0.87, -0.90 + index * 1.10),
             mats["steel"], 0.0)
    cube("servery_sign", (0.04, 0.20, 1.60), (2.32, 2.54, 0.20), mats["neon_amber"], 0.0)
    cube("servery_queue", (0.90, 0.02, 3.40), (1.85, 0.02, 0.20), mats["canvas"], 0.0)
    for index in range(3):
        cube(f"servery_tray_{index}", (0.34, 0.05, 0.44), (2.11, 1.125, -0.90 + index * 1.10),
             mats["wood"], 0.0)
    occupy(1, -1.90, 2.30)

    # Laundry chute hopper. The trunk is inside the bulkhead where it belongs —
    # what the alleyway gets is the door you post through and the sign over it.
    cube("chute_frame", (0.14, 1.10, 1.00), (2.29, 0.95, 5.40), mats["steel"], 0.02)
    cube("chute_flap", (0.05, 0.70, 0.80), (2.195, 0.95, 5.40), mats["brass"], 0.0)
    cylinder("chute_handle", 0.03, 0.30, (2.14, 0.95, 5.40), mats["brass"], 6,
             (math.pi / 2, 0.0, 0.0))
    cube("chute_sign", (0.04, 0.22, 0.90), (2.32, 1.72, 5.40), mats["neon_pink"], 0.0)
    bay_outline("chute_bay", 1.24, 2.32, 6.60, 9.80)
    for index, z in enumerate((7.40, 8.80)):
        linen_cart(f"soiled_cart_{index}", 1.82, z, -1, ("coral", "canvas")[index])
    occupy(1, 4.80, 6.00)

    # Damage-control locker, forward, because that is the end the bridge calls.
    cube("dc_locker", (0.50, 2.00, 5.20), (2.11, 1.10, 13.80), mats["trim"], 0.02)
    cube("dc_locker_plinth", (0.42, 0.10, 5.16), (2.15, 0.05, 13.80), mats["steel"], 0.0)
    for index in range(4):
        z = 11.85 + index * 1.30
        cube(f"dc_door_{index}", (0.04, 1.90, 1.20), (1.84, 1.10, z), mats["coral"], 0.0)
        cylinder(f"dc_handle_{index}", 0.03, 0.18, (1.80, 1.10, z + 0.44), mats["brass"], 6)
        cube(f"dc_label_{index}", (0.02, 0.16, 0.80), (1.81, 1.92, z), mats["neon_amber"], 0.0)
    cube("dc_stripe", (0.03, 0.14, 5.20), (2.345, 2.24, 13.80), mats["neon_amber"], 0.0)
    occupy(1, 11.05, 16.55)

    # Forward end: a bench, because the changing room is here and people sit to
    # get their boots off whether or not you give them anywhere to do it.
    cube("alley_bench", (0.44, 0.08, 1.80), (2.14, 0.46, 21.20), mats["wood"], 0.02)
    for tag, sz in (("a", -1), ("f", 1)):
        cube(f"alley_bench_leg_{tag}", (0.36, 0.42, 0.08), (2.16, 0.21, 21.20 + sz * 0.76),
             mats["steel"], 0.0)
    for index in range(4):
        cube(f"boot_hook_{index}", (0.10, 0.06, 0.06), (2.31, 1.60, 20.60 + index * 0.40),
             mats["brass"], 0.0)
    cube("alley_mirror", (0.04, 0.90, 1.40), (2.33, 1.90, 18.90), mats["glass"], 0.0)
    occupy(1, 18.10, 22.10)

    # -- deckhead services ----------------------------------------------------
    for side, sign in (("port", -1), ("stbd", 1)):
        for lane, (x, y, radius, mat) in enumerate(((2.05, 2.42, 0.09, "steel"),
                                                    (1.83, 2.40, 0.07, "brass"),
                                                    (1.65, 2.38, 0.06, "coral"))):
            pipe_run(mats, f"crew_pipe_{side}_{lane}", sign * x, y, -22.20, 22.20, radius,
                     mat=mat, brackets=10, bracket_to=2.80)
        cube(f"cable_tray_{side}", (0.44, 0.10, 44.00), (sign * 1.34, 2.55, 0.0),
             mats["trim"], 0.0)
        for index in range(11):
            cube(f"cable_tray_{side}_hanger_{index}", (0.06, 0.18, 0.06),
                 (sign * 1.34, 2.71, -18.60 + index * 4.00), mats["steel"], 0.0)
    for index in range(13):
        cube(f"deck_beam_{index}", (4.72, 0.14, 0.24), (0.0, 2.73, -21.60 + index * 3.60),
             mats["bulkhead"], 0.0)
    for index in range(12):
        cube(f"strip_light_{index}", (0.60, 0.06, 1.80), (0.0, 2.74, -19.80 + index * 3.60),
             mats["screen"], 0.0)
    for index in range(6):
        cube(f"way_sign_{index}", (0.90, 0.14, 0.05), (0.0, 2.58, -18.00 + index * 7.20),
             mats["neon_cyan"], 0.0)

    # -- what the fixtures left over ------------------------------------------
    # The dado and the kick rail run only where there is bare wall to run on.
    # Drawing them the whole length and letting the lockers swallow them is how
    # you end up with a corridor that looks painted through its own furniture.
    def free_spans(spans, start=-END + 0.30, end=END - 0.30):
        free, cursor = [], start
        for lo, hi in sorted(spans):
            if lo - cursor > 0.40:
                free.append((cursor, lo))
            cursor = max(cursor, hi)
        if end - cursor > 0.40:
            free.append((cursor, end))
        return free

    for side, sign in (("port", -1), ("stbd", 1)):
        for index, (lo, hi) in enumerate(free_spans(blocked[sign])):
            cube(f"dado_{side}_{index}", (0.03, 0.14, hi - lo),
                 (sign * 2.345, 0.96, (lo + hi) / 2), mats["teal"], 0.0)
            cube(f"kick_{side}_{index}", (0.04, 0.16, hi - lo),
                 (sign * 2.34, 0.08, (lo + hi) / 2), mats["steel"], 0.0)
            cube(f"upper_{side}_{index}", (0.02, 0.06, hi - lo),
                 (sign * 2.35, 1.94, (lo + hi) / 2), mats["trim"], 0.0)


# ---------------------------------------------------------------------------
# Deck 2 — galley, atrium, dining
# ---------------------------------------------------------------------------


def build_main_galley(mats):
    """The galley, laid out the way a galley works: aft to forward, once.

    Food travels in one direction through this room and never doubles back.
    Stores are at the after end because that is where the hoist from the
    storerooms lands. Preparation is next, so raw food never crosses cooked.
    The hot line is amidships, on the centreline, because that is the only
    place the extraction trunk can reach the funnel. The pass is forward of the
    line, facing the one door the food leaves by. And the scullery is beside
    that same door, because dirty plates come back in through it and must not
    be carried the length of the room to get washed.

    Two painted lanes run either side of the hot line from the stores to the
    pass. Nothing stands in them. Every counter in the room is set back off
    them, and every door — reefer, dishwasher, oven — opens onto one.
    """
    kit.shell(mats, (24, 2.8, 32), [portal("stairwell-aft", 0, 0, 16)], carpet="deck")

    # --- the two lanes, painted first so everything else defers to them ------
    for side, tag in ((-1, "port"), (1, "stbd")):
        hazard_lane(mats, f"lane_{tag}", side * 3.60, -11.20, 6.40)
    # A cross lane at the stores end joins the two, so the aft corners are not
    # dead ends, and a short one forward links the pass to the door.
    cube("lane_cross_aft", (7.20, 0.02, 1.90), (0, 0.02, -10.10), mats["teal"], 0.0)
    cube("lane_cross_fwd", (7.20, 0.02, 1.90), (0, 0.02, 5.50), mats["teal"], 0.0)

    # --- stores, hard against the after bulkhead ----------------------------
    #
    # Two walk-ins, port and starboard, doors facing forward onto the lanes;
    # dry goods on open racking between them so the centre stays walkable.
    for side, tag, label in ((-1, "port", "neon_cyan"), (1, "stbd", "neon_pink")):
        box_x = side * 8.10
        cube(f"reefer_{tag}", (7.60, 2.50, 4.44), (box_x, 1.25, -13.68), mats["bulkhead"], 0.02)
        cube(f"reefer_{tag}_kerb", (7.72, 0.10, 4.50), (box_x, 0.05, -13.68), mats["trim"], 0.0)
        cube(f"reefer_{tag}_cornice", (7.72, 0.12, 4.50), (box_x, 2.44, -13.68), mats["steel"], 0.0)
        # Door leaf, hinged to one side of its frame so the opening reads.
        cube(f"reefer_{tag}_frame", (2.10, 2.26, 0.14), (box_x, 1.13, -11.42), mats["steel"], 0.0)
        cube(f"reefer_{tag}_leaf", (1.76, 2.06, 0.10), (box_x - side * 0.06, 1.03, -11.38),
             mats["trim"], 0.02)
        cylinder(f"reefer_{tag}_handle", 0.04, 0.46,
                 (box_x + side * 0.72, 1.05, -11.31), mats["brass"], 8)
        cube(f"reefer_{tag}_light", (1.20, 0.22, 0.05), (box_x, 2.30, -11.33), mats[label], 0.0)
        gauge_panel(mats, f"reefer_{tag}_gauges", box_x + side * 1.90, 1.66, -11.36,
                    1.30, 0.60, (0, -1), dials=3)
        # A strip curtain in the opening, which is what actually sells a reefer.
        for strip in range(7):
            cube(f"reefer_{tag}_strip_{strip}", (0.22, 1.90, 0.03),
                 (box_x - 0.78 + strip * 0.26, 1.03, -11.46), mats["glass"], 0.0)
        # Stacked cases on a pallet inside, visible whenever the leaf is passed.
        for row in range(3):
            for column in range(4):
                cube(f"reefer_{tag}_case_{row}_{column}", (0.86, 0.52, 0.72),
                     (box_x - 1.62 + column * 1.08, 0.30 + row * 0.56, -14.40),
                     mats["teal" if (row + column) % 2 else "orange"], 0.02)

    for index, x in enumerate((-2.80, 0.0, 2.80)):
        levels = shelf_unit(mats, f"drystore_{index}", x, -15.42, 2.30, 0.80, 0.0, 2.20,
                            shelves=5)
        for level_index, level in enumerate(levels):
            for slot in range(4):
                cube(f"drystore_{index}_case_{level_index}_{slot}", (0.48, 0.32, 0.58),
                     (x - 0.84 + slot * 0.56, level + 0.18, -15.42),
                     mats[("teal", "orange", "coral", "canvas")[(index + slot + level_index) % 4]],
                     0.02)
        cube(f"drystore_{index}_label", (1.60, 0.20, 0.05), (x, 2.34, -15.02),
             mats["neon_amber"], 0.0)

    # Two mobile racks parked out of the lane, waiting to be wheeled aft.
    for index, (x, z) in enumerate(((-5.60, -10.10), (5.60, -10.10))):
        levels = shelf_unit(mats, f"trolley_{index}", x, z, 0.80, 1.60, 0.16, 1.60, shelves=4)
        for wheel, (wx, wz) in enumerate(((-0.32, -0.66), (0.32, -0.66), (-0.32, 0.66),
                                          (0.32, 0.66))):
            cylinder(f"trolley_{index}_wheel_{wheel}", 0.08, 0.06, (x + wx, 0.08, z + wz),
                     mats["trim"], 6, (0.0, math.pi / 2, 0.0))
        for level_index, level in enumerate(levels[:3]):
            cube(f"trolley_{index}_tray_{level_index}", (0.66, 0.10, 1.30),
                 (x, level + 0.07, z), mats["bulkhead"], 0.0)
        cylinder(f"trolley_{index}_push", 0.03, 0.74, (x, 1.86, z + 0.72), mats["steel"], 8,
                 (0.0, math.pi / 2, 0.0))

    # --- preparation --------------------------------------------------------
    #
    # Port is the cold side: sinks against the shell, benches inboard of them.
    # Starboard is butchery: a block, a bench, and a rail to hang from. The two
    # never share a surface, which is the whole point of splitting them.
    sink_top = counter(mats, "veg_sinks", -10.60, -8.40, 2.40, 5.20, height=0.92, lip=-1)
    for index, z in enumerate((-10.30, -8.40, -6.50)):
        cube(f"veg_bowl_{index}", (1.30, 0.12, 1.30), (-10.60, sink_top - 0.03, z),
             mats["trim"], 0.0)
        cylinder(f"veg_tap_{index}", 0.035, 0.44, (-11.44, sink_top + 0.22, z), mats["brass"], 8)
        cylinder(f"veg_spout_{index}", 0.03, 0.52, (-11.18, sink_top + 0.42, z), mats["brass"], 8,
                 (0.0, 0.0, math.pi / 2))
    cube("veg_splashback", (0.05, 1.10, 5.26), (-11.83, 1.47, -8.40), mats["steel"], 0.0)

    prep_top = counter(mats, "veg_bench", -6.60, -8.40, 2.60, 5.20, height=0.92, lip=1)
    for index, z in enumerate((-10.20, -8.40, -6.60)):
        cube(f"veg_board_{index}", (1.10, 0.05, 0.80), (-6.60, prep_top + 0.025, z),
             mats["wood"], 0.0)
    for index, z in enumerate((-10.60, -9.40, -7.20, -6.00)):
        cube(f"veg_crate_{index}", (0.70, 0.34, 0.70), (-5.90, prep_top + 0.17, z),
             mats["orange" if index % 2 else "teal"], 0.02)
    cube("veg_peeler", (0.62, 0.80, 0.62), (-6.60, prep_top + 0.40, -5.30), mats["steel"], 0.03)
    cylinder("veg_peeler_lid", 0.30, 0.10, (-6.60, prep_top + 0.85, -5.30), mats["brass"], 12)
    for index, level in enumerate(shelf_unit(mats, "veg_rack", -6.60, -11.00, 2.60, 0.60,
                                             1.35, 1.30, shelves=3)):
        for slot in range(5):
            cylinder(f"veg_tin_{index}_{slot}", 0.11, 0.26,
                     (-7.60 + slot * 0.50, level + 0.15, -11.00), mats["brass"], 8)

    butcher_top = counter(mats, "meat_bench", 10.60, -8.40, 2.40, 5.20, height=0.92, lip=1)
    cube("meat_block", (1.40, 0.28, 1.40), (10.60, butcher_top + 0.14, -9.60), mats["wood"], 0.02)
    for index in range(6):
        cube(f"meat_knife_{index}", (0.05, 0.34, 0.10),
             (9.62, butcher_top + 0.30, -10.60 + index * 0.42), mats["steel"], 0.0)
    cube("meat_saw", (0.90, 1.10, 0.80), (10.60, butcher_top + 0.55, -6.40), mats["steel"], 0.03)
    cube("meat_saw_guard", (0.10, 0.80, 0.60), (10.10, butcher_top + 0.60, -6.40),
         mats["glass"], 0.0)
    cylinder("meat_rail", 0.04, 5.00, (8.90, 2.20, -8.40), mats["brass"], 8,
             (math.pi / 2, 0.0, 0.0))
    for index in range(6):
        z = -10.50 + index * 0.84
        cylinder(f"meat_hook_{index}", 0.02, 0.34, (8.90, 2.03, z), mats["steel"], 6)
        cube(f"meat_cut_{index}", (0.32, 0.60, 0.30), (8.90, 1.56, z), mats["coral"], 0.10)
    for tag, sx in (("p", -1), ("s", 1)):
        cube(f"meat_rail_post_{tag}", (0.08, 1.40, 0.08), (8.90, 1.52, -8.40 + sx * 2.46),
             mats["steel"], 0.0)

    fish_top = counter(mats, "fish_bench", 6.60, -8.40, 2.60, 5.20, height=0.92, lip=-1)
    cube("fish_ice", (2.20, 0.24, 2.60), (6.60, fish_top + 0.12, -9.30), mats["glass"], 0.02)
    for index in range(7):
        cube(f"fish_{index}", (0.24, 0.16, 0.90),
             (5.80 + (index % 4) * 0.52, fish_top + 0.30, -9.90 + (index // 4) * 0.90),
             mats["steel"], 0.07)
    for index, z in enumerate((-7.20, -6.20)):
        cube(f"fish_tray_{index}", (1.60, 0.14, 0.70), (6.60, fish_top + 0.07, z),
             mats["bulkhead"], 0.0)

    # --- the hot line -------------------------------------------------------
    #
    # One island, worked from both sides, with the ovens underneath and the
    # extraction directly overhead. Nothing outboard of the lanes is hot.
    range_top = counter(mats, "hot_island", 0.0, 0.0, 4.60, 9.60, height=0.92)
    for side, tag in ((-1, "p"), (1, "s")):
        for index, z in enumerate((-3.60, -1.20, 1.20, 3.60)):
            cube(f"oven_{tag}_{index}", (0.06, 0.62, 1.90), (side * 2.32, 0.50, z),
                 mats["trim"], 0.02)
            cube(f"oven_{tag}_{index}_glass", (0.04, 0.36, 1.50), (side * 2.36, 0.54, z),
                 mats["glass"], 0.0)
            cylinder(f"oven_{tag}_{index}_handle", 0.03, 1.60, (side * 2.40, 0.86, z),
                     mats["brass"], 8, (math.pi / 2, 0.0, 0.0))
            cube(f"oven_{tag}_{index}_dial", (0.05, 0.16, 0.16), (side * 2.38, 0.24, z - 0.80),
                 mats["neon_amber"], 0.0)
    for column, x in enumerate((-1.72, -0.58, 0.58, 1.72)):
        for index in range(8):
            z = -4.20 + index * 1.20
            cylinder(f"burner_{column}_{index}", 0.24, 0.06, (x, range_top + 0.03, z),
                     mats["trim"], 10)
            cylinder(f"burner_{column}_{index}_ring", 0.10, 0.05, (x, range_top + 0.07, z),
                     mats["brass"], 8)
    # Pans on roughly a third of the burners, tilted nowhere, just sitting.
    for index, (x, z) in enumerate(((-1.72, -3.00), (-0.58, -1.80), (-0.58, 2.40),
                                    (1.72, -4.20), (1.72, 0.60), (0.58, 3.60),
                                    (-1.72, 1.80), (1.72, 3.60))):
        cylinder(f"pan_{index}", 0.28, 0.24, (x, range_top + 0.20, z), mats["steel"], 12)
        cylinder(f"pan_{index}_rim", 0.30, 0.04, (x, range_top + 0.32, z), mats["brass"], 12)
        cylinder(f"pan_{index}_handle", 0.025, 0.44, (x + 0.48, range_top + 0.28, z),
                 mats["trim"], 6, (0.0, 0.0, math.pi / 2))
    # A flat top at the after end and a chargrill at the forward end, so the
    # line is not thirty-two identical rings.
    cube("hot_plancha", (2.20, 0.08, 1.10), (0.0, range_top + 0.04, -4.90), mats["steel"], 0.0)
    for index in range(9):
        cube(f"hot_grill_bar_{index}", (2.00, 0.06, 0.08), (0.0, range_top + 0.05,
                                                            4.46 + index * 0.11),
             mats["trim"], 0.0)

    # The banks either side: combi ovens to port, fryers and a bain-marie to
    # starboard. Both face the lane, both are set back 0.6 m from it.
    for index, z in enumerate((-3.20, 0.00, 3.20)):
        cube(f"combi_{index}", (2.20, 1.86, 2.40), (-6.70, 0.93, z), mats["steel"], 0.03)
        cube(f"combi_{index}_plinth", (2.26, 0.16, 2.46), (-6.70, 0.08, z), mats["trim"], 0.0)
        for door in range(2):
            cube(f"combi_{index}_door_{door}", (0.08, 0.76, 2.10),
                 (-5.62, 0.58 + door * 0.86, z), mats["trim"], 0.02)
            cube(f"combi_{index}_glass_{door}", (0.05, 0.52, 1.70),
                 (-5.58, 0.58 + door * 0.86, z), mats["glass"], 0.0)
            cylinder(f"combi_{index}_handle_{door}", 0.03, 1.80,
                     (-5.52, 0.58 + door * 0.86, z), mats["brass"], 8, (math.pi / 2, 0.0, 0.0))
        gauge_panel(mats, f"combi_{index}_panel", -5.56, 1.72, z, 1.40, 0.44, (1, 0), dials=3)
    cube("combi_shelf", (2.40, 0.06, 9.20), (-6.70, 2.32, 0.0), mats["steel"], 0.0)
    for index in range(10):
        cube(f"combi_tray_{index}", (1.60, 0.10, 0.66), (-6.70, 2.40, -4.10 + index * 0.92),
             mats["bulkhead"], 0.0)

    fry_top = counter(mats, "fryer_bank", 6.70, -2.40, 2.20, 4.40, height=0.94, lip=1)
    for index, z in enumerate((-3.90, -2.40, -0.90)):
        cube(f"fryer_{index}", (1.70, 0.26, 1.10), (6.70, fry_top - 0.06, z), mats["trim"], 0.0)
        for basket in range(2):
            cube(f"fryer_{index}_basket_{basket}", (0.66, 0.20, 0.90),
                 (6.30 + basket * 0.80, fry_top + 0.14, z), mats["steel"], 0.02)
            cylinder(f"fryer_{index}_grip_{basket}", 0.025, 0.40,
                     (6.30 + basket * 0.80, fry_top + 0.26, z + 0.62), mats["trim"], 6)
    bain_top = counter(mats, "bain_marie", 6.70, 2.30, 2.20, 4.40, height=0.94, lip=1)
    for index in range(4):
        z = 0.60 + index * 1.10
        cube(f"bain_well_{index}", (1.70, 0.22, 0.94), (6.70, bain_top - 0.04, z),
             mats["trim"], 0.0)
        cube(f"bain_pan_{index}", (0.76, 0.16, 0.84), (6.36, bain_top + 0.06, z),
             mats["brass"], 0.02)
        cube(f"bain_pan_{index}_b", (0.76, 0.16, 0.84), (7.04, bain_top + 0.06, z),
             mats["orange"], 0.02)
    for index in range(2):
        cube(f"hot_gantry_{index}", (2.40, 0.06, 9.00), (6.70, 1.62 + index * 0.52, 0.0),
             mats["steel"], 0.0)

    # --- the pass -----------------------------------------------------------
    #
    # A transverse counter with the cooks behind it and the waiters in front,
    # open at both ends so the line can walk round without crossing the pass.
    pass_top = counter(mats, "pass", 0.0, 7.10, 11.00, 1.30, height=0.96, lip=-1)
    for index in range(9):
        x = -4.40 + index * 1.10
        cylinder(f"pass_plate_{index}", 0.15, 0.06, (x, pass_top + 0.03, 7.34),
                 mats["bulkhead"], 12)
        if index % 2 == 0:
            cylinder(f"pass_cloche_{index}", 0.16, 0.14, (x, pass_top + 0.12, 7.34),
                     mats["brass"], 12)
    for tag, sx in (("p", -1), ("s", 1)):
        cube(f"pass_post_{tag}", (0.10, 1.10, 0.10), (sx * 5.20, 1.51, 7.10), mats["brass"], 0.0)
    cube("pass_gantry", (10.80, 0.16, 0.46), (0.0, 2.06, 7.10), mats["brass"], 0.02)
    for index in range(7):
        cube(f"pass_lamp_{index}", (0.90, 0.10, 0.32), (-4.50 + index * 1.50, 1.92, 7.10),
             mats["neon_amber"], 0.0)
    cylinder("pass_ticket_rail", 0.025, 10.20, (0.0, 1.74, 6.72), mats["steel"], 8,
             (0.0, 0.0, math.pi / 2))
    for index in range(11):
        cube(f"pass_ticket_{index}", (0.16, 0.24, 0.01), (-4.60 + index * 0.92, 1.60, 6.72),
             mats["bulkhead"], 0.0)
    # The expediter's corner, starboard, where the ticket screen lives.
    chef_top = counter(mats, "chef_desk", 8.40, 7.10, 2.00, 1.30, height=0.96, lip=-1)
    cube("chef_screen", (1.20, 0.72, 0.06), (8.40, chef_top + 0.46, 7.62), mats["screen"], 0.0)
    cube("chef_printer", (0.42, 0.26, 0.36), (7.66, chef_top + 0.13, 7.10), mats["trim"], 0.02)
    cube("chef_stool", (0.44, 0.10, 0.44), (8.40, 0.66, 6.10), mats["coral"], 0.02)
    cylinder("chef_stool_stem", 0.06, 0.62, (8.40, 0.31, 6.10), mats["steel"], 8)
    # Port of the pass, the plating bench the garnish comes off.
    plate_top = counter(mats, "plating", -8.40, 7.10, 2.00, 1.30, height=0.96, lip=-1)
    for index in range(4):
        cube(f"plating_tub_{index}", (0.34, 0.20, 0.34), (-9.00 + index * 0.42,
                                                          plate_top + 0.10, 7.10),
             mats[("coral", "teal", "orange", "canvas")[index]], 0.03)

    # --- the scullery and the door lobby ------------------------------------
    #
    # The door is on the centreline forward. Dirty ware turns to port the
    # instant it is through it, runs down the outboard side to the tunnel, and
    # comes back clean to the starboard racks. The lobby itself stays empty.
    drop_top = counter(mats, "dish_drop", -4.40, 13.60, 2.20, 3.20, height=0.94, lip=1)
    cube("dish_scrap", (1.00, 0.16, 1.00), (-4.40, drop_top - 0.02, 14.60), mats["trim"], 0.0)
    for index in range(5):
        cylinder(f"dish_stack_{index}", 0.16, 0.34,
                 (-4.90 + (index % 2) * 0.90, drop_top + 0.17, 12.40 + (index // 2) * 0.80),
                 mats["bulkhead"], 12)
    cube("dish_rail", (2.30, 0.06, 0.06), (-4.40, drop_top + 0.42, 12.10), mats["brass"], 0.0)

    cube("dishwasher", (3.60, 1.90, 3.60), (-8.40, 0.95, 14.00), mats["steel"], 0.03)
    cube("dishwasher_plinth", (3.66, 0.14, 3.66), (-8.40, 0.07, 14.00), mats["trim"], 0.0)
    cube("dishwasher_hood", (2.40, 0.70, 2.40), (-8.40, 2.25, 14.00), mats["steel"], 0.02)
    for tag, z in (("in", 12.24), ("out", 15.76)):
        cube(f"dishwasher_{tag}", (2.20, 0.90, 0.10), (-8.40, 0.98, z), mats["trim"], 0.0)
        for strip in range(6):
            cube(f"dishwasher_{tag}_strip_{strip}", (0.26, 0.62, 0.03),
                 (-9.10 + strip * 0.28, 1.10, z - 0.06 if tag == "in" else z + 0.06),
                 mats["glass"], 0.0)
    gauge_panel(mats, "dishwasher_panel", -6.56, 1.60, 14.00, 1.60, 0.56, (1, 0), dials=4)
    cube("dishwasher_steam", (2.00, 0.10, 0.40), (-8.40, 2.62, 14.00), mats["neon_cyan"], 0.0)

    pot_top = counter(mats, "pot_wash", -10.60, 10.20, 2.40, 2.20, height=0.94, lip=-1)
    for index, z in enumerate((9.60, 10.80)):
        cube(f"pot_bowl_{index}", (1.40, 0.14, 0.90), (-10.60, pot_top - 0.04, z),
             mats["trim"], 0.0)
        cylinder(f"pot_tap_{index}", 0.035, 0.60, (-11.50, pot_top + 0.30, z), mats["brass"], 8)
    for index, level in enumerate(shelf_unit(mats, "pot_rack", -10.80, 12.40, 1.90, 1.20,
                                             1.30, 1.40, shelves=3)):
        for slot in range(3):
            cylinder(f"pot_pan_{index}_{slot}", 0.24, 0.20,
                     (-11.40 + slot * 0.62, level + 0.12, 12.40), mats["steel"], 10)

    for index, z in enumerate((10.60, 13.20)):
        levels = shelf_unit(mats, f"clean_rack_{index}", 11.36, z, 0.90, 2.20, 0.0, 2.20,
                            shelves=5)
        for level_index, level in enumerate(levels):
            for slot in range(3):
                cylinder(f"clean_plate_{index}_{level_index}_{slot}", 0.17, 0.28,
                         (11.36, level + 0.16, z - 0.70 + slot * 0.70), mats["bulkhead"], 12)
    for index, z in enumerate((11.20, 12.80)):
        cylinder(f"plate_warmer_{index}", 0.36, 1.00, (6.20, 0.50, z), mats["steel"], 12)
        cylinder(f"plate_warmer_{index}_stack", 0.30, 0.36, (6.20, 1.16, z),
                 mats["bulkhead"], 12)
        cube(f"plate_warmer_{index}_lamp", (0.30, 0.06, 0.30), (6.20, 1.38, z),
             mats["neon_amber"], 0.0)
    for index, z in enumerate((9.80, 11.00)):
        cube(f"linen_bin_{index}", (1.10, 0.90, 1.30), (8.60, 0.52, z), mats["canvas"], 0.06)
        cube(f"linen_bin_{index}_rim", (1.16, 0.08, 1.36), (8.60, 1.00, z), mats["steel"], 0.0)

    # Handwash by the door, because that is the rule and it should be visible.
    cube("handwash_pedestal", (0.44, 0.86, 0.44), (3.30, 0.43, 14.90), mats["steel"], 0.02)
    cube("handwash_basin", (0.72, 0.24, 0.60), (3.30, 0.96, 14.90), mats["bulkhead"], 0.03)
    cylinder("handwash_tap", 0.03, 0.40, (3.30, 1.28, 15.16), mats["brass"], 8)
    cube("handwash_sign", (0.60, 0.34, 0.05), (3.30, 1.78, 15.28), mats["neon_cyan"], 0.0)

    # --- deckhead -----------------------------------------------------------
    #
    # The hood sits on the island. Two trunks leave it sideways and run the
    # length of the room over the lanes, which are the only clear air there is.
    cube("hood", (5.20, 1.10, 9.80), (0.0, 2.25, 0.0), mats["steel"], 0.02)
    cube("hood_lip", (5.40, 0.14, 10.00), (0.0, 1.66, 0.0), mats["trim"], 0.0)
    for tag, sx in (("p", -1), ("s", 1)):
        cube(f"hood_filter_{tag}", (0.20, 0.60, 9.40), (sx * 2.36, 2.06, 0.0), mats["brass"], 0.0)
        cylinder(f"hood_rail_{tag}", 0.03, 9.00, (sx * 1.80, 1.52, 0.0), mats["brass"], 8,
                 (math.pi / 2, 0.0, 0.0))
        for index in range(7):
            z = -3.60 + index * 1.20
            cylinder(f"hood_hook_{tag}_{index}", 0.018, 0.26, (sx * 1.80, 1.37, z),
                     mats["steel"], 6)
            cylinder(f"hood_pan_{tag}_{index}", 0.20, 0.16, (sx * 1.80, 1.16, z),
                     mats["steel"], 10)
    for index in range(8):
        cube(f"hood_lamp_{index}", (4.20, 0.08, 0.50), (0.0, 1.60, -4.20 + index * 1.20),
             mats["neon_amber"], 0.0)

    for tag, sx in (("p", -1), ("s", 1)):
        cube(f"trunk_spur_{tag}", (0.80, 0.52, 1.60), (sx * 2.98, 2.50, 0.0), mats["trim"], 0.0)
        cube(f"trunk_{tag}", (0.80, 0.52, 17.80), (sx * 3.60, 2.50, 4.10), mats["trim"], 0.02)
        for index in range(7):
            cube(f"trunk_{tag}_hanger_{index}", (0.06, 0.24, 0.06),
                 (sx * 3.60, 2.88, -4.20 + index * 2.60), mats["steel"], 0.0)
        pipe_run(mats, f"sprinkler_{tag}", sx * 9.40, 2.66, -15.00, 15.00, 0.05,
                 mat="coral", brackets=8, bracket_to=2.80)
        for index in range(10):
            cylinder(f"sprinkler_{tag}_head_{index}", 0.04, 0.12,
                     (sx * 9.40, 2.56, -13.50 + index * 3.00), mats["brass"], 6)
        for index in range(9):
            cube(f"deckhead_light_{tag}_{index}", (1.40, 0.08, 0.44),
                 (sx * 6.60, 2.72, -13.00 + index * 3.40), mats["screen"], 0.0)
    for index in range(5):
        cube(f"lobby_light_{index}", (2.60, 0.08, 0.44), (0.0, 2.72, 7.60 + index * 1.90),
             mats["screen"], 0.0)

    # Drains sit clear of the lanes, under the places water actually lands.
    for index, (x, z) in enumerate(((-10.60, -8.40), (10.60, -8.40), (-8.40, 12.00),
                                    (-10.60, 10.20), (0.0, -5.60), (0.0, 5.20))):
        cube(f"drain_{index}", (0.60, 0.02, 0.60), (x, 0.03, z), mats["trim"], 0.0)
        cube(f"drain_{index}_grate", (0.44, 0.02, 0.44), (x, 0.05, z), mats["steel"], 0.0)


# ---------------------------------------------------------------------------
# Public-room parts, shared by every room forward of the machinery spaces
# ---------------------------------------------------------------------------


def slab(mats, name, x_span, z_span, y, mat="carpet", thickness=0.14):
    """A floor plate given by its edges, so a void is described by leaving it out.

    Multi-level rooms are built plate by plate rather than as one long deck,
    because that is the only way a stair opening exists as an opening rather
    than as a hole punched through something afterwards.
    """
    cube(name, (x_span[1] - x_span[0], thickness, z_span[1] - z_span[0]),
         ((x_span[0] + x_span[1]) / 2, y - thickness / 2, (z_span[0] + z_span[1]) / 2),
         mats[mat], 0.0)


def stair_flight(mats, name, x, width, z_foot, z_head, y_foot, y_head, steps=16,
                 tread="wood", nosing="brass"):
    """A straight fore-and-aft flight, built as solid steps off the lower floor.

    Boxes rising from the lower floor to each tread give the flight an underside
    without a rotated soffit, and the top tread finishes exactly on `y_head` at
    `z_head` — which callers set to the edge of the plate above. That is the
    whole guarantee: no flight in this ship ends in mid-air.
    """
    run = (z_head - z_foot) / steps
    rise = (y_head - y_foot) / steps
    for index in range(steps):
        top = y_foot + rise * (index + 1)
        centre = z_foot + run * (index + 0.5)
        cube(f"{name}_step_{index}", (width, top - y_foot, abs(run)),
             (x, (y_foot + top) / 2, centre), mats[tread], 0.0)
        cube(f"{name}_nose_{index}", (width, 0.04, 0.07),
             (x, top + 0.02, centre - math.copysign(abs(run) / 2 - 0.035, run)),
             mats[nosing], 0.0)


def slope_rail(mats, name, x, z_foot, z_head, y_foot, y_head, height=1.02, mat="brass"):
    """A handrail following a flight, with a newel about every metre."""
    length = math.hypot(z_head - z_foot, y_head - y_foot)
    # The box's long axis starts along Blender +Y, which is ship aft, so the
    # pitch that points it up the flight is measured against -dz.
    pitch = math.atan2(y_head - y_foot, -(z_head - z_foot))
    cube(f"{name}_rail", (0.07, 0.07, length),
         (x, (y_foot + y_head) / 2 + height, (z_foot + z_head) / 2),
         mats[mat], 0.0, (pitch, 0.0, 0.0))
    posts = max(2, int(length / 1.1))
    for index in range(posts + 1):
        share = index / posts
        cylinder(f"{name}_newel_{index}", 0.035, height,
                 (x, y_foot + (y_head - y_foot) * share + height / 2, z_foot + (z_head - z_foot) * share),
                 mats[mat], 8)


def planter(mats, name, x, z, y, radius=0.7, height=0.85, tub="trim"):
    cylinder(f"{name}_tub", radius, height, (x, y + height / 2, z), mats[tub], 12)
    cylinder(f"{name}_rim", radius + 0.05, 0.10, (x, y + height, z), mats["brass"], 12)
    cube(f"{name}_foliage", (radius * 1.9, radius * 2.2, radius * 1.9),
         (x, y + height + radius * 1.05, z), mats["teal"], radius * 0.5)


def bench(mats, name, x, z, y, length, axis="z", mat="coral", back=None):
    """A public-room bench. `back` is a signed offset for the backrest, or None."""
    long_z = axis == "z"
    seat = (0.62, 0.11, length) if long_z else (length, 0.11, 0.62)
    cube(f"{name}_seat", seat, (x, y + 0.44, z), mats[mat], 0.03)
    for edge in (-1, 1):
        leg = (0.50, 0.38, 0.10) if long_z else (0.10, 0.38, 0.50)
        at = (x, y + 0.19, z + edge * (length / 2 - 0.25)) if long_z else \
             (x + edge * (length / 2 - 0.25), y + 0.19, z)
        cube(f"{name}_leg_{'a' if edge < 0 else 'b'}", leg, at, mats["wood"], 0.0)
    if back is not None:
        rest = (0.14, 0.52, length) if long_z else (length, 0.52, 0.14)
        at = (x + back * 0.24, y + 0.76, z) if long_z else (x, y + 0.76, z + back * 0.24)
        cube(f"{name}_back", rest, at, mats[mat], 0.03)


def lounge_set(mats, name, x, z, y, facing=1):
    """Two chairs and a sofa around a low table, all square to the room.

    `facing` is +1 when the sofa's back is to smaller x. Furniture in a public
    room is arranged in conversation groups, never scattered, so this is the
    unit the atrium and the lounges place rather than individual seats.
    """
    cube(f"{name}_sofa", (0.90, 0.42, 2.10), (x, y + 0.21, z), mats["coral"], 0.03)
    cube(f"{name}_sofa_back", (0.24, 0.50, 2.10), (x - facing * 0.33, y + 0.67, z),
         mats["coral"], 0.03)
    for edge, tag in ((-1, "a"), (1, "b")):
        cube(f"{name}_arm_{tag}", (0.90, 0.24, 0.20), (x, y + 0.54, z + edge * 0.95),
             mats["wood"], 0.03)
    cube(f"{name}_table", (0.85, 0.36, 1.20), (x + facing * 1.45, y + 0.18, z), mats["glass"], 0.02)
    cube(f"{name}_tray", (0.40, 0.05, 0.55), (x + facing * 1.45, y + 0.39, z), mats["brass"], 0.0)
    for edge, tag in ((-1, "a"), (1, "b")):
        cube(f"{name}_chair_{tag}", (0.72, 0.40, 0.72), (x + facing * 2.65, y + 0.20, z + edge * 0.85),
             mats["teal"], 0.04)
        cube(f"{name}_chair_{tag}_back", (0.20, 0.50, 0.72),
             (x + facing * 2.98, y + 0.65, z + edge * 0.85), mats["teal"], 0.04)


def shop_unit(mats, name, x_back, x_front, z_span, y, kind, sign_colour, height=2.40):
    """A retail unit: three solid walls, a glazed shopfront, a fascia and a fit-out.

    The unit stands against the shell so the walkway stays outboard of the well
    rail, which is where a passenger actually walks. Every shop is the same
    shell with a different fit-out, so the gallery reads as a parade rather than
    as one shop copied.
    """
    z0, z1 = z_span
    out = 1.0 if x_front > x_back else -1.0
    depth = abs(x_front - x_back)
    mid_x, mid_z = (x_back + x_front) / 2, (z0 + z1) / 2
    cube(f"{name}_back", (0.12, height, z1 - z0), (x_back, y + height / 2, mid_z),
         mats["bulkhead"], 0.0)
    for tag, z in (("a", z0), ("b", z1)):
        cube(f"{name}_side_{tag}", (depth, height, 0.12), (mid_x, y + height / 2, z),
             mats["bulkhead"], 0.0)
    for index, (a, b) in enumerate(wall_segments(z0, z1, [mid_z], 1.60)):
        cube(f"{name}_kick_{index}", (0.18, 0.35, b - a), (x_front, y + 0.175, (a + b) / 2),
             mats["trim"], 0.0)
        cube(f"{name}_glass_{index}", (0.08, height - 0.45, b - a),
             (x_front, y + 0.35 + (height - 0.45) / 2, (a + b) / 2), mats["glass"], 0.0)
        cube(f"{name}_mull_{index}", (0.16, 0.10, b - a), (x_front, y + height - 0.05, (a + b) / 2),
             mats["trim"], 0.0)
    cube(f"{name}_header", (0.16, 0.35, 1.60), (x_front, y + height - 0.175, mid_z),
         mats["trim"], 0.0)
    cube(f"{name}_fascia", (0.34, 0.50, z1 - z0), (x_front + out * 0.10, y + height + 0.25,
                                                   mid_z), mats["wood"], 0.02)
    cube(f"{name}_sign", (0.06, 0.26, (z1 - z0) * 0.55), (x_front + out * 0.29,
                                                          y + height + 0.25, mid_z),
         mats[sign_colour], 0.0)
    cube(f"{name}_sole", (depth - 0.20, 0.03, z1 - z0 - 0.20), (mid_x, y + 0.015, mid_z),
         mats["wood"], 0.0)

    inner = x_back + out * 0.30
    if kind == "jewellery":
        # Cases in a U with the till at the back: high value, low stock, staffed.
        for index, z in enumerate(grid(3, z1 - z0 - 1.2)):
            cube(f"{name}_case_{index}", (0.62, 0.55, 1.30), (inner + out * 0.10, y + 0.72,
                                                              mid_z + z), mats["glass"], 0.0)
            cube(f"{name}_plinth_{index}", (0.66, 0.45, 1.34), (inner + out * 0.10, y + 0.225,
                                                                mid_z + z), mats["wood"], 0.02)
            cube(f"{name}_light_{index}", (0.50, 0.05, 1.10), (inner + out * 0.10,
                                                               y + height - 0.12, mid_z + z),
                 mats["neon_amber"], 0.0)
        cube(f"{name}_panel", (0.05, 1.60, z1 - z0 - 0.80), (x_back + out * 0.09,
                                                             y + 1.45, mid_z),
             mats["neon_amber"], 0.0)
    elif kind == "fashion":
        for index, z in enumerate(grid(3, z1 - z0 - 1.0)):
            cylinder(f"{name}_rail_post_a_{index}", 0.04, 1.70,
                     (inner + out * 0.15, y + 0.85, mid_z + z - 0.55), mats["steel"], 8)
            cylinder(f"{name}_rail_post_b_{index}", 0.04, 1.70,
                     (inner + out * 0.15, y + 0.85, mid_z + z + 0.55), mats["steel"], 8)
            cube(f"{name}_rail_{index}", (0.05, 0.05, 1.10), (inner + out * 0.15, y + 1.66,
                                                              mid_z + z), mats["steel"], 0.0)
            cube(f"{name}_stock_{index}", (0.42, 0.95, 1.02), (inner + out * 0.15, y + 1.12,
                                                               mid_z + z),
                 mats["coral" if index % 2 else "teal"], 0.05)
        cube(f"{name}_table", (0.80, 0.62, 1.10), (x_front - out * 0.95, y + 0.31, mid_z - 1.9),
             mats["wood"], 0.02)
        for fold in range(3):
            cube(f"{name}_fold_{fold}", (0.60, 0.12, 0.34), (x_front - out * 0.95,
                                                             y + 0.68 + fold * 0.13, mid_z - 1.9),
                 mats["canvas"], 0.03)
        cube(f"{name}_mirror", (0.05, 1.80, 0.90), (x_back + out * 0.09, y + 1.10, mid_z + 2.2),
             mats["glass"], 0.0)
    else:
        # Duty free: gondolas athwartships so the aisle runs along the front.
        for index, z in enumerate(grid(4, z1 - z0 - 0.8)):
            cube(f"{name}_gondola_{index}", (depth - 1.10, 0.55, 0.60),
                 (mid_x - out * 0.35, y + 0.275, mid_z + z), mats["bulkhead"], 0.02)
            for shelf in range(3):
                cube(f"{name}_shelf_{index}_{shelf}", (depth - 1.10, 0.05, 0.60),
                     (mid_x - out * 0.35, y + 0.75 + shelf * 0.42, mid_z + z), mats["steel"], 0.0)
                cube(f"{name}_stock_{index}_{shelf}", (depth - 1.30, 0.30, 0.44),
                     (mid_x - out * 0.35, y + 0.92 + shelf * 0.42, mid_z + z),
                     mats["coral" if (index + shelf) % 2 else "teal"], 0.04)
    cube(f"{name}_till", (0.70, 0.98, 1.60), (x_back + out * 0.45, y + 0.49, z1 - 1.30),
         mats["wood"], 0.02)
    cube(f"{name}_till_top", (0.78, 0.06, 1.68), (x_back + out * 0.45, y + 1.01, z1 - 1.30),
         mats["brass"], 0.0)
    cube(f"{name}_till_screen", (0.30, 0.26, 0.06), (x_back + out * 0.45, y + 1.20, z1 - 1.30),
         mats["screen"], 0.0)


def framed_run(mats, name, x, z_span, y, count, facing, height=1.10, sill=1.05):
    """A run of framed works on a wall — the cheapest way to make a wall read."""
    z0, z1 = z_span
    for index, offset in enumerate(grid(count, z1 - z0)):
        z = (z0 + z1) / 2 + offset
        cube(f"{name}_frame_{index}", (0.06, height + 0.14, 1.10), (x, y + sill + height / 2, z),
             mats["brass"], 0.0)
        cube(f"{name}_work_{index}", (0.03, height, 0.96), (x + facing * 0.03,
                                                            y + sill + height / 2, z),
             mats["teal" if index % 2 else "coral"], 0.0)
        cube(f"{name}_pict_{index}", (0.26, 0.08, 0.30), (x + facing * 0.26,
                                                          y + sill + height + 0.22, z),
             mats["neon_amber"], 0.0)


def build_atrium(mats):
    """Four decks of void with galleries around it — the ship's front room.

    The well is x -7..7, z -17..17 and every plate around it is authored as its
    own rectangle. Three flights spiral up the ring: the grand stair rises
    forward off the sole onto the fore gallery, the next climbs aft up the
    starboard gallery, the last climbs forward up the port gallery. Each one
    stops on a plate that exists. The lift trunk stands in the well immediately
    forward of the aft gallery so its doors open onto that gallery at every
    level without piercing a single floor.
    """
    kit.shell(
        mats,
        (24, 12.8, 46),
        [portal("stairwell-aft", 0, 0, -23), portal("stairwell-mid", 0, 0, 23)],
        carpet="carpet",
    )

    port_x, stbd_x = (-11.90, -7.00), (7.00, 11.90)
    aft_z, fore_z = (-22.90, -17.00), (17.00, 22.90)
    ring_z = (-22.90, 22.90)
    # The two upper flights each take the full width of their band, so the void
    # they need is exactly their own footprint.
    stbd_void = (-3.80, 3.90)
    port_void = (-3.90, 3.80)

    for level in range(1, 4):
        y = level * DECK_PITCH
        if level == 2:
            slab(mats, f"gallery_{level}_stbd_aft", stbd_x, (ring_z[0], stbd_void[0]), y)
            slab(mats, f"gallery_{level}_stbd_fwd", stbd_x, (stbd_void[1], ring_z[1]), y)
        else:
            slab(mats, f"gallery_{level}_stbd", stbd_x, ring_z, y)
        if level == 3:
            slab(mats, f"gallery_{level}_port_aft", port_x, (ring_z[0], port_void[0]), y)
            slab(mats, f"gallery_{level}_port_fwd", port_x, (port_void[1], ring_z[1]), y)
        else:
            slab(mats, f"gallery_{level}_port", port_x, ring_z, y)
        slab(mats, f"gallery_{level}_aft", (-7.00, 7.00), aft_z, y)
        slab(mats, f"gallery_{level}_fore", (-7.00, 7.00), fore_z, y)

        # Guard every open edge. The head of the grand stair and the lift doors
        # are the only gaps, and both are gaps because something arrives there.
        fore_gap = [0.0] if level == 1 else []
        for index, run in enumerate(wall_segments(-7.00, 7.00, fore_gap, 7.40)):
            railing(mats, f"gallery_{level}_fore_rail_{index}",
                    [(run[0], 17.00), (run[1], 17.00)], y, mat="brass")
        for index, run in enumerate(wall_segments(-7.00, 7.00, [0.0], 3.00)):
            railing(mats, f"gallery_{level}_aft_rail_{index}",
                    [(run[0], -17.00), (run[1], -17.00)], y, mat="brass")
        if level == 2:
            for tag, span in (("aft", (-17.00, stbd_void[0])), ("fwd", (stbd_void[1], 17.00))):
                railing(mats, f"gallery_{level}_stbd_rail_{tag}",
                        [(7.00, span[0]), (7.00, span[1])], y, mat="brass")
        else:
            railing(mats, f"gallery_{level}_stbd_rail",
                    [(7.00, -17.00), (7.00, 17.00)], y, mat="brass")
        if level == 3:
            for tag, span in (("aft", (-17.00, port_void[0])), ("fwd", (port_void[1], 17.00))):
                railing(mats, f"gallery_{level}_port_rail_{tag}",
                        [(-7.00, span[0]), (-7.00, span[1])], y, mat="brass")
        else:
            railing(mats, f"gallery_{level}_port_rail",
                    [(-7.00, -17.00), (-7.00, 17.00)], y, mat="brass")

    # Colonnade: a column per bay standing between one plate and the next, never
    # driven through one. They sit just outboard of the balustrade line, which
    # keeps them out of the gallery walkway and out of the well.
    for level in range(0, 4):
        y = level * DECK_PITCH
        for index, z in enumerate(grid(9, 32.0)):
            for side, x in (("port", -7.35), ("stbd", 7.35)):
                if level == 2 and side == "stbd" and stbd_void[0] < z < stbd_void[1]:
                    continue
                if level == 3 and side == "port" and port_void[0] < z < port_void[1]:
                    continue
                cylinder(f"column_{level}_{side}_{index}", 0.24, 3.06,
                         (x, y + 1.53, z), mats["bulkhead"], 10)
                cube(f"column_{level}_{side}_{index}_cap", (0.66, 0.16, 0.66),
                     (x, y + 3.00, z), mats["brass"], 0.02)

    # --- the three flights -------------------------------------------------
    stair_flight(mats, "grand", 0.0, 7.00, 10.60, 17.00, 0.0, 3.20)
    for edge in (-1, 1):
        slope_rail(mats, f"grand_rail_{'p' if edge < 0 else 's'}", edge * 3.35,
                   10.60, 17.00, 0.0, 3.20)
        cube(f"grand_newel_base_{'p' if edge < 0 else 's'}", (0.36, 1.00, 0.36),
             (edge * 3.35, 0.50, 10.35), mats["wood"], 0.03)
        cylinder(f"grand_urn_{'p' if edge < 0 else 's'}", 0.22, 0.55,
                 (edge * 3.35, 1.27, 10.35), mats["brass"], 10)
    cube("grand_apron", (7.40, 0.06, 1.20), (0, 0.03, 9.70), mats["brass"], 0.0)

    stair_flight(mats, "upper_stbd", 9.45, 4.90, 3.80, -3.80, 3.20, 6.40)
    slope_rail(mats, "upper_stbd_rail", 7.18, 3.80, -3.80, 3.20, 6.40)
    stair_flight(mats, "upper_port", -9.45, 4.90, -3.80, 3.80, 6.40, 9.60)
    slope_rail(mats, "upper_port_rail", -7.18, -3.80, 3.80, 6.40, 9.60)

    # --- the lift ----------------------------------------------------------
    # Clear, not the tinted shell glass: a scenic lift whose trunk you cannot
    # see the car move inside is just a brass-framed column.
    cube("lift_trunk_port", (0.18, 12.80, 2.60), (-1.31, 6.40, -15.70), mats["glass_clear"], 0.0)
    cube("lift_trunk_stbd", (0.18, 12.80, 2.60), (1.31, 6.40, -15.70), mats["glass_clear"], 0.0)
    cube("lift_trunk_fwd", (2.80, 12.80, 0.18), (0, 6.40, -14.40), mats["glass_clear"], 0.0)
    for index in range(4):
        cube(f"lift_frame_{index}", (0.14, 12.80, 0.14),
             (-1.33 + (index % 2) * 2.66, 6.40, -17.00 + (index // 2) * 2.60),
             mats["brass"], 0.0)
    cube("lift_car", (2.30, 2.35, 2.30), (0, 1.18, -15.70), mats["brass"], 0.02)
    cube("lift_car_glass", (2.10, 1.90, 0.06), (0, 1.30, -14.60), mats["glass_clear"], 0.0)
    for level in range(0, 4):
        y = level * DECK_PITCH
        for leaf in (-1, 1):
            cube(f"lift_door_{level}_{'p' if leaf < 0 else 's'}", (0.62, 2.20, 0.10),
                 (leaf * 0.36, y + 1.10, -17.02), mats["brass"], 0.0)
        cube(f"lift_arch_{level}", (2.10, 0.55, 0.14), (0, y + 2.48, -17.02), mats["wood"], 0.02)
        cube(f"lift_call_{level}", (0.16, 0.26, 0.05), (0.98, y + 1.15, -17.06),
             mats["neon_amber"], 0.0)
        cube(f"lift_deck_sign_{level}", (0.70, 0.24, 0.05), (-1.05, y + 2.05, -17.06),
             mats["neon_cyan"], 0.0)

    # --- sole: aft vestibule, hall, reception, forward vestibule -----------
    cube("sole_medallion", (9.00, 0.02, 9.00), (0, 0.02, -6.00), mats["wood"], 0.0)
    cube("sole_medallion_ring", (6.20, 0.03, 6.20), (0, 0.03, -6.00), mats["brass"], 0.0)
    cube("sole_runner_fwd", (5.00, 0.02, 12.00), (0, 0.02, 4.00), mats["teal"], 0.0)

    # Everything that reads as a fitting is set against the shell plating, and
    # everything that reads as furniture stands off it, so the room has a wall
    # line rather than a scatter of floating panels.
    cube("excursion_desk", (1.00, 1.02, 4.40), (-10.60, 0.51, -20.20), mats["wood"], 0.02)
    cube("excursion_top", (1.16, 0.07, 4.56), (-10.60, 1.05, -20.20), mats["brass"], 0.0)
    cube("excursion_back", (0.14, 2.40, 4.60), (-11.79, 1.20, -20.20), mats["teal"], 0.0)
    cube("excursion_sign", (0.06, 0.34, 3.00), (-11.68, 2.10, -20.20), mats["neon_pink"], 0.0)
    for index in range(3):
        cube(f"excursion_screen_{index}", (0.05, 0.60, 0.90), (-11.69, 1.45, -21.60 + index * 1.40),
             mats["screen"], 0.0)
    cube("plan_board", (0.16, 2.00, 4.60), (11.78, 1.35, -20.20), mats["wood"], 0.02)
    cube("plan_board_face", (0.05, 1.60, 4.10), (11.68, 1.40, -20.20), mats["screen"], 0.0)
    for index in range(2):
        bench(mats, f"vest_bench_aft_{index}", 6.20 - index * 12.40, -20.20, 0.0, 3.20,
              axis="z", mat="coral", back=-1 if index else 1)
    for index, z in enumerate((-21.60, -18.80)):
        planter(mats, f"vest_planter_aft_{index}", -3.20, z, 0.0)
        planter(mats, f"vest_planter_aft_s_{index}", 3.20, z, 0.0)

    # The bar takes the starboard side of the hall, the seating the port side,
    # and the centreline stays clear because it is the walk from the aft door to
    # the grand stair.
    # Wall, back-bar, staff aisle, counter, stool line, then the colonnade: the
    # order a bar is actually built in, and the reason the stools clear the
    # columns instead of standing inside them.
    cube("bar", (2.20, 1.12, 11.00), (9.40, 0.56, -8.00), mats["wood"], 0.03)
    cube("bar_top", (2.50, 0.09, 11.40), (9.40, 1.16, -8.00), mats["brass"], 0.0)
    cube("bar_kick", (0.16, 0.20, 11.00), (8.22, 0.10, -8.00), mats["trim"], 0.0)
    cube("bar_backbar", (0.55, 2.50, 11.00), (11.58, 1.25, -8.00), mats["wood"], 0.02)
    cube("bar_sign", (0.06, 0.60, 5.00), (11.80, 2.85, -8.00), mats["neon_cyan"], 0.0)
    for shelf in range(3):
        cube(f"bar_shelf_{shelf}", (0.36, 0.05, 10.40), (11.10, 0.95 + shelf * 0.52, -8.00),
             mats["glass"], 0.0)
        for index in range(13):
            cylinder(f"bottle_{shelf}_{index}", 0.06, 0.30,
                     (11.10, 1.12 + shelf * 0.52, -12.90 + index * 0.78),
                     mats["teal" if index % 3 else "coral"], 6)
    for index in range(9):
        z = -12.60 + index * 1.15
        cylinder(f"bar_stool_{index}", 0.09, 0.68, (7.95, 0.34, z), mats["steel"], 8)
        cylinder(f"bar_stool_{index}_foot", 0.20, 0.05, (7.95, 0.03, z), mats["steel"], 10)
        cylinder(f"bar_stool_{index}_seat", 0.22, 0.10, (7.95, 0.73, z), mats["coral"], 12)
    cube("bar_gantry", (2.40, 0.22, 11.00), (9.40, 2.60, -8.00), mats["brass"], 0.02)
    for index in range(8):
        cube(f"bar_pendant_{index}", (0.26, 0.30, 0.26), (9.40, 2.30, -12.30 + index * 1.30),
             mats["neon_amber"], 0.04)

    for index, z in enumerate((-13.00, -8.00, -3.00)):
        lounge_set(mats, f"hall_group_{index}", -10.90, z, 0.0, facing=1)
    for index, z in enumerate((-15.60, -10.50, -5.50, -0.40)):
        planter(mats, f"hall_planter_{index}", -5.20, z, 0.0, radius=0.55, height=0.75)

    cube("piano", (1.60, 0.28, 2.40), (0, 0.86, -14.20), mats["wood"], 0.04)
    cube("piano_lid", (1.60, 0.06, 1.60), (0, 1.03, -14.60), mats["wood"], 0.02)
    for index in range(3):
        cylinder(f"piano_leg_{index}", 0.07, 0.72, (-0.60 + index * 0.60, 0.36,
                                                    -13.30 + (index % 2) * -1.60),
                 mats["wood"], 8)
    cube("piano_keys", (1.30, 0.05, 0.24), (0, 0.74, -13.10), mats["bulkhead"], 0.0)
    cube("piano_bench", (0.90, 0.10, 0.36), (0, 0.52, -12.55), mats["coral"], 0.03)
    for edge in (-1, 1):
        cube(f"piano_bench_leg_{'p' if edge < 0 else 's'}", (0.08, 0.42, 0.30),
             (edge * 0.36, 0.30, -12.55), mats["wood"], 0.0)
    cube("piano_stage", (3.60, 0.12, 3.60), (0, 0.06, -14.00), mats["brass"], 0.0)

    # Reception faces the walk-in, with the concierge desk opposite it.
    cube("reception", (1.10, 1.10, 8.00), (-9.40, 0.55, 3.00), mats["wood"], 0.03)
    cube("reception_top", (1.30, 0.08, 8.30), (-9.40, 1.14, 3.00), mats["brass"], 0.0)
    cube("reception_back", (0.16, 2.60, 8.40), (-11.78, 1.30, 3.00), mats["teal"], 0.02)
    cube("reception_sign", (0.06, 0.42, 4.60), (-11.66, 2.30, 3.00), mats["neon_pink"], 0.0)
    for index in range(4):
        z = 0.00 + index * 2.00
        cube(f"reception_screen_{index}", (0.05, 0.42, 0.62), (-11.66, 1.55, z), mats["screen"], 0.0)
        cube(f"reception_post_{index}", (0.36, 0.60, 0.36), (-9.40, 1.44, z), mats["screen"], 0.02)
        cylinder(f"reception_stool_{index}", 0.20, 0.62, (-8.55, 0.31, z), mats["coral"], 10)
    cube("concierge", (1.00, 1.02, 4.60), (9.40, 0.51, 3.00), mats["wood"], 0.03)
    cube("concierge_top", (1.18, 0.07, 4.80), (9.40, 1.05, 3.00), mats["brass"], 0.0)
    cube("concierge_back", (0.14, 2.40, 4.80), (11.79, 1.20, 3.00), mats["wood"], 0.02)
    cube("concierge_sign", (0.06, 0.30, 2.60), (11.68, 2.05, 3.00), mats["neon_amber"], 0.0)
    for index in range(3):
        cube(f"queue_post_{index}", (0.10, 1.00, 0.10), (-6.80, 0.50, 0.40 + index * 2.20),
             mats["brass"], 0.0)
        cube(f"queue_tape_{index}", (0.04, 0.06, 2.20), (-6.80, 0.92, 1.50 + index * 2.20),
             mats["coral"], 0.0)

    for index in range(2):
        bench(mats, f"vest_bench_fwd_{index}", 5.60 - index * 11.20, 20.20, 0.0, 3.00,
              axis="z", mat="teal", back=-1 if index else 1)
    # Clear of the stairwell-mid doorway head, which is at y 2.1 on the centreline.
    cube("gangway_sign", (5.00, 0.60, 0.10), (0, 2.45, 22.79), mats["neon_cyan"], 0.0)
    cube("photo_wall", (0.16, 2.20, 4.40), (-11.78, 1.25, 20.00), mats["wood"], 0.02)
    framed_run(mats, "photo_wall_art", -11.68, (18.20, 21.80), 0.0, 3, 1, height=0.90, sill=1.10)
    cube("bureau", (1.00, 1.02, 3.20), (10.60, 0.51, 20.00), mats["wood"], 0.03)
    cube("bureau_top", (1.18, 0.07, 3.36), (10.60, 1.05, 20.00), mats["brass"], 0.0)
    cube("bureau_sign", (0.06, 0.30, 2.00), (11.68, 2.00, 20.00), mats["neon_pink"], 0.0)
    cube("bureau_back", (0.14, 2.40, 3.40), (11.79, 1.20, 20.00), mats["teal"], 0.02)

    # --- level 1: the shopping parade --------------------------------------
    y1 = DECK_PITCH
    shop_unit(mats, "shop_jewel", -11.85, -9.40, (-15.60, -8.60), y1, "jewellery", "neon_amber")
    shop_unit(mats, "shop_fashion", -11.85, -9.40, (-7.40, -0.40), y1, "fashion", "neon_pink")
    shop_unit(mats, "shop_duty", -11.85, -9.40, (0.80, 7.80), y1, "duty", "neon_cyan")
    # The starboard parade has to stop clear of z -3.9: forward of that the band
    # is the underside and then the treads of the flight up to level 2, and a
    # shop there would be a shop inside a staircase.
    shop_unit(mats, "shop_watch", 11.85, 9.40, (-16.40, -10.40), y1, "jewellery", "neon_cyan")
    shop_unit(mats, "shop_logo", 11.85, 9.40, (-9.60, -4.20), y1, "fashion", "neon_amber")
    for index, z in enumerate((-18.60, 10.40, 14.40)):
        planter(mats, f"gallery1_planter_p_{index}", -8.30, z, y1, radius=0.55, height=0.75)
        planter(mats, f"gallery1_planter_s_{index}", 8.30, z, y1, radius=0.55, height=0.75)
    framed_run(mats, "gallery1_stbd_art", 11.78, (4.60, 15.60), y1, 5, -1)
    for index, z in enumerate((-20.80, -18.20)):
        bench(mats, f"gallery1_bench_{index}", 9.60, z, y1, 2.20, axis="z", mat="coral", back=1)
    # The aft gallery is the coffee house, overlooking the well.
    cube("cafe_counter", (1.00, 1.05, 5.40), (-4.60, y1 + 0.525, -20.00), mats["wood"], 0.03)
    cube("cafe_top", (1.18, 0.07, 5.60), (-4.60, y1 + 1.09, -20.00), mats["brass"], 0.0)
    cube("cafe_back", (0.55, 2.20, 5.40), (-6.40, y1 + 1.10, -20.00), mats["wood"], 0.02)
    cube("cafe_sign", (0.06, 0.40, 3.20), (-6.08, y1 + 2.05, -20.00), mats["neon_amber"], 0.0)
    for index in range(4):
        cube(f"cafe_machine_{index}", (0.50, 0.55, 0.60), (-4.85, y1 + 1.40,
                                                           -21.80 + index * 1.20),
             mats["steel"], 0.03)
    for index, z in enumerate((-21.40, -19.60, -17.90)):
        cylinder(f"cafe_table_{index}", 0.42, 0.06, (2.40, y1 + 0.75, z), mats["wood"], 14)
        cylinder(f"cafe_stem_{index}", 0.07, 0.72, (2.40, y1 + 0.36, z), mats["steel"], 8)
        for seat, dx in enumerate((-0.75, 0.75)):
            cube(f"cafe_chair_{index}_{seat}", (0.44, 0.72, 0.44), (2.40 + dx, y1 + 0.36, z),
                 mats["teal"], 0.04)
    # The head of the grand stair is a landing, so it gets landing furniture.
    for edge in (-1, 1):
        cube(f"stair_head_console_{'p' if edge < 0 else 's'}", (1.60, 0.85, 0.50),
             (edge * 4.60, y1 + 0.425, 18.10), mats["wood"], 0.03)
        planter(mats, f"stair_head_planter_{'p' if edge < 0 else 's'}", edge * 5.90, 21.20, y1)
        cube(f"stair_head_mirror_{'p' if edge < 0 else 's'}", (1.40, 1.60, 0.05),
             (edge * 4.60, y1 + 1.75, 22.82), mats["glass"], 0.0)
    lounge_set(mats, "stair_head_group", -0.60, 20.60, y1, facing=1)

    # --- level 2: gallery, coffee bar, lounge ------------------------------
    y2 = 2 * DECK_PITCH
    framed_run(mats, "art_port", -11.78, (-15.00, 8.00), y2, 8, 1)
    for index, z in enumerate(grid(5, 20.0)):
        cylinder(f"art_plinth_{index}", 0.34, 1.05, (-8.60, y2 + 0.525, z - 3.00),
                 mats["trim"], 12)
        cube(f"art_piece_{index}", (0.50, 0.80, 0.50), (-8.60, y2 + 1.45, z - 3.00),
             mats["brass" if index % 2 else "coral"], 0.12)
        cube(f"art_spot_{index}", (0.24, 0.10, 0.24), (-8.60, y2 + 2.95, z - 3.00),
             mats["neon_amber"], 0.0)
    cube("art_desk", (0.90, 1.00, 2.60), (-9.80, y2 + 0.50, 13.60), mats["wood"], 0.03)
    cube("art_desk_top", (1.06, 0.07, 2.76), (-9.80, y2 + 1.03, 13.60), mats["brass"], 0.0)
    cube("coffee_bar", (0.95, 1.05, 6.00), (10.90, y2 + 0.525, 9.60), mats["wood"], 0.03)
    cube("coffee_bar_top", (1.14, 0.07, 6.20), (10.90, y2 + 1.09, 9.60), mats["brass"], 0.0)
    cube("coffee_bar_sign", (0.06, 0.36, 3.40), (11.80, y2 + 2.10, 9.60), mats["neon_cyan"], 0.0)
    for index in range(6):
        z = 7.10 + index * 1.00
        cylinder(f"coffee_stool_{index}", 0.09, 0.66, (9.90, y2 + 0.33, z), mats["steel"], 8)
        cylinder(f"coffee_stool_{index}_seat", 0.21, 0.10, (9.90, y2 + 0.71, z), mats["teal"], 12)
    for index, z in enumerate((-14.00, -9.00)):
        lounge_set(mats, f"gallery2_group_{index}", 11.10, z, y2, facing=-1)
    for index, z in enumerate((-20.60, -18.60)):
        lounge_set(mats, f"gallery2_aft_{index}", -4.80 + index * 9.60, z, y2,
                   facing=1 if index else -1)
    for index, z in enumerate((18.60, 21.20)):
        cylinder(f"gallery2_fore_table_{index}", 0.45, 0.06, (0, y2 + 1.02, z), mats["glass"], 14)
        cylinder(f"gallery2_fore_stem_{index}", 0.08, 0.98, (0, y2 + 0.49, z), mats["steel"], 8)
        for seat, dx in enumerate((-0.85, 0.85)):
            cylinder(f"gallery2_fore_stool_{index}_{seat}", 0.09, 0.76,
                     (dx, y2 + 0.38, z), mats["steel"], 8)
            cylinder(f"gallery2_fore_seat_{index}_{seat}", 0.21, 0.10,
                     (dx, y2 + 0.81, z), mats["coral"], 12)
    # The forward bulkhead carries the art here rather than a free-standing run,
    # because the middle of this gallery is where the high tables stand.
    cube("gallery2_fore_panel", (7.20, 2.20, 0.08), (0, y2 + 1.45, 22.82), mats["wood"], 0.02)
    for index, x in enumerate(grid(3, 6.00)):
        cube(f"gallery2_fore_work_{index}", (1.60, 1.30, 0.04), (x, y2 + 1.55, 22.76),
             mats["teal" if index % 2 else "coral"], 0.0)
        cube(f"gallery2_fore_spot_{index}", (0.34, 0.10, 0.26), (x, y2 + 2.45, 22.62),
             mats["neon_amber"], 0.0)

    # --- level 3: library, observation lounge ------------------------------
    y3 = 3 * DECK_PITCH
    for index, z in enumerate(grid(6, 12.0)):
        cube(f"library_case_{index}", (0.45, 2.20, 1.70), (-11.60, y3 + 1.10, z - 10.60),
             mats["wood"], 0.02)
        for shelf in range(4):
            # Set forward of the carcass face so the spines actually read.
            cube(f"library_books_{index}_{shelf}", (0.36, 0.30, 1.54),
                 (-11.44, y3 + 0.45 + shelf * 0.52, z - 10.60),
                 mats["coral" if (index + shelf) % 2 else "teal"], 0.03)
    for index, z in enumerate((-16.40, -12.40, -8.40)):
        cube(f"library_chair_{index}", (0.80, 0.42, 0.80), (-8.60, y3 + 0.21, z),
             mats["teal"], 0.05)
        cube(f"library_chair_{index}_back", (0.22, 0.62, 0.80), (-8.95, y3 + 0.72, z),
             mats["teal"], 0.05)
        cube(f"library_lamp_{index}", (0.30, 0.34, 0.30), (-8.60, y3 + 1.20, z + 0.80),
             mats["neon_amber"], 0.05)
        cylinder(f"library_stand_{index}", 0.05, 1.05, (-8.60, y3 + 0.52, z + 0.80),
                 mats["brass"], 8)
    cube("writing_table", (1.40, 0.76, 3.20), (-10.20, y3 + 0.38, 10.60), mats["wood"], 0.03)
    for index in range(3):
        cube(f"writing_chair_{index}", (0.50, 0.46, 0.50), (-8.90, y3 + 0.23,
                                                            9.40 + index * 1.20),
             mats["coral"], 0.04)
        cube(f"writing_lamp_{index}", (0.22, 0.30, 0.22), (-10.70, y3 + 0.95,
                                                           9.40 + index * 1.20),
             mats["neon_amber"], 0.04)
    for index, z in enumerate((-14.00, -8.00, -2.00, 4.00, 10.00)):
        cube(f"obs_banquette_{index}", (1.00, 0.42, 4.60), (11.30, y3 + 0.21, z),
             mats["coral"], 0.04)
        cube(f"obs_banquette_{index}_back", (0.26, 0.66, 4.60), (11.68, y3 + 0.75, z),
             mats["coral"], 0.04)
        cylinder(f"obs_table_{index}", 0.40, 0.06, (9.90, y3 + 0.72, z), mats["wood"], 14)
        cylinder(f"obs_stem_{index}", 0.07, 0.69, (9.90, y3 + 0.35, z), mats["steel"], 8)
        cube(f"obs_chair_{index}", (0.46, 0.74, 0.46), (8.90, y3 + 0.37, z), mats["teal"], 0.04)
    for index, z in enumerate((-20.40, -18.40)):
        cube(f"kiosk_{index}", (0.70, 1.20, 1.00), (-3.00 + index * 6.00, y3 + 0.60, z),
             mats["bulkhead"], 0.03)
        cube(f"kiosk_{index}_screen", (0.50, 0.60, 0.06), (-3.00 + index * 6.00,
                                                           y3 + 1.35, z + 0.52),
             mats["screen"], 0.0)
    lounge_set(mats, "gallery3_fore_group", -1.20, 20.20, y3, facing=1)

    # --- the well: chandelier, banners, cove lighting ----------------------
    for tier in range(4):
        cylinder(f"chandelier_tier_{tier}", 1.90 - tier * 0.42, 0.22,
                 (0, 12.10 - tier * 0.85, 0.00), mats["neon_pink"], 16)
        cylinder(f"chandelier_ring_{tier}", 1.98 - tier * 0.42, 0.06,
                 (0, 11.98 - tier * 0.85, 0.00), mats["brass"], 16)
    cylinder("chandelier_stem", 0.09, 0.70, (0, 12.55, 0.00), mats["brass"], 8)
    for index, z in enumerate((-11.00, 11.00)):
        cylinder(f"pendant_{index}", 1.10, 0.20, (0, 12.20, z), mats["neon_amber"], 14)
        cylinder(f"pendant_{index}_stem", 0.07, 0.50, (0, 12.55, z), mats["brass"], 8)
    for index, z in enumerate(grid(6, 28.0)):
        cube(f"banner_{index}", (0.06, 5.00, 1.60), (-6.85, 7.20, z), mats["teal"], 0.0)
        cube(f"banner_s_{index}", (0.06, 5.00, 1.60), (6.85, 7.20, z), mats["coral"], 0.0)
    for level in range(1, 4):
        y = level * DECK_PITCH
        for index, z in enumerate(grid(12, 32.0)):
            cube(f"cove_{level}_p_{index}", (0.16, 0.10, 1.80), (-7.06, y - 0.30, z),
                 mats["neon_cyan"], 0.0)
            cube(f"cove_{level}_s_{index}", (0.16, 0.10, 1.80), (7.06, y - 0.30, z),
                 mats["neon_cyan"], 0.0)
        for index, x in enumerate(grid(6, 12.0)):
            cube(f"cove_{level}_a_{index}", (1.60, 0.10, 0.16), (x, y - 0.30, -17.06),
                 mats["neon_cyan"], 0.0)
            cube(f"cove_{level}_f_{index}", (1.60, 0.10, 0.16), (x, y - 0.30, 17.06),
                 mats["neon_cyan"], 0.0)
    for index, z in enumerate(grid(8, 40.0)):
        cube(f"deckhead_light_p_{index}", (0.30, 0.14, 2.40), (-11.60, 12.62, z),
             mats["neon_amber"], 0.0)
        cube(f"deckhead_light_s_{index}", (0.30, 0.14, 2.40), (11.60, 12.62, z),
             mats["neon_amber"], 0.0)


# --- restaurant parts ------------------------------------------------------
#
# A dining room is not a field of tables. It is a hierarchy: a way in, a route
# through, a place the route is going, and a service side the guest is not
# meant to read as service. Everything below is a piece of that hierarchy, and
# every piece is authored about the diner rather than about the grid, which is
# why the chairs, covers and cutlery all take a facing.


def diner_chair(mats, name, x, z, y, fx, fz, mat="coral"):
    """A chair at a table. `(fx, fz)` points from the chair toward the table.

    The back therefore always ends up on the outside of the setting, whatever
    angle the chair stands at, which is what lets a round table be laid with
    ten covers without a single chair facing the wrong way.
    """
    yaw = math.atan2(fx, fz)
    sin_y, cos_y = math.sin(yaw), math.cos(yaw)

    def at(across, along):
        return (x + across * cos_y + along * sin_y, z - across * sin_y + along * cos_y)

    rot = (0.0, 0.0, yaw)
    cube(f"{name}_seat", (0.46, 0.09, 0.46), (x, y + 0.45, z), mats[mat], 0.02, rot)
    for tag, across, along in (("aa", -1, -1), ("ab", -1, 1), ("ba", 1, -1), ("bb", 1, 1)):
        leg_x, leg_z = at(across * 0.18, along * 0.18)
        cube(f"{name}_leg_{tag}", (0.05, 0.42, 0.05), (leg_x, y + 0.21, leg_z),
             mats["wood"], 0.0, rot)
    back_x, back_z = at(0.0, -0.185)
    cube(f"{name}_back", (0.46, 0.52, 0.09), (back_x, y + 0.755, back_z), mats[mat], 0.02, rot)
    crest_x, crest_z = at(0.0, -0.185)
    cube(f"{name}_crest", (0.46, 0.07, 0.13), (crest_x, y + 1.045, crest_z),
         mats["wood"], 0.02, rot)


def cover(mats, name, x, z, y, fx, fz):
    """One place setting on a table top at `y`, laid for a diner facing (fx, fz)."""
    yaw = math.atan2(fx, fz)
    sin_y, cos_y = math.sin(yaw), math.cos(yaw)

    def at(across, along):
        return (x + across * cos_y + along * sin_y, z - across * sin_y + along * cos_y)

    rot = (0.0, 0.0, yaw)
    cylinder(f"{name}_plate", 0.13, 0.02, (x, y + 0.01, z), mats["bulkhead"], 12)
    cube(f"{name}_napkin", (0.10, 0.16, 0.10), (x, y + 0.10, z), mats["coral"], 0.03, rot)
    glass_x, glass_z = at(0.21, 0.13)
    cylinder(f"{name}_glass", 0.035, 0.15, (glass_x, y + 0.075, glass_z), mats["glass"], 8)
    for tag, across in (("l", -0.20), ("r", 0.19)):
        piece_x, piece_z = at(across, 0.0)
        cube(f"{name}_cutlery_{tag}", (0.03, 0.01, 0.20), (piece_x, y + 0.005, piece_z),
             mats["brass"], 0.0, rot)


def round_table(mats, name, x, z, y, radius, covers, chair="coral"):
    """A skirted round table laid for `covers`, chairs set square to each cover.

    The linen goes to the deck the way it does in a real dining room, so there
    is no pedestal to be seen and nothing hidden inside the drape.
    """
    top = y + 0.76
    cylinder(f"{name}_drape", radius, 0.76, (x, y + 0.38, z), mats["bulkhead"], 16)
    cylinder(f"{name}_top", radius + 0.03, 0.04, (x, top - 0.02, z), mats["bulkhead"], 16)
    cylinder(f"{name}_vase", 0.06, 0.22, (x, top + 0.11, z), mats["glass"], 8)
    cube(f"{name}_posy", (0.24, 0.22, 0.24), (x, top + 0.30, z), mats["coral"], 0.10)
    for index in range(covers):
        angle = index * 2 * math.pi / covers
        out_x, out_z = math.sin(angle), math.cos(angle)
        cover(mats, f"{name}_cover_{index}", x + out_x * (radius - 0.26),
              z + out_z * (radius - 0.26), top, -out_x, -out_z)
        diner_chair(mats, f"{name}_chair_{index}", x + out_x * (radius + 0.52),
                    z + out_z * (radius + 0.52), y, -out_x, -out_z, chair)


def bay_table(mats, name, x, z, y, width, depth):
    """A skirted rectangular table, used where a banquette fixes the geometry."""
    top = y + 0.76
    cube(f"{name}_drape", (width, 0.76, depth), (x, y + 0.38, z), mats["bulkhead"], 0.0)
    cube(f"{name}_top", (width + 0.06, 0.04, depth + 0.06), (x, top - 0.02, z),
         mats["bulkhead"], 0.0)
    cylinder(f"{name}_vase", 0.055, 0.20, (x, top + 0.10, z), mats["glass"], 8)
    cube(f"{name}_posy", (0.20, 0.20, 0.20), (x, top + 0.27, z), mats["teal"], 0.09)
    return top


def build_dining_room(mats):
    """The main restaurant: a raised window tier, a spine, and a service side.

    The plan is the argument. You come in one door on the centreline aft, are
    met at a podium, and walk a spine that runs the length of the room to the
    captain's table under the dome. Outboard of the spine are the round tables,
    outboard of those a column line that carries the four waiter stations, and
    outboard of that a tier lifted 200 mm so the banquettes against the glass
    look over the room and out of the windows at once. Everything a waiter
    needs is on the column line; everything a guest sees is inboard of it; and
    the galley doors are at the far end, behind the carvery, where the guests
    are not walking.
    """
    kit.shell(
        mats,
        (28, 2.8, 44),
        [portal("stairwell-mid", 0, 0, -22)],
        carpet="carpet",
        glaze={"port": (0.9, 2.3), "starboard": (0.9, 2.3)},
    )

    tier_y = 0.20
    tier_out, tier_edge = 13.86, 9.80
    tier_z = (-16.80, 16.80)
    # Bay boundaries and the column line share one ladder, so a column always
    # lands on a partition between two window bays and never in front of one.
    bounds = [(index - 5) * 3.36 for index in range(11)]
    bays = [(bounds[index] + bounds[index + 1]) / 2 for index in range(10)]

    # --- the window tiers --------------------------------------------------
    for side, tag in ((-1, "port"), (1, "stbd")):
        span = (min(side * tier_out, side * tier_edge), max(side * tier_out, side * tier_edge))
        slab(mats, f"tier_{tag}", span, tier_z, tier_y, mat="carpet", thickness=tier_y)
        cube(f"tier_{tag}_nosing", (0.10, 0.05, tier_z[1] - tier_z[0]),
             (side * (tier_edge + 0.02), tier_y - 0.025, 0.0),
             mats["brass"], 0.0)
        for end, z in (("aft", tier_z[0]), ("fwd", tier_z[1])):
            cube(f"tier_{tag}_nosing_{end}", (tier_out - tier_edge, 0.05, 0.10),
                 (side * (tier_out + tier_edge) / 2, tier_y - 0.025,
                  z - math.copysign(0.03, z)),
                 mats["brass"], 0.0)

        # Banquette against the shell: the back stops at 1.28, which crosses
        # only the bottom of the glass, so a seated guest still has a window.
        for index, z in enumerate(bays):
            cube(f"banq_{tag}_{index}_plinth", (0.68, 0.40, 2.80),
                 (side * 13.38, tier_y + 0.20, z), mats["wood"], 0.02)
            cube(f"banq_{tag}_{index}_seat", (0.72, 0.12, 2.80),
                 (side * 13.36, tier_y + 0.46, z), mats["teal"], 0.03)
            cube(f"banq_{tag}_{index}_back", (0.16, 0.56, 2.80),
                 (side * 13.74, tier_y + 0.80, z), mats["teal"], 0.03)
            cube(f"banq_{tag}_{index}_cap", (0.20, 0.06, 2.80),
                 (side * 13.74, tier_y + 1.11, z), mats["wood"], 0.02)

            top = bay_table(mats, f"bay_{tag}_{index}", side * 12.55, z, tier_y, 0.90, 1.30)
            for seat, offset in enumerate((-0.45, 0.45)):
                cover(mats, f"bay_{tag}_{index}_in_{seat}", side * 12.86, z + offset, top,
                      -side, 0.0)
                cover(mats, f"bay_{tag}_{index}_out_{seat}", side * 12.24, z + offset, top,
                      side, 0.0)
                diner_chair(mats, f"bay_{tag}_{index}_chair_{seat}", side * 11.62, z + offset,
                            tier_y, side, 0.0, "coral")
            cylinder(f"bay_{tag}_{index}_rod", 0.025, 0.62, (side * 12.55, 2.49, z),
                     mats["brass"], 8)
            cube(f"bay_{tag}_{index}_shade", (0.44, 0.26, 0.44), (side * 12.55, 2.05, z),
                 mats["neon_amber"], 0.05)

        # One divider per boundary, drawn here rather than by the bays, so no
        # two bays ever author the same panel twice in the same place.
        for index, z in enumerate(bounds):
            cube(f"banq_{tag}_div_{index}", (0.76, 1.24, 0.12),
                 (side * 13.42, tier_y + 0.62, z), mats["wood"], 0.02)
            cube(f"banq_{tag}_div_{index}_top", (0.80, 0.07, 0.16),
                 (side * 13.42, tier_y + 1.28, z), mats["brass"], 0.02)

        # A glass balustrade along the tier edge, broken by a metre of open
        # nosing at every boundary. Those breaks are the steps up, which is
        # why the balustrade runs on bay centres and not on the boundaries.
        for index, z in enumerate(bays):
            cube(f"tier_{tag}_glass_{index}", (0.05, 0.90, 2.36),
                 (side * 9.95, tier_y + 0.50, z), mats["glass_clear"], 0.0)
            cube(f"tier_{tag}_rail_{index}", (0.14, 0.06, 2.46),
                 (side * 9.95, tier_y + 1.03, z), mats["brass"], 0.02)
            for post, offset in ((0, -1.18), (1, 1.18)):
                cylinder(f"tier_{tag}_post_{index}_{post}", 0.045, 1.00,
                         (side * 9.95, tier_y + 0.50, z + offset), mats["brass"], 8)

    # --- the column line and its waiter stations ---------------------------
    #
    # Guests walk between the columns and the tier; waiters work the other
    # face, so a station's doors and worktop clutter face the tables and its
    # glass screen faces the guest aisle.
    for side, tag in ((-1, "port"), (1, "stbd")):
        for index, z in enumerate(bounds):
            cube(f"col_{tag}_{index}_base", (0.72, 0.14, 0.72), (side * 7.90, 0.07, z),
                 mats["trim"], 0.02)
            cylinder(f"col_{tag}_{index}", 0.28, 2.66, (side * 7.90, 1.47, z),
                     mats["bulkhead"], 12)
            cube(f"col_{tag}_{index}_cap", (0.80, 0.18, 0.80), (side * 7.90, 2.49, z),
                 mats["brass"], 0.02)

        for slot, gap in enumerate((1, 3, 6, 8)):
            z = bays[gap]
            name = f"station_{tag}_{slot}"
            cube(f"{name}_kick", (0.56, 0.12, 2.40), (side * 7.85, 0.06, z), mats["trim"], 0.0)
            cube(f"{name}_carcass", (0.70, 0.80, 2.48), (side * 7.85, 0.52, z), mats["wood"], 0.02)
            cube(f"{name}_top", (0.78, 0.06, 2.56), (side * 7.85, 0.95, z), mats["brass"], 0.0)
            for door, offset in enumerate((-0.80, 0.0, 0.80)):
                cube(f"{name}_door_{door}", (0.04, 0.62, 0.74), (side * 7.48, 0.50, z + offset),
                     mats["trim"], 0.02)
            cylinder(f"{name}_urn", 0.16, 0.42, (side * 7.85, 1.19, z - 0.95), mats["steel"], 12)
            cylinder(f"{name}_urn_lid", 0.17, 0.06, (side * 7.85, 1.43, z - 0.95),
                     mats["brass"], 12)
            cube(f"{name}_trays", (0.42, 0.22, 0.42), (side * 7.85, 1.09, z + 0.30),
                 mats["steel"], 0.02)
            for stack in range(2):
                cylinder(f"{name}_plates_{stack}", 0.14, 0.24,
                         (side * 7.85, 1.10, z + 0.75 + stack * 0.30), mats["bulkhead"], 12)
            cylinder(f"{name}_post", 0.03, 0.42, (side * 7.95, 1.19, z - 0.20), mats["steel"], 8)
            cube(f"{name}_terminal", (0.05, 0.30, 0.40), (side * 7.95, 1.52, z - 0.20),
                 mats["screen"], 0.0)
            for post, offset in ((0, -1.20), (1, 1.20)):
                cylinder(f"{name}_screen_post_{post}", 0.035, 0.60,
                         (side * 8.25, 1.28, z + offset), mats["brass"], 8)
            cube(f"{name}_screen", (0.05, 0.50, 2.40), (side * 8.25, 1.32, z),
                 mats["glass_clear"], 0.0)

    # --- the tables in the room proper -------------------------------------
    row_z = [-15.20 + index * 3.80 for index in range(9)]
    for side, tag in ((-1, "port"), (1, "stbd")):
        for index, z in enumerate(row_z):
            # The three middle stations are left out on purpose: that gap is
            # the rotunda round the captain's table, and a table standing in it
            # would close the only route past.
            if 3 <= index <= 5:
                continue
            covers = 6 if index % 2 == 0 else 8
            radius = 0.85 if covers == 6 else 1.05
            round_table(mats, f"table_{tag}_{index}", side * 4.30, z, 0.0, radius, covers,
                        chair="coral" if index % 2 else "teal")
            cylinder(f"table_{tag}_{index}_rod", 0.03, 0.50, (side * 4.30, 2.55, z),
                     mats["brass"], 8)
            cube(f"table_{tag}_{index}_shade", (0.55, 0.30, 0.55), (side * 4.30, 2.18, z),
                 mats["neon_amber"], 0.06)

    # --- the rotunda and the captain's table -------------------------------
    # Two inlays, the smaller one a shade higher so the ring reads as a border
    # rather than as two discs fighting for the same plane.
    cylinder("rotunda_border", 4.40, 0.02, (0, 0.02, 0), mats["teal"], 32)
    cylinder("rotunda_medallion", 4.20, 0.02, (0, 0.04, 0), mats["wood"], 32)
    # Four planters on the diagonals mark the rotunda out as a place without
    # walling it off: the four cardinal approaches stay wide open.
    for index in range(4):
        angle = math.pi / 4 + index * math.pi / 2
        planter(mats, f"rotunda_planter_{index}", math.sin(angle) * 5.52,
                math.cos(angle) * 5.52, 0.0, radius=0.62, height=0.86)
    round_table(mats, "captain", 0.0, 0.0, 0.0, 1.30, 10, chair="coral")
    for index in range(4):
        angle = math.pi / 4 + index * math.pi / 2
        x, z = math.sin(angle) * 3.55, math.cos(angle) * 3.55
        cylinder(f"candelabrum_{index}_base", 0.34, 0.10, (x, 0.05, z), mats["brass"], 12)
        cylinder(f"candelabrum_{index}_stem", 0.08, 1.35, (x, 0.775, z), mats["brass"], 10)
        cube(f"candelabrum_{index}_arms", (0.90, 0.07, 0.14), (x, 1.48, z), mats["brass"], 0.0)
        for lamp, offset in ((0, -0.40), (1, 0.0), (2, 0.40)):
            cylinder(f"candelabrum_{index}_lamp_{lamp}", 0.06, 0.26,
                     (x + offset, 1.64, z), mats["neon_amber"], 8)

    for ring, (radius, height, level, mat) in enumerate(
        ((3.40, 0.10, 2.72, "trim"), (2.60, 0.10, 2.60, "brass"), (1.80, 0.10, 2.48, "neon_amber"))
    ):
        cylinder(f"dome_ring_{ring}", radius, height, (0, level, 0), mats[mat], 32)
    cylinder("chandelier_stem", 0.06, 0.44, (0, 2.24, 0), mats["brass"], 8)
    for tier, (radius, height, level, mat) in enumerate(
        ((0.90, 0.12, 2.02, "brass"), (0.62, 0.12, 1.90, "glass"), (0.36, 0.10, 1.79, "neon_amber"))
    ):
        cylinder(f"chandelier_{tier}", radius, height, (0, level, 0), mats[mat], 16)

    # --- the spine ---------------------------------------------------------
    # Every flat inlay floats 20 mm over the carpet. Laid flush it would share
    # a plane with the deck and the two would fight for every pixel.
    for index, (z0, z1) in enumerate(((-17.00, -4.40), (4.40, 17.00))):
        cube(f"spine_runner_{index}", (3.20, 0.02, z1 - z0), (0, 0.02, (z0 + z1) / 2),
             mats["teal"], 0.0)
        cube(f"spine_border_p_{index}", (0.16, 0.02, z1 - z0), (-1.68, 0.02, (z0 + z1) / 2),
             mats["brass"], 0.0)
        cube(f"spine_border_s_{index}", (0.16, 0.02, z1 - z0), (1.68, 0.02, (z0 + z1) / 2),
             mats["brass"], 0.0)
    for side in (-1, 1):
        for index, z in enumerate((-11.30, 11.30)):
            cube(f"field_inlay_{'p' if side < 0 else 's'}_{index}", (4.80, 0.02, 11.80),
                 (side * 4.80, 0.02, z), mats["wood"], 0.0)

    # --- the way in --------------------------------------------------------
    cube("entry_inlay", (12.00, 0.02, 4.60), (0, 0.02, -19.50), mats["wood"], 0.0)
    for side in (-1, 1):
        tag = "p" if side < 0 else "s"
        cylinder(f"arch_col_{tag}", 0.26, 2.20, (side * 2.40, 1.10, -17.40),
                 mats["bulkhead"], 12)
        cube(f"arch_col_{tag}_cap", (0.68, 0.14, 0.68), (side * 2.40, 2.27, -17.40),
             mats["brass"], 0.02)
    # The header sits on the capitals rather than through them: 2.34 is the top
    # of the caps and the bottom of the beam, and it clears a 2.1 m doorway.
    cube("arch_header", (5.60, 0.30, 0.36), (0, 2.49, -17.40), mats["wood"], 0.03)
    cube("arch_sign", (3.20, 0.26, 0.06), (0, 2.49, -17.60), mats["neon_cyan"], 0.0)

    # Podium to port of the doorway, reservation desk to starboard: the
    # centreline stays clear because that is where the queue stands.
    cube("podium", (1.00, 1.14, 0.66), (-2.40, 0.57, -19.60), mats["wood"], 0.03)
    cube("podium_top", (1.14, 0.06, 0.78), (-2.40, 1.17, -19.60), mats["brass"], 0.0)
    cube("podium_plan", (0.60, 0.04, 0.44), (-2.40, 1.22, -19.60), mats["screen"], 0.0)
    cube("desk", (1.80, 1.02, 0.70), (2.60, 0.51, -19.60), mats["wood"], 0.03)
    cube("desk_top", (1.94, 0.06, 0.82), (2.60, 1.05, -19.60), mats["brass"], 0.0)
    cube("desk_screen", (0.46, 0.32, 0.05), (2.60, 1.24, -19.80), mats["screen"], 0.0)
    for index in range(3):
        cylinder(f"desk_stool_{index}", 0.07, 0.62, (2.00 + index * 0.60, 0.31, -20.60),
                 mats["steel"], 8)
        cylinder(f"desk_stool_{index}_seat", 0.19, 0.09, (2.00 + index * 0.60, 0.66, -20.60),
                 mats["coral"], 12)

    for side in (-1, 1):
        tag = "p" if side < 0 else "s"
        bench(mats, f"wait_bench_{tag}", side * 5.20, -20.20, 0.0, 3.00, axis="z",
              mat="coral", back=side)
        planter(mats, f"entry_planter_{tag}", side * 7.20, -20.00, 0.0, radius=0.60, height=0.80)
        cube(f"menu_board_{tag}", (2.20, 1.40, 0.10), (side * 3.20, 1.55, -21.80),
             mats["wood"], 0.02)
        cube(f"menu_face_{tag}", (1.90, 1.10, 0.04), (side * 3.20, 1.55, -21.73),
             mats["screen"], 0.0)
        cube(f"menu_light_{tag}", (1.60, 0.08, 0.22), (side * 3.20, 2.36, -21.66),
             mats["neon_amber"], 0.0)

        # Wine displays flank the entry against the after bulkhead, which is
        # the one stretch of wall in this room with no window behind it. The
        # case is a carcass — back, two sides, a top and a plinth — so the
        # shelves and bottles inside it are actually visible through the glass.
        x = side * 9.00
        cube(f"wine_{tag}_back", (2.60, 1.72, 0.10), (x, 1.22, -21.80), mats["wood"], 0.0)
        cube(f"wine_{tag}_plinth", (2.60, 0.36, 0.55), (x, 0.18, -21.52), mats["trim"], 0.02)
        cube(f"wine_{tag}_top", (2.60, 0.12, 0.55), (x, 2.14, -21.52), mats["wood"], 0.02)
        for edge, offset in (("p", -1.24), ("s", 1.24)):
            cube(f"wine_{tag}_side_{edge}", (0.12, 1.72, 0.55), (x + offset, 1.22, -21.52),
                 mats["wood"], 0.02)
        cube(f"wine_{tag}_glass", (2.30, 1.60, 0.06), (x, 1.22, -21.28), mats["glass_clear"], 0.0)
        for shelf in range(4):
            cube(f"wine_{tag}_shelf_{shelf}", (2.24, 0.04, 0.44),
                 (x, 0.46 + shelf * 0.40, -21.55), mats["steel"], 0.0)
            for slot in range(9):
                cylinder(f"wine_{tag}_bottle_{shelf}_{slot}", 0.045, 0.30,
                         (x - 1.00 + slot * 0.25, 0.63 + shelf * 0.40, -21.53),
                         mats["teal" if (shelf + slot) % 3 else "coral"], 6)
        cube(f"wine_{tag}_light", (2.20, 0.06, 0.30), (x, 2.24, -21.52),
             mats["neon_pink"], 0.0)

    # --- the service end ---------------------------------------------------
    # Carvery on the centreline, galley doors either side of it. Guests reach
    # the carvery from the spine; the crew reach it from behind, through the
    # 800 mm of working space between its back and the bulkhead.
    cube("carvery", (7.00, 1.00, 1.10), (0, 0.50, 20.40), mats["wood"], 0.03)
    cube("carvery_top", (7.30, 0.08, 1.30), (0, 1.04, 20.40), mats["steel"], 0.0)
    cube("carvery_kick", (6.60, 0.16, 0.10), (0, 0.08, 19.80), mats["trim"], 0.0)
    for index, x in enumerate(grid(5, 6.20)):
        cube(f"carvery_well_{index}", (0.96, 0.22, 0.72), (x, 1.19, 20.40), mats["steel"], 0.02)
        cube(f"carvery_food_{index}", (0.84, 0.10, 0.60), (x, 1.35, 20.40),
             mats["coral" if index % 2 else "orange"], 0.03)
        cube(f"carvery_lamp_{index}", (0.90, 0.08, 0.40), (x, 1.92, 20.40),
             mats["neon_amber"], 0.0)
    # The gantry posts stand outboard of the last hot well and the plate stacks
    # outboard of the posts, so nothing on this counter is reached across
    # something else that is hot.
    cube("carvery_gantry", (7.30, 0.20, 0.90), (0, 2.06, 20.40), mats["brass"], 0.02)
    for index, x in ((0, -3.50), (1, 3.50)):
        cylinder(f"carvery_post_{index}", 0.05, 0.90, (x, 1.51, 20.40), mats["brass"], 8)
    for side in (-1, 1):
        for index, z in ((0, 20.10), (1, 20.70)):
            cylinder(f"carvery_plates_{'p' if side < 0 else 's'}_{index}", 0.15, 0.30,
                     (side * 3.25, 1.23, z), mats["bulkhead"], 12)
    cube("carvery_back", (7.60, 2.40, 0.12), (0, 1.20, 21.79), mats["wood"], 0.02)
    cube("carvery_mirror", (7.00, 1.60, 0.04), (0, 1.50, 21.71), mats["glass"], 0.0)
    cube("carvery_sign", (4.20, 0.30, 0.06), (0, 2.58, 21.82), mats["neon_cyan"], 0.0)

    for side in (-1, 1):
        tag = "p" if side < 0 else "s"
        cube(f"galley_frame_{tag}", (2.10, 2.45, 0.16), (side * 5.00, 1.225, 21.77),
             mats["trim"], 0.0)
        for leaf, offset in ((0, -0.45), (1, 0.45)):
            cube(f"galley_leaf_{tag}_{leaf}", (0.86, 2.20, 0.08),
                 (side * 5.00 + offset, 1.10, 21.64), mats["steel"], 0.0)
            cylinder(f"galley_light_{tag}_{leaf}", 0.17, 0.04,
                     (side * 5.00 + offset, 1.62, 21.58), mats["glass"], 12)
            cube(f"galley_kick_{tag}_{leaf}", (0.86, 0.30, 0.04),
                 (side * 5.00 + offset, 0.20, 21.58), mats["brass"], 0.0)
        cube(f"galley_sign_{tag}", (1.40, 0.26, 0.05), (side * 5.00, 2.62, 21.83),
             mats["neon_pink"], 0.0)

        cube(f"dish_{tag}", (1.60, 1.05, 0.70), (side * 8.60, 0.525, 19.40), mats["steel"], 0.02)
        cube(f"dish_{tag}_top", (1.72, 0.06, 0.80), (side * 8.60, 1.08, 19.40), mats["brass"], 0.0)
        for stack in range(3):
            cylinder(f"dish_{tag}_stack_{stack}", 0.15, 0.26,
                     (side * 8.60 - 0.50 + stack * 0.50, 1.24, 19.40), mats["bulkhead"], 12)
        cube(f"dish_{tag}_bin", (0.60, 0.72, 0.60), (side * 8.60, 0.36, 18.60),
             mats["trim"], 0.02)
        planter(mats, f"service_planter_{tag}", side * 11.60, 19.60, 0.0, radius=0.62,
                height=0.82)
        planter(mats, f"service_planter_{tag}_b", side * 12.60, 18.20, 0.0, radius=0.50,
                height=0.70)

    # --- deckhead ----------------------------------------------------------
    # Every beam lands on something. The main beams run column capital to
    # column capital and stop there; over the dome they are split so the two
    # never occupy the same air; and the tier gets its own short beams
    # outboard of the balustrade, on the same ladder as everything else.
    for index, z in enumerate(bounds):
        if abs(z) < 4.20:
            for side in (-1, 1):
                cube(f"beam_{index}_{'p' if side < 0 else 's'}", (4.70, 0.22, 0.30),
                     (side * 5.95, 2.69, z), mats["trim"], 0.02)
        else:
            cube(f"beam_{index}", (16.60, 0.22, 0.30), (0, 2.69, z), mats["trim"], 0.02)
        for side in (-1, 1):
            cube(f"beam_tier_{index}_{'p' if side < 0 else 's'}", (4.06, 0.22, 0.30),
                 (side * 11.83, 2.69, z), mats["trim"], 0.02)

    # Light lives between the beams: a trough down the spine in every bay clear
    # of the dome, and a cove over each tier edge. The round tables are lit by
    # their own pendants, so there is nothing over them to foul the rods.
    for index in range(10):
        if abs(bays[index]) > 5.0:
            cube(f"trough_spine_{index}", (2.60, 0.10, 2.10), (0, 2.72, bays[index]),
                 mats["neon_amber"], 0.0)
        for side in (-1, 1):
            cube(f"cove_{'p' if side < 0 else 's'}_{index}", (0.30, 0.12, 2.80),
                 (side * 9.95, 2.66, bays[index]), mats["neon_cyan"], 0.0)


# ---------------------------------------------------------------------------
# Decks 4 and 7 — accommodation
# ---------------------------------------------------------------------------


# A cabin is authored in its own (u, v) frame: u runs away from the entry
# bulkhead, v runs forward from the aft partition. The port and starboard rows
# are the same layout mirrored, so the mirror lives in one place — `placer` —
# and nowhere else. That is what stops the two sides drifting out of step, and
# it is why every dimension below can be reasoned about as a floor plan rather
# than as a list of world coordinates.


def placer(sign, entry_x, outward=1):
    """Map cabin-local (u, v) metres onto compartment (x, z)."""

    def place(u, v):
        return (sign * (entry_x + outward * u), v)

    return place


def prop(mats, place, name, size, at, y, mat, bevel=0.03):
    """A box in cabin-local metres. `size` is (u, height, v); `at` is (u, v)."""
    x, z = place(at[0], at[1])
    cube(name, (size[0], size[1], size[2]), (x, y, z), mats[mat], bevel)


def post(mats, place, name, radius, depth, at, y, mat, verts=12, rotation=(0.0, 0.0, 0.0)):
    """An upright cylinder in cabin-local metres."""
    x, z = place(at[0], at[1])
    cylinder(name, radius, depth, (x, y, z), mats[mat], verts, rotation)


def long_wall(mats, name, x, span, height, doors=(), door_w=0.9, thickness=0.12,
              mat="bulkhead", door_h=2.05):
    """A fore-and-aft bulkhead at `x`, holed for a doorway at each z in `doors`."""
    for index, (a, b) in enumerate(wall_segments(span[0], span[1], doors, door_w)):
        cube(f"{name}_{index}", (thickness, height, b - a), (x, height / 2, (a + b) / 2),
             mats[mat], 0.0)
    for index, centre in enumerate(doors):
        cube(f"{name}_head_{index}", (thickness, height - door_h, door_w),
             (x, door_h + (height - door_h) / 2, centre), mats[mat], 0.0)


def cross_wall(mats, name, z, span, height, doors=(), door_w=0.9, thickness=0.12,
               mat="bulkhead", door_h=2.05):
    """An athwartships bulkhead at `z`, holed for a doorway at each x in `doors`."""
    for index, (a, b) in enumerate(wall_segments(span[0], span[1], doors, door_w)):
        cube(f"{name}_{index}", (b - a, height, thickness), ((a + b) / 2, height / 2, z),
             mats[mat], 0.0)
    for index, centre in enumerate(doors):
        cube(f"{name}_head_{index}", (door_w, height - door_h, thickness),
             (centre, door_h + (height - door_h) / 2, z), mats[mat], 0.0)


def cabin_door(mats, place, name, v, leaf_u=-0.04, plate_u=-0.11, width=0.85, number="cyan"):
    """The leaf standing in the corridor bulkhead's opening, plus its number."""
    prop(mats, place, f"{name}_leaf", (0.06, 2.05, width), (leaf_u, v), 1.025, "wood", 0.0)
    post(mats, place, f"{name}_handle", 0.035, 0.16, (leaf_u + 0.05, v + width / 2 - 0.12),
         1.05, "brass", 8, (0.0, math.pi / 2, 0.0))
    prop(mats, place, f"{name}_plate", (0.03, 0.16, 0.30), (plate_u, v - width / 2 - 0.28),
         1.80, f"neon_{number}", 0.0)


def bathroom_pod(mats, place, name, depth, width, door_u, tall=False):
    """A wet unit in the corner beside the entry: the one room that must be a room.

    The pod is what turns a cabin from a furnished box into a cabin. It walls
    off `depth` x `width` of the entry corner, leaves the rest of that corner as
    an entry passage, and takes a door on its forward face.
    """
    height = 2.35
    wall = 0.10
    prop(mats, place, f"{name}_side", (wall, height, width + wall),
         (depth + wall / 2, (width + wall) / 2 - wall / 2), height / 2, "bulkhead", 0.0)
    for index, (a, b) in enumerate(wall_segments(0.0, depth + wall, [door_u], 0.75)):
        prop(mats, place, f"{name}_face_{index}", (b - a, height, wall),
             ((a + b) / 2, width + wall / 2), height / 2, "bulkhead", 0.0)
    prop(mats, place, f"{name}_face_head", (0.75, height - 2.05, wall),
         (door_u, width + wall / 2), 2.05 + (height - 2.05) / 2, "bulkhead", 0.0)

    # Shower against the far end, WC and vanity along the entry side, so the
    # three fittings sit on three different walls and nothing shares a footprint.
    prop(mats, place, f"{name}_shower", (0.85, 2.05, 0.85), (depth - 0.45, 0.475),
         1.025, "glass", 0.0)
    prop(mats, place, f"{name}_tray", (0.85, 0.06, 0.85), (depth - 0.45, 0.475), 0.03, "trim", 0.0)
    post(mats, place, f"{name}_wc", 0.19, 0.40, (0.35, 0.30), 0.20, "bulkhead", 10)
    prop(mats, place, f"{name}_cistern", (0.20, 0.55, 0.42), (0.10, 0.30), 0.475, "bulkhead", 0.02)
    prop(mats, place, f"{name}_vanity", (0.50, 0.76, 0.72), (0.35, width - 0.42), 0.38, "wood")
    prop(mats, place, f"{name}_counter", (0.56, 0.08, 0.78), (0.35, width - 0.42), 0.80, "trim", 0.02)
    post(mats, place, f"{name}_basin", 0.20, 0.12, (0.35, width - 0.42), 0.88, "bulkhead", 12)
    prop(mats, place, f"{name}_mirror", (0.52, 0.62, 0.04), (0.35, width - 0.04),
         1.45, "glass", 0.0)
    if tall:
        prop(mats, place, f"{name}_bath", (0.72, 0.52, 1.55), (depth - 1.35, 0.80),
             0.26, "bulkhead", 0.03)


def made_bed(mats, place, name, head_u, length, v_centre, width, linen, facing=1):
    """A bed made up so the linen is on the mattress and the pillows are not.

    The old block floated a pillow off the end of the mattress and buried a
    nightstand inside the base. Every number here is derived from the mattress
    box so that cannot happen again. `facing` is +1 when the foot lies further
    from the entry than the head and -1 when the bed is turned end for end, so a
    room that wants its head against the far bulkhead asks for it here rather
    than drawing a second headboard of its own.
    """
    foot_u = head_u + facing * length
    mid_u = (head_u + foot_u) / 2
    # The headboard stays inside the bed's own width: the transverse partitions
    # are only a couple of centimetres outboard of it and it must not reach them.
    prop(mats, place, f"{name}_headboard", (0.10, 1.05, width - 0.20),
         (head_u - facing * 0.05, v_centre), 0.95, "wood", 0.02)
    prop(mats, place, f"{name}_base", (length, 0.42, width), (mid_u, v_centre),
         0.21, linen, 0.02)
    prop(mats, place, f"{name}_mattress", (length - 0.08, 0.22, width - 0.08),
         (mid_u, v_centre), 0.53, "bulkhead", 0.04)
    prop(mats, place, f"{name}_duvet", (length * 0.5, 0.06, width - 0.06),
         (foot_u - facing * length * 0.29, v_centre), 0.67, linen, 0.02)
    for index, offset in enumerate((-0.28, 0.28)):
        prop(mats, place, f"{name}_pillow_{index}", (0.52, 0.16, width * 0.42),
             (head_u + facing * 0.36, v_centre + offset * width), 0.72, "bulkhead", 0.05)


def nightstand(mats, place, name, u, v):
    prop(mats, place, f"{name}", (0.45, 0.50, 0.45), (u, v), 0.25, "wood")
    prop(mats, place, f"{name}_lamp", (0.16, 0.24, 0.16), (u, v), 0.62, "neon_amber", 0.0)


def balcony_cabin(mats, place, name, depth, width, linen):
    """One outboard cabin, laid out the way a real one is.

    Entry passage first, with the wet unit on one side and the wardrobe on the
    other; then the bed centred on its headboard wall with a nightstand each
    side; then the credenza and sofa on opposite partitions; then the glass.
    Nothing floats and nothing overlaps — every prop stands on the deck, against
    a wall, or on top of the thing below it.
    """
    pod_v = 1.75
    closet_v = 0.65
    entry_v = (pod_v + 0.10 + width - closet_v) / 2
    centre = width / 2

    bathroom_pod(mats, place, f"{name}_pod", 2.20, pod_v, 1.45)
    prop(mats, place, f"{name}_closet", (2.10, 2.15, closet_v), (1.10, width - closet_v / 2),
         1.075, "wood", 0.02)
    prop(mats, place, f"{name}_closet_seam", (0.04, 2.00, closet_v - 0.10),
         (2.17, width - closet_v / 2), 1.02, "trim", 0.0)
    cabin_door(mats, place, f"{name}_door", entry_v)

    made_bed(mats, place, f"{name}_bed", 2.90, 1.90, centre, 2.00, linen)
    nightstand(mats, place, f"{name}_night_a", 3.15, centre - 1.25)
    nightstand(mats, place, f"{name}_night_b", 3.15, centre + 1.25)

    # The credenza takes the aft partition with the screen above it, facing the
    # bed; the sofa takes the forward one under the balcony light.
    prop(mats, place, f"{name}_credenza", (1.30, 0.75, 0.55), (5.65, 0.325), 0.375, "wood")
    prop(mats, place, f"{name}_screen", (0.95, 0.55, 0.06), (5.65, 0.09), 1.40, "screen", 0.0)
    prop(mats, place, f"{name}_chair", (0.45, 0.85, 0.45), (5.65, 0.95), 0.425, "coral", 0.03)
    prop(mats, place, f"{name}_sofa", (1.50, 0.42, 0.75), (5.80, width - 0.375), 0.21, "coral")
    prop(mats, place, f"{name}_sofa_back", (1.50, 0.45, 0.22), (5.80, width - 0.11),
         0.645, "coral")
    prop(mats, place, f"{name}_table", (0.70, 0.40, 0.55), (5.80, width - 1.23), 0.20, "glass", 0.02)
    post(mats, place, f"{name}_lamp", 0.09, 1.55, (6.70, width - 0.40), 0.775, "steel", 8)
    prop(mats, place, f"{name}_shade", (0.34, 0.30, 0.34), (6.70, width - 0.40),
         1.70, "neon_amber", 0.04)
    prop(mats, place, f"{name}_cove", (0.10, 0.05, width - 0.60), (depth - 0.30, centre),
         2.72, "screen", 0.0)


def balcony_glass(mats, place, name, u, width, jamb=0.60):
    """The balcony screen: full-height glass in a framed opening, with a leaf."""
    prop(mats, place, f"{name}_jamb_a", (0.14, 2.80, jamb), (u, jamb / 2), 1.40, "bulkhead", 0.0)
    prop(mats, place, f"{name}_jamb_b", (0.14, 2.80, jamb), (u, width - jamb / 2),
         1.40, "bulkhead", 0.0)
    clear = width - 2 * jamb
    # The one pane on the ship that has to be clear. Behind it are the balcony,
    # the shell glazing and then the sea; a tinted screen here would turn every
    # balcony cabin on board back into an inside cabin.
    prop(mats, place, f"{name}_glass", (0.06, 2.50, clear), (u, width / 2), 1.35, "glass_clear", 0.0)
    prop(mats, place, f"{name}_sill", (0.14, 0.10, clear), (u, width / 2), 0.05, "trim", 0.0)
    prop(mats, place, f"{name}_head", (0.14, 0.20, clear), (u, width / 2), 2.70, "trim", 0.0)
    prop(mats, place, f"{name}_stile", (0.06, 2.50, 0.08), (u + 0.06, width / 2), 1.35, "trim", 0.0)
    post(mats, place, f"{name}_pull", 0.03, 0.85, (u + 0.09, width / 2 + 0.45), 1.10, "brass", 8)


def build_cabin_deck_four(mats):
    """Deck 4: two alleyways, an inside-cabin spine between them, balconies out.

    A 38 m beam does not run one corridor. It runs two, with back-to-back inside
    cabins on the centreline and the balcony rooms outboard of each — which is
    why the deck reads as a ship rather than as a hotel floor. The stair lands on
    the centreline at the forward bulkhead, so the accommodation stops short of
    it and a lobby takes the last six metres; without that the door would open
    into somebody's wardrobe.
    """
    kit.shell(
        mats,
        (34, 2.8, 60),
        [portal("stairwell-aft", 0, 0, 30)],
        carpet="carpet",
        glaze={"port": (0.12, 2.58), "starboard": (0.12, 2.58)},
    )

    spine_x, alley_x, screen_x = 4.40, 7.00, 14.00
    band_aft, band_fwd = -25.5, 24.0
    pitch = 4.125
    count = 12
    frames = [band_aft + pitch * index for index in range(count + 1)]
    inside_pitch = 3.30
    inside_end = 7.50
    inside_count = 10
    inside_frames = [band_aft + inside_pitch * index for index in range(inside_count + 1)]

    cube("spine_centreline", (0.14, 2.8, band_fwd - band_aft), (0, 1.4, (band_aft + band_fwd) / 2),
         mats["bulkhead"], 0.0)

    for side, sign in (("port", -1), ("starboard", 1)):
        outboard_doors = []
        inside_doors = []
        for index in range(count):
            z0 = frames[index]
            width = pitch - 0.12
            entry = z0 + 0.06 + (1.85 + width - 0.65) / 2
            outboard_doors.append(entry)
        for index in range(inside_count):
            z0 = inside_frames[index]
            width = inside_pitch - 0.12
            inside_doors.append(z0 + 0.06 + (1.65 + width - 0.55) / 2)

        long_wall(mats, f"alley_out_{side}", sign * alley_x, (band_aft, band_fwd), 2.8,
                  outboard_doors, 0.85, 0.14)
        long_wall(mats, f"alley_in_{side}", sign * spine_x, (band_aft, band_fwd), 2.8,
                  inside_doors + [inside_end + 3.5], 0.85, 0.14)

        cube(f"alley_runner_{side}", (2.30, 0.03, band_fwd - band_aft),
             (sign * 5.7, 0.015, (band_aft + band_fwd) / 2), mats["teal"], 0.0)

        # Balcony cabins, transverse partition first so every cabin is closed.
        for index, z0 in enumerate(frames):
            cube(f"cabin_frame_{side}_{index}", (screen_x - alley_x, 2.8, 0.12),
                 (sign * (alley_x + screen_x) / 2, 1.4, z0), mats["bulkhead"], 0.0)
            cube(f"balcony_divider_{side}_{index}", (2.86, 1.90, 0.10), (sign * 15.5, 0.95, z0),
                 mats["bulkhead"], 0.0)

        for index in range(count):
            z0 = frames[index]
            width = pitch - 0.12
            name = f"cabin_{side}_{index}"
            place = placer(sign, alley_x + 0.07)
            # `place` maps v as an absolute z, so the cabin's own zero is folded
            # into the placer by shifting v; do it once, here.
            base = z0 + 0.06

            def local(u, v, base=base, place=place):
                x, _ = place(u, 0.0)
                return (x, base + v)

            balcony_cabin(mats, local, name, 6.86, width,
                          "coral" if index % 2 else "teal")
            balcony_glass(mats, local, f"{name}_screen", 6.93, width)

            # Balcony: teak over the deck plate, rail on the shell glazing.
            zc = base + width / 2
            cube(f"{name}_teak", (2.80, 0.04, width - 0.12), (sign * 15.5, 0.02, zc),
                 mats["wood"], 0.0)
            cube(f"{name}_rail", (0.06, 0.06, width - 0.12), (sign * 16.85, 1.05, zc),
                 mats["steel"], 0.0)
            for seat, offset in enumerate((-0.85, 0.85)):
                cube(f"{name}_bal_chair_{seat}", (0.55, 0.75, 0.55),
                     (sign * 15.0, 0.375, zc + offset), mats["canvas"], 0.03)
            cylinder(f"{name}_bal_table", 0.32, 0.06, (sign * 15.0, 0.72, zc), mats["glass"], 12)
            cylinder(f"{name}_bal_stem", 0.07, 0.70, (sign * 15.0, 0.35, zc), mats["steel"], 8)
            cube(f"{name}_lounger", (1.85, 0.16, 0.70), (sign * 15.75, 0.45, zc + 1.55),
                 mats["canvas"], 0.04)

        # Inside cabins on the centreline spine, entered off the same alleyway.
        for index, z0 in enumerate(inside_frames):
            cube(f"inside_frame_{side}_{index}", (spine_x, 2.8, 0.12),
                 (sign * spine_x / 2, 1.4, z0), mats["bulkhead"], 0.0)

        for index in range(inside_count):
            z0 = inside_frames[index]
            width = inside_pitch - 0.12
            name = f"inside_{side}_{index}"
            base = z0 + 0.06
            inward = placer(sign, spine_x - 0.07, outward=-1)

            def local(u, v, base=base, inward=inward):
                x, _ = inward(u, 0.0)
                return (x, base + v)

            inside_cabin(mats, local, name, 4.26, width,
                         "teal" if index % 2 else "coral")

        # Forward of the inside cabins the spine turns into ship's services,
        # which is where they belong: next to the stair, off the guest rooms.
        cross_wall(mats, f"spine_stop_{side}", inside_end,
                   (min(0.0, sign * spine_x), max(0.0, sign * spine_x)), 2.8)
        service_z = (inside_end + band_fwd) / 2
        for slot in range(4):
            cube(f"laundry_{side}_{slot}", (0.70, 0.95, 0.75),
                 (sign * 3.6, 0.475, inside_end + 1.2 + slot * 0.95), mats["steel"], 0.02)
            cube(f"laundry_door_{side}_{slot}", (0.06, 0.55, 0.55),
                 (sign * 3.18, 0.55, inside_end + 1.2 + slot * 0.95), mats["glass"], 0.0)
        cube(f"fold_table_{side}", (1.60, 0.08, 1.10), (sign * 1.4, 0.90, service_z - 2.0),
             mats["trim"], 0.02)
        cube(f"vending_{side}", (0.80, 2.00, 0.90), (sign * 3.9, 1.00, service_z + 3.0),
             mats["neon_cyan"], 0.02)
        cube(f"ice_{side}", (0.80, 1.40, 0.90), (sign * 3.9, 0.70, service_z + 4.2),
             mats["steel"], 0.02)
        cube(f"lounge_settee_{side}", (0.70, 0.80, 2.60), (sign * 1.0, 0.40, service_z + 5.4),
             mats["coral"])

        for index, z in enumerate(grid(18, band_fwd - band_aft)):
            cube(f"alley_light_{side}_{index}", (0.55, 0.05, 1.20),
                 (sign * 5.7, 2.73, z + (band_aft + band_fwd) / 2), mats["screen"], 0.0)

    # Forward lobby: the stair lands here, so it gets the lifts and a signpost.
    cross_wall(mats, "accom_fwd", band_fwd, (-17.0, 17.0), 2.8,
               [-5.7, 5.7], 2.20, 0.14, door_h=2.40)
    cross_wall(mats, "accom_aft", band_aft, (-17.0, 17.0), 2.8,
               [-5.7, 5.7], 2.20, 0.14, door_h=2.40)
    cube("lobby_carpet", (13.0, 0.03, 5.20), (0, 0.015, 27.0), mats["wood"], 0.0)
    for sign in (-1, 1):
        cube(f"lift_wall_{sign}", (0.15, 2.40, 6.00), (sign * 8.0, 1.20, 27.0),
             mats["bulkhead"], 0.0)
        for car in range(3):
            cube(f"lift_door_{sign}_{car}", (0.06, 2.15, 1.10),
                 (sign * 7.90, 1.075, 27.0 + (car - 1) * 1.90), mats["brass"], 0.0)
            cube(f"lift_call_{sign}_{car}", (0.04, 0.22, 0.14),
                 (sign * 7.86, 1.40, 27.0 + (car - 1) * 1.90 + 0.75), mats["neon_amber"], 0.0)
        cube(f"lobby_sign_{sign}", (2.40, 0.50, 0.06), (sign * 3.5, 2.20, 29.88),
             mats["neon_cyan"], 0.0)
        cube(f"lobby_bench_{sign}", (2.20, 0.45, 0.60), (sign * 3.2, 0.225, 24.9),
             mats["coral"])
    cylinder("lobby_settee", 1.60, 0.45, (0, 0.225, 27.0), mats["coral"], 20)
    cylinder("lobby_planter", 0.60, 0.90, (0, 0.90, 27.0), mats["trim"], 14)
    cube("lobby_foliage", (1.30, 1.30, 1.30), (0, 1.95, 27.0), mats["teal"], 0.2)
    for index, z in enumerate(grid(4, 5.0)):
        cube(f"lobby_light_{index}", (7.0, 0.06, 0.5), (0, 2.72, z + 27.0), mats["screen"], 0.0)

    # Aft lobby: crew access and the guest laundry queue, no lifts.
    cube("aft_lobby_carpet", (13.0, 0.03, 3.60), (0, 0.015, -27.8), mats["wood"], 0.0)
    for sign in (-1, 1):
        cube(f"aft_bench_{sign}", (2.60, 0.45, 0.60), (sign * 4.0, 0.225, -29.4), mats["coral"])
        cube(f"aft_art_{sign}", (3.20, 1.60, 0.05), (sign * 5.0, 1.60, -29.85),
             mats["neon_pink"], 0.0)
    cube("aft_lobby_light", (9.0, 0.06, 0.5), (0, 2.72, -27.8), mats["screen"], 0.0)


def inside_cabin(mats, place, name, depth, width, linen):
    """A windowless inside cabin: pod at the door, bed against the far bulkhead.

    Smaller than an outboard room and furnished like one — the point of the
    spine is that a player who wanders into it finds a real room, not a filler
    volume.
    """
    pod_v = 1.55
    closet_v = 0.55
    entry_v = (pod_v + 0.10 + width - closet_v) / 2
    centre = width / 2

    bathroom_pod(mats, place, f"{name}_pod", 2.00, pod_v, 1.40)
    prop(mats, place, f"{name}_closet", (2.00, 2.15, closet_v), (1.05, width - closet_v / 2),
         1.075, "wood", 0.02)
    cabin_door(mats, place, f"{name}_door", entry_v, -0.04, -0.11, 0.85, "cyan")

    # The head is at the far bulkhead here, so the bed is turned end for end and
    # its foot stops short of the wet unit's side wall at u 2.10.
    made_bed(mats, place, f"{name}_bed", depth - 0.15, 1.90, centre, 2.00, linen, facing=-1)
    nightstand(mats, place, f"{name}_night_a", depth - 0.55, 0.34)
    nightstand(mats, place, f"{name}_night_b", depth - 0.55, width - 0.34)
    prop(mats, place, f"{name}_desk", (1.20, 0.75, 0.50), (2.80, 0.25), 0.375, "wood")
    prop(mats, place, f"{name}_screen", (0.95, 0.55, 0.06), (2.80, 0.08), 1.40, "screen", 0.0)
    prop(mats, place, f"{name}_mirror", (0.90, 1.10, 0.05), (2.80, width - 0.03),
         1.45, "glass", 0.0)
    prop(mats, place, f"{name}_cove", (0.10, 0.05, width - 0.50), (depth - 0.55, centre),
         2.72, "screen", 0.0)


def suite(mats, place, name, depth, width, linen):
    """A deck 7 suite: entry hall, wet room, dressing room, bedroom, saloon.

    Four rooms rather than one, because a suite that is only a bigger box reads
    as a bigger box. The dividing screen is holed in the middle so the saloon and
    the bedroom are one sightline while still being two rooms.
    """
    centre = width / 2

    bathroom_pod(mats, place, f"{name}_bath", 2.60, 1.85, 1.30, tall=True)

    # Dressing room forward of the entry, walled off the same way.
    prop(mats, place, f"{name}_dress_side", (0.10, 2.35, width - 3.45),
         (2.65, (3.55 + width) / 2), 1.175, "bulkhead", 0.0)
    for index, (a, b) in enumerate(wall_segments(0.0, 2.70, [1.30], 0.80)):
        prop(mats, place, f"{name}_dress_face_{index}", (b - a, 2.35, 0.10), ((a + b) / 2, 3.50),
             1.175, "bulkhead", 0.0)
    prop(mats, place, f"{name}_dress_head", (0.80, 0.30, 0.10), (1.30, 3.50), 2.20,
         "bulkhead", 0.0)
    prop(mats, place, f"{name}_hanging_a", (0.60, 2.20, 1.73), (0.35, 4.47), 1.10, "wood", 0.02)
    prop(mats, place, f"{name}_hanging_b", (1.90, 2.20, 0.60), (1.60, width - 0.35),
         1.10, "wood", 0.02)
    prop(mats, place, f"{name}_island", (1.20, 0.85, 0.60), (1.60, 4.10), 0.425, "wood")

    cabin_door(mats, place, f"{name}_door", 2.70, -0.04, -0.11, 1.00, "pink")
    prop(mats, place, f"{name}_console", (1.00, 0.85, 0.35), (1.60, 2.13), 0.425, "wood")
    prop(mats, place, f"{name}_console_art", (0.90, 0.80, 0.04), (1.60, 1.93), 1.55,
         "neon_pink", 0.0)

    made_bed(mats, place, f"{name}_bed", 2.90, 2.10, centre, 2.20, linen)
    nightstand(mats, place, f"{name}_night_a", 3.20, 1.25)
    nightstand(mats, place, f"{name}_night_b", 3.20, width - 1.25)
    prop(mats, place, f"{name}_bench", (0.55, 0.45, 2.20), (5.28, centre), 0.225, "canvas")
    prop(mats, place, f"{name}_dresser", (2.00, 0.80, 0.50), (4.30, 0.28), 0.40, "wood")
    prop(mats, place, f"{name}_screen", (1.25, 0.70, 0.06), (4.30, 0.09), 1.45, "screen", 0.0)
    prop(mats, place, f"{name}_vanity", (1.30, 0.78, 0.50), (4.30, width - 0.25), 0.39, "wood")
    prop(mats, place, f"{name}_vanity_mirror", (1.10, 0.90, 0.05), (4.30, width - 0.03),
         1.45, "glass", 0.0)
    post(mats, place, f"{name}_stool", 0.22, 0.44, (4.30, width - 0.78), 0.22, "coral", 12)

    # The screen between bedroom and saloon: two piers and a wide centre opening.
    prop(mats, place, f"{name}_pier_a", (0.10, 2.80, 1.60), (6.05, 0.80), 1.40, "bulkhead", 0.0)
    prop(mats, place, f"{name}_pier_b", (0.10, 2.80, width - 3.80), (6.05, (3.80 + width) / 2),
         1.40, "bulkhead", 0.0)
    prop(mats, place, f"{name}_pier_head", (0.10, 0.40, 2.20), (6.05, 2.70), 2.60,
         "bulkhead", 0.0)

    prop(mats, place, f"{name}_sofa", (0.90, 0.42, 2.30), (6.65, 1.60), 0.21, "coral")
    prop(mats, place, f"{name}_sofa_back", (0.25, 0.45, 2.30), (6.28, 1.60), 0.65, "coral")
    prop(mats, place, f"{name}_coffee", (0.60, 0.40, 1.10), (7.60, 1.60), 0.20, "glass", 0.02)
    prop(mats, place, f"{name}_armchair", (0.75, 0.80, 0.75), (8.35, 1.60), 0.40, "canvas")
    post(mats, place, f"{name}_dine_top", 0.60, 0.06, (7.45, 4.20), 0.75, "wood", 16)
    post(mats, place, f"{name}_dine_stem", 0.15, 0.72, (7.45, 4.20), 0.36, "steel", 10)
    for index, (du, dv) in enumerate(((-0.90, 0.0), (0.90, 0.0), (0.0, -0.90), (0.0, 0.90))):
        prop(mats, place, f"{name}_dine_chair_{index}", (0.45, 0.85, 0.45),
             (7.45 + du, 4.20 + dv), 0.425, "wood", 0.02)
    prop(mats, place, f"{name}_sideboard", (0.45, 0.85, 0.95), (6.38, width - 0.48),
         0.425, "wood")
    prop(mats, place, f"{name}_cove", (0.10, 0.05, width - 1.20), (depth - 0.30, centre),
         2.72, "screen", 0.0)


def build_cabin_deck_seven(mats):
    """Deck 7 suites: one centre alleyway, four suites a side, wide balconies.

    Forward, where the hull is fining, the beam no longer supports two alleyways
    — so this deck does what a real ship does there and runs one down the middle
    with the big rooms outboard of it. Both stairs land on the centreline, one at
    each end, so both ends are lobbies.
    """
    kit.shell(
        mats,
        (30, 2.8, 29),
        [portal("stairwell-mid", 0, 0, -14.5), portal("stairwell-fwd", 0, 0, 14.5)],
        carpet="carpet",
        glaze={"port": (0.12, 2.58), "starboard": (0.12, 2.58)},
    )

    alley_x, screen_x = 1.70, 10.60
    band_aft, band_fwd = -11.0, 11.0
    pitch = 5.50
    count = 4
    frames = [band_aft + pitch * index for index in range(count + 1)]

    cube("suite_runner", (2.90, 0.03, band_fwd - band_aft), (0, 0.015, 0), mats["wood"], 0.0)

    for side, sign in (("port", -1), ("starboard", 1)):
        doors = [frames[index] + 0.06 + 2.70 for index in range(count)]
        long_wall(mats, f"suite_alley_{side}", sign * alley_x, (band_aft, band_fwd), 2.8,
                  doors, 1.00, 0.14)

        for index, z0 in enumerate(frames):
            cube(f"suite_frame_{side}_{index}", (screen_x - alley_x, 2.8, 0.12),
                 (sign * (alley_x + screen_x) / 2, 1.4, z0), mats["bulkhead"], 0.0)
            cube(f"suite_bal_divider_{side}_{index}", (4.26, 2.00, 0.10),
                 (sign * 12.80, 1.00, z0), mats["bulkhead"], 0.0)

        for index in range(count):
            z0 = frames[index]
            width = pitch - 0.12
            name = f"suite_{side}_{index}"
            outward = placer(sign, alley_x + 0.07)
            base = z0 + 0.06

            def local(u, v, base=base, outward=outward):
                x, _ = outward(u, 0.0)
                return (x, base + v)

            suite(mats, local, name, 8.76, width, "teal" if index % 2 else "coral")
            balcony_glass(mats, local, f"{name}_screen", 8.83, width, jamb=0.70)

            zc = base + width / 2
            cube(f"{name}_teak", (4.20, 0.04, width - 0.14), (sign * 12.80, 0.02, zc),
                 mats["wood"], 0.0)
            cube(f"{name}_rail", (0.06, 0.06, width - 0.14), (sign * 14.85, 1.05, zc),
                 mats["steel"], 0.0)
            cube(f"{name}_tub", (1.70, 0.70, 1.70), (sign * 13.90, 0.35, zc - 1.60),
                 mats["bulkhead"])
            cube(f"{name}_tub_water", (1.50, 0.06, 1.50), (sign * 13.90, 0.68, zc - 1.60),
                 mats["water"], 0.0)
            for seat, offset in enumerate((1.00, 1.90)):
                cube(f"{name}_lounger_{seat}", (1.95, 0.16, 0.72),
                     (sign * 12.40, 0.45, zc + offset), mats["canvas"], 0.04)
            cylinder(f"{name}_bal_table", 0.35, 0.06, (sign * 11.30, 0.72, zc - 1.60),
                     mats["glass"], 12)
            cylinder(f"{name}_bal_stem", 0.07, 0.70, (sign * 11.30, 0.35, zc - 1.60),
                     mats["steel"], 8)
            for seat, offset in enumerate((-2.35, -0.85)):
                cube(f"{name}_bal_chair_{seat}", (0.50, 0.75, 0.50),
                     (sign * 11.30, 0.375, zc + offset), mats["canvas"], 0.03)

        # A pair of deckhead panels per suite, one over the bedroom and one over
        # the saloon, clear of the screen wall's header at u 6.05.
        for index in range(count):
            zc = frames[index] + 0.06 + (pitch - 0.12) / 2
            for lamp, u in enumerate((3.60, 7.10)):
                cube(f"suite_light_{side}_{index}_{lamp}", (1.10, 0.05, 0.45),
                     (sign * (alley_x + 0.07 + u), 2.73, zc), mats["screen"], 0.0)

    for index, z in enumerate(grid(10, band_fwd - band_aft)):
        cube(f"suite_alley_light_{index}", (1.40, 0.06, 0.50), (0, 2.72, z), mats["screen"], 0.0)

    # Both ends are stair lobbies, so both get a landing room rather than a wall.
    for end, z_wall, z_room in (("fwd", band_fwd, 12.8), ("aft", band_aft, -12.8)):
        cross_wall(mats, f"suite_{end}_stop", z_wall, (-15.0, 15.0), 2.8, [0.0], 2.20, 0.14,
                   door_h=2.40)
        cube(f"suite_{end}_carpet", (11.0, 0.03, 3.20), (0, 0.015, z_room), mats["wood"], 0.0)
        for sign in (-1, 1):
            cube(f"suite_{end}_lift_{sign}", (0.15, 2.40, 3.20), (sign * 6.5, 1.20, z_room),
                 mats["bulkhead"], 0.0)
            cube(f"suite_{end}_lift_door_{sign}", (0.06, 2.15, 1.10),
                 (sign * 6.40, 1.075, z_room), mats["brass"], 0.0)
            cube(f"suite_{end}_bench_{sign}", (1.80, 0.45, 0.60), (sign * 3.4, 0.225, z_room),
                 mats["coral"])
            cube(f"suite_{end}_art_{sign}", (2.40, 1.30, 0.05), (sign * 3.4, 1.60,
                 z_room + (1.55 if end == "fwd" else -1.55)), mats["neon_pink"], 0.0)
        cube(f"suite_{end}_light", (7.0, 0.06, 0.50), (0, 2.72, z_room), mats["screen"], 0.0)


# ---------------------------------------------------------------------------
# Decks 5, 8, 9 — open decks
# ---------------------------------------------------------------------------


def steamer_chair(mats, name, sign, x_head, z, lean=0.55):
    """A folding steamer chair, head inboard and back raked out towards the sea.

    `o` runs outboard from the head end, so every part is placed against one
    number instead of a hand-copied pair per side. Five seat slats and not six:
    a sixth would start 0.019 inside the raked back panel.
    """
    def px(o):
        return x_head + sign * o

    for edge in (-1, 1):
        for tag, o in (("head", 0.22), ("foot", 1.62)):
            cube(f"{name}_leg_{tag}_{edge}", (0.06, 0.36, 0.06),
                 (px(o), 0.18, z + edge * 0.30), mats["wood"], 0.0)
        cube(f"{name}_rail_{edge}", (1.62, 0.07, 0.07),
             (px(0.92), 0.395, z + edge * 0.30), mats["wood"], 0.0)
        cube(f"{name}_arm_{edge}", (1.10, 0.06, 0.09),
             (px(0.75), 0.66, z + edge * 0.355), mats["wood"], 0.0)
        for tag, o in (("fore", 0.22), ("aft", 1.25)):
            cube(f"{name}_armpost_{edge}_{tag}", (0.06, 0.20, 0.06),
                 (px(o), 0.53, z + edge * 0.355), mats["wood"], 0.0)
    for slat in range(5):
        cube(f"{name}_slat_{slat}", (0.20, 0.05, 0.62),
             (px(0.36 + slat * 0.30), 0.455, z), mats["wood"], 0.0)
    # The back is raked about ship +Z, so its up axis is (sin a, cos a, 0) and
    # its bottom edge lands on the seat rail at o = 0.18.
    angle = -sign * lean
    height, thick = 0.92, 0.09
    cube(f"{name}_back", (thick, height, 0.62),
         (px(0.18) + math.sin(angle) * height / 2, 0.46 + math.cos(angle) * height / 2, z),
         mats["canvas"], 0.0, (0.0, angle, 0.0))


def bistro_set(mats, name, x, z):
    """A pedestal table with a chair either side of it, square to the walk."""
    cylinder(f"{name}_foot", 0.30, 0.04, (x, 0.02, z), mats["steel"], 12)
    cylinder(f"{name}_stem", 0.07, 0.68, (x, 0.38, z), mats["steel"], 10)
    cylinder(f"{name}_top", 0.44, 0.06, (x, 0.75, z), mats["trim"], 16)
    for edge in (-1, 1):
        seat_x = x + edge * 0.86
        cube(f"{name}_seat_{edge}", (0.46, 0.05, 0.46), (seat_x, 0.45, z), mats["canvas"], 0.02)
        for across in (-1, 1):
            for along in (-1, 1):
                cube(f"{name}_leg_{edge}_{across}_{along}", (0.04, 0.43, 0.04),
                     (seat_x + across * 0.19, 0.215, z + along * 0.19), mats["steel"], 0.0)
        cube(f"{name}_back_{edge}", (0.06, 0.46, 0.46),
             (seat_x + edge * 0.20, 0.68, z), mats["canvas"], 0.02)


def build_promenade(mats):
    """The teak walk that wraps the ship, outboard of the deckhouse.

    Not a room, and so not a `shell`. There is no outboard bulkhead — only a
    rail against the sea — and the three doors are in the deckhouse face
    inboard rather than at the ends, which is exactly the case `shell`'s
    portal-to-side classification gets wrong. It is authored by hand instead.

    The walk is laid station by station so its edge tapers with the hull, in
    three bands: a steel waterway against the deckhouse, the teak field, and a
    covering board at the deck edge. Everything else is set out against
    `beam(z)` rather than against a fixed inset, because forward of about
    z = 118 the walk narrows to under two metres and a fixed inset would put
    the furniture over the side.
    """
    doors = [-15.0, 43.0, 84.0]
    house_x = 5.5      # the ship-layout.ts door plane, and the wall's centre
    face_x = 5.60      # outboard face of the deckhouse plating
    canopy_x = 10.10   # outboard edge of the covered strip amidships
    # The pilasters stand 0.16 proud of `face_x`, so 5.76 is what anything
    # leaning on the deckhouse has to clear.
    stations, span = 52, 260.0
    step = span / stations

    def beam(z):
        return min(19.0, hull_half_beam(z))

    def station_z(index):
        return -span / 2 + step * (index + 0.5)

    # --- Deck: waterway, teak field, covering board -------------------------
    for index in range(stations):
        z = station_z(index)
        half = beam(z)
        field = half - 0.55 - (house_x + 0.30)
        for sign in (-1, 1):
            cube(f"walk_waterway_{index}_{sign}", (0.30, 0.12, step),
                 (sign * (house_x + 0.15), -0.06, z), mats["steel"], 0.0)
            cube(f"walk_board_{index}_{sign}", (0.55, 0.12, step),
                 (sign * (half - 0.275), -0.06, z), mats["trim"], 0.0)
            if field > 0.05:
                cube(f"walk_teak_{index}_{sign}", (field, 0.12, step),
                     (sign * (house_x + 0.30 + field / 2), -0.06, z), mats["wood"], 0.0)

    # --- The covered strip, replacing the old soffit ------------------------
    # The soffit it replaces spanned |x| < 5.5, which is inside the deckhouse:
    # it roofed nothing anybody could walk under. This one starts at the house
    # face and stops short of the rail, and it only exists where the walk is
    # wide enough to be worth covering.
    for index in range(stations):
        z = station_z(index)
        cap = min(canopy_x, beam(z) - 1.6)
        width = cap - 0.20 - face_x
        if width < 1.2:
            continue
        for sign in (-1, 1):
            cube(f"canopy_{index}_{sign}", (width, 0.16, step),
                 (sign * (face_x + width / 2), 3.28, z), mats["bulkhead"], 0.0)
            cube(f"canopy_fascia_{index}_{sign}", (0.20, 0.50, step),
                 (sign * (cap - 0.10), 3.11, z), mats["trim"], 0.0)
            if index % 4 == 0:
                at = sign * (cap - 0.35)
                cylinder(f"canopy_column_{index}_{sign}", 0.11, 3.20, (at, 1.60, z),
                         mats["steel"], 12)
                cylinder(f"canopy_base_{index}_{sign}", 0.17, 0.12, (at, 0.06, z),
                         mats["trim"], 12)
                # 0.15 is exactly the reach from the column to the fascia's
                # inboard face, so the capital meets it instead of crossing it.
                cylinder(f"canopy_capital_{index}_{sign}", 0.15, 0.14, (at, 3.13, z),
                         mats["trim"], 12)
                cube(f"canopy_light_{index}_{sign}", (0.30, 0.06, 0.30),
                     (sign * (face_x + width * 0.55), 3.17, z), mats["neon_amber"], 0.0)

    # --- Deckhouse face: sill, glazing, head, pilasters, kick and strake ----
    for sign in (-1, 1):
        cuts = doors if sign < 0 else []
        door_edges = [centre + edge * 0.8 for centre in cuts for edge in (-1, 1)]
        for part, (start, end) in enumerate(wall_segments(-span / 2, span / 2, cuts)):
            cube(f"house_sill_{sign}_{part}", (0.20, 1.00, end - start),
                 (sign * house_x, 0.50, (start + end) / 2), mats["bulkhead"], 0.0)
            cube(f"house_head_{sign}_{part}", (0.20, 0.80, end - start),
                 (sign * house_x, 2.80, (start + end) / 2), mats["bulkhead"], 0.0)
            bays = max(1, int(round((end - start) / 6.0)))
            for bay in range(bays):
                low = start + (end - start) * bay / bays
                high = start + (end - start) * (bay + 1) / bays
                window_band(mats, f"house_win_{sign}_{part}_{bay}",
                            (low + 0.22, high - 0.22), 0.0, 1.0, 2.4, sign * house_x, True)
                cube(f"house_kick_{sign}_{part}_{bay}", (0.12, 0.30, high - low - 0.36),
                     (sign * 5.66, 0.15, (low + high) / 2), mats["trim"], 0.0)
                cube(f"house_strake_{sign}_{part}_{bay}", (0.10, 0.14, high - low - 0.36),
                     (sign * 5.65, 0.91, (low + high) / 2), mats["brass"], 0.0)
            for bay in range(bays + 1):
                at = start + (end - start) * bay / bays
                # At a doorway the jamb is the pilaster, so no second one here.
                if any(abs(at - edge) < 0.30 for edge in door_edges):
                    continue
                cube(f"house_pier_{sign}_{part}_{bay}", (0.16, 3.20, 0.36),
                     (sign * 5.68, 1.60, at), mats["bulkhead"], 0.0)

    # --- The three doorways, all in the port face ---------------------------
    for index, centre in enumerate(doors):
        for edge in (-1, 1):
            cube(f"door_jamb_{index}_{edge}", (0.34, 2.34, 0.26),
                 (-5.77, 1.17, centre + edge * 0.93), mats["trim"], 0.0)
        cube(f"door_head_{index}", (0.34, 0.36, 2.12), (-5.77, 2.52, centre), mats["trim"], 0.0)
        cube(f"door_sign_{index}", (0.08, 0.44, 1.70), (-5.98, 2.92, centre),
             mats["neon_pink"], 0.0)
        cube(f"door_mat_{index}", (2.40, 0.02, 1.80), (-7.14, 0.015, centre), mats["carpet"], 0.0)
        for edge in (-1, 1):
            at = centre + edge * 2.70
            cube(f"door_screen_{index}_{edge}", (3.24, 2.10, 0.08), (-7.38, 1.05, at),
                 mats["glass"], 0.0)
            cube(f"door_screen_cap_{index}_{edge}", (3.24, 0.10, 0.14), (-7.38, 2.15, at),
                 mats["trim"], 0.0)
            cube(f"door_screen_post_{index}_{edge}", (0.12, 2.20, 0.12), (-9.06, 1.10, at),
                 mats["steel"], 0.0)

    # --- The rail, authored by hand ----------------------------------------
    # `kit.railing` draws a post at every point it is given, so a 52-point
    # polyline would stack two posts at each interior vertex. Here the bars are
    # drawn per segment and the posts once per point.
    rail_z = [-span / 2 + 0.30] + [station_z(index) for index in range(stations)] \
        + [span / 2 - 0.30]
    bars = (("top", 1.12, 0.06), ("mid", 0.74, 0.04), ("low", 0.36, 0.04))
    for sign in (-1, 1):
        points = [(sign * (beam(z) - 0.30), z) for z in rail_z]
        for index in range(len(points) - 1):
            (x0, z0), (x1, z1) = points[index], points[index + 1]
            run = math.hypot(x1 - x0, z1 - z0)
            yaw = yaw_towards(x1 - x0, z1 - z0)
            for tag, level, thick in bars:
                cube(f"prom_rail_{sign}_{index}_{tag}", (run, thick, thick),
                     ((x0 + x1) / 2, level, (z0 + z1) / 2), mats["steel"], 0.0, (0.0, 0.0, yaw))
        for index, (at, z) in enumerate(points):
            cube(f"prom_post_{sign}_{index}", (0.07, 1.145, 0.07), (at, 0.5725, z),
                 mats["steel"], 0.0)
        # End cross rails, inset 0.30 so they do not repeat the corner post.
        for end in (-1, 1):
            z_end = end * (span / 2 - 0.30)
            x_out, x_in = sign * (beam(z_end) - 0.60), sign * 5.90
            run = abs(x_out - x_in)
            for tag, level, thick in bars:
                cube(f"prom_cross_{sign}_{end}_{tag}", (run, thick, thick),
                     ((x_in + x_out) / 2, level, z_end), mats["steel"], 0.0)
            for tag, at in (("in", x_in), ("out", x_out)):
                cube(f"prom_cross_post_{sign}_{end}_{tag}", (0.07, 1.145, 0.07),
                     (at, 0.5725, z_end), mats["steel"], 0.0)

    # --- Jogging lane, only where the walk is wide enough to carry one ------
    for index in range(stations):
        z = station_z(index)
        half = beam(z)
        if half < 13.0:
            continue
        for sign in (-1, 1):
            lane = sign * (half - 2.60)
            cube(f"jog_lane_{index}_{sign}", (1.40, 0.02, step), (lane, 0.02, z),
                 mats["teal"], 0.0)
            for edge in (-1, 1):
                # 0.77 with a 0.14 stripe puts the stripe edge on the lane edge
                # rather than over it: two same-facing inlays must never overlap.
                cube(f"jog_edge_{index}_{sign}_{edge}", (0.14, 0.02, step),
                     (lane + edge * 0.77, 0.02, z), mats["neon_cyan"], 0.0)

    # --- Lifebuoy stations and deck lights ---------------------------------
    for index in range(-6, 7):
        z = index * 18.0
        half = beam(z)
        for sign in (-1, 1):
            cube(f"buoy_plate_{index}_{sign}", (0.06, 0.90, 0.90),
                 (sign * (half - 0.50), 1.10, z), mats["bulkhead"], 0.0)
            cube(f"buoy_post_{index}_{sign}", (0.06, 1.55, 0.14),
                 (sign * (half - 0.44), 0.775, z), mats["steel"], 0.0)
            # Depth 0.12 centred 0.09 outboard of the plate face: the buoy
            # touches its board instead of hanging in front of it.
            cylinder(f"buoy_{index}_{sign}", 0.38, 0.12, (sign * (half - 0.59), 1.10, z),
                     mats["orange"], 16, (0.0, math.pi / 2, 0.0))
    for index in range(-12, 13):
        z = index * 10.0
        half = beam(z)
        for sign in (-1, 1):
            at = sign * (half - 0.95)
            cube(f"deck_light_base_{index}_{sign}", (0.24, 0.10, 0.24), (at, 0.05, z),
                 mats["steel"], 0.0)
            cube(f"deck_light_stem_{index}_{sign}", (0.16, 0.85, 0.16), (at, 0.525, z),
                 mats["steel"], 0.0)
            cube(f"deck_light_head_{index}_{sign}", (0.24, 0.18, 0.24), (at, 1.04, z),
                 mats["neon_amber"], 0.0)

    # --- Aft terrace: benches against the house, planters between them ------
    # x 6.11 and not 5.91: the bench back has to clear the pilasters, which
    # stand 0.16 proud of the deckhouse face.
    for index, z in enumerate([-126.0, -121.0, -116.0, -111.0]):
        for sign in (-1, 1):
            bench(mats, f"terrace_bench_{index}_{sign}", sign * 6.11, z, 0.0, 2.60,
                  "z", "wood", -sign)
    for index, z in enumerate([-123.5, -118.5, -113.5, -108.5]):
        for sign in (-1, 1):
            planter(mats, f"terrace_planter_{index}_{sign}", sign * 7.50, z, 0.0, 0.52, 0.80)

    # --- Steamer chairs in pairs, head inboard, table between them ----------
    def zone_free(z):
        if -6.0 <= z <= 30.0:      # the cafe terrace owns this stretch
            return False
        return all(abs(z - centre) >= 5.5 for centre in doors)

    group, z = 0, -80.0
    while z <= 78.0:
        if zone_free(z) and beam(z) >= 18.0:
            for sign in (-1, 1):
                x_head = sign * (beam(z) - 7.6)
                for edge in (-1, 1):
                    steamer_chair(mats, f"steamer_{group}_{sign}_{edge}", sign, x_head,
                                  z + edge * 0.85)
                table_x = x_head + sign * 0.75
                cylinder(f"steamer_table_{group}_{sign}_foot", 0.24, 0.04,
                         (table_x, 0.02, z), mats["steel"], 12)
                cylinder(f"steamer_table_{group}_{sign}_stem", 0.07, 0.48,
                         (table_x, 0.28, z), mats["steel"], 10)
                cylinder(f"steamer_table_{group}_{sign}_top", 0.30, 0.05,
                         (table_x, 0.545, z), mats["trim"], 12)
            group += 1
        z += 8.0

    # --- Cafe terrace under the canopy, with a drinks kiosk each side -------
    for index, z in enumerate([-4.5, -0.5, 3.5, 12.0, 16.0, 20.0, 24.0, 28.0]):
        for sign in (-1, 1):
            bistro_set(mats, f"cafe_set_{index}_{sign}", sign * 7.05, z)
    for index, z in enumerate([-2.0, 14.0, 22.0, 30.0]):
        for sign in (-1, 1):
            planter(mats, f"cafe_planter_{index}_{sign}", sign * 8.90, z, 0.0, 0.46, 0.75)
    for sign in (-1, 1):
        cube(f"kiosk_back_{sign}", (0.12, 2.90, 3.60), (sign * 5.82, 1.45, 8.0),
             mats["bulkhead"], 0.0)
        cube(f"kiosk_body_{sign}", (0.60, 1.06, 3.60), (sign * 6.18, 0.53, 8.0),
             mats["trim"], 0.0)
        cube(f"kiosk_counter_{sign}", (0.70, 0.10, 3.60), (sign * 6.23, 1.11, 8.0),
             mats["wood"], 0.02)
        cube(f"kiosk_sign_{sign}", (0.06, 0.50, 2.40), (sign * 5.91, 2.45, 8.0),
             mats["neon_cyan"], 0.0)
        for shelf, level in enumerate((1.40, 1.85)):
            cube(f"kiosk_shelf_{sign}_{shelf}", (0.24, 0.06, 3.20),
                 (sign * 5.98, level, 8.0), mats["steel"], 0.0)
        for stool in range(4):
            z_stool = 6.65 + stool * 0.90
            cylinder(f"kiosk_stool_foot_{sign}_{stool}", 0.22, 0.04,
                     (sign * 6.95, 0.02, z_stool), mats["steel"], 12)
            cylinder(f"kiosk_stool_stem_{sign}_{stool}", 0.06, 0.68,
                     (sign * 6.95, 0.38, z_stool), mats["steel"], 10)
            cylinder(f"kiosk_stool_seat_{sign}_{stool}", 0.20, 0.08,
                     (sign * 6.95, 0.76, z_stool), mats["canvas"], 12)

    # --- Observation zone forward, then the barrier and the bare tip -------
    for index, z in enumerate([92.0, 100.0, 108.0]):
        half = beam(z)
        for sign in (-1, 1):
            at = sign * (half - 1.30)
            cylinder(f"scope_base_{index}_{sign}", 0.22, 0.08, (at, 0.04, z), mats["steel"], 12)
            cylinder(f"scope_column_{index}_{sign}", 0.09, 1.06, (at, 0.61, z),
                     mats["steel"], 10)
            cylinder(f"scope_head_{index}_{sign}", 0.13, 0.16, (at, 1.22, z), mats["brass"], 10)
            cylinder(f"scope_tube_{index}_{sign}", 0.08, 0.62, (at + sign * 0.22, 1.30, z),
                     mats["brass"], 10, (0.0, math.pi / 2, 0.0))
    for index, z in enumerate([96.0, 104.0]):
        half = beam(z)
        for sign in (-1, 1):
            bench(mats, f"observation_bench_{index}_{sign}", sign * (half - 4.60), z, 0.0,
                  2.20, "z", "wood", -sign)
    for index, z in enumerate([90.0, 106.0]):
        for sign in (-1, 1):
            at = sign * 8.60
            cube(f"chart_post_{index}_{sign}", (0.14, 0.95, 0.14), (at, 0.475, z),
                 mats["steel"], 0.0)
            angle = -sign * 0.90
            cube(f"chart_panel_{index}_{sign}", (0.06, 0.70, 0.90),
                 (at + math.sin(angle) * 0.35, 0.95 + math.cos(angle) * 0.35, z),
                 mats["screen"], 0.0, (0.0, angle, 0.0))
    for sign in (-1, 1):
        x_in, x_out = sign * 5.90, sign * (beam(118.0) - 0.45)
        for tag, at in (("in", x_in), ("out", x_out)):
            cylinder(f"barrier_post_{sign}_{tag}", 0.06, 1.00, (at, 0.50, 118.0),
                     mats["steel"], 10)
            cylinder(f"barrier_cap_{sign}_{tag}", 0.08, 0.06, (at, 1.03, 118.0),
                     mats["brass"], 10)
        for tag, level in (("upper", 0.86), ("lower", 0.52)):
            cube(f"barrier_chain_{sign}_{tag}", (abs(x_out - x_in), 0.05, 0.05),
                 ((x_in + x_out) / 2, level, 118.0), mats["brass"], 0.0)
        cube(f"barrier_sign_{sign}", (0.70, 0.34, 0.05),
             ((x_in + x_out) / 2, 0.665, 118.0), mats["coral"], 0.0)


def build_pool_deck(mats):
    """The lido: a recessed pool amidships, the bar under its canopy, the funnel
    casings, and a waterslide that starts on a tower and ends in water.

    The plating is laid as four plates around a hole rather than one plate with
    a blue box standing on it, because a pool you can see the bottom of is the
    difference between a lido and a car park with a rug. Everything else is set
    back off the two teak lanes at x +/-11.5 that run the full length, so a
    guest can walk from the after rail to the bar without stepping over a
    lounger.

    The basin reaches 1.3 m below the plating. On paper that volume belongs to
    deck 7, but deck 7 closes its own deckhead over it and the two compartments
    are never resident at the same time.
    """
    HALF_X, AFT_Z, FWD_Z = 17.0, -59.5, 59.5
    POOL_HALF, POOL_A, POOL_F, POOL_DEEP = 6.0, 16.0, 32.0, 1.30
    LANE_X, LOUNGE_X = 11.5, 13.9

    def side_table(name, x, z):
        cube(f"{name}_top", (0.62, 0.06, 0.62), (x, 0.49, z), mats["trim"], 0.02)
        for tag, sx in (("p", -1), ("s", 1)):
            for end, sz in (("a", -1), ("f", 1)):
                cube(f"{name}_leg_{tag}{end}", (0.05, 0.46, 0.05),
                     (x + sx * 0.25, 0.23, z + sz * 0.25), mats["steel"], 0.0)

    def lounger(name, sign, x_head, z, lean=0.55):
        """A steamer lounger lying athwartships: head inboard, feet at the rail.

        The backrest is a raked panel rather than a slab stood on end, so it
        leans over the head end instead of hovering behind it. Its foot is at
        px(0.16) and the first seat slat starts at px(0.39), which is the
        clearance that keeps the two out of each other.
        """
        def px(offset):
            return x_head + sign * offset

        for tag, dz in (("a", -0.30), ("b", 0.30)):
            for leg, o in (("h", 0.30), ("f", 1.70)):
                cube(f"{name}_leg_{leg}{tag}", (0.06, 0.36, 0.06), (px(o), 0.18, z + dz),
                     mats["steel"], 0.0)
            cube(f"{name}_rail_{tag}", (1.62, 0.07, 0.07), (px(1.00), 0.395, z + dz),
                 mats["steel"], 0.0)
        for index in range(5):
            cube(f"{name}_slat_{index}", (0.22, 0.05, 0.66),
                 (px(0.50 + index * 0.30), 0.455, z), mats["canvas"], 0.0)
        angle = -sign * lean  # about ship +Z: tilts the panel's top inboard
        cube(f"{name}_back", (0.09, 0.92, 0.66),
             (px(0.16) + math.sin(angle) * 0.46, 0.46 + math.cos(angle) * 0.46, z),
             mats["canvas"], 0.0, (0.0, angle, 0.0))

    def bistro(name, x, z):
        """A pedestal table and four chairs, square to the ship."""
        cylinder(f"{name}_foot", 0.35, 0.05, (x, 0.025, z), mats["steel"], 12)
        cylinder(f"{name}_stem", 0.10, 0.65, (x, 0.375, z), mats["steel"], 10)
        cylinder(f"{name}_top", 0.62, 0.06, (x, 0.73, z), mats["glass"], 16)
        for tag, dx, dz in (("p", -1, 0), ("s", 1, 0), ("a", 0, -1), ("f", 0, 1)):
            cx, cz = x + dx * 0.95, z + dz * 0.95
            cube(f"{name}_seat_{tag}", (0.48, 0.06, 0.48), (cx, 0.45, cz), mats["orange"], 0.02)
            for ex in (-1, 1):
                for ez in (-1, 1):
                    cube(f"{name}_leg_{tag}_{ex}_{ez}", (0.04, 0.42, 0.04),
                         (cx + ex * 0.19, 0.21, cz + ez * 0.19), mats["steel"], 0.0)
            back = (0.06, 0.46, 0.44) if dx else (0.44, 0.46, 0.06)
            cube(f"{name}_back_{tag}", back, (cx + dx * 0.21, 0.71, cz + dz * 0.21),
                 mats["orange"], 0.02)

    # ---- plating and rails ------------------------------------------------
    slab(mats, "lido_plate_aft", (-HALF_X, HALF_X), (AFT_Z, POOL_A), 0.0, "deck")
    slab(mats, "lido_plate_fwd", (-HALF_X, HALF_X), (POOL_F, FWD_Z), 0.0, "deck")
    slab(mats, "lido_plate_port", (-HALF_X, -POOL_HALF), (POOL_A, POOL_F), 0.0, "deck")
    slab(mats, "lido_plate_stbd", (POOL_HALF, HALF_X), (POOL_A, POOL_F), 0.0, "deck")
    for sign in (-1, 1):
        railing(mats, f"lido_rail_{sign}", [(sign * 16.8, -59.0), (sign * 16.8, 59.0)], 0.0)
    # The cross rails are inset 0.3: end-to-end with the side rails they would
    # each draw a post on the same spot and the corner would render twice.
    railing(mats, "lido_rail_aft", [(-16.5, -58.7), (16.5, -58.7)], 0.0)
    railing(mats, "lido_rail_fwd", [(-16.5, 58.7), (16.5, 58.7)], 0.0)

    # ---- circulation, painted before anything is allowed to stand on it ----
    for sign in (-1, 1):
        cube(f"lido_lane_{sign}", (2.0, 0.02, 112.0), (sign * LANE_X, 0.01, 0.0),
             mats["wood"], 0.0)
    for name, z in (("aft", -12.5), ("mid", 13.5), ("fwd", 47.5)):
        cube(f"lido_cross_{name}", (21.0, 0.02, 2.0), (0.0, 0.01, z), mats["wood"], 0.0)

    # ---- the pool: a real basin, walls, steps, coping ----------------------
    slab(mats, "pool_floor", (-POOL_HALF, POOL_HALF), (POOL_A, POOL_F), -POOL_DEEP,
         "bulkhead", 0.16)
    for tag, sign in (("port", -1), ("stbd", 1)):
        cube(f"pool_wall_{tag}", (0.14, POOL_DEEP, POOL_F - POOL_A - 0.28),
             (sign * (POOL_HALF - 0.07), -POOL_DEEP / 2, (POOL_A + POOL_F) / 2),
             mats["bulkhead"], 0.0)
    for tag, z in (("aft", POOL_A + 0.07), ("fwd", POOL_F - 0.07)):
        cube(f"pool_wall_{tag}", (POOL_HALF * 2, POOL_DEEP, 0.14),
             (0.0, -POOL_DEEP / 2, z), mats["bulkhead"], 0.0)
    cube("pool_water", (POOL_HALF * 2 - 0.28, 0.05, POOL_F - POOL_A - 0.28),
         (0.0, -0.145, (POOL_A + POOL_F) / 2), mats["water"], 0.0)
    for index in range(4):
        top = -0.26 * (index + 1)
        cube(f"pool_step_{index}", (4.8, POOL_DEEP + top, 0.45),
             (0.0, (-POOL_DEEP + top) / 2, POOL_A + 0.365 + 0.45 * index),
             mats["bulkhead"], 0.0)
    for tag, sign in (("p", -1), ("s", 1)):
        # An arch: up out of the water on the steps, over the coping, down to it.
        cylinder(f"pool_grab_{tag}_fwd", 0.035, 1.62, (sign * 2.6, 0.29, 16.70),
                 mats["brass"], 8)
        cylinder(f"pool_grab_{tag}_head", 0.035, 1.00, (sign * 2.6, 1.10, 16.20),
                 mats["brass"], 8, (math.pi / 2, 0.0, 0.0))
        cylinder(f"pool_grab_{tag}_aft", 0.035, 1.00, (sign * 2.6, 0.60, 15.70),
                 mats["brass"], 8)
    for index in range(5):
        cube(f"pool_lane_mark_{index}", (0.16, 0.02, 12.0),
             (-4.0 + index * 2.0, -POOL_DEEP + 0.01, 25.5), mats["neon_cyan"], 0.0)
    for index, offset in enumerate(grid(4, 13.0)):
        for tag, sign in (("p", -1), ("s", 1)):
            cube(f"pool_lamp_{index}_{tag}", (0.06, 0.24, 0.44),
                 (sign * (POOL_HALF - 0.17), -0.55, 24.0 + offset), mats["neon_cyan"], 0.0)
    cope = 0.45
    for tag, sign in (("port", -1), ("stbd", 1)):
        cube(f"pool_cope_{tag}", (cope, 0.10, POOL_F - POOL_A + cope * 2),
             (sign * (POOL_HALF + cope / 2), 0.05, (POOL_A + POOL_F) / 2),
             mats["bulkhead"], 0.0)
    for tag, z in (("aft", POOL_A - cope / 2), ("fwd", POOL_F + cope / 2)):
        cube(f"pool_cope_{tag}", (POOL_HALF * 2, 0.10, cope), (0.0, 0.05, z),
             mats["bulkhead"], 0.0)
    for index, offset in enumerate(grid(8, 15.0)):
        for tag, sign in (("p", -1), ("s", 1)):
            cube(f"pool_cope_mark_{index}_{tag}", (0.12, 0.02, 0.60),
                 (sign * (POOL_HALF + 0.23), 0.11, 24.0 + offset), mats["neon_amber"], 0.0)

    # Lifeguard chair and its safety kit, on the port side of the basin.
    cube("guard_chair_mast", (0.60, 1.90, 0.60), (-7.60, 0.95, 24.0), mats["steel"], 0.03)
    cube("guard_chair_seat", (0.90, 0.10, 0.86), (-7.60, 1.95, 24.0), mats["orange"], 0.02)
    cube("guard_chair_back", (0.14, 0.72, 0.86), (-8.03, 2.36, 24.0), mats["orange"], 0.02)
    for tag, sz in (("a", -1), ("f", 1)):
        cube(f"guard_chair_arm_{tag}", (0.86, 0.08, 0.10),
             (-7.60, 2.28, 24.0 + sz * 0.42), mats["steel"], 0.0)
    ladder(mats, "guard_chair_ladder", -7.60, 24.62, 0.0, 1.90, 1, 0.52)
    cube("guard_post", (0.10, 1.30, 0.10), (-7.10, 0.65, 20.0), mats["steel"], 0.0)
    cylinder("guard_ring", 0.38, 0.10, (-7.10, 1.30, 20.0), mats["orange"], 12,
             (0.0, math.pi / 2, 0.0))
    cube("guard_pole", (0.06, 0.06, 3.00), (-7.10, 1.20, 28.0), mats["trim"], 0.0)
    cube("guard_notice", (0.06, 0.90, 0.70), (-7.10, 1.60, 20.9), mats["bulkhead"], 0.0)

    # ---- whirlpools on raised octagonal platforms -------------------------
    for tag, sign in (("port", -1), ("stbd", 1)):
        cx, cz = sign * 6.8, 8.0
        cylinder(f"whirl_{tag}_base", 3.12, 0.12, (cx, 0.06, cz), mats["trim"], 8)
        cylinder(f"whirl_{tag}_platform", 3.00, 0.33, (cx, 0.285, cz), mats["deck"], 8)
        cylinder(f"whirl_{tag}_liner", 1.95, 0.04, (cx, 0.47, cz), mats["teal"], 16)
        side = 2 * 2.10 * math.tan(math.pi / 8)
        seat = 2 * 1.80 * math.tan(math.pi / 8)
        for k in range(8):
            angle = k * math.pi / 4
            dx, dz = math.cos(angle), math.sin(angle)
            yaw = yaw_towards(-dz, dx)
            cube(f"whirl_{tag}_coam_{k}", (0.22, 0.62, side),
                 (cx + dx * 2.10, 0.76, cz + dz * 2.10), mats["bulkhead"], 0.02,
                 (0.0, 0.0, yaw))
            cube(f"whirl_{tag}_cap_{k}", (0.34, 0.06, side),
                 (cx + dx * 2.10, 1.10, cz + dz * 2.10), mats["brass"], 0.0, (0.0, 0.0, yaw))
            cube(f"whirl_{tag}_seat_{k}", (0.38, 0.34, seat),
                 (cx + dx * 1.80, 0.66, cz + dz * 1.80), mats["bulkhead"], 0.02,
                 (0.0, 0.0, yaw))
        cylinder(f"whirl_{tag}_water", 1.95, 0.04, (cx, 0.94, cz), mats["water"], 16)
        for index in range(2):
            top = 0.15 * (index + 1)
            cube(f"whirl_{tag}_step_{index}", (0.55, top, 2.40),
                 (cx - sign * (3.395 + (1 - index) * 0.55), top / 2, cz), mats["deck"], 0.0)
        for end, sz in (("a", -1), ("f", 1)):
            cube(f"whirl_{tag}_grab_{end}", (0.07, 1.05, 0.07),
                 (cx - sign * 3.40, 0.525, cz + sz * 1.35), mats["brass"], 0.0)
        cube(f"whirl_{tag}_plate", (0.90, 0.06, 0.36),
             (cx - sign * 3.94, 0.32, cz + 1.35), mats["neon_amber"], 0.0)

    # ---- the two tower deckhouses -----------------------------------------
    # Door centres are the portals in ship-layout.ts: (5.5, 0, -4.5) and
    # (5.5, 0, 53.5). The forward house is 9 m fore-and-aft, not 12, so that it
    # clears the forward cross rail at z 59 instead of standing on it.
    for name, z, depth in (("aft", -4.5, 12.0), ("fwd", 53.5, 9.0)):
        cube(f"house_{name}", (11.0, 3.40, depth), (0, 1.70, z), mats["bulkhead"], 0.04)
        cube(f"house_{name}_plinth", (11.40, 0.18, depth + 0.40), (0, 0.09, z),
             mats["trim"], 0.0)
        cube(f"house_{name}_roof", (12.00, 0.20, depth + 1.0), (0, 3.50, z), mats["trim"], 0.0)
        cube(f"house_{name}_coam", (11.40, 0.34, depth + 0.40), (0, 3.77, z),
             mats["bulkhead"], 0.02)
        for tag, sx in (("p", -1), ("s", 1)):
            for end, sz in (("a", -1), ("f", 1)):
                cube(f"house_{name}_pilaster_{tag}{end}", (0.24, 3.40, 0.24),
                     (sx * 5.62, 1.70, z + sz * (depth / 2 - 0.12)), mats["trim"], 0.0)
        # The door, mounted proud of the starboard face at x 5.5.
        for end, sz in (("a", -1), ("f", 1)):
            cube(f"house_{name}_jamb_{end}", (0.10, 2.34, 0.26),
                 (5.55, 1.17, z + sz * 0.93), mats["trim"], 0.0)
        cube(f"house_{name}_head", (0.10, 0.24, 2.12), (5.55, 2.46, z), mats["trim"], 0.0)
        cube(f"house_{name}_leaf", (0.06, 2.10, 1.60), (5.53, 1.05, z), mats["glass"], 0.0)
        cube(f"house_{name}_sill", (0.30, 0.03, 1.92), (5.60, 0.015, z), mats["brass"], 0.0)
        cube(f"house_{name}_exit", (0.08, 0.34, 1.30), (5.58, 2.86, z), mats["neon_cyan"], 0.0)
        # Glazing everywhere else, so the house is not a blank white block.
        for tag, sx in (("p", -1), ("s", 1)):
            cuts = [z] if sx > 0 else []
            for part, (start, end) in enumerate(
                    wall_segments(z - depth / 2 + 0.4, z + depth / 2 - 0.4, cuts, 2.6)):
                if end - start < 1.2:
                    continue
                window_band(mats, f"house_{name}_win_{tag}_{part}",
                            (start + 0.10, end - 0.10), 0.0, 1.05, 2.55, sx * 5.5, True)
        for end, sz in (("a", -1), ("f", 1)):
            window_band(mats, f"house_{name}_win_{end}", (-4.2, 4.2), 0.0, 1.05, 2.55,
                        z + sz * (depth / 2), False)
        cube(f"house_{name}_name", (3.60, 0.52, 0.08), (0, 2.90, z - depth / 2 - 0.09),
             mats["neon_cyan"], 0.0)
        for index, offset in enumerate(grid(4, depth - 2.0)):
            for tag, sx in (("p", -1), ("s", 1)):
                cube(f"house_{name}_lamp_{index}_{tag}", (0.16, 0.26, 0.26),
                     (sx * 5.62, 3.04, z + offset), mats["neon_amber"], 0.0)

    # ---- the deck cinema: screen on pylons over the after deckhouse --------
    for tag, sx in (("p", -1), ("s", 1)):
        cube(f"cine_pylon_{tag}", (0.32, 7.00, 0.32), (sx * 5.0, 3.50, 2.35),
             mats["steel"], 0.02)
        cube(f"cine_foot_{tag}", (0.60, 0.16, 0.60), (sx * 5.0, 0.08, 2.35), mats["trim"], 0.0)
        stay = math.hypot(2.15, 2.80)
        cube(f"cine_stay_{tag}", (0.14, 0.14, stay), (sx * 5.0, 5.00, 1.275),
             mats["steel"], 0.0, (math.atan2(-2.80, 2.15), 0.0, 0.0))
        cube(f"cine_speaker_{tag}", (0.44, 0.70, 0.34), (sx * 5.0, 5.90, 2.05),
             mats["trim"], 0.02)
    cube("cine_frame", (10.00, 4.90, 0.24), (0, 4.65, 2.35), mats["trim"], 0.0)
    cube("cine_screen", (8.80, 4.40, 0.10), (0, 4.65, 2.18), mats["screen"], 0.0)
    cube("cine_hood", (10.00, 0.16, 0.90), (0, 7.18, 1.95), mats["trim"], 0.0)
    cube("cine_title", (5.40, 0.44, 0.08), (0, 2.00, 2.19), mats["neon_pink"], 0.0)

    # ---- funnel casings ----------------------------------------------------
    for index, z in enumerate((-30.0, -18.0)):
        cube(f"funnel_{index}_plinth", (7.60, 0.30, 8.60), (0, 0.15, z), mats["trim"], 0.0)
        cube(f"funnel_{index}_casing", (7.00, 5.70, 8.00), (0, 3.15, z), mats["hull"], 0.06)
        for tag, sx, sz, w, d in (("p", -3.56, 0.0, 0.12, 8.12), ("s", 3.56, 0.0, 0.12, 8.12),
                                  ("a", 0.0, -4.06, 7.00, 0.12),
                                  ("f", 0.0, 4.06, 7.00, 0.12)):
            cube(f"funnel_{index}_band_{tag}", (w, 0.70, d), (sx, 4.60, z + sz),
                 mats["coral"], 0.0)
        for tag, sx in (("p", -1), ("s", 1)):
            for end, sz in (("a", -1), ("f", 1)):
                cube(f"funnel_{index}_strake_{tag}{end}", (0.14, 5.70, 0.14),
                     (sx * 3.57, 3.15, z + sz * 4.07), mats["trim"], 0.0)
        for offset in (-2.0, 0.0, 2.0):
            for tag, sx in (("p", -1), ("s", 1)):
                cube(f"funnel_{index}_rib_{tag}_{offset}", (0.10, 5.30, 0.10),
                     (sx * 3.55, 3.15, z + offset), mats["trim"], 0.0)
        for vent in range(4):
            cylinder(f"funnel_{index}_uptake_{vent}", 0.42, 1.80,
                     (-2.4 + vent * 1.6, 6.90, z), mats["steel"], 12)
            cylinder(f"funnel_{index}_cowl_{vent}", 0.50, 0.12,
                     (-2.4 + vent * 1.6, 7.86, z), mats["trim"], 12)
        cube(f"funnel_{index}_light", (0.24, 0.30, 0.24), (0, 8.07, z), mats["neon_amber"], 0.0)
        # Machinery door and the cage ladder that reaches the casing top.
        cube(f"funnel_{index}_door", (1.70, 2.10, 0.08), (0, 1.35, z - 4.04),
             mats["steel"], 0.0)
        cube(f"funnel_{index}_door_head", (1.94, 0.20, 0.14), (0, 2.50, z - 4.07),
             mats["trim"], 0.0)
        cube(f"funnel_{index}_placard", (0.80, 0.32, 0.06), (0, 2.86, z - 4.03),
             mats["neon_amber"], 0.0)
        ladder(mats, f"funnel_{index}_ladder", 2.60, z - 4.20, 0.30, 6.00, -1)
    cylinder("funnel_whistle", 0.34, 1.30, (-2.60, 6.60, -26.60), mats["brass"], 10,
             (math.pi / 2, 0.0, 0.0))
    cube("funnel_whistle_bracket", (0.20, 0.60, 0.20), (-2.60, 6.30, -26.10),
         mats["trim"], 0.0)

    # ---- the waterslide: tower, flume, splash basin ------------------------
    stair_flight(mats, "slide_stair", 7.0, 1.90, -58.0, -50.8, 0.0, 5.20, 24, "deck", "brass")
    for tag, sx in (("p", -1), ("s", 1)):
        slope_rail(mats, f"slide_stair_rail_{tag}", 7.0 + sx * 0.90, -58.0, -50.8, 0.0, 5.20)
    cube("slide_platform", (3.00, 0.16, 2.60), (7.0, 5.12, -49.50), mats["deck"], 0.0)
    for tag, sx in (("p", -1), ("s", 1)):
        for end, sz in (("a", -1), ("f", 1)):
            cube(f"slide_leg_{tag}{end}", (0.16, 5.04, 0.16),
                 (7.0 + sx * 1.32, 2.52, -49.50 + sz * 1.12), mats["steel"], 0.0)
        railing(mats, f"slide_plat_rail_{tag}",
                [(7.0 + sx * 1.35, -50.70), (7.0 + sx * 1.35, -48.30)], 5.20)
    cube("slide_platform_sign", (2.20, 0.44, 0.08), (7.0, 6.10, -50.75),
         mats["neon_pink"], 0.0)
    for tag, sx in (("p", -1), ("s", 1)):
        cube(f"slide_platform_mast_{tag}", (0.10, 0.90, 0.10),
             (7.0 + sx * 0.90, 5.65, -50.75), mats["steel"], 0.0)

    flume = []
    for index in range(13):
        along = index / 12
        flume.append((-48.20 + 20.00 * along, 0.62 + 4.58 * (1 - along) ** 1.7))
    for index in range(12):
        z0, y0 = flume[index]
        z1, y1 = flume[index + 1]
        run, drop = z1 - z0, y1 - y0
        length = math.hypot(run, drop)
        # +pi so the panel's height axis points up the slope, not down it.
        pitch = math.atan2(drop, -run) + math.pi
        up_y, up_z = math.cos(pitch), math.sin(pitch)
        mid_y, mid_z = (y0 + y1) / 2, (z0 + z1) / 2
        cube(f"slide_bed_{index}", (1.90, 0.12, length), (7.0, mid_y, mid_z),
             mats["neon_pink"], 0.0, (pitch, 0.0, 0.0))
        for tag, sx in (("p", -1), ("s", 1)):
            cube(f"slide_wall_{index}_{tag}", (0.10, 0.62, length),
                 (7.0 + sx * 0.95, mid_y + up_y * 0.37, mid_z + up_z * 0.37),
                 mats["neon_pink"], 0.0, (pitch, 0.0, 0.0))
        if index % 2 == 0 and mid_y > 0.90:
            for tag, sx in (("p", -1), ("s", 1)):
                cube(f"slide_prop_{index}_{tag}", (0.14, mid_y - 0.06, 0.14),
                     (7.0 + sx * 1.05, (mid_y - 0.06) / 2, mid_z), mats["steel"], 0.0)
    for tag, x0, x1 in (("port", 4.60, 4.85), ("stbd", 9.15, 9.40)):
        cube(f"splash_coam_{tag}", (x1 - x0, 0.55, 5.40), ((x0 + x1) / 2, 0.275, -26.10),
             mats["bulkhead"], 0.02)
    for tag, x0, x1 in (("pa", 4.85, 5.85), ("sa", 8.15, 9.15)):
        cube(f"splash_coam_{tag}", (x1 - x0, 0.55, 0.25), ((x0 + x1) / 2, 0.275, -28.675),
             mats["bulkhead"], 0.02)
    for tag, x0, x1 in (("pf", 4.85, 6.20), ("sf", 7.80, 9.15)):
        cube(f"splash_coam_{tag}", (x1 - x0, 0.55, 0.25), ((x0 + x1) / 2, 0.275, -23.525),
             mats["bulkhead"], 0.02)
    cube("splash_sill", (1.60, 0.20, 0.25), (7.0, 0.10, -23.525), mats["bulkhead"], 0.0)
    cube("splash_water", (4.30, 0.06, 4.90), (7.0, 0.43, -26.10), mats["water"], 0.0)
    cube("splash_step_in", (1.60, 0.28, 0.50), (7.0, 0.14, -24.05), mats["bulkhead"], 0.0)
    cube("splash_step_out", (1.60, 0.10, 0.60), (7.0, 0.05, -23.10), mats["bulkhead"], 0.0)
    for tag, sx in (("p", -1), ("s", 1)):
        cube(f"splash_grab_{tag}", (0.07, 1.05, 0.07), (7.0 + sx * 0.95, 0.525, -23.30),
             mats["brass"], 0.0)
    cube("splash_notice", (1.20, 0.06, 0.44), (7.0, 0.60, -22.60), mats["neon_amber"], 0.0)

    # ---- pool bar under its canopy ----------------------------------------
    bar_top = counter(mats, "lido_bar", 0.0, 40.0, 11.00, 1.40, 0.0, 1.12,
                      top="brass", body="wood", lip=-1)
    work_top = counter(mats, "lido_backbar", 0.0, 42.20, 9.00, 0.70, 0.0, 0.92,
                       top="steel", body="steel", lip=1)
    levels = shelf_unit(mats, "lido_shelf", 0.0, 43.10, 9.00, 0.55, 0.0, 2.20, 4,
                        "steel", "wood")
    for index, level in enumerate(levels[1:]):
        for slot in range(11):
            cube(f"lido_bottle_{index}_{slot}", (0.13, 0.32, 0.13),
                 (-3.9 + slot * 0.78, level + 0.18, 43.10),
                 mats["teal" if slot % 3 else "coral"], 0.0)
    for index in range(9):
        x = -4.8 + index * 1.2
        cylinder(f"lido_stool_{index}", 0.09, 0.72, (x, 0.36, 38.70), mats["steel"], 10)
        cylinder(f"lido_stool_{index}_foot", 0.26, 0.05, (x, 0.025, 38.70), mats["steel"], 12)
        cylinder(f"lido_stool_{index}_ring", 0.22, 0.05, (x, 0.245, 38.70), mats["brass"], 10)
        cylinder(f"lido_stool_{index}_seat", 0.24, 0.10, (x, bar_top - 0.30, 38.70),
                 mats["orange"], 12)
    for index in range(6):
        cube(f"lido_glassrack_{index}", (0.90, 0.22, 0.46),
             (-3.6 + index * 1.44, work_top + 0.11, 42.20), mats["glass"], 0.0)
    cube("lido_bar_sign", (4.00, 0.24, 0.06), (0, 3.05, 37.37), mats["neon_pink"], 0.0)
    cube("lido_bar_canopy", (14.00, 0.20, 6.00), (0, 3.30, 40.40), mats["canvas"], 0.0)
    for tag, sz in (("a", 37.49), ("f", 43.31)):
        cube(f"lido_bar_fascia_{tag}", (13.64, 0.30, 0.18), (0, 3.05, sz), mats["canvas"], 0.0)
    for tag, sx in (("p", -1), ("s", 1)):
        cube(f"lido_bar_fascia_{tag}", (0.18, 0.30, 6.00), (sx * 6.91, 3.05, 40.40),
             mats["canvas"], 0.0)
        for index, z in enumerate((37.80, 40.40, 43.00)):
            cylinder(f"lido_bar_base_{tag}{index}", 0.20, 0.12, (sx * 6.40, 0.06, z),
                     mats["trim"], 10)
            cylinder(f"lido_bar_post_{tag}{index}", 0.11, 2.96, (sx * 6.40, 1.60, z),
                     mats["steel"], 10)
            cylinder(f"lido_bar_cap_{tag}{index}", 0.20, 0.12, (sx * 6.40, 3.14, z),
                     mats["trim"], 10)
            cube(f"lido_bar_lamp_{tag}{index}", (0.22, 0.22, 0.22), (sx * 6.40, 2.70, z),
                 mats["neon_amber"], 0.0)

    for index, (bx, bz) in enumerate(((-8.0, 34.5), (0.0, 34.5), (8.0, 34.5),
                                      (-8.0, 45.0), (0.0, 45.0), (8.0, 45.0))):
        bistro(f"lido_bistro_{index}", bx, bz)

    # ---- the after deck: shuffleboard, a pergola, sun beds -----------------
    cube("shuffle_court", (1.90, 0.02, 12.00), (0, 0.01, -44.0), mats["wood"], 0.0)
    for tag, sx in (("p", -1), ("s", 1)):
        cube(f"shuffle_edge_{tag}", (0.10, 0.02, 12.00), (sx * 1.00, 0.01, -44.0),
             mats["neon_cyan"], 0.0)
    for end, sz in (("a", -1), ("f", 1)):
        cube(f"shuffle_head_{end}", (1.90, 0.02, 0.10), (0, 0.01, -44.0 + sz * 5.95),
             mats["neon_cyan"], 0.0)
        for row in range(3):
            cube(f"shuffle_zone_{end}_{row}", (1.90 - row * 0.60, 0.02, 0.08),
                 (0, 0.01, -44.0 + sz * (5.20 - row * 0.70)), mats["neon_amber"], 0.0)
    cube("shuffle_rack", (0.36, 0.90, 1.60), (2.20, 0.45, -44.0), mats["trim"], 0.02)
    for index in range(4):
        cube(f"shuffle_cue_{index}", (0.05, 0.05, 1.70), (2.05, 0.95 + index * 0.14, -44.0),
             mats["wood"], 0.0)

    for tag, sx in (("p", -1), ("s", 1)):
        for end, sz in (("a", -1), ("f", 1)):
            cube(f"pergola_post_{tag}{end}", (0.20, 2.90, 0.20),
                 (-7.0 + sx * 3.00, 1.45, -45.5 + sz * 4.50), mats["wood"], 0.0)
        cube(f"pergola_beam_{tag}", (0.18, 0.34, 9.40), (-7.0 + sx * 3.00, 3.07, -45.5),
             mats["wood"], 0.0)
    for index, offset in enumerate(grid(11, 9.00)):
        cube(f"pergola_slat_{index}", (6.20, 0.12, 0.18), (-7.0, 3.30, -45.5 + offset),
             mats["wood"], 0.0)
    for index, offset in enumerate(grid(2, 7.60)):
        cube(f"daybed_{index}_base", (2.40, 0.34, 1.90), (-7.0, 0.17, -45.5 + offset),
             mats["wood"], 0.02)
        cube(f"daybed_{index}_pad", (2.30, 0.18, 1.80), (-7.0, 0.43, -45.5 + offset),
             mats["canvas"], 0.04)
        for end, sz in (("a", -1), ("f", 1)):
            cube(f"daybed_{index}_bolster_{end}", (2.30, 0.26, 0.30),
                 (-7.0, 0.65, -45.5 + offset + sz * 0.75), mats["coral"], 0.06)
    cube("pergola_sign", (2.40, 0.40, 0.08), (-7.0, 2.60, -50.10), mats["neon_cyan"], 0.0)

    # ---- loungers, tables and parasols outboard of the lanes ---------------
    for group in range(7):
        z0 = -53.0 + group * 16.0
        for slot in range(5):
            for sign in (-1, 1):
                lounger(f"lounger_{group}_{slot}_{sign}", sign, sign * LOUNGE_X,
                        z0 + slot * 2.50)
        for tag, offset in (("a", 1.25), ("b", 6.25)):
            for sign in (-1, 1):
                side_table(f"lounge_table_{group}_{tag}_{sign}",
                           sign * (LOUNGE_X + 0.75), z0 + offset)
        if group < 6:
            for sign in (-1, 1):
                x = sign * 13.0
                z = z0 + 13.50
                cylinder(f"parasol_{group}_{sign}_base", 0.40, 0.14, (x, 0.07, z),
                         mats["trim"], 12)
                cylinder(f"parasol_{group}_{sign}_pole", 0.06, 2.26, (x, 1.27, z),
                         mats["steel"], 8)
                cylinder(f"parasol_{group}_{sign}_canopy", 1.50, 0.12, (x, 2.46, z),
                         mats["orange"], 12)
                cylinder(f"parasol_{group}_{sign}_boss", 0.14, 0.18, (x, 2.61, z),
                         mats["trim"], 8)

    # ---- towel stations against the deckhouses -----------------------------
    for index, (z, house) in enumerate(((-7.5, "aft"), (-1.5, "aft"),
                                        (51.0, "fwd"), (56.0, "fwd"))):
        cube(f"towel_{index}_carcass", (0.80, 1.30, 1.80), (-5.90, 0.65, z), mats["teal"], 0.03)
        cube(f"towel_{index}_top", (0.86, 0.06, 1.86), (-5.90, 1.33, z), mats["trim"], 0.0)
        for shelf in range(3):
            cube(f"towel_{index}_stack_{shelf}", (0.60, 0.22, 1.60),
                 (-5.86, 0.24 + shelf * 0.36, z), mats["canvas"], 0.03)
        cube(f"towel_{index}_sign", (0.06, 0.30, 1.00), (-6.33, 1.05, z),
             mats["neon_cyan"], 0.0)
        cube(f"towel_{index}_bin", (0.62, 0.70, 0.62), (-6.70, 0.35, z + 1.30),
             mats["trim"], 0.03)

    # ---- lifebuoys, deck lighting, wayfinding ------------------------------
    for index, z in enumerate(grid(12, 108.0)):
        for tag, sign in (("p", -1), ("s", 1)):
            cube(f"buoy_{index}_{tag}_post", (0.10, 1.00, 0.10), (sign * 16.30, 0.50, z),
                 mats["steel"], 0.0)
            cube(f"buoy_{index}_{tag}_plate", (0.06, 0.86, 0.86), (sign * 16.33, 1.30, z),
                 mats["trim"], 0.0)
            cylinder(f"buoy_{index}_{tag}", 0.38, 0.12, (sign * 16.24, 1.30, z),
                     mats["orange"], 12, (0.0, math.pi / 2, 0.0))
    for index, z in enumerate(grid(18, 112.0)):
        for tag, sign in (("p", -1), ("s", 1)):
            cube(f"lido_light_{index}_{tag}", (0.24, 1.05, 0.24), (sign * 15.90, 0.525, z),
                 mats["neon_amber"], 0.0)
            cube(f"lido_light_{index}_{tag}_head", (0.34, 0.16, 0.34),
                 (sign * 15.90, 1.13, z), mats["trim"], 0.0)
    for index, (z, sign) in enumerate(((-36.0, -1), (-36.0, 1), (11.0, -1), (11.0, 1),
                                       (36.0, -1), (36.0, 1))):
        cube(f"lido_way_post_{index}", (0.12, 2.10, 0.12), (sign * LANE_X, 1.05, z),
             mats["steel"], 0.0)
        cube(f"lido_way_sign_{index}", (1.60, 0.34, 0.06), (sign * LANE_X, 1.95, z),
             mats["neon_cyan"], 0.0)
        cube(f"lido_way_sign_{index}_b", (1.60, 0.34, 0.06), (sign * LANE_X, 1.55, z),
             mats["neon_amber"], 0.0)


def build_sun_deck(mats):
    """Topmost open deck: entry terrace, sunbathing blocks, a fenced sports
    court, an after bar, and the mast platform right aft.

    An open deck is planned exactly like a room. The walkways are painted
    first — a centre walk out of the tower door, a cross walk, and a side walk
    down each rail — and then every lounger, table and fence is set back clear
    of them. That is why the sunbathing rows come in pairs with an aisle
    between, and why the court is fenced with the circulation running around
    it rather than across it.
    """
    cube("sun_deck_plate", (30.0, 0.12, 74.0), (0, -0.06, 0), mats["deck"], 0.0)
    for sign in (-1, 1):
        railing(mats, f"sun_rail_{sign}", [(sign * 14.8, -36.5), (sign * 14.8, 36.5)], 0.0)
    # Inset off the side rails so the corner posts do not land inside each other.
    railing(mats, "sun_rail_aft", [(-14.5, -36.5), (14.5, -36.5)], 0.0)

    # --- the walkways, painted before anything is allowed to stand on them ---
    cube("sun_walk_centre", (4.00, 0.02, 25.00), (0, 0.01, 24.00), mats["wood"], 0.0)
    cube("sun_walk_cross", (27.00, 0.02, 3.00), (0, 0.01, 10.00), mats["wood"], 0.0)
    for sign in (-1, 1):
        cube(f"sun_walk_side_{sign}", (3.00, 0.02, 38.50), (sign * 12.00, 0.01, -10.75),
             mats["wood"], 0.0)

    # --- the forward bulkhead the aft tower opens through -------------------
    for part, (start, end) in enumerate(wall_segments(-15.0, 15.0, [0.0])):
        cube(f"sun_bulkhead_{part}", (end - start, 3.2, 0.2), ((start + end) / 2, 1.6, 36.9),
             mats["bulkhead"], 0.0)
    cube("sun_bulkhead_header", (1.6, 1.1, 0.24), (0, 2.65, 36.9), mats["trim"], 0.0)
    for sign in (-1, 1):
        # Beside the door, never across the header, which fills the same gap.
        cube(f"sun_bulkhead_sign_{sign}", (2.0, 0.5, 0.06), (sign * 2.6, 2.40, 36.77),
             mats["neon_cyan"], 0.0)
        cube(f"sun_bulkhead_lamp_{sign}", (0.30, 0.16, 0.20), (sign * 1.35, 2.95, 36.70),
             mats["neon_amber"], 0.0)

    # --- entry terrace, z 29 to the bulkhead, shaded by a louvred pergola ---
    for sign in (-1, 1):
        for z in (30.5, 35.5):
            cylinder(f"pergola_post_{sign}_{int(z * 10)}", 0.09, 2.90,
                     (sign * 6.5, 1.45, z), mats["wood"], 8)
        cube(f"pergola_beam_{sign}", (0.16, 0.18, 5.90), (sign * 6.5, 2.99, 33.0),
             mats["wood"], 0.0)
    for index in range(4):
        cube(f"pergola_cross_{index}", (13.16, 0.14, 0.14), (0, 3.15, 30.6 + index * 1.8),
             mats["wood"], 0.0)
    for index in range(16):
        cube(f"pergola_louvre_{index}", (12.80, 0.05, 0.10), (0, 3.245, 30.0 + index * 0.4),
             mats["trim"], 0.0)
    for sign in (-1, 1):
        # The deck-plan pylons flank the walk without standing on it.
        cube(f"deck_plan_{sign}", (1.60, 2.20, 0.16), (sign * 3.2, 1.10, 32.0), mats["trim"], 0.02)
        cube(f"deck_plan_{sign}_face", (1.36, 1.60, 0.04), (sign * 3.2, 1.35, 32.09),
             mats["screen"], 0.0)
        cube(f"deck_plan_{sign}_head", (1.36, 0.22, 0.04), (sign * 3.2, 0.40, 32.09),
             mats["neon_cyan"], 0.0)
        for z in (30.6, 35.4):
            planter(mats, f"terrace_planter_{sign}_{int(z * 10)}", sign * 3.4, z, 0.0,
                    0.62, 0.80)
        # Towel and water stations, backed against the pergola's outboard bay.
        top = counter(mats, f"towel_stn_{sign}", sign * 9.0, 33.0, 2.60, 0.90, 0.0, 0.95,
                      top="trim", body="teal", lip=0)
        for stack in range(4):
            cube(f"towel_stack_{sign}_{stack}", (0.52, 0.26, 0.62),
                 (sign * 9.0 - 0.975 + stack * 0.65, top + 0.13, 33.0), mats["bulkhead"], 0.02)
        levels = shelf_unit(mats, f"towel_rack_{sign}", sign * 9.0, 34.35, 2.60, 0.50, 0.0, 1.90,
                            shelves=3, frame="steel", plank="trim")
        for index, level in enumerate(levels):
            # Inset clear of the rack's own corner legs at +/- 1.23 off centre.
            for slot in range(4):
                cube(f"towel_roll_{sign}_{index}_{slot}", (0.42, 0.22, 0.40),
                     (sign * 9.0 - 0.90 + slot * 0.60, level + 0.13, 34.35),
                     mats["canvas"], 0.06)
        cube(f"water_urn_{sign}_plinth", (0.60, 0.30, 0.60), (sign * 11.6, 0.15, 30.6),
             mats["trim"], 0.0)
        cube(f"water_urn_{sign}", (0.46, 0.62, 0.46), (sign * 11.6, 0.61, 30.6), mats["steel"], 0.03)
        cube(f"water_urn_{sign}_tap", (0.10, 0.10, 0.16), (sign * 11.6, 0.50, 30.32),
             mats["brass"], 0.0)

    # --- sun terrace: two lounger blocks a side with a working aisle between -
    def lounger(name, x, z, sign, mat):
        """A steamer chair: a frame on four feet, slats, and a raked back."""
        cube(f"{name}_frame", (0.74, 0.10, 1.90), (x, 0.36, z), mats["wood"], 0.02)
        for fx in (-1, 1):
            for fz in (-1, 1):
                cube(f"{name}_foot_{fx}_{fz}", (0.07, 0.31, 0.07),
                     (x + fx * 0.31, 0.155, z + fz * 0.80), mats["wood"], 0.0)
        for slat in range(7):
            cube(f"{name}_slat_{slat}", (0.68, 0.04, 0.18), (x, 0.43, z - 0.72 + slat * 0.24),
                 mats[mat], 0.0)
        rake = sign * 0.55
        cube(f"{name}_back", (0.72, 0.80, 0.08),
             (x, 0.42 + 0.40 * math.cos(rake), z + sign * 0.85 + 0.40 * math.sin(rake)),
             mats[mat], 0.0, (rake, 0.0, 0.0))

    def side_table(name, x, z):
        cylinder(f"{name}_foot", 0.24, 0.03, (x, 0.015, z), mats["steel"], 12)
        cylinder(f"{name}_stem", 0.05, 0.44, (x, 0.22, z), mats["steel"], 8)
        cylinder(f"{name}_top", 0.32, 0.05, (x, 0.465, z), mats["glass"], 12)

    rows = [13.0, 15.6, 18.2, 20.8, 23.4, 26.0, 28.6]
    for row, z in enumerate(rows):
        for sign in (-1, 1):
            # Head aft, so the chair reclines looking forward over the bow.
            lounger(f"lounger_in_a_{row}_{sign}", sign * 4.2, z, -1, "canvas")
            lounger(f"lounger_in_b_{row}_{sign}", sign * 6.0, z, -1, "canvas")
            side_table(f"lounger_in_tbl_{row}_{sign}", sign * 5.1, z)
            lounger(f"lounger_out_a_{row}_{sign}", sign * 8.8, z, -1, "orange")
            lounger(f"lounger_out_b_{row}_{sign}", sign * 10.6, z, -1, "orange")
            side_table(f"lounger_out_tbl_{row}_{sign}", sign * 9.7, z)
    for index, z in enumerate((14.5, 19.7, 24.9)):
        for sign in (-1, 1):
            cylinder(f"sun_parasol_{index}_{sign}_base", 0.40, 0.12, (sign * 12.6, 0.06, z),
                     mats["steel"], 12)
            cylinder(f"sun_parasol_{index}_{sign}", 0.06, 2.40, (sign * 12.6, 1.20, z),
                     mats["steel"], 8)
            cylinder(f"sun_parasol_{index}_{sign}_top", 1.50, 0.12, (sign * 12.6, 2.40, z),
                     mats["coral"], 12)

    # --- the sports court, fenced so a stray ball never goes over the side ---
    # Stops 0.2 short of the fence line so no fence post stands in the paint.
    cube("court_surface", (17.60, 0.02, 19.60), (0, 0.01, -4.0), mats["teal"], 0.0)
    for tag, z in (("fwd", 5.7), ("aft", -13.7)):
        cube(f"court_line_{tag}", (17.40, 0.02, 0.12), (0, 0.03, z), mats["bulkhead"], 0.0)
    for sign in (-1, 1):
        cube(f"court_line_side_{sign}", (0.12, 0.02, 19.40), (sign * 8.7, 0.03, -4.0),
             mats["bulkhead"], 0.0)
    cube("court_line_half", (17.40, 0.02, 0.12), (0, 0.03, -4.0), mats["bulkhead"], 0.0)
    for index in range(20):
        angle = index / 20 * math.tau
        cube(f"court_circle_{index}", (0.42, 0.02, 0.12),
             (math.cos(angle) * 2.40, 0.03, -4.0 + math.sin(angle) * 2.40), mats["bulkhead"], 0.0,
             (0.0, 0.0, yaw_towards(-math.sin(angle), math.cos(angle))))
    for tag, base, into in (("fwd", 5.7, -1), ("aft", -13.7, 1)):
        cube(f"court_key_{tag}_end", (4.90, 0.02, 0.12), (0, 0.03, base + into * 5.80),
             mats["bulkhead"], 0.0)
        for sign in (-1, 1):
            cube(f"court_key_{tag}_{sign}", (0.12, 0.02, 5.80),
                 (sign * 2.45, 0.03, base + into * 2.90), mats["bulkhead"], 0.0)

    def cage(name, runs, height=3.60, levels=(0.90, 1.80, 2.70)):
        """Ball-stop fencing: posts and horizontal rails, no solid panel.

        Corner posts are placed once, from a shared set, so two runs meeting at
        a corner never draw one post inside another.
        """
        seen = set()
        for run_index, points in enumerate(runs):
            for index in range(len(points) - 1):
                (x0, z0), (x1, z1) = points[index], points[index + 1]
                span = math.hypot(x1 - x0, z1 - z0)
                if span < 0.05:
                    continue
                along_x = abs(x1 - x0) > abs(z1 - z0)
                for level in tuple(levels) + (height - 0.05,):
                    size = (span, 0.06, 0.06) if along_x else (0.06, 0.06, span)
                    cube(f"{name}_rail_{run_index}_{index}_{int(level * 100)}", size,
                         ((x0 + x1) / 2, level, (z0 + z1) / 2), mats["steel"], 0.0)
                posts = max(2, int(span / 2.4) + 1)
                for post in range(posts):
                    share = post / (posts - 1)
                    px, pz = x0 + (x1 - x0) * share, z0 + (z1 - z0) * share
                    key = (round(px, 2), round(pz, 2))
                    if key in seen:
                        continue
                    seen.add(key)
                    cube(f"{name}_post_{run_index}_{index}_{post}", (0.09, height, 0.09),
                         (px, height / 2, pz), mats["steel"], 0.0)

    cage("court_fence", [
        [(-9.0, 6.0), (9.0, 6.0)],
        [(-9.0, -14.0), (9.0, -14.0)],
        # A 2 m gate amidships on each side, opposite the side walks.
        [(-9.0, 6.0), (-9.0, 1.0)], [(-9.0, -1.0), (-9.0, -14.0)],
        [(9.0, 6.0), (9.0, 1.0)], [(9.0, -1.0), (9.0, -14.0)],
    ])
    for tag, z, out in (("fwd", 6.0, 1), ("aft", -14.0, -1)):
        cylinder(f"hoop_{tag}_post", 0.10, 4.00, (0, 2.00, z + out * 0.40), mats["steel"], 10)
        cube(f"hoop_{tag}_arm", (0.12, 0.12, 0.90), (0, 3.95, z + out * 0.05), mats["steel"], 0.0)
        cube(f"hoop_{tag}_board", (1.80, 1.05, 0.08), (0, 3.55, z - out * 0.40),
             mats["bulkhead"], 0.0)
        cube(f"hoop_{tag}_board_mark", (0.62, 0.46, 0.03), (0, 3.30, z - out * 0.445),
             mats["coral"], 0.0)
        # Long enough to actually reach from the board face out to the ring.
        cube(f"hoop_{tag}_bracket", (0.10, 0.06, 0.14), (0, 3.05, z - out * 0.43),
             mats["coral"], 0.0)
        cylinder(f"hoop_{tag}_ring", 0.23, 0.04, (0, 3.05, z - out * 0.70), mats["coral"], 12)
    for sign in (-1, 1):
        # A lintel across the gate opening, so the sign hangs off structure.
        cube(f"court_gate_head_{sign}", (0.06, 0.10, 2.00), (sign * 9.0, 3.00, 0.0),
             mats["steel"], 0.0)
        cube(f"court_gate_sign_{sign}", (0.06, 0.30, 1.00), (sign * 9.0, 2.80, 0.0),
             mats["neon_amber"], 0.0)
        for z in (3.4, -8.0):
            bench(mats, f"court_bench_{sign}_{int(abs(z) * 10)}", sign * 9.9, z, 0.0, 2.20,
                  axis="z", mat="teal", back=sign)
        cube(f"court_ball_bin_{sign}", (0.70, 0.80, 0.70), (sign * 9.9, 0.40, -2.4),
             mats["steel"], 0.04)
        for ball in range(3):
            cylinder(f"court_ball_{sign}_{ball}", 0.13, 0.26,
                     (sign * 9.9 - 0.2 + ball * 0.2, 0.93, -2.4), mats["orange"], 8)

    # --- the after bar, between the court and the mast ----------------------
    top = counter(mats, "sun_bar", 0.0, -19.2, 11.00, 1.20, 0.0, 1.10,
                  top="brass", body="wood", lip=0)
    for index in range(7):
        cylinder(f"sun_bar_stool_{index}", 0.09, 0.72, (-4.5 + index * 1.5, 0.36, -17.9),
                 mats["steel"], 8)
        cylinder(f"sun_bar_stool_{index}_foot", 0.30, 0.04, (-4.5 + index * 1.5, 0.02, -17.9),
                 mats["steel"], 12)
        cylinder(f"sun_bar_stool_{index}_seat", 0.24, 0.10, (-4.5 + index * 1.5, 0.77, -17.9),
                 mats["coral"], 12)
    for index in range(5):
        cube(f"sun_bar_tap_{index}", (0.08, 0.34, 0.08), (-1.6 + index * 0.8, top + 0.17, -19.6),
             mats["brass"], 0.0)
    cube("sun_bar_sink", (1.10, 0.06, 0.70), (3.6, top - 0.06, -19.4), mats["steel"], 0.0)
    counter(mats, "sun_bar_under", 0.0, -20.8, 9.00, 0.80, 0.0, 0.86,
            top="steel", body="steel", lip=0)
    for index in range(4):
        cube(f"sun_bar_fridge_{index}", (1.90, 0.60, 0.06), (-3.3 + index * 2.2, 0.48, -21.19),
             mats["glass"], 0.0)
    levels = shelf_unit(mats, "sun_bar_back", 0.0, -22.6, 9.00, 0.60, 0.0, 2.10,
                        shelves=4, frame="steel", plank="wood")
    for index, level in enumerate(levels[1:], start=1):
        for slot in range(11):
            cube(f"sun_bar_bottle_{index}_{slot}", (0.13, 0.32, 0.13),
                 (-4.0 + slot * 0.8, level + 0.18, -22.6),
                 mats["teal" if (index + slot) % 3 else "coral"], 0.0)
    for slot in range(9):
        cylinder(f"sun_bar_glass_{slot}", 0.05, 0.16, (-3.2 + slot * 0.8, levels[0] + 0.10, -22.6),
                 mats["glass"], 8)
    for sign in (-1, 1):
        for z in (-18.4, -23.6):
            cylinder(f"sun_bar_post_{sign}_{int(abs(z) * 10)}", 0.10, 3.00,
                     (sign * 5.8, 1.50, z), mats["steel"], 8)
    cube("sun_bar_canopy", (13.00, 0.18, 7.00), (0, 3.09, -21.0), mats["canvas"], 0.0)
    cube("sun_bar_sign", (4.60, 0.60, 0.10), (0, 2.70, -17.55), mats["neon_pink"], 0.0)
    for index, z in enumerate((-16.4, -21.6)):
        for sign in (-1, 1):
            cylinder(f"high_table_{index}_{sign}_foot", 0.42, 0.06, (sign * 8.6, 0.03, z),
                     mats["steel"], 12)
            cylinder(f"high_table_{index}_{sign}_stem", 0.07, 1.02, (sign * 8.6, 0.54, z),
                     mats["steel"], 8)
            cylinder(f"high_table_{index}_{sign}_top", 0.55, 0.06, (sign * 8.6, 1.08, z),
                     mats["wood"], 14)
            for seat in range(3):
                angle = seat / 3 * math.tau + 0.5
                sx = sign * 8.6 + math.cos(angle) * 0.95
                sz = z + math.sin(angle) * 0.95
                cylinder(f"high_stool_{index}_{sign}_{seat}", 0.08, 0.72, (sx, 0.36, sz),
                         mats["steel"], 8)
                cylinder(f"high_stool_{index}_{sign}_{seat}_seat", 0.22, 0.09, (sx, 0.765, sz),
                         mats["coral"], 12)

    # --- mast platform, right aft, up one step off the deck -----------------
    cube("mast_platform", (9.00, 0.30, 6.00), (0, 0.15, -31.0), mats["deck"], 0.0)
    cube("mast_step", (3.00, 0.15, 0.34), (0, 0.075, -27.83), mats["deck"], 0.0)
    for sign in (-1, 1):
        railing(mats, f"mast_rail_{sign}", [(sign * 4.5, -28.0), (sign * 4.5, -34.0)], 0.30)
    railing(mats, "mast_rail_aft", [(-4.2, -34.0), (4.2, -34.0)], 0.30)
    cylinder("sun_mast", 0.30, 9.00, (0, 4.80, -31.0), mats["steel"], 12)
    for index, width in enumerate((5.0, 3.8, 2.6)):
        level = 3.60 + index * 2.20
        cube(f"sun_mast_yard_{index}", (width, 0.14, 0.14), (0, level, -31.0), mats["steel"], 0.0)
        for sign in (-1, 1):
            # Lamps sit on the yard, not in the air above it.
            cube(f"sun_mast_lamp_{index}_{sign}", (0.22, 0.22, 0.22),
                 (sign * (width / 2 - 0.15), level + 0.18, -31.0), mats["neon_amber"], 0.0)
            # Signal flags bent onto the yard, hanging from its underside.
            cube(f"sun_mast_flag_{index}_{sign}", (0.05, 0.34, 0.44),
                 (sign * (width / 2 - 0.55), level - 0.24, -31.0),
                 mats["coral" if index % 2 else "teal"], 0.0)
    for index in range(4):
        cylinder(f"sun_mast_whip_{index}", 0.03, 1.60,
                 (-1.1 + index * 0.7333, 8.87, -31.0), mats["steel"], 6)
    cube("radar_pedestal", (0.50, 0.40, 0.50), (0, 9.50, -31.0), mats["steel"], 0.02)
    cube("radar_pedestal_lamp", (0.20, 0.24, 0.10), (0, 9.50, -31.30), mats["neon_cyan"], 0.0)
    cube("radar_scanner", (3.40, 0.12, 0.36), (0, 9.76, -31.0), mats["trim"], 0.02)

    # --- the after lookout, abaft the mast and hard against the stern rail --
    for sign in (-1, 1):
        bench(mats, f"lookout_bench_{sign}", sign * 7.0, -35.2, 0.0, 2.20, axis="x",
              mat="wood", back=1)
        cylinder(f"telescope_{sign}_post", 0.16, 1.10, (sign * 3.5, 0.55, -35.6), mats["steel"], 10)
        cylinder(f"telescope_{sign}_head", 0.10, 0.70, (sign * 3.5, 1.22, -35.6), mats["brass"], 10,
                 (math.pi / 2 - 0.25, 0.0, 0.0))
        cube(f"telescope_{sign}_yoke", (0.30, 0.14, 0.14), (sign * 3.5, 1.10, -35.6),
             mats["steel"], 0.0)

    # --- edge furniture: lifebuoys on the rail, bins and lights inboard -----
    for index, z in enumerate(grid(6, 60.0)):
        for sign in (-1, 1):
            cube(f"buoy_bracket_{index}_{sign}", (0.26, 0.08, 0.08), (sign * 14.66, 1.12, z),
                 mats["steel"], 0.0)
            cylinder(f"buoy_{index}_{sign}", 0.38, 0.12, (sign * 14.55, 0.70, z),
                     mats["orange"], 12, (0.0, math.pi / 2, 0.0))
    for index, z in enumerate(grid(5, 56.0)):
        for sign in (-1, 1):
            cube(f"sun_bin_{index}_{sign}", (0.60, 0.90, 0.60), (sign * 13.8, 0.45, z + 3.0),
                 mats["steel"], 0.04)
            cube(f"sun_bin_{index}_{sign}_lid", (0.66, 0.08, 0.66), (sign * 13.8, 0.94, z + 3.0),
                 mats["trim"], 0.0)
    for index, z in enumerate(grid(10, 66.0)):
        for sign in (-1, 1):
            cube(f"sun_light_{index}_{sign}", (0.22, 1.00, 0.22), (sign * 14.3, 0.50, z),
                 mats["neon_amber"], 0.0)


# ---------------------------------------------------------------------------
# Deck 9 — bridge
# ---------------------------------------------------------------------------


def build_bridge(mats):
    """The wheelhouse: a console the helm actually reads from, and glass."""
    kit.shell(
        mats,
        (26, 3.4, 12),
        [portal("stairwell-fwd", 0, 0, -6)],
        carpet="deck",
        glaze={"fore": (1.1, 2.9), "port": (1.1, 2.9), "starboard": (1.1, 2.9)},
    )

    # `shell` centres each bulkhead on its half-size, so the interior faces are
    # x +-12.93, z +-5.93, and the glass inner faces 0.03 outboard of those.
    TILT = 0.34                           # rake of every instrument fascia
    COS, SIN = math.cos(TILT), math.sin(TILT)

    def fascia(name, x, z, width, height, y_foot, mat="trim"):
        """A raked instrument panel standing on a console top.

        Returned as an anchor so anything mounted on it is placed in the
        panel's own frame rather than by eye: `up` runs up the rake and `out`
        is the aft-facing normal, which is the face the watchkeeper reads.
        """
        y = y_foot + height / 2 * COS + 0.035 * SIN
        cube(name, (width, height, 0.07), (x, y, z), mats[mat], 0.0, (TILT, 0.0, 0.0))
        return (x, y, z)

    def on_fascia(name, anchor, across, along, size, mat, proud=0.055):
        x0, y0, z0 = anchor
        cube(name, size,
             (x0 + across, y0 + along * COS + proud * SIN, z0 + along * SIN - proud * COS),
             mats[mat], 0.0, (TILT, 0.0, 0.0))

    # --- the sole: where the watch stands, and the way in from the door ------
    # A bridge is worked standing at the window line, so the rubber is laid
    # where the feet go and the carpet runs from the door to the helm. Nothing
    # else is painted: a wheelhouse at night wants a dark floor.
    # The rubber lies in the one clear lane between the steering stand and the
    # console plinths, and the carpet stops short of the stand rather than
    # running under it.
    cube("sole_strip", (25.40, 0.02, 0.74), (0, 0.02, 3.21), mats["trim"], 0.0)
    cube("watch_walk", (1.70, 0.02, 7.20), (0, 0.02, -2.20), mats["carpet"], 0.0)

    # --- the window line: sill shelf under the glass ------------------------
    cube("sill_shelf", (25.60, 0.08, 0.62), (0, 1.14, 5.60), mats["wood"], 0.0)
    for index, x in enumerate(grid(9, 24.0)):
        cube(f"sill_bracket_{index}", (0.08, 0.16, 0.58), (x, 1.02, 5.63), mats["steel"], 0.0)
    for index, x in enumerate((-10.4, -3.6, 3.6, 10.4)):
        cube(f"binocular_case_{index}", (0.46, 0.20, 0.34), (x, 1.28, 5.62), mats["trim"], 0.02)

    # Clear-view screens, set in the panes between mullions so a spinning disc
    # never lands on the frame it would be bolted through.
    for index, x in enumerate((-9.058, -3.882, 1.294, 6.470)):
        cylinder(f"clearview_{index}", 0.34, 0.05, (x, 2.05, 5.935), mats["steel"], 16,
                 (math.pi / 2, 0.0, 0.0))
        cylinder(f"clearview_{index}_glass", 0.30, 0.03, (x, 2.05, 5.925), mats["glass"], 16,
                 (math.pi / 2, 0.0, 0.0))
        cube(f"clearview_{index}_motor", (0.18, 0.22, 0.16), (x, 1.66, 5.84), mats["steel"], 0.02)

    # --- five stations under one window line --------------------------------
    # Docking consoles outboard where the wing is conned from, conning consoles
    # either side of the centreline, and the helm on it. That is the order an
    # officer of the watch walks the console in, and it is why the run is broken
    # into five bodies rather than drawn as one slab of instruments.
    def station(tag, x, width):
        cube(f"{tag}_plinth", (width - 0.20, 0.12, 1.40), (x, 0.06, 4.30), mats["steel"], 0.0)
        cube(f"{tag}_body", (width, 0.82, 1.60), (x, 0.53, 4.30), mats["trim"], 0.02)
        cube(f"{tag}_top", (width + 0.10, 0.10, 1.72), (x, 0.99, 4.30), mats["steel"], 0.0)
        return 1.04

    for tag, x, sx in (("port_dock", -10.6, -1), ("stbd_dock", 10.6, 1)):
        top = station(tag, x, 4.0)
        panel = fascia(f"{tag}_fascia", x, 4.86, 3.40, 0.62, top)
        for index, across in enumerate((-1.05, 1.05)):
            on_fascia(f"{tag}_screen_{index}", panel, across, -0.02, (1.70, 0.44, 0.04), "screen")
        for index, across in enumerate((-1.35, -0.45, 0.45, 1.35)):
            on_fascia(f"{tag}_lamp_{index}", panel, across, 0.25, (0.60, 0.08, 0.03),
                      "neon_amber" if index % 2 else "neon_cyan")
        # The joystick a ship is berthed on goes outboard, on the side of the
        # console the officer stands at to watch the quay; the thrust repeaters
        # go inboard where they are read from the conning station as well.
        jx, bx = x + sx * 1.00, x - sx * 1.20
        cylinder(f"{tag}_joystick_base", 0.15, 0.09, (jx, 1.09, 3.85), mats["steel"], 10)
        cylinder(f"{tag}_joystick", 0.035, 0.26, (jx, 1.26, 3.85), mats["steel"], 8)
        cube(f"{tag}_joystick_knob", (0.11, 0.09, 0.11), (jx, 1.42, 3.85), mats["coral"], 0.03)
        cube(f"{tag}_thrust_box", (1.30, 0.24, 0.34), (bx, 1.16, 3.92), mats["trim"], 0.02)
        for index in range(3):
            cylinder(f"{tag}_thrust_dial_{index}", 0.08, 0.04,
                     (bx - 0.40 + index * 0.40, 1.16, 3.73), mats["screen"], 10,
                     (math.pi / 2, 0.0, 0.0))

    for tag, x in (("port_conn", -5.6), ("stbd_conn", 5.6)):
        top = station(tag, x, 5.2)
        panel = fascia(f"{tag}_fascia", x, 4.86, 4.60, 0.68, top)
        on_fascia(f"{tag}_chart_screen", panel, -1.30, 0.00, (1.90, 0.52, 0.04), "screen")
        on_fascia(f"{tag}_radar_screen", panel, 1.10, 0.00, (1.60, 0.52, 0.04), "screen")
        for index in range(8):
            on_fascia(f"{tag}_key_{index}", panel, 2.10, -0.24 + index * 0.07,
                      (0.34, 0.04, 0.02), "neon_cyan" if index % 3 else "neon_pink")
        # A tracker ball and a keyboard shelf, because a screen with no way of
        # driving it reads as a picture of a bridge rather than a bridge.
        cube(f"{tag}_keyboard", (1.20, 0.05, 0.42), (x - 1.30, 1.07, 3.82), mats["bulkhead"], 0.0)
        cube(f"{tag}_trackball_pad", (0.34, 0.03, 0.34), (x - 0.30, 1.055, 3.82), mats["steel"], 0.0)
        cylinder(f"{tag}_trackball", 0.07, 0.06, (x - 0.30, 1.10, 3.82), mats["brass"], 10)
    # Engine and thruster control lives to starboard of the centreline, so the
    # helm and the throttles are worked by two people standing side by side.
    for index, offset in enumerate((-0.55, 0.55)):
        cube(f"pod_quadrant_{index}", (0.26, 0.04, 0.44), (6.90 + offset, 1.06, 3.80),
             mats["brass"], 0.0)
        cylinder(f"pod_lever_{index}", 0.05, 0.34, (6.90 + offset, 1.21, 3.80), mats["steel"], 8,
                 (0.5, 0.0, 0.0))
        cube(f"pod_knob_{index}", (0.16, 0.13, 0.20), (6.90 + offset, 1.38, 3.72),
             mats["orange"], 0.03)
    cube("bow_thruster_plate", (0.20, 0.04, 0.30), (3.40, 1.06, 3.80), mats["brass"], 0.0)
    cylinder("bow_thruster_lever", 0.05, 0.30, (3.40, 1.19, 3.80), mats["steel"], 8, (0.5, 0.0, 0.0))
    cube("bow_thruster_knob", (0.15, 0.12, 0.18), (3.40, 1.34, 3.73), mats["teal"], 0.03)

    # --- the helm itself ----------------------------------------------------
    top = station("helm_console", 0.0, 5.0)
    panel = fascia("helm_fascia", 0.0, 4.86, 3.60, 0.60, top)
    on_fascia("autopilot_head", panel, -1.00, 0.00, (1.40, 0.40, 0.04), "screen")
    on_fascia("conning_screen", panel, 1.00, 0.00, (1.60, 0.40, 0.04), "screen")
    on_fascia("helm_mode_row", panel, 0.00, 0.25, (3.20, 0.09, 0.03), "neon_amber")

    # Rudder-angle indicator, slung under the overhead console on the
    # centreline where it is read from anywhere on the bridge rather than only
    # from the wheel. The stays are short because it hangs off the console,
    # not off the deckhead the console is already hung from.
    cube("rudder_indicator", (2.20, 0.46, 0.24), (0, 2.70, 5.10), mats["trim"], 0.02)
    cube("rudder_indicator_face", (1.94, 0.30, 0.05), (0, 2.70, 4.96), mats["screen"], 0.0)
    cube("rudder_indicator_needle", (0.06, 0.22, 0.03), (0, 2.70, 4.92), mats["neon_pink"], 0.0)
    for tag, sx in (("p", -1), ("s", 1)):
        cube(f"rudder_indicator_stay_{tag}", (0.07, 0.10, 0.07), (sx * 1.00, 2.945, 5.10),
             mats["steel"], 0.0)

    # The steering stand: a compact raked wheel on a pedestal, which is what a
    # ship of this age is actually steered by when the autopilot is out. The
    # wheel plane has normal (0, cos AXIS, sin AXIS) and lies in the basis
    # e1 = athwartships, e2 = (0, sin AXIS, -cos AXIS), so anything mounted on
    # it is placed from that basis instead of by eye.
    AXIS = math.pi / 2 - 0.35
    E2Y, E2Z = math.sin(AXIS), -math.cos(AXIS)
    NY, NZ = math.cos(AXIS), math.sin(AXIS)
    HUB = (0.0, 1.10, 2.00)

    def on_wheel(radius, angle, out):
        return (math.cos(angle) * radius,
                HUB[1] + math.sin(angle) * radius * E2Y + out * NY,
                HUB[2] + math.sin(angle) * radius * E2Z + out * NZ)

    cylinder("helm_base", 0.42, 0.08, (0, 0.04, 2.40), mats["steel"], 14)
    cylinder("helm_pedestal", 0.28, 0.86, (0, 0.51, 2.40), mats["steel"], 12)
    cube("helm_head", (0.80, 0.34, 0.50), (0, 1.10, 2.40), mats["trim"], 0.03)
    cube("helm_head_face", (0.62, 0.16, 0.05), (0, 1.06, 2.13), mats["screen"], 0.0)
    cylinder("helm_hub", 0.09, 0.24, on_wheel(0.0, 0.0, 0.12), mats["steel"], 10, (AXIS, 0.0, 0.0))
    cylinder("helm_wheel", 0.26, 0.06, HUB, mats["brass"], 18, (AXIS, 0.0, 0.0))
    cylinder("helm_wheel_face", 0.20, 0.04, on_wheel(0.0, 0.0, -0.05), mats["trim"], 16,
             (AXIS, 0.0, 0.0))
    # Two bars in the wheel's own plane read as four spokes; the rake carries
    # them, so a spoke can never end up lying flat like a yawed box would.
    cube("helm_spoke_across", (0.50, 0.05, 0.05), HUB, mats["brass"], 0.0, (AXIS, 0.0, 0.0))
    cube("helm_spoke_up", (0.05, 0.50, 0.05), HUB, mats["brass"], 0.0, (AXIS, 0.0, 0.0))
    for index in range(3):
        cylinder(f"helm_grip_{index}", 0.035, 0.10,
                 on_wheel(0.22, index / 3 * math.tau, -0.055), mats["brass"], 8, (AXIS, 0.0, 0.0))

    # --- the two watch chairs ----------------------------------------------
    for tag, x in (("port", -4.40), ("stbd", 4.40)):
        cylinder(f"chair_{tag}_base", 0.38, 0.06, (x, 0.03, 1.50), mats["steel"], 12)
        cylinder(f"chair_{tag}_stem", 0.09, 0.60, (x, 0.36, 1.50), mats["steel"], 10)
        cube(f"chair_{tag}_footrest", (0.46, 0.05, 0.07), (x, 0.30, 1.50), mats["steel"], 0.0)
        cube(f"chair_{tag}_seat", (0.62, 0.14, 0.60), (x, 0.73, 1.50), mats["coral"], 0.04)
        cube(f"chair_{tag}_back", (0.62, 0.66, 0.12), (x, 1.13, 1.14), mats["coral"], 0.04)
        for arm, sx in (("p", -1), ("s", 1)):
            cube(f"chair_{tag}_arm_{arm}", (0.09, 0.07, 0.46), (x + sx * 0.34, 1.02, 1.44),
                 mats["trim"], 0.02)
            cube(f"chair_{tag}_arm_post_{arm}", (0.06, 0.24, 0.06), (x + sx * 0.34, 0.87, 1.24),
                 mats["steel"], 0.0)

    # --- overhead switch console -------------------------------------------
    cube("overhead_console", (18.00, 0.38, 0.70), (0, 3.15, 4.90), mats["trim"], 0.02)
    for index, x in enumerate(grid(7, 17.0)):
        cube(f"overhead_hanger_{index}", (0.10, 0.06, 0.70), (x, 3.37, 4.90), mats["steel"], 0.0)
    for index, x in enumerate(grid(24, 17.20)):
        cube(f"overhead_switch_{index}", (0.44, 0.10, 0.05), (x, 3.24, 4.53),
             mats["neon_cyan" if index % 4 else "neon_amber"], 0.0)
        cube(f"overhead_label_{index}", (0.44, 0.07, 0.03), (x, 3.06, 4.54), mats["bulkhead"], 0.0)

    # --- port quarter: navigation -------------------------------------------
    # The chart table faces the port glass so the officer plotting has the coast
    # in view, and the publications live under the sill beside it.
    chart_top = counter(mats, "chart_table", -9.40, -3.40, 2.80, 1.50, 0.0, 0.86,
                        top="wood", body="trim", lip=0)
    cube("chart", (2.44, 0.02, 1.26), (-9.40, chart_top + 0.01, -3.40), mats["bulkhead"], 0.0)
    cube("chart_track", (1.30, 0.02, 0.05), (-9.10, chart_top + 0.035, -3.10),
         mats["neon_pink"], 0.0)
    cube("parallel_rule", (0.90, 0.03, 0.11), (-8.60, chart_top + 0.035, -3.80), mats["brass"], 0.0)
    cylinder("dividers", 0.02, 0.24, (-10.30, chart_top + 0.04, -3.90), mats["brass"], 6,
             (0.0, math.pi / 2, 0.0))
    for index in range(4):
        cube(f"chart_drawer_{index}", (2.50, 0.14, 0.04), (-9.40, 0.22 + index * 0.18, -4.13),
             mats["wood"], 0.0)
        cylinder(f"chart_drawer_handle_{index}", 0.02, 0.40,
                 (-9.40, 0.22 + index * 0.18, -4.17), mats["brass"], 6, (0.0, math.pi / 2, 0.0))
    cylinder("chart_lamp_stem", 0.03, 0.52, (-10.60, chart_top + 0.26, -2.90), mats["steel"], 8)
    cylinder("chart_lamp_arm", 0.03, 0.40, (-10.42, chart_top + 0.50, -2.90), mats["steel"], 8,
             (0.0, math.pi / 2, 0.0))
    cube("chart_lamp_shade", (0.26, 0.14, 0.26), (-10.22, chart_top + 0.44, -2.90),
         mats["neon_amber"], 0.02)
    # Sailing directions and light lists under the port sill. The unit is 1.05
    # tall so it finishes below the 1.10 sill and never fouls the glass, and the
    # top row is folded charts rather than spines so nothing overtops the frame.
    for index, level in enumerate(shelf_unit(mats, "publications", -12.46, -1.20, 0.90, 2.40,
                                             0.0, 1.05, shelves=3, frame="trim", plank="wood")):
        height = 0.24 if index < 2 else 0.10
        for slot in range(4):
            cube(f"publication_{index}_{slot}", (0.60, height, 0.44),
                 (-12.46, level + 0.02 + height / 2, -2.10 + slot * 0.60),
                 mats[("wood", "canvas", "teal", "bulkhead")[(index + slot) % 4]], 0.0)

    # Pantry in the port after corner: a watch is four hours long.
    pantry_top = counter(mats, "bridge_pantry", -10.60, -5.43, 2.20, 1.00, 0.0, 0.92,
                         top="steel", body="trim", lip=0)
    cube("pantry_sink", (0.52, 0.05, 0.44), (-11.30, pantry_top - 0.01, -5.43), mats["steel"], 0.0)
    cylinder("pantry_tap", 0.02, 0.26, (-11.30, pantry_top + 0.13, -5.72), mats["brass"], 6)
    cube("pantry_urn", (0.36, 0.46, 0.36), (-10.10, pantry_top + 0.23, -5.43), mats["steel"], 0.03)
    for index in range(4):
        cylinder(f"pantry_mug_{index}", 0.05, 0.10,
                 (-9.80 + (index % 2) * 0.16, pantry_top + 0.05, -5.62 + (index // 2) * 0.18),
                 mats["bulkhead"], 8)

    # --- starboard quarter: the safety centre -------------------------------
    safety_top = counter(mats, "safety_console", 9.60, -3.40, 3.00, 1.20, 0.0, 0.92,
                         top="steel", body="steel", lip=0)
    mimic = fascia("fire_mimic", 9.60, -3.00, 2.60, 0.90, safety_top)
    for index in range(24):
        on_fascia(f"mimic_lamp_{index}", mimic, -1.10 + (index % 8) * 0.32,
                  -0.30 + (index // 8) * 0.26, (0.16, 0.10, 0.02),
                  "neon_pink" if index % 7 == 3 else "neon_cyan")
    on_fascia("mimic_outline", mimic, 0.00, 0.34, (2.30, 0.05, 0.02), "neon_amber")
    cube("fire_pump_button", (0.22, 0.10, 0.22), (10.70, safety_top + 0.05, -3.90),
         mats["coral"], 0.02)
    cube("general_alarm_button", (0.22, 0.10, 0.22), (10.30, safety_top + 0.05, -3.90),
         mats["orange"], 0.02)

    cube("gmdss_stack", (2.40, 2.10, 0.55), (9.40, 1.05, -5.655), mats["steel"], 0.02)
    for index in range(4):
        cube(f"gmdss_set_{index}", (2.00, 0.28, 0.06), (9.40, 0.40 + index * 0.42, -5.35),
             mats["trim"], 0.0)
        cube(f"gmdss_face_{index}", (1.20, 0.14, 0.03), (9.10, 0.40 + index * 0.42, -5.31),
             mats["neon_cyan"], 0.0)
        cylinder(f"gmdss_dial_{index}", 0.05, 0.04, (10.20, 0.40 + index * 0.42, -5.31),
                 mats["brass"], 8, (math.pi / 2, 0.0, 0.0))
    cube("gmdss_distress", (0.30, 0.16, 0.08), (9.40, 2.00, -5.34), mats["coral"], 0.02)
    cube("gmdss_sign", (1.60, 0.20, 0.05), (9.40, 2.52, -5.905), mats["neon_pink"], 0.0)

    # --- the after bulkhead: what the watch reads standing at the door ------
    # The general-arrangement board is bordered with four strips rather than a
    # backing slab, so nothing is drawn inside anything else.
    cube("ga_board", (3.60, 1.30, 0.06), (-5.00, 1.85, -5.90), mats["bulkhead"], 0.0)
    for tag, dx, dy, size in (("top", 0.0, 0.69, (3.76, 0.08, 0.05)),
                              ("bottom", 0.0, -0.69, (3.76, 0.08, 0.05)),
                              ("port", -1.84, 0.0, (0.08, 1.46, 0.05)),
                              ("stbd", 1.84, 0.0, (0.08, 1.46, 0.05))):
        cube(f"ga_board_edge_{tag}", size, (-5.00 + dx, 1.85 + dy, -5.885), mats["trim"], 0.0)
    for index in range(9):
        cube(f"ga_deck_line_{index}", (3.30, 0.03, 0.02), (-5.00, 1.30 + index * 0.13, -5.86),
             mats["neon_cyan"], 0.0)
    cube("alarm_panel", (3.20, 1.10, 0.10), (4.60, 2.00, -5.88), mats["coral"], 0.02)
    for index in range(12):
        cube(f"alarm_lamp_{index}", (0.34, 0.16, 0.04), (3.35 + (index % 6) * 0.50,
             1.74 + (index // 6) * 0.42, -5.82),
             mats["neon_pink" if index % 5 == 2 else "neon_amber"], 0.0)
    cube("alarm_accept", (0.26, 0.12, 0.06), (6.00, 1.56, -5.80), mats["orange"], 0.02)
    for tag, sx in (("p", -1), ("s", 1)):
        cube(f"door_frame_{tag}", (0.12, 2.10, 0.10), (sx * 0.86, 1.05, -5.88), mats["trim"], 0.0)
    cube("door_head_sign", (1.40, 0.22, 0.05), (0, 2.28, -5.90), mats["neon_cyan"], 0.0)

    # Life-saving gear, on the one stretch of after bulkhead left over between
    # the door frame and the safety centre.
    for index in range(3):
        cube(f"lifejacket_box_{index}", (0.90, 0.70, 0.42), (1.90 + index * 0.95, 0.35, -5.70),
             mats["orange"], 0.03)
        cube(f"lifejacket_label_{index}", (0.62, 0.14, 0.03), (1.90 + index * 0.95, 0.50, -5.50),
             mats["neon_amber"], 0.0)
    cube("bridge_extinguisher_bracket", (0.24, 0.26, 0.26), (-1.90, 0.80, -5.80), mats["steel"], 0.0)
    cylinder("bridge_extinguisher", 0.14, 0.66, (-1.90, 0.75, -5.72), mats["coral"], 8)

    # --- authored commander/control room island -----------------------------
    # `navigationIncidentDefinition.bridge.position` is the bridge playfield
    # point (13, 5.5). `simToCompartmentLocal` maps that to (0, -0.5) in this
    # 26 x 12 wheelhouse, so the authored helm below sits under the runtime
    # feedback overlay without changing the shared navigation contract.
    HELM_X, HELM_Z = 0.0, -0.50
    bridge_root = kit.bpy.data.objects.get("CM_BRIDGE_ROOT")
    if bridge_root:
        bridge_root["cm_bridge_room_role"] = "commander-control-room"
        bridge_root["cm_bridge_room_contract"] = "bridge-command-island-v1"
        bridge_root["cm_helm_target"] = "bridge-helm"
        bridge_root["cm_helm_local_position"] = "0.0,-0.5"

    def bridge_socket(name, position, target, role):
        empty = kit.bpy.data.objects.new(name, None)
        empty.empty_display_type = "CIRCLE"
        empty.empty_display_size = 0.30
        empty.location = kit.world_location(*position)
        empty["cm_compartment_id"] = "bridge"
        empty["cm_socket_role"] = role
        empty["cm_interaction_target"] = target
        empty["cm_coordinate_space"] = "bridge-local"
        kit.bpy.context.scene.collection.objects.link(empty)
        if bridge_root:
            empty.parent = bridge_root
        return empty

    def command_station(name, x, z, width, depth=1.10):
        cube(f"{name}_plinth", (width - 0.20, 0.12, depth + 0.08), (x, 0.06, z), mats["steel"], 0.0)
        cube(f"{name}_body", (width, 0.82, depth), (x, 0.53, z), mats["trim"], 0.02)
        cube(f"{name}_top", (width + 0.10, 0.10, depth + 0.12), (x, 0.99, z), mats["steel"], 0.0)
        return 1.04

    # Command header and floor rails give the middle of the room a readable
    # silhouette from the doorway, even with the HUD feedback overlay hidden.
    cube("bridge_command_header", (10.40, 0.16, 0.18), (0, 2.72, HELM_Z - 0.10), mats["neon_cyan"], 0.02)
    cube("bridge_command_header_core", (7.20, 0.08, 0.08), (0, 2.84, HELM_Z - 0.10), mats["neon_pink"], 0.01)
    cube("bridge_command_floor_mark_a", (10.80, 0.02, 0.08), (0, 0.04, HELM_Z - 1.34), mats["neon_amber"], 0.0)
    cube("bridge_command_floor_mark_b", (10.80, 0.02, 0.08), (0, 0.04, HELM_Z + 1.30), mats["neon_amber"], 0.0)

    # Central helm island: wheel, rudder display and telegraph all occupy the
    # same interaction target used by the host navigation system.
    helm_top = command_station("commander_helm_console", HELM_X, HELM_Z, 3.20, 1.05)
    helm_panel = fascia("commander_helm_fascia", HELM_X, HELM_Z - 0.55, 2.72, 0.58, helm_top)
    on_fascia("commander_autopilot_display", helm_panel, -0.78, 0.00, (1.05, 0.38, 0.04), "screen")
    on_fascia("commander_conning_display", helm_panel, 0.78, 0.00, (1.05, 0.38, 0.04), "screen")
    on_fascia("commander_helm_mode_row", helm_panel, 0.00, 0.24, (2.36, 0.07, 0.03), "neon_amber")

    COMMANDER_AXIS = math.pi / 2 - 0.26
    wheel_x, wheel_y, wheel_z = HELM_X, 1.34, HELM_Z + 0.18
    cylinder("commander_helm_wheel", 0.42, 0.07, (wheel_x, wheel_y, wheel_z), mats["brass"], 20,
             (COMMANDER_AXIS, 0.0, 0.0))
    cylinder("commander_helm_hub", 0.10, 0.16, (wheel_x, wheel_y, wheel_z), mats["steel"], 12,
             (COMMANDER_AXIS, 0.0, 0.0))
    cube("commander_helm_spoke_across", (0.78, 0.06, 0.06), (wheel_x, wheel_y, wheel_z), mats["brass"], 0.0,
         (COMMANDER_AXIS, 0.0, 0.0))
    cube("commander_helm_spoke_up", (0.06, 0.78, 0.06), (wheel_x, wheel_y, wheel_z), mats["brass"], 0.0,
         (COMMANDER_AXIS, 0.0, 0.0))
    for index in range(3):
        angle = index / 3 * math.tau
        cylinder(
            f"commander_helm_grip_{index}",
            0.04,
            0.12,
            (wheel_x + math.cos(angle) * 0.34, wheel_y + math.sin(angle) * 0.34 * math.sin(COMMANDER_AXIS),
             wheel_z - math.sin(angle) * 0.34 * math.cos(COMMANDER_AXIS)),
            mats["brass"],
            8,
            (COMMANDER_AXIS, 0.0, 0.0),
        )
    cube("commander_telegraph_base", (0.34, 0.05, 0.48), (1.02, 1.06, HELM_Z + 0.02), mats["brass"], 0.0)
    cylinder("commander_telegraph_lever", 0.05, 0.34, (1.02, 1.24, HELM_Z + 0.02), mats["steel"], 8,
             (0.5, 0.0, 0.0))
    cube("commander_telegraph_handle", (0.18, 0.13, 0.20), (1.02, 1.40, HELM_Z - 0.04), mats["orange"], 0.03)

    # Port navigation station: chart table, plotted route and paper controls.
    port_top = command_station("bridge_nav_port_console", -4.45, HELM_Z, 3.20)
    port_panel = fascia("bridge_nav_port_fascia", -4.45, HELM_Z - 0.55, 2.82, 0.60, port_top)
    on_fascia("bridge_nav_port_chart_display", port_panel, -0.55, 0.00, (1.18, 0.42, 0.04), "screen")
    on_fascia("bridge_nav_port_control_display", port_panel, 0.72, 0.00, (1.18, 0.42, 0.04), "screen")
    for index in range(5):
        on_fascia(f"bridge_nav_port_key_{index}", port_panel, -0.92 + index * 0.46, 0.23,
                  (0.28, 0.04, 0.02), "neon_cyan" if index % 2 else "neon_pink")
    cube("bridge_chart_tabletop", (2.76, 0.10, 1.12), (-4.45, 1.08, HELM_Z), mats["wood"], 0.02)
    cube("bridge_chart_surface", (2.42, 0.03, 0.86), (-4.45, 1.15, HELM_Z - 0.02), mats["screen"], 0.0)
    for index in range(4):
        cube(f"bridge_chart_grid_{index}", (2.12, 0.02, 0.025), (-4.45, 1.18, HELM_Z - 0.30 + index * 0.20),
             mats["neon_cyan"], 0.0)
    cube("bridge_chart_route", (1.62, 0.025, 0.04), (-4.20, 1.20, HELM_Z - 0.04), mats["neon_pink"], 0.0)
    cube("bridge_chart_parallel_rule", (0.86, 0.04, 0.10), (-5.10, 1.21, HELM_Z + 0.26), mats["brass"], 0.0)

    # Starboard navigation station: unmistakable circular radar scope and sweep.
    stbd_top = command_station("bridge_nav_stbd_console", 4.45, HELM_Z, 3.20)
    stbd_panel = fascia("bridge_nav_stbd_fascia", 4.45, HELM_Z - 0.55, 2.82, 0.60, stbd_top)
    on_fascia("bridge_nav_stbd_control_display", stbd_panel, -0.72, 0.00, (1.18, 0.42, 0.04), "screen")
    on_fascia("bridge_nav_stbd_radar_status", stbd_panel, 0.62, 0.00, (1.18, 0.42, 0.04), "screen")
    for index in range(5):
        on_fascia(f"bridge_nav_stbd_key_{index}", stbd_panel, -0.92 + index * 0.46, 0.23,
                  (0.28, 0.04, 0.02), "neon_amber" if index % 2 else "neon_cyan")
    cylinder("bridge_radar_bezel", 0.50, 0.08, (4.45, 1.48, HELM_Z - 0.58), mats["steel"], 28,
             (math.pi / 2, 0.0, 0.0))
    cylinder("bridge_radar_screen", 0.42, 0.04, (4.45, 1.49, HELM_Z - 0.64), mats["screen"], 28,
             (math.pi / 2, 0.0, 0.0))
    cube("bridge_radar_sweep", (0.035, 0.035, 0.62), (4.45, 1.52, HELM_Z - 0.64), mats["neon_pink"], 0.0)
    for index in range(3):
        cylinder(f"bridge_radar_ring_{index}", 0.14 + index * 0.10, 0.02, (4.45, 1.53, HELM_Z - 0.66),
                 mats["neon_cyan"], 24, (math.pi / 2, 0.0, 0.0))

    # Engineering/control station and emergency panel, kept on starboard side
    # so it reads as a second watch position rather than scenery in the lane.
    control_top = command_station("bridge_control_console", 8.00, HELM_Z, 2.60)
    control_panel = fascia("bridge_control_fascia", 8.00, HELM_Z - 0.55, 2.22, 0.62, control_top)
    on_fascia("bridge_control_display", control_panel, 0.00, 0.00, (1.72, 0.42, 0.04), "screen")
    for index in range(6):
        on_fascia(f"bridge_control_key_{index}", control_panel, -0.82 + index * 0.33, 0.25,
                  (0.22, 0.05, 0.02), "neon_amber" if index % 3 else "neon_pink")
    cube("bridge_emergency_panel", (2.18, 0.64, 0.08), (8.00, 1.48, HELM_Z - 0.60), mats["coral"], 0.02)
    for index in range(4):
        cube(f"bridge_emergency_button_{index}", (0.24, 0.12, 0.20),
             (7.30 + index * 0.46, 1.60, HELM_Z - 0.64), mats["orange" if index % 2 else "neon_amber"], 0.02)

    def work_chair(name, x, z, mat="coral"):
        cylinder(f"{name}_base", 0.36, 0.07, (x, 0.04, z), mats["steel"], 12)
        cylinder(f"{name}_stem", 0.09, 0.62, (x, 0.37, z), mats["steel"], 10)
        cube(f"{name}_seat", (0.72, 0.14, 0.68), (x, 0.72, z), mats[mat], 0.04)
        cube(f"{name}_back", (0.72, 0.78, 0.12), (x, 1.13, z + 0.30), mats[mat], 0.04)
        for side, sx in (("p", -1), ("s", 1)):
            cube(f"{name}_arm_{side}", (0.09, 0.07, 0.48), (x + sx * 0.38, 1.00, z), mats["trim"], 0.02)

    work_chair("captain_chair", 0.0, 0.92)
    work_chair("crew_chair_port", -4.45, 0.84)
    work_chair("crew_chair_stbd", 4.45, 0.84)

    # Semantic nodes remain as empties through material joining and glTF export.
    # Runtime can bind by name/metadata without depending on merged draw meshes.
    for name in ("BRIDGE_COMMANDER_ROOM", "BRIDGE_CONTROL_ROOM"):
        bridge_socket(name, (0.0, 0.0, HELM_Z), "bridge-control-room", "room")
    for name in ("BRIDGE_HELM", "BRIDGE_HELM_SOCKET", "BRIDGE_HELM_INTERACTION_SOCKET", "bridge-helm"):
        bridge_socket(name, (HELM_X, 1.10, HELM_Z), "bridge-helm", "interaction")
    bridge_socket("BRIDGE_TELEGRAPH_SOCKET", (1.02, 1.18, HELM_Z), "bridge-telegraph", "interaction")
    bridge_socket("BRIDGE_CHART_SOCKET", (-4.45, 1.16, HELM_Z), "bridge-chart", "interaction")
    bridge_socket("BRIDGE_RADAR_SOCKET", (4.45, 1.52, HELM_Z - 0.64), "bridge-radar", "interaction")
    bridge_socket("BRIDGE_CONTROL_SOCKET", (8.00, 1.20, HELM_Z), "bridge-control", "interaction")
    bridge_socket("BRIDGE_EMERGENCY_PANEL_SOCKET", (8.00, 1.58, HELM_Z - 0.64), "bridge-emergency-panel", "interaction")
    bridge_socket("BRIDGE_CAPTAIN_WORK_POSITION", (0.0, 0.0, 0.92), "captain", "work-position")
    bridge_socket("BRIDGE_CREW_PORT_WORK_POSITION", (-4.45, 0.0, 0.84), "crew-port", "work-position")
    bridge_socket("BRIDGE_CREW_STBD_WORK_POSITION", (4.45, 0.0, 0.84), "crew-stbd", "work-position")

    # --- lighting -----------------------------------------------------------
    for index, x in enumerate(grid(8, 23.0)):
        cube(f"bridge_light_{index}", (1.30, 0.06, 0.46), (x, 3.36, 1.20), mats["screen"], 0.0)
        cube(f"bridge_night_light_{index}", (1.30, 0.06, 0.30), (x, 3.36, -3.40),
             mats["neon_pink"], 0.0)


# ---------------------------------------------------------------------------
# Stair towers
# ---------------------------------------------------------------------------


def tower_landings(size):
    """Landing heights, mirroring `stairLandings` in src/sim/compartment-space.ts.

    One landing on every deck the shaft passes, from its own sole up to a deck
    below its deckhead — not only the decks with a door on them. That is what
    makes every flight identical, and it is the reason one flight of treads
    serves all three towers.
    """
    levels = int((size[1] - 1e-6) // DECK_PITCH) + 1
    return [level * DECK_PITCH for level in range(levels)]


# Seven-segment strokes as (across, up, is_horizontal), in units of half the
# numeral's inner extent. `across` is +1 towards the numeral's own right.
SEGMENTS = {
    "a": (0.0, 1.0, True), "g": (0.0, 0.0, True), "d": (0.0, -1.0, True),
    "f": (-1.0, 0.5, False), "b": (1.0, 0.5, False),
    "e": (-1.0, -0.5, False), "c": (1.0, -0.5, False),
}
DIGIT_SEGMENTS = {
    0: "abcdef", 1: "bc", 2: "abged", 3: "abgcd", 4: "fgbc",
    5: "afgcd", 6: "afgecd", 7: "abc", 8: "abcdefg", 9: "abgfcd",
}


def seven_segment(mats, name, digit, centre, width, height, normal,
                  mat="neon_amber", depth=0.06):
    """A deck number drawn as strokes rather than as one blank lit square.

    `normal` is the axis the numeral faces along, so the same call works on an
    x-normal bulkhead and on a z-normal one without a second set of constants.
    """
    cx, cy, cz = centre
    thick = min(width, height) * 0.16
    for key in DIGIT_SEGMENTS[digit]:
        across, up, horizontal = SEGMENTS[key]
        extent = (width - thick) if horizontal else thick
        rise = thick if horizontal else (height - thick) / 2
        y = cy + up * (height - thick) / 2
        offset = across * (width - thick) / 2
        if normal == "x":
            cube(f"{name}_{key}", (depth, rise, extent), (cx, y, cz + offset), mats[mat], 0.0)
        else:
            cube(f"{name}_{key}", (extent, rise, depth), (cx + offset, y, cz), mats[mat], 0.0)


def _tower_doors(portals, size, level):
    """The doors on one landing, as `(side, coordinate along that wall)`.

    Classified the same way `kit.shell` classifies them, so the dressing lands
    on the same wall the opening was cut in.
    """
    half_x, half_z = size[0] / 2, size[2] / 2
    found = []
    for entry in portals:
        px, py, pz = entry["position"]
        if abs(py - level) > 1e-6:
            continue
        if pz >= half_z - 0.5:
            found.append(("fore", px))
        elif pz <= -half_z + 0.5:
            found.append(("aft", px))
        elif px <= -half_x + 0.5:
            found.append(("port", pz))
        else:
            found.append(("starboard", pz))
    return found


def tower_dressing(mats, size, landings, portals, base_deck):
    """What makes a shaft feel used, and — more to the point — legible.

    Every landing says which deck it is twice, once on the port wall you face
    while climbing and once on the aft bulkhead you face when you step off the
    flight, and a landing with no door says so instead of looking like one you
    failed to open. Nothing here is placed against a hand-copied constant: the
    walls are `half - 0.07` because that is where `kit.shell` centres a 0.14
    band, the deckhead is the next landing's plate underside, and the stair
    side of the room is left clear because the treads are already there.
    """
    width, height, length = size
    half_x, half_z = width / 2, length / 2
    face_x, face_z = half_x - 0.07, half_z - 0.07
    well_x0 = kit.WELL_CENTRE_X - kit.WELL_HALF_X
    well_z0 = kit.SWITCHBACK_HALF_Z - kit.CLIMB_RUN_Z
    run = kit.CLIMB_RUN_Z / 16

    for index, level in enumerate(landings):
        deck = base_deck + index
        doors = _tower_doors(portals, size, level)
        # The plate overhead is the next landing's, except at the top of the
        # shaft where it is the deckhead `kit.shell` drew at `height`.
        ceiling = landings[index + 1] - 0.12 if index + 1 < len(landings) else height

        # Floor: a spine down the middle and one arm to each side wall, laid
        # out so no two pieces share a surface and none of it runs under the
        # well rail's posts or out over the void.
        for tag, x0, x1, z0, z1 in (
            ("spine", -1.10, 1.10, -face_z + 0.26, face_z - 0.23),
            ("port", -face_x + 0.26, -1.10, -1.10, 0.85),
            ("starboard", 1.10, face_x - 0.26, -1.10, 0.85),
            ("stair", 1.10, well_x0 - 0.05, well_z0 + 3.60, face_z - 0.23),
        ):
            cube(f"landing_floor_{index}_{tag}", (x1 - x0, 0.02, z1 - z0),
                 ((x0 + x1) / 2, level + 0.015, (z0 + z1) / 2), mats["carpet"], 0.0)

        # Brass nosings on the flight above, inset clear of the well rail.
        if index + 1 < len(landings):
            rise = (landings[index + 1] - level) / 16
            for tread in range(16):
                cube(f"tread_nose_{index}_{tread}", (2.20, 0.03, 0.08),
                     (kit.WELL_CENTRE_X, level + rise * (tread + 1) + 0.015,
                      half_z - run * tread - 0.04), mats["brass"], 0.0)

        # Handrail down the port wall, broken for any door in that wall.
        port_doors = [at for side, at in doors if side == "port"]
        for part, (start, end) in enumerate(
                wall_segments(-face_z + 0.33, face_z - 0.33, port_doors, 1.90)):
            cube(f"handrail_{index}_{part}", (0.06, 0.06, end - start),
                 (-5.35, level + 1.00, (start + end) / 2), mats["brass"], 0.0)
            brackets = max(2, int((end - start) / 1.8) + 1)
            for bracket in range(brackets):
                at = start + (end - start) * bracket / (brackets - 1)
                cube(f"handrail_bracket_{index}_{part}_{bracket}", (0.16, 0.06, 0.06),
                     (-5.35, level + 0.94, at), mats["brass"], 0.0)

        # Deck identity, port wall: a board with a colour band and the numeral.
        cube(f"deck_board_{index}", (0.05, 1.60, 1.30), (-face_x + 0.025, level + 2.05, -3.70),
             mats["bulkhead"], 0.0)
        cube(f"deck_band_{index}", (0.04, 0.26, 1.30), (-5.36, level + 2.72, -3.70),
             mats["teal"], 0.0)
        seven_segment(mats, f"deck_numeral_port_{index}", deck % 10,
                      (-5.35, level + 1.90, -3.70), 0.62, 1.00, "x")

        # Deck identity again on the aft bulkhead, which is what you are looking
        # at the moment you arrive off the flight.
        cube(f"deck_plate_{index}", (1.00, 1.40, 0.05), (3.00, level + 1.85, -face_z + 0.025),
             mats["bulkhead"], 0.0)
        seven_segment(mats, f"deck_numeral_aft_{index}", deck % 10,
                      (3.00, level + 1.85, -5.85), 0.62, 1.00, "z")
        cube(f"deck_plate_band_{index}", (0.86, 0.14, 0.04), (3.00, level + 2.42, -5.86),
             mats["teal"], 0.0)

        # Luminaires hung off whatever is actually overhead.
        for tag, at in (("aft", -2.60), ("fwd", 3.20)):
            cube(f"luminaire_{index}_{tag}", (1.60, 0.08, 0.70), (0.0, ceiling - 0.04, at),
                 mats["steel"], 0.0)
            cube(f"luminaire_lens_{index}_{tag}", (1.40, 0.04, 0.50), (0.0, ceiling - 0.10, at),
                 mats["screen"], 0.0)

        # Doors: a lit threshold strip and a sign, on the wall the door is in.
        for side, at in doors:
            if side in ("aft", "fore"):
                edge = -1 if side == "aft" else 1
                cube(f"threshold_{index}_{side}", (1.60, 0.03, 0.26),
                     (at, level + 0.025, edge * (face_z - 0.13)), mats["neon_cyan"], 0.0)
                cube(f"door_sign_{index}_{side}", (0.90, 0.30, 0.05),
                     (at, level + 2.35, edge * (face_z - 0.025)), mats["neon_cyan"], 0.0)
            else:
                edge = -1 if side == "port" else 1
                cube(f"threshold_{index}_{side}", (0.26, 0.03, 1.60),
                     (edge * (face_x - 0.13), level + 0.025, at), mats["neon_cyan"], 0.0)
                cube(f"door_sign_{index}_{side}", (0.05, 0.30, 0.90),
                     (edge * (face_x - 0.025), level + 2.35, at), mats["neon_cyan"], 0.0)

        if doors:
            # A bench only where somebody has a reason to wait.
            bench(mats, f"landing_bench_{index}", -4.96, -3.70, level, 1.60, "z", "wood", -1)
        else:
            cube(f"no_exit_plate_{index}", (1.30, 0.50, 0.05),
                 (0.0, level + 1.70, -face_z + 0.025), mats["trim"], 0.0)
            cube(f"no_exit_bar_{index}", (1.10, 0.12, 0.02), (0.0, level + 1.70, -5.87),
                 mats["coral"], 0.0)

        # Notice board and a bin, forward of the cross, clear of the well.
        cube(f"notice_board_{index}", (0.05, 0.90, 1.20), (-face_x + 0.025, level + 1.90, 3.40),
             mats["trim"], 0.0)
        for row in range(2):
            for column in range(3):
                cube(f"notice_sheet_{index}_{row}_{column}", (0.02, 0.28, 0.22),
                     (-5.37, level + 1.90 + (0.5 - row) * 0.34, 3.40 + (column - 1) * 0.36),
                     mats["bulkhead"], 0.0)
        cylinder(f"waste_bin_{index}", 0.22, 0.66, (-4.60, level + 0.33, 4.60), mats["steel"], 12)
        cylinder(f"waste_lid_{index}", 0.24, 0.06, (-4.60, level + 0.69, 4.60), mats["trim"], 12)

        # Fire station: board, shelf, bottle and a strap that actually reaches
        # around it — the old one hung 0.2 clear of the wall on nothing.
        if index % 3 == 0:
            cube(f"fire_board_{index}", (0.05, 1.10, 0.70), (face_x - 0.025, level + 0.70, -3.50),
                 mats["coral"], 0.0)
            cube(f"fire_shelf_{index}", (0.30, 0.05, 0.34), (5.23, level + 0.30, -3.50),
                 mats["steel"], 0.0)
            cylinder(f"fire_bottle_{index}", 0.13, 0.62, (5.25, level + 0.635, -3.50),
                     mats["coral"], 12)
            for edge in (-1, 1):
                cube(f"fire_strap_{index}_{edge}", (0.31, 0.06, 0.05),
                     (5.225, level + 0.90, -3.50 + edge * 0.165), mats["steel"], 0.0)
            cube(f"fire_strap_face_{index}", (0.05, 0.06, 0.38), (5.095, level + 0.90, -3.50),
                 mats["steel"], 0.0)
            cube(f"fire_plan_{index}", (0.90, 0.66, 0.05), (-3.20, level + 1.75, -face_z + 0.025),
                 mats["bulkhead"], 0.0)
            cube(f"fire_plan_face_{index}", (0.80, 0.56, 0.02), (-3.20, level + 1.75, -5.87),
                 mats["screen"], 0.0)


# ---------------------------------------------------------------------------
# The table — a copy of src/data/ship-layout.ts
# ---------------------------------------------------------------------------

ROOMS = [
    ("engine-room", 0, build_engine_room, [portal("stairwell-aft", 0, 0, 22)]),
    ("crew-corridor", 1, build_crew_corridor,
     [portal("stairwell-aft", 0, 0, -23), portal("stairwell-mid", 0, 0, 23)]),
    ("main-galley", 2, build_main_galley, [portal("stairwell-aft", 0, 0, 16)]),
    ("atrium", 2, build_atrium,
     [portal("stairwell-aft", 0, 0, -23), portal("stairwell-mid", 0, 0, 23)]),
    ("dining-room", 2, build_dining_room, [portal("stairwell-mid", 0, 0, -22)]),
    ("cabin-deck-four", 4, build_cabin_deck_four, [portal("stairwell-aft", 0, 0, 30)]),
    ("promenade", 5, build_promenade,
     [portal("stairwell-aft", -5.5, 0, -15), portal("stairwell-mid", -5.5, 0, 43),
      portal("stairwell-fwd", -5.5, 0, 84)]),
    ("cabin-deck-seven", 7, build_cabin_deck_seven,
     [portal("stairwell-mid", 0, 0, -14.5), portal("stairwell-fwd", 0, 0, 14.5)]),
    ("pool-deck", 8, build_pool_deck,
     [portal("stairwell-aft", 5.5, 0, -4.5), portal("stairwell-mid", 5.5, 0, 53.5)]),
    ("sun-deck", 9, build_sun_deck, [portal("stairwell-aft", 0, 0, 37)]),
    ("bridge", 9, build_bridge, [portal("stairwell-fwd", 0, 0, -6)]),
]

TOWERS = [
    ("stairwell-aft", 0, (11, 32, 12), [
        portal("engine-room", 0, 0, -6),
        portal("crew-corridor", 0, 3.2, 6),
        portal("main-galley", 0, 6.4, -6),
        portal("atrium", 0, 6.4, 6),
        portal("cabin-deck-four", 0, 12.8, -6),
        portal("promenade", -5.5, 16, 0),
        portal("pool-deck", 5.5, 25.6, 0),
        portal("sun-deck", 0, 28.8, -6),
    ]),
    ("stairwell-mid", 1, (11, 28.8, 12), [
        portal("crew-corridor", 0, 0, -6),
        portal("atrium", 0, 3.2, -6),
        portal("dining-room", 0, 3.2, 6),
        portal("promenade", -5.5, 12.8, 0),
        portal("cabin-deck-seven", 0, 19.2, 6),
        portal("pool-deck", 5.5, 22.4, 0),
    ]),
    ("stairwell-fwd", 5, (11, 16, 12), [
        portal("promenade", -5.5, 0, 0),
        portal("cabin-deck-seven", 0, 6.4, -6),
        portal("bridge", 0, 12.8, 6),
    ]),
]


def main():
    print("Building MS Cabin Mayhem compartments")
    total = 0
    for compartment_id, deck, builder, portals in ROOMS:
        kit.new_scene()
        mats = kit.build_materials()
        root = kit.compartment_root(compartment_id, deck)
        builder(mats)
        total += kit.export(compartment_id, root, portals)[1]

    for compartment_id, deck, size, portals in TOWERS:
        kit.new_scene()
        mats = kit.build_materials()
        root = kit.compartment_root(compartment_id, deck)
        landings = tower_landings(size)
        kit.stair_tower(mats, size, portals, landings)
        tower_dressing(mats, size, landings, portals, deck)
        total += kit.export(compartment_id, root, portals)[1]

    print(f"Done: {len(ROOMS) + len(TOWERS)} compartments, {total / 1048576:.2f} MB total")


if __name__ == "__main__":
    main()
