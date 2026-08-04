"""Build the greybox-plus compartment set for MS Cabin Mayhem.

Four compartments, one GLB each, deterministic from source:

  atrium            Deck 2, the public heart and the compartment the crew wakes in
  cabin-corridor-a  Deck 1, guest cabins port and starboard
  bridge            Deck 4, the helm
  engine-room       Deck 0, propulsion

Run with Blender 5.x:
  blender --background --python tools/blender/compartments/build_compartments.py

Every compartment is authored about its own floor centre, matching the `size`
and `portals` declared in src/data/ship-layout.ts. Those two files must agree;
`pnpm validate:assets` fails the build if they drift.
"""

from pathlib import Path
import math
import sys

# Blender does not put the script's own directory on sys.path.
sys.path.insert(0, str(Path(__file__).resolve().parent))

import kit  # noqa: E402


# ---------------------------------------------------------------------------
# Atrium — Deck 2
#
# The footprint is deliberately the simulation's cabin volume: 8 m by 18 m,
# double height. Lounge seating sits at exactly the coordinates the passenger
# avatars already occupy, so guests keep their seats when the shell changes.
# ---------------------------------------------------------------------------

ATRIUM_SIZE = (8.0, 6.4, 18.0)
ATRIUM_PORTALS = [
    {"target": "cabin-corridor-a", "position": (0.0, 0.0, -9.0)},
    {"target": "bridge", "position": (0.0, 0.0, 9.0)},
]
# The eight guests the simulation seats, converted from sim coordinates to the
# atrium's local frame: sim x 4.7/11.3 and sim y 7.2 + row * 2.76, through
# cabinToWorld at CABIN_SCALE 0.5, minus the atrium origin at world z 7.5.
#
# They alternate port and starboard, so an armchair at each one lands as eight
# staggered singles, never as rows. That distinction is the whole point: paired
# seats on a repeating pitch read as an aircraft cabin no matter what the room
# is called, which is exactly the mistake this layout replaces.
GUEST_ANCHORS = [(-1.65 if row % 2 == 0 else 1.65, -5.4 + row * 1.38) for row in range(8)]


def lounge_chair(mats, name, x, z, accent, yaw=0.0):
    """One armchair, facing `yaw` radians off the ship's bow."""
    turn = (0.0, 0.0, yaw)
    kit.cube(f"{name} base", (0.82, 0.24, 0.78), (x, 0.46, z), mats[accent], 0.09, turn)
    offset = (-math.sin(yaw) * 0.31, math.cos(yaw) * 0.31)
    back = kit.cube(
        f"{name} back",
        (0.84, 1.10, 0.20),
        (x + offset[0], 1.01, z + offset[1]),
        mats[accent],
        0.09,
        turn,
    )
    back.rotation_euler[0] = math.radians(-8)
    kit.cube(f"{name} cushion", (0.70, 0.10, 0.66), (x, 0.63, z), mats["coral"], 0.05, turn)
    for side in (-1, 1):
        arm = (math.cos(yaw) * side * 0.43, math.sin(yaw) * side * 0.43)
        kit.cube(f"{name} arm {side}", (0.09, 0.11, 0.70), (x + arm[0], 0.72, z + arm[1]), mats["brass"], 0.03, turn)
        kit.cylinder(f"{name} leg {side}", 0.035, 0.44, (x + arm[0] * 0.63, 0.22, z + arm[1] * 0.63), mats["brass"], 8)


