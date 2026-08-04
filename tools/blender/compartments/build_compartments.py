"""Build the greybox-plus compartment set for MS Cabin Mayhem.

Four compartments, one GLB each, deterministic from source:

  atrium            Deck 2, the public heart and the compartment the crew wakes in
  cabin-corridor-a  Deck 1, guest cabins port and starboard
  bridge            Deck 6, the helm
  engine-room       Deck 0, propulsion

Run with Blender 5.x:
  blender --background --python tools/blender/compartments/build_compartments.py

Every compartment is authored about its own floor centre, matching the `size`
and `portals` declared in src/data/ship-layout.ts. Those two files must agree;
`pnpm validate:assets` fails the build if they drift.

Scale note: one authored unit is one metre and `CABIN_SCALE` in
src/three/coordinates.ts is 1, so the numbers here are the numbers the
simulation clamps against. Anything solid authored in this file must have a
matching box in `cabinFixtures` in src/sim/cabin-simulation.ts, or the crew
will walk through furniture they can see.
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
# The footprint is deliberately the simulation's cabin volume: 24 m by 46 m and
# 12.8 m clear, which is four decks of void over a room you can see all the way
# across. Lounge seating sits at exactly the coordinates the passenger avatars
# already occupy, so guests keep their seats when the shell changes.
# ---------------------------------------------------------------------------

ATRIUM_SIZE = (24.0, 12.8, 46.0)
ATRIUM_PORTALS = [
    {"target": "cabin-corridor-a", "position": (0.0, 0.0, -23.0)},
    {"target": "bridge", "position": (0.0, 0.0, 23.0)},
]

# The eight guests the simulation seats, converted from sim coordinates to the
# atrium's local frame: sim x 6.6/17.4 and sim y 9.5 + row * 3.4, through
# cabinToWorld at CABIN_SCALE 1, minus the atrium origin at world z 0.
#
# They alternate port and starboard, so an armchair at each one lands as eight
# staggered singles, never as rows. That distinction is the whole point: paired
# seats on a repeating pitch read as an aircraft cabin no matter what the room
# is called, which is exactly the mistake this layout replaces.
GUEST_ANCHORS = [(-5.4 if row % 2 == 0 else 5.4, -13.5 + row * 3.4) for row in range(8)]

# Gallery levels, inner edge and extent. Two decks of shopfronts looking down
# into the void is the single silhouette that says "cruise atrium"; the middle
# 16 m of width stays open top to bottom so the height can actually be seen.
GALLERY_LEVELS = (4.2, 8.4)
GALLERY_INNER_X = 8.0
GALLERY_HALF_Z = 16.0


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


def build_atrium():
    kit.new_scene()
    mats = kit.build_materials()
    root = kit.compartment_root("atrium", 2)
    kit.shell(mats, ATRIUM_SIZE, ATRIUM_PORTALS, carpet="carpet")

    # Two gallery decks port and starboard, joined by a cross gallery aft. The
    # forward end is left open so the reception hall is the full 12.8 m tall.
    # Balustrades are single glass panels rather than runs of balusters: same
    # read from the deck, a fraction of the vertices.
    for level, height in enumerate(GALLERY_LEVELS):
        for side in (-1, 1):
            tag = "P" if side < 0 else "S"
            kit.cube(
                f"Gallery deck {level}{tag}",
                (4.0, 0.20, GALLERY_HALF_Z * 2),
                (side * 10.0, height, 0.0),
                mats["wood"],
                0.04,
            )
            kit.cube(
                f"Gallery balustrade {level}{tag}",
                (0.10, 1.02, GALLERY_HALF_Z * 2),
                (side * GALLERY_INNER_X, height + 0.51, 0.0),
                mats["glass"],
                0.02,
            )
            kit.cube(
                f"Gallery handrail {level}{tag}",
                (0.16, 0.10, GALLERY_HALF_Z * 2),
                (side * GALLERY_INNER_X, height + 1.06, 0.0),
                mats["brass"],
                0.03,
            )
            # Shopfronts along the outboard bulkhead: the mall the stock-run
            # task will restock. Alternating sign colours keep it from reading
            # as one repeated module.
            for index, z in enumerate(kit.grid(7, 30.0)):
                accent = ("neon_cyan", "neon_pink", "neon_amber")[(index + level) % 3]
                kit.cube(
                    f"Shopfront {level}{tag}{index}",
                    (0.10, 2.40, 3.40),
                    (side * 11.86, height + 1.30, z),
                    mats["glass"],
                    0.02,
                )
                kit.cube(
                    f"Shop sign {level}{tag}{index}",
                    (0.08, 0.40, 2.20),
                    (side * 11.80, height + 2.80, z),
                    mats[accent],
                    0.02,
                )
                kit.cube(
                    f"Shop stall {level}{tag}{index}",
                    (0.90, 0.90, 1.40),
                    (side * 9.60, height + 0.55, z),
                    mats["trim"],
                    0.05,
                )
        kit.cube(
            f"Gallery cross deck {level}",
            (GALLERY_INNER_X * 2, 0.20, 4.0),
            (0.0, height, 18.0),
            mats["wood"],
            0.04,
        )
        kit.cube(
            f"Gallery cross balustrade {level}",
            (GALLERY_INNER_X * 2, 1.02, 0.10),
            (0.0, height + 0.51, GALLERY_HALF_Z),
            mats["glass"],
            0.02,
        )
        kit.cube(
            f"Gallery cross handrail {level}",
            (GALLERY_INNER_X * 2, 0.10, 0.16),
            (0.0, height + 1.06, GALLERY_HALF_Z),
            mats["brass"],
            0.03,
        )
        # The columns holding that level up.
        for side in (-1, 1):
            for z in kit.grid(6, 30.0):
                kit.cylinder(
                    f"Gallery column {level}{side} {z:.2f}",
                    0.20,
                    height if level == 0 else GALLERY_LEVELS[1] - GALLERY_LEVELS[0],
                    (
                        side * GALLERY_INNER_X,
                        (height / 2) if level == 0 else (GALLERY_LEVELS[0] + GALLERY_LEVELS[1]) / 2,
                        z,
                    ),
                    mats["brass"],
                    8,
                )

    # Two flights of the spiral stair wrapped around the feature column, deck to
    # gallery one and gallery one to gallery two. A cruise atrium is a vertical
    # room and the stair is what says so.
    for flight, (base, top) in enumerate(((0.30, GALLERY_LEVELS[0]), (GALLERY_LEVELS[0], GALLERY_LEVELS[1]))):
        steps = 18
        rise = (top - base) / steps
        for step in range(steps):
            angle = kit.TAU * 0.60 * (step / (steps - 1.0)) - 0.4 + flight * kit.TAU * 0.60
            radius = 2.30
            kit.cube(
                f"Stair tread {flight}{step}",
                (1.30, 0.16, 0.74),
                (math.cos(angle) * radius, base + step * rise, math.sin(angle) * radius),
                mats["wood"],
                0.03,
                (0.0, 0.0, -angle),
            )
            kit.cube(
                f"Stair rail {flight}{step}",
                (0.10, 0.06, 0.80),
                (
                    math.cos(angle) * (radius + 0.70),
                    base + step * rise + 1.02,
                    math.sin(angle) * (radius + 0.70),
                ),
                mats["brass"],
                0.02,
                (0.0, 0.0, -angle),
            )

    # Central feature: a lit sculpture column running the full height, under a
    # skylight well at the top of the void.
    kit.cylinder("Feature column", 1.00, 12.4, (0.0, 6.2, 0.0), mats["steel"], 16)
    for index, height in enumerate((2.2, 5.0, 7.8, 10.6)):
        accent = ("neon_cyan", "neon_pink", "neon_amber", "neon_cyan")[index]
        kit.cylinder(f"Feature glow {index}", 1.12, 0.36, (0.0, height, 0.0), mats[accent], 16)
    kit.cube("Skylight well", (6.4, 0.12, 6.4), (0.0, 12.66, 0.0), mats["glass"], 0.02)
    for index in range(5):
        kit.cylinder(
            f"Chandelier tier {index}",
            1.60 - index * 0.26,
            0.10,
            (0.0, 11.60 - index * 0.42, 0.0),
            mats["neon_amber"],
            12,
        )

    # Reception hall across the forward end, matching the fixture box at
    # sim x 7.0-17.0, y 3.2-5.0.
    kit.cube("Reception counter", (9.6, 1.05, 1.60), (0.0, 0.53, -18.9), mats["wood"], 0.06)
    kit.cube("Reception top", (10.0, 0.10, 1.84), (0.0, 1.10, -18.9), mats["trim"], 0.03)
    kit.cube("Reception sign", (6.0, 0.70, 0.10), (0.0, 4.20, -22.4), mats["neon_amber"], 0.02)
    kit.cube("Reception backdrop", (11.0, 4.60, 0.14), (0.0, 2.30, -21.6), mats["trim"], 0.04)
    for index, x in enumerate(kit.grid(5, 8.6)):
        kit.cube(f"Reception terminal {index}", (0.52, 0.38, 0.08), (x, 1.38, -18.6), mats["screen"], 0.02)
        kit.cube(f"Reception stool {index}", (0.40, 0.66, 0.40), (x, 0.33, -17.6), mats["teal"], 0.05)
        kit.cube(f"Reception panel {index}", (1.60, 2.20, 0.06), (x, 2.40, -21.5), mats["screen"], 0.02)

    # Guest seating: one armchair per seated passenger, angled inboard towards
    # the column so the room reads as a lounge rather than a seating plan, plus
    # a café table and planter outboard of each — both inside the fixture boxes
    # the simulation collides against.
    for index, (x, z) in enumerate(GUEST_ANCHORS):
        inboard = math.radians(-28.0 if x < 0 else 28.0)
        accent = "teal" if index % 2 == 0 else "coral"
        outboard = -7.4 if x < 0 else 7.4
        lounge_chair(mats, f"Guest chair {index}", x, z, accent, inboard)
        kit.cylinder(f"Cafe table {index}", 0.40, 0.07, (outboard, 0.74, z + 0.30), mats["trim"], 12)
        kit.cylinder(f"Cafe stem {index}", 0.07, 0.72, (outboard, 0.36, z + 0.30), mats["brass"], 8)
        kit.cylinder(f"Planter {index}", 0.34, 0.60, (outboard, 0.30, z - 0.95), mats["brass"], 10)
        kit.cylinder(f"Planter foliage {index}", 0.52, 0.80, (outboard, 1.00, z - 0.95), mats["teal"], 8)

    # A grand piano and the bar it plays to, both on their fixture boxes: the
    # two props that say cruise atrium at a glance.
    piano_yaw = math.radians(18)
    kit.cube("Piano body", (2.60, 0.40, 1.90), (5.8, 0.92, 14.0), mats["trim"], 0.08, (0.0, 0.0, piano_yaw))
    kit.cube("Piano lid", (2.40, 0.08, 1.70), (5.8, 1.42, 14.2), mats["wood"], 0.04, (0.0, 0.0, piano_yaw))
    for leg in ((-1.0, -0.6), (1.0, -0.6), (0.0, 0.8)):
        kit.cylinder(f"Piano leg {leg[0]:.1f}", 0.06, 0.72, (5.8 + leg[0], 0.36, 14.0 + leg[1]), mats["brass"], 6)
    kit.cube("Piano bench", (1.00, 0.46, 0.44), (5.8, 0.23, 12.6), mats["teal"], 0.05, (0.0, 0.0, piano_yaw))

    kit.cube("Bar counter", (10.6, 1.12, 1.60), (0.0, 0.56, 18.9), mats["wood"], 0.06)
    kit.cube("Bar top", (11.0, 0.10, 1.84), (0.0, 1.18, 18.9), mats["trim"], 0.03)
    kit.cube("Bar backlight", (10.4, 2.60, 0.10), (0.0, 2.60, 20.6), mats["neon_pink"], 0.02)
    for index, x in enumerate(kit.grid(9, 10.0)):
        kit.cylinder(f"Bar stool {index}", 0.24, 0.76, (x, 0.38, 17.6), mats["teal"], 10)
        kit.cube(f"Bottle shelf {index}", (0.90, 0.08, 0.24), (x, 1.70 + (index % 3) * 0.46, 20.4), mats["glass"], 0.01)

    # Signage, lighting and wear: life that costs nothing per frame.
    for z in kit.grid(10, 42.0):
        for side in (-1, 1):
            kit.cube(f"Wall sconce {side} {z:.2f}", (0.12, 0.52, 0.20), (side * 11.86, 2.60, z), mats["neon_amber"], 0.02)
        kit.cube(f"Deckhead light {z:.2f}", (2.60, 0.08, 0.30), (0.0, 12.70, z), mats["neon_cyan"], 0.02)
    for index, z in enumerate(kit.grid(4, 30.0)):
        for side in (-1, 1):
            kit.cube(f"Deck sign {index}{side}", (0.08, 0.60, 1.60), (side * 11.84, 3.40, z), mats["screen"], 0.02)

    # Bell-desk clutter forward, where guests arrive.
    kit.cube("Luggage trolley", (1.40, 0.18, 2.20), (-9.0, 0.66, -15.0), mats["steel"], 0.04)
    for index in range(6):
        kit.cube(f"Suitcase {index}", (0.52, 0.72, 0.32), (-9.0 + (index % 2) * 0.62, 0.40 + (index // 2) * 0.76, -15.6 + index * 0.34), mats["coral"], 0.05)
    kit.cube("Notice board", (0.10, 1.60, 2.60), (11.84, 2.20, -12.0), mats["trim"], 0.03)
    kit.cube("Notice glow", (0.05, 1.30, 2.30), (11.76, 2.20, -12.0), mats["screen"], 0.01)

    kit.export("atrium", root, ATRIUM_PORTALS)


# ---------------------------------------------------------------------------
# Cabin corridor A — Deck 1
# ---------------------------------------------------------------------------

CORRIDOR_SIZE = (4.0, 2.8, 40.0)
CORRIDOR_PORTALS = [
    {"target": "atrium", "position": (0.0, 0.0, 20.0)},
    {"target": "engine-room", "position": (0.0, 0.0, -20.0)},
]


def build_corridor():
    kit.new_scene()
    mats = kit.build_materials()
    root = kit.compartment_root("cabin-corridor-a", 1)
    kit.shell(mats, CORRIDOR_SIZE, CORRIDOR_PORTALS, carpet="carpet")

    # Twenty-eight cabin doors, fourteen per side. The corridor's whole job is
    # to feel long and repetitive, so the repetition is the content.
    for index, z in enumerate(kit.grid(14, 38.0)):
        for side in (-1, 1):
            tag = "P" if side < 0 else "S"
            kit.cube(f"Door {tag}{index}", (0.06, 2.05, 0.86), (side * 1.94, 1.02, z), mats["wood"], 0.02)
            kit.cube(f"Door frame {tag}{index}", (0.04, 2.16, 1.00), (side * 1.97, 1.08, z), mats["trim"], 0.02)
            kit.cylinder(f"Door handle {tag}{index}", 0.035, 0.14, (side * 1.88, 1.02, z + 0.30), mats["brass"], 8, (0.0, math.pi / 2, 0.0))
            kit.cube(f"Cabin number {tag}{index}", (0.03, 0.14, 0.22), (side * 1.90, 1.72, z - 0.52), mats["neon_cyan"], 0.01)
            kit.cube(f"Reader {tag}{index}", (0.03, 0.10, 0.08), (side * 1.90, 1.20, z - 0.50), mats["screen"], 0.01)

    # Deckhead services and floor wear.
    for index, z in enumerate(kit.grid(20, 39.0)):
        kit.cube(f"Deckhead strip {index}", (0.90, 0.05, 0.20), (0.0, 2.74, z), mats["neon_amber"], 0.01)
    for side in (-1, 1):
        kit.cube(f"Handrail {side}", (0.06, 0.06, 38.5), (side * 1.86, 0.92, 0.0), mats["brass"], 0.02)
        kit.cube(f"Skirting {side}", (0.05, 0.14, 39.6), (side * 1.94, 0.07, 0.0), mats["trim"], 0.01)
        kit.cylinder(f"Conduit {side}", 0.07, 39.0, (side * 1.60, 2.58, 0.0), mats["steel"], 8, (math.pi / 2, 0.0, 0.0))

    # Housekeeping clutter: the corridor is worked in, not just walked through.
    kit.cube("Housekeeping cart", (0.66, 0.98, 1.10), (1.2, 0.49, 6.0), mats["steel"], 0.05)
    kit.cube("Linen stack", (0.54, 0.36, 0.86), (1.2, 1.16, 6.0), mats["bulkhead"], 0.05)
    for index in range(5):
        kit.cube(f"Room tray {index}", (0.52, 0.06, 0.40), (-1.50, 0.05, -3.0 - index * 5.0), mats["steel"], 0.02)
        kit.cylinder(f"Tray cloche {index}", 0.16, 0.14, (-1.50, 0.14, -3.0 - index * 5.0), mats["bulkhead"], 10)
    for index, z in enumerate((-14.0, 0.0, 14.0)):
        kit.cube(f"Fire station {index}", (0.10, 0.70, 0.44), (1.92, 1.30, z), mats["coral"], 0.03)
        kit.cube(f"Muster notice {index}", (0.03, 0.36, 0.50), (-1.94, 1.60, z + 2.0), mats["screen"], 0.01)

    kit.export("cabin-corridor-a", root, CORRIDOR_PORTALS)


# ---------------------------------------------------------------------------
# Bridge — Deck 6, directly over the atrium void. Positional authority lands
# here next slice, so the console is authored at the centreline where the helm
# volume will be.
# ---------------------------------------------------------------------------

BRIDGE_SIZE = (26.0, 3.4, 10.0)
BRIDGE_PORTALS = [{"target": "atrium", "position": (0.0, 0.0, -5.0)}]


def build_bridge():
    kit.new_scene()
    mats = kit.build_materials()
    root = kit.compartment_root("bridge", 6)
    kit.shell(mats, BRIDGE_SIZE, BRIDGE_PORTALS, carpet="deck")

    # Forward window band. The bridge is the one room whose entire point is what
    # you can see out of it.
    for index, x in enumerate(kit.grid(16, 25.4)):
        kit.cube(f"Window {index}", (1.44, 1.70, 0.06), (x, 2.00, 4.96), mats["glass"], 0.0)
        kit.cube(f"Window mullion {index}", (0.10, 1.84, 0.10), (x + 0.79, 2.00, 4.94), mats["trim"], 0.02)
    kit.cube("Window sill", (25.6, 0.18, 0.40), (0.0, 1.06, 4.84), mats["trim"], 0.03)

    # Helm console at the centreline.
    kit.cube("Helm console", (3.20, 1.02, 1.30), (0.0, 0.51, 2.60), mats["trim"], 0.06)
    kit.cube("Helm console top", (3.40, 0.08, 1.46), (0.0, 1.06, 2.60), mats["steel"], 0.03)
    kit.cylinder("Helm wheel hub", 0.14, 0.22, (0.0, 1.34, 2.06), mats["brass"], 12, (math.pi / 2, 0.0, 0.0))
    for spoke in range(6):
        angle = spoke * math.tau / 6
        kit.cube(f"Helm spoke {spoke}", (0.06, 0.70, 0.06), (0.0, 1.34, 2.06), mats["brass"], 0.01, (0.0, 0.0, angle))
    for index, x in enumerate(kit.grid(7, 3.0)):
        kit.cube(f"Helm screen {index}", (0.40, 0.28, 0.04), (x, 1.36, 3.06), mats["screen"], 0.01)
    kit.cube("Telegraph base", (0.32, 0.90, 0.32), (2.20, 0.45, 2.20), mats["steel"], 0.04)
    kit.cylinder("Telegraph dial", 0.24, 0.10, (2.20, 1.02, 2.20), mats["brass"], 14, (math.pi / 2, 0.0, 0.0))
    kit.cube("Throttle quadrant", (0.50, 0.16, 0.44), (-2.20, 1.10, 2.30), mats["trim"], 0.03)
    for index in range(2):
        kit.cylinder(f"Throttle lever {index}", 0.03, 0.42, (-2.34 + index * 0.28, 1.34, 2.30), mats["coral"], 8)

    # Radar and chart stations along the aft bulkhead.
    for index, x in enumerate((-10.0, -7.6, -5.2, 5.2, 7.6, 10.0)):
        kit.cube(f"Console {index}", (1.60, 1.00, 0.80), (x, 0.50, -3.90), mats["trim"], 0.05)
        kit.cube(f"Console face {index}", (1.36, 0.66, 0.05), (x, 1.44, -4.06), mats["screen"], 0.02)
        kit.cube(f"Console hood {index}", (1.64, 0.10, 0.68), (x, 1.82, -3.96), mats["steel"], 0.02)
    kit.cube("Chart table", (2.60, 0.92, 1.40), (0.0, 0.46, -3.40), mats["wood"], 0.05)
    kit.cube("Chart surface", (2.72, 0.06, 1.52), (0.0, 0.95, -3.40), mats["bulkhead"], 0.02)
    kit.cube("Chart lamp", (0.70, 0.06, 0.24), (0.0, 2.20, -3.40), mats["neon_amber"], 0.02)

    # Alarm and signage.
    for side in (-1, 1):
        kit.cube(f"Alarm beacon {side}", (0.24, 0.24, 0.24), (side * 12.4, 3.10, 0.0), mats["neon_pink"], 0.04)
        kit.cube(f"Bridge wing door {side}", (0.06, 2.05, 0.86), (side * 12.94, 1.02, 1.4), mats["trim"], 0.02)
        kit.cube(f"Pilot chair {side}", (0.64, 0.52, 0.64), (side * 1.70, 0.56, 0.90), mats["teal"], 0.06)
        kit.cylinder(f"Pilot chair post {side}", 0.08, 0.58, (side * 1.70, 0.29, 0.90), mats["steel"], 8)
    for index, x in enumerate(kit.grid(10, 24.0)):
        kit.cube(f"Deckhead panel {index}", (1.40, 0.05, 0.34), (x, 3.34, 0.0), mats["neon_cyan"], 0.01)

    kit.export("bridge", root, BRIDGE_PORTALS)


# ---------------------------------------------------------------------------
# Engine room — Deck 0
# ---------------------------------------------------------------------------

ENGINE_SIZE = (22.0, 8.0, 26.0)
ENGINE_PORTALS = [{"target": "cabin-corridor-a", "position": (0.0, 0.0, 13.0)}]


def build_engine_room():
    kit.new_scene()
    mats = kit.build_materials()
    root = kit.compartment_root("engine-room", 0)
    kit.shell(mats, ENGINE_SIZE, ENGINE_PORTALS, carpet="deck")

    # Two main engine blocks, port and starboard.
    for side in (-1, 1):
        tag = "P" if side < 0 else "S"
        kit.cube(f"Engine block {tag}", (4.40, 3.20, 13.00), (side * 5.6, 1.60, -1.5), mats["steel"], 0.08)
        kit.cube(f"Engine head {tag}", (3.60, 0.70, 12.20), (side * 5.6, 3.55, -1.5), mats["trim"], 0.05)
        for index, z in enumerate(kit.grid(8, 12.0)):
            kit.cylinder(f"Cylinder cap {tag}{index}", 0.50, 0.80, (side * 5.6, 4.30, z - 1.5), mats["brass"], 12)
            kit.cylinder(f"Exhaust riser {tag}{index}", 0.24, 3.4, (side * 7.6, 6.00, z - 1.5), mats["steel"], 10)
        kit.cylinder(f"Shaft {tag}", 0.40, 8.0, (side * 5.6, 0.80, -9.0), mats["brass"], 12, (math.pi / 2, 0.0, 0.0))
        kit.cube(f"Engine plinth {tag}", (4.90, 0.44, 13.60), (side * 5.6, 0.22, -1.5), mats["trim"], 0.03)
        kit.cube(f"Engine label {tag}", (1.60, 0.36, 0.06), (side * 3.2, 2.80, 5.10), mats["neon_amber"], 0.02)

    # Catwalk down the centreline, with ladders at both ends.
    kit.cube("Catwalk", (2.40, 0.12, 24.0), (0.0, 3.60, 0.0), mats["steel"], 0.03)
    for side in (-1, 1):
        kit.cube(f"Catwalk rail {side}", (0.08, 0.08, 24.0), (side * 1.15, 4.66, 0.0), mats["brass"], 0.02)
        kit.cube(f"Catwalk mesh {side}", (0.05, 0.94, 24.0), (side * 1.15, 4.13, 0.0), mats["steel"], 0.0)
    for index, z in enumerate((-11.0, 11.0)):
        for rung in range(11):
            kit.cylinder(f"Ladder rung {index}{rung}", 0.03, 0.60, (0.0, 0.30 + rung * 0.33, z), mats["brass"], 6, (0.0, 0.0, math.pi / 2))
        for side in (-1, 1):
            kit.cube(f"Ladder rail {index}{side}", (0.06, 3.60, 0.06), (side * 0.30, 1.80, z), mats["steel"], 0.01)

    # Switchboards, pumps, pipework and tools. This is the room the repair jobs
    # live in, so it is dressed with things worth walking to.
    for index, x in enumerate(kit.grid(6, 16.0)):
        kit.cube(f"Switchboard {index}", (2.40, 2.20, 0.60), (x, 1.10, 12.40), mats["trim"], 0.04)
        kit.cube(f"Switchboard face {index}", (2.05, 1.30, 0.05), (x, 1.40, 12.08), mats["screen"], 0.02)
        kit.cube(f"Switchboard lamp {index}", (0.34, 0.10, 0.05), (x, 2.40, 12.08), mats["neon_pink"], 0.01)
    for index, z in enumerate(kit.grid(7, 18.0)):
        kit.cylinder(f"Pipe run {index}", 0.14, 21.6, (0.0, 7.10 - index * 0.26, 0.0), mats["steel"], 8, (0.0, 0.0, math.pi / 2))
        kit.cylinder(f"Pump {index}", 0.44, 0.94, (0.0, 0.47, z - 3.0), mats["coral"], 12)
        kit.cylinder(f"Pump motor {index}", 0.28, 0.64, (0.0, 1.24, z - 3.0), mats["brass"], 10)
    kit.cube("Workbench", (3.00, 0.90, 0.80), (-9.4, 0.45, 8.6), mats["wood"], 0.04)
    for index, x in enumerate(kit.grid(7, 2.8)):
        kit.cube(f"Tool {index}", (0.16, 0.10, 0.36), (-9.4 + x, 0.95, 8.6), mats["brass"], 0.02)
    kit.cube("Tool board", (3.00, 1.40, 0.06), (-9.4, 2.00, 9.10), mats["trim"], 0.02)
    kit.cube("Spares rack", (0.80, 2.60, 3.20), (9.4, 1.30, 8.2), mats["steel"], 0.03)
    for index in range(7):
        kit.cube(f"Spare crate {index}", (0.60, 0.36, 0.60), (9.4, 0.30 + index * 0.44, 8.2), mats["coral"], 0.04)
    for side in (-1, 1):
        kit.cube(f"Bilge grating {side}", (2.60, 0.06, 20.0), (side * 9.8, 0.03, 0.0), mats["steel"], 0.0)
        for z in kit.grid(3, 20.0):
            kit.cube(f"Emergency light {side} {z:.2f}", (0.26, 0.26, 0.12), (side * 10.9, 6.40, z), mats["neon_pink"], 0.03)

    kit.export("engine-room", root, ENGINE_PORTALS)


def main():
    print("Building compartments...")
    build_atrium()
    build_corridor()
    build_bridge()
    build_engine_room()
    print("Compartments built.")


main()