def build_atrium():
    kit.new_scene()
    mats = kit.build_materials()
    root = kit.compartment_root("atrium", 2)
    kit.shell(mats, ATRIUM_SIZE, ATRIUM_PORTALS, carpet="carpet")

    # Mezzanine balconies fore and aft only. A full-length gallery down both
    # sides drew a hard horizontal line at eye level along the whole room, which
    # is the silhouette of an overhead bin run; keeping the middle open lets the
    # double height actually be seen from the deck.
    for end in (-1, 1):
        kit.cube(f"Mezzanine deck {end}", (7.6, 0.18, 3.6), (0.0, 3.2, end * 6.4), mats["wood"], 0.04)
        kit.cube(f"Mezzanine fascia {end}", (7.6, 0.90, 0.12), (0.0, 3.6, end * 4.6), mats["brass"], 0.03)
        for x in kit.grid(9, 7.2):
            kit.cylinder(f"Baluster {end} {x:.2f}", 0.035, 0.86, (x, 3.63, end * 4.6), mats["brass"], 6)

    # The stair that connects them, wrapped around the feature column. A cruise
    # atrium is a vertical room and the stair is what says so.
    for step in range(14):
        angle = kit.TAU * 0.62 * (step / 13.0) - 0.4
        radius = 1.85
        kit.cube(
            f"Stair tread {step}",
            (1.35, 0.14, 0.62),
            (math.cos(angle) * radius, 0.24 + step * 0.222, math.sin(angle) * radius),
            mats["wood"],
            0.03,
            (0.0, 0.0, -angle),
        )
        kit.cylinder(
            f"Stair post {step}",
            0.032,
            0.92,
            (math.cos(angle) * (radius + 0.62), 0.70 + step * 0.222, math.sin(angle) * (radius + 0.62)),
            mats["brass"],
            6,
        )

    # Central feature: a lit sculpture column under a skylight well.
    kit.cylinder("Feature column", 0.55, 6.2, (0.0, 3.1, 0.0), mats["steel"], 18)
    kit.cylinder("Feature glow", 0.62, 0.34, (0.0, 2.20, 0.0), mats["neon_cyan"], 18)
    kit.cylinder("Feature glow upper", 0.62, 0.34, (0.0, 4.60, 0.0), mats["neon_pink"], 18)
    kit.cube("Skylight well", (2.4, 0.10, 2.4), (0.0, 6.28, 0.0), mats["glass"], 0.02)

    # Reception counter, forward and to starboard of the column.
    kit.cube("Reception counter", (3.4, 1.05, 0.80), (1.9, 0.53, 5.6), mats["wood"], 0.06)
    kit.cube("Reception top", (3.6, 0.08, 0.96), (1.9, 1.09, 5.6), mats["trim"], 0.03)
    kit.cube("Reception sign", (2.2, 0.36, 0.06), (1.9, 2.30, 6.2), mats["neon_amber"], 0.02)
    for index, x in enumerate(kit.grid(3, 3.0)):
        kit.cube(f"Reception terminal {index}", (0.42, 0.30, 0.06), (1.9 + x, 1.32, 5.8), mats["screen"], 0.02)
        kit.cube(f"Reception stool {index}", (0.36, 0.62, 0.36), (1.9 + x, 0.31, 4.9), mats["teal"], 0.05)

    # Guest seating: one armchair per seated passenger, angled inboard towards
    # the column so the room reads as a lounge rather than a seating plan, plus
    # a companion chair and a café table to break the spacing up further.
    for index, (x, z) in enumerate(GUEST_ANCHORS):
        inboard = math.radians(-28.0 if x < 0 else 28.0)
        accent = "teal" if index % 2 == 0 else "coral"
        lounge_chair(mats, f"Guest chair {index}", x, z, accent, inboard)
        kit.cylinder(f"Cafe table {index}", 0.34, 0.06, (x * 1.55, 0.72, z + 0.55), mats["trim"], 12)
        kit.cylinder(f"Cafe stem {index}", 0.06, 0.70, (x * 1.55, 0.35, z + 0.55), mats["brass"], 8)
        if index % 2 == 0:
            lounge_chair(
                mats,
                f"Companion chair {index}",
                x * 1.9,
                z + 1.05,
                "coral" if accent == "teal" else "teal",
                math.radians(196.0 if x < 0 else 164.0),
            )
        else:
            kit.cylinder(f"Planter {index}", 0.28, 0.56, (x * 1.95, 0.28, z - 0.7), mats["brass"], 10)
            kit.cylinder(f"Planter foliage {index}", 0.42, 0.60, (x * 1.95, 0.86, z - 0.7), mats["teal"], 8)

    # A grand piano block and the bar it plays to: the two props that say cruise
    # atrium at a glance and cost two draw meshes between them.
    kit.cube("Piano body", (1.9, 0.32, 1.35), (-2.3, 0.86, 2.6), mats["trim"], 0.08, (0.0, 0.0, math.radians(18)))
    kit.cube("Piano lid", (1.7, 0.06, 1.15), (-2.3, 1.28, 2.75), mats["wood"], 0.04, (0.0, 0.0, math.radians(18)))
    for leg in ((-0.7, -0.4), (0.7, -0.4), (0.0, 0.55)):
        kit.cylinder(f"Piano leg {leg[0]:.1f}", 0.05, 0.70, (-2.3 + leg[0], 0.35, 2.6 + leg[1]), mats["brass"], 6)
    kit.cube("Bar counter", (0.9, 1.12, 4.6), (-3.35, 0.56, -2.2), mats["wood"], 0.06)
    kit.cube("Bar top", (1.06, 0.08, 4.8), (-3.35, 1.16, -2.2), mats["trim"], 0.03)
    kit.cube("Bar backlight", (0.06, 1.90, 4.4), (-3.92, 2.10, -2.2), mats["neon_pink"], 0.02)
    for index, z in enumerate(kit.grid(5, 4.2)):
        kit.cylinder(f"Bar stool {index}", 0.22, 0.72, (-2.55, 0.36, -2.2 + z), mats["teal"], 10)
        kit.cube(f"Bottle shelf {index}", (0.18, 0.06, 0.70), (-3.86, 1.60 + (index % 2) * 0.42, -2.2 + z), mats["glass"], 0.01)

    # Signage, lighting and wear: life that costs nothing per frame.
    for z in kit.grid(6, 16.0):
        for side in (-1, 1):
            kit.cube(f"Wall sconce {side} {z:.2f}", (0.10, 0.44, 0.16), (side * 3.92, 2.30, z), mats["neon_amber"], 0.02)
        kit.cube(f"Deckhead light {z:.2f}", (1.20, 0.06, 0.24), (0.0, 6.30, z), mats["neon_cyan"], 0.02)
    for index, z in enumerate(kit.grid(4, 14.0)):
        kit.cube(f"Deck sign {index}", (0.06, 0.30, 0.90), (-3.92, 2.90, z), mats["screen"], 0.02)
    kit.cube("Luggage trolley", (0.70, 0.14, 1.10), (-2.6, 0.62, 7.2), mats["steel"], 0.04)
    for index in range(4):
        kit.cube(f"Suitcase {index}", (0.44, 0.62, 0.26), (-2.6, 0.35 + index * 0.10, 6.6 + index * 0.30), mats["coral"], 0.05)
    kit.cube("Notice board", (1.40, 0.90, 0.08), (3.92, 1.90, -6.0), mats["trim"], 0.03)
    kit.cube("Notice glow", (1.20, 0.70, 0.03), (3.86, 1.90, -6.0), mats["screen"], 0.01)

    kit.export("atrium", root, ATRIUM_PORTALS)


# ---------------------------------------------------------------------------
# Cabin corridor A — Deck 1
# ---------------------------------------------------------------------------

CORRIDOR_SIZE = (3.0, 2.8, 24.0)
CORRIDOR_PORTALS = [
    {"target": "atrium", "position": (0.0, 0.0, 12.0)},
    {"target": "engine-room", "position": (0.0, 0.0, -12.0)},
]


def build_corridor():
    kit.new_scene()
    mats = kit.build_materials()
    root = kit.compartment_root("cabin-corridor-a", 1)
    kit.shell(mats, CORRIDOR_SIZE, CORRIDOR_PORTALS, carpet="carpet")

    # Sixteen cabin doors, eight per side. The corridor's whole job is to feel
    # long and repetitive, so the repetition is the content.
    for index, z in enumerate(kit.grid(8, 22.0)):
        for side in (-1, 1):
            tag = "P" if side < 0 else "S"
            kit.cube(f"Door {tag}{index}", (0.06, 2.05, 0.86), (side * 1.44, 1.02, z), mats["wood"], 0.02)
            kit.cube(f"Door frame {tag}{index}", (0.04, 2.16, 1.00), (side * 1.47, 1.08, z), mats["trim"], 0.02)
            kit.cylinder(f"Door handle {tag}{index}", 0.035, 0.14, (side * 1.38, 1.02, z + 0.30), mats["brass"], 8, (0.0, math.pi / 2, 0.0))
            kit.cube(f"Cabin number {tag}{index}", (0.03, 0.14, 0.22), (side * 1.40, 1.72, z - 0.52), mats["neon_cyan"], 0.01)
            kit.cube(f"Reader {tag}{index}", (0.03, 0.10, 0.08), (side * 1.40, 1.20, z - 0.50), mats["screen"], 0.01)

    # Deckhead services and floor wear.
    for index, z in enumerate(kit.grid(12, 23.0)):
        kit.cube(f"Deckhead strip {index}", (0.70, 0.05, 0.20), (0.0, 2.74, z), mats["neon_amber"], 0.01)
    for side in (-1, 1):
        kit.cube(f"Handrail {side}", (0.06, 0.06, 22.5), (side * 1.36, 0.92, 0.0), mats["brass"], 0.02)
        kit.cube(f"Skirting {side}", (0.05, 0.14, 23.6), (side * 1.44, 0.07, 0.0), mats["trim"], 0.01)
        kit.cylinder(f"Conduit {side}", 0.07, 23.0, (side * 1.20, 2.58, 0.0), mats["steel"], 8, (math.pi / 2, 0.0, 0.0))

    # Housekeeping clutter: the corridor is worked in, not just walked through.
    kit.cube("Housekeeping cart", (0.66, 0.98, 1.10), (0.9, 0.49, 3.4), mats["steel"], 0.05)
    kit.cube("Linen stack", (0.54, 0.36, 0.86), (0.9, 1.16, 3.4), mats["bulkhead"], 0.05)
    for index in range(3):
        kit.cube(f"Room tray {index}", (0.52, 0.06, 0.40), (-1.10, 0.05, -2.0 - index * 4.0), mats["steel"], 0.02)
        kit.cylinder(f"Tray cloche {index}", 0.16, 0.14, (-1.10, 0.14, -2.0 - index * 4.0), mats["bulkhead"], 10)
    kit.cube("Fire station", (0.10, 0.70, 0.44), (1.42, 1.30, -8.5), mats["coral"], 0.03)
    kit.cube("Muster notice", (0.03, 0.36, 0.50), (-1.44, 1.60, 8.5), mats["screen"], 0.01)

    kit.export("cabin-corridor-a", root, CORRIDOR_PORTALS)


# ---------------------------------------------------------------------------
# Bridge — Deck 4. The helm. Positional authority lands here next slice, so the
# console is authored at the centreline where the helm volume will be.
# ---------------------------------------------------------------------------

BRIDGE_SIZE = (14.0, 3.0, 7.0)
BRIDGE_PORTALS = [{"target": "atrium", "position": (0.0, 0.0, -3.5)}]


def build_bridge():
    kit.new_scene()
    mats = kit.build_materials()
    root = kit.compartment_root("bridge", 4)
    kit.shell(mats, BRIDGE_SIZE, BRIDGE_PORTALS, carpet="deck")

    # Forward window band. The bridge is the one room whose entire point is what
    # you can see out of it.
    for index, x in enumerate(kit.grid(9, 13.4)):
        kit.cube(f"Window {index}", (1.34, 1.50, 0.06), (x, 1.85, 3.46), mats["glass"], 0.0)
        kit.cube(f"Window mullion {index}", (0.10, 1.62, 0.10), (x + 0.74, 1.85, 3.44), mats["trim"], 0.02)
    kit.cube("Window sill", (13.6, 0.16, 0.34), (0.0, 1.05, 3.36), mats["trim"], 0.03)

    # Helm console at the centreline.
    kit.cube("Helm console", (2.60, 1.02, 1.10), (0.0, 0.51, 1.90), mats["trim"], 0.06)
    kit.cube("Helm console top", (2.76, 0.08, 1.24), (0.0, 1.06, 1.90), mats["steel"], 0.03)
    kit.cylinder("Helm wheel hub", 0.12, 0.20, (0.0, 1.32, 1.44), mats["brass"], 12, (math.pi / 2, 0.0, 0.0))
    for spoke in range(6):
        angle = spoke * math.tau / 6
        kit.cube(
            f"Helm spoke {spoke}",
            (0.06, 0.62, 0.06),
            (math.sin(angle) * 0.0, 1.32, 1.44),
            mats["brass"],
            0.01,
            (0.0, 0.0, angle),
        )
    for index, x in enumerate(kit.grid(5, 2.4)):
        kit.cube(f"Helm screen {index}", (0.40, 0.28, 0.04), (x, 1.34, 2.28), mats["screen"], 0.01)
    kit.cube("Telegraph base", (0.30, 0.90, 0.30), (1.70, 0.45, 1.60), mats["steel"], 0.04)
    kit.cylinder("Telegraph dial", 0.22, 0.10, (1.70, 1.00, 1.60), mats["brass"], 14, (math.pi / 2, 0.0, 0.0))
    kit.cube("Throttle quadrant", (0.44, 0.16, 0.40), (-1.70, 1.10, 1.70), mats["trim"], 0.03)
    for index in range(2):
        kit.cylinder(f"Throttle lever {index}", 0.03, 0.40, (-1.82 + index * 0.24, 1.32, 1.70), mats["coral"], 8)

    # Radar and chart stations along the aft bulkhead.
    for index, x in enumerate((-5.0, -3.2, 3.2, 5.0)):
        kit.cube(f"Console {index}", (1.40, 1.00, 0.70), (x, 0.50, -2.60), mats["trim"], 0.05)
        kit.cube(f"Console face {index}", (1.20, 0.60, 0.05), (x, 1.42, -2.72), mats["screen"], 0.02)
        kit.cube(f"Console hood {index}", (1.44, 0.10, 0.60), (x, 1.78, -2.64), mats["steel"], 0.02)
    kit.cube("Chart table", (2.20, 0.92, 1.20), (0.0, 0.46, -2.20), mats["wood"], 0.05)
    kit.cube("Chart surface", (2.30, 0.06, 1.30), (0.0, 0.95, -2.20), mats["bulkhead"], 0.02)
    kit.cube("Chart lamp", (0.60, 0.06, 0.20), (0.0, 1.90, -2.20), mats["neon_amber"], 0.02)

    # Alarm and signage.
    for side in (-1, 1):
        kit.cube(f"Alarm beacon {side}", (0.22, 0.22, 0.22), (side * 6.4, 2.70, 0.0), mats["neon_pink"], 0.04)
        kit.cube(f"Bridge wing door {side}", (0.06, 2.05, 0.86), (side * 6.94, 1.02, 1.0), mats["trim"], 0.02)
        kit.cube(f"Pilot chair {side}", (0.60, 0.50, 0.60), (side * 1.35, 0.55, 0.60), mats["teal"], 0.06)
        kit.cylinder(f"Pilot chair post {side}", 0.07, 0.56, (side * 1.35, 0.28, 0.60), mats["steel"], 8)
    for index, x in enumerate(kit.grid(6, 12.0)):
        kit.cube(f"Deckhead panel {index}", (1.30, 0.05, 0.30), (x, 2.94, 0.0), mats["neon_cyan"], 0.01)

    kit.export("bridge", root, BRIDGE_PORTALS)


# ---------------------------------------------------------------------------
# Engine room — Deck 0
# ---------------------------------------------------------------------------

ENGINE_SIZE = (14.0, 7.0, 18.0)
ENGINE_PORTALS = [{"target": "cabin-corridor-a", "position": (0.0, 0.0, 9.0)}]


def build_engine_room():
    kit.new_scene()
    mats = kit.build_materials()
    root = kit.compartment_root("engine-room", 0)
    kit.shell(mats, ENGINE_SIZE, ENGINE_PORTALS, carpet="deck")

    # Two main engine blocks, port and starboard.
    for side in (-1, 1):
        tag = "P" if side < 0 else "S"
        kit.cube(f"Engine block {tag}", (3.20, 2.60, 9.00), (side * 3.6, 1.30, -1.0), mats["steel"], 0.08)
        kit.cube(f"Engine head {tag}", (2.60, 0.60, 8.40), (side * 3.6, 2.90, -1.0), mats["trim"], 0.05)
        for index, z in enumerate(kit.grid(6, 8.0)):
            kit.cylinder(f"Cylinder cap {tag}{index}", 0.42, 0.70, (side * 3.6, 3.55, z - 1.0), mats["brass"], 12)
            kit.cylinder(f"Exhaust riser {tag}{index}", 0.20, 3.0, (side * 4.9, 4.80, z - 1.0), mats["steel"], 10)
        kit.cylinder(f"Shaft {tag}", 0.34, 6.0, (side * 3.6, 0.70, -6.5), mats["brass"], 12, (math.pi / 2, 0.0, 0.0))
        kit.cube(f"Engine plinth {tag}", (3.60, 0.40, 9.40), (side * 3.6, 0.20, -1.0), mats["trim"], 0.03)
        kit.cube(f"Engine label {tag}", (1.20, 0.30, 0.05), (side * 2.0, 2.40, 3.60), mats["neon_amber"], 0.02)

    # Catwalk down the centreline at deck-plus-three, with ladders at both ends.
    kit.cube("Catwalk", (2.00, 0.10, 16.0), (0.0, 3.00, 0.0), mats["steel"], 0.03)
    for side in (-1, 1):
        kit.cube(f"Catwalk rail {side}", (0.06, 0.06, 16.0), (side * 0.95, 4.00, 0.0), mats["brass"], 0.02)
        for z in kit.grid(11, 15.6):
            kit.cylinder(f"Catwalk stanchion {side} {z:.2f}", 0.03, 1.00, (side * 0.95, 3.50, z), mats["brass"], 6)
    for index, z in enumerate((-7.4, 7.4)):
        for rung in range(9):
            kit.cylinder(f"Ladder rung {index}{rung}", 0.03, 0.60, (0.0, 0.30 + rung * 0.32, z), mats["brass"], 6, (0.0, 0.0, math.pi / 2))
        for side in (-1, 1):
            kit.cube(f"Ladder rail {index}{side}", (0.06, 3.00, 0.06), (side * 0.30, 1.50, z), mats["steel"], 0.01)

    # Switchboards, pumps, pipework and tools. This is the room the repair jobs
    # live in, so it is dressed with things worth walking to.
    for index, x in enumerate(kit.grid(4, 10.0)):
        kit.cube(f"Switchboard {index}", (2.20, 2.00, 0.60), (x, 1.00, 8.40), mats["trim"], 0.04)
        kit.cube(f"Switchboard face {index}", (1.90, 1.20, 0.05), (x, 1.30, 8.08), mats["screen"], 0.02)
        kit.cube(f"Switchboard lamp {index}", (0.30, 0.10, 0.05), (x, 2.20, 8.08), mats["neon_pink"], 0.01)
    for index, z in enumerate(kit.grid(5, 12.0)):
        kit.cylinder(f"Pipe run {index}", 0.12, 13.6, (0.0, 6.20 - index * 0.22, z * 0), mats["steel"], 8, (0.0, 0.0, math.pi / 2))
        kit.cylinder(f"Pump {index}", 0.40, 0.90, (0.0, 0.45, z - 6.0), mats["coral"], 12)
        kit.cylinder(f"Pump motor {index}", 0.26, 0.60, (0.0, 1.20, z - 6.0), mats["brass"], 10)
    kit.cube("Workbench", (2.40, 0.90, 0.70), (-6.2, 0.45, 6.0), mats["wood"], 0.04)
    for index, x in enumerate(kit.grid(5, 2.2)):
        kit.cube(f"Tool {index}", (0.16, 0.10, 0.36), (-6.2 + x, 0.95, 6.0), mats["brass"], 0.02)
    kit.cube("Tool board", (2.40, 1.20, 0.06), (-6.2, 1.90, 6.40), mats["trim"], 0.02)
    kit.cube("Spares rack", (0.70, 2.20, 2.60), (6.2, 1.10, 5.6), mats["steel"], 0.03)
    for index in range(5):
        kit.cube(f"Spare crate {index}", (0.56, 0.34, 0.56), (6.2, 0.30 + index * 0.42, 5.6), mats["coral"], 0.04)
    for side in (-1, 1):
        kit.cube(f"Bilge grating {side}", (2.00, 0.06, 14.0), (side * 6.4, 0.03, 0.0), mats["steel"], 0.0)
        kit.cube(f"Emergency light {side}", (0.24, 0.24, 0.10), (side * 6.9, 5.60, 0.0), mats["neon_pink"], 0.03)

    kit.export("engine-room", root, ENGINE_PORTALS)


def main():
    print("Building compartments...")
    build_atrium()
    build_corridor()
    build_bridge()
    build_engine_room()
    print("Compartments built.")


main()
