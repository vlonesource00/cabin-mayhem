"""Author the ship's exterior: one always-resident GLB.

  blender --background --python tools/blender/compartments/build_exterior.py

The compartments are the ship you walk through. This is the ship you *see* —
from an open deck, through a window, and from the sea. It is a single asset
rather than a streamed one because it is visible from everywhere, and it is the
whole reason a stack of authored rooms reads as a vessel.

Everything here is in ship space: origin amidships on the centreline at the
waterline, +X starboard, +Y up, +Z bow, LOA 290, beam 38, draught 8.4. The plan
comes from `kit.hull_half_beam`, the same curve `halfBeamAt` uses in TypeScript,
so the hull the player sees is the hull the simulation clamps them inside.

Who owns what
-------------
The exterior and an exterior-exposure compartment are drawn at the same time
whenever the crew is on an open deck, so anything authored in both is drawn
twice — coplanar, z-fighting, and paid for twice against the budget. One rule
settles it: **the exterior owns the shell and everything permanently outboard of
or above the compartment volumes; a compartment owns what stands on its own
deck.**

So the exterior has the hull, the superstructure blocks, balconies, window
bands, funnels, lifeboats, masts and ground tackle, and it does *not* have the
promenade's planking, the lido's rails, the pool, the slide, the loungers or the
sun deck's mast — build_compartments.py authors those at the positions the
simulation uses. Where a compartment dresses a stretch of the ship's side, the
exterior's band skips that stretch rather than overlapping it, and where a
compartment lays its own deck the block underneath is capped just below it so
the walking surface has exactly one owner.

Two joined groups, and the split matters: `CM_STRUCTURE_*` is the hull and the
superstructure, `CM_DRESSING_*` is everything else. The X1 tier in
docs/PERFORMANCE.md hides the dressing by name when the crew is inside looking
out of a window, which is most of the time.
"""

from pathlib import Path
import math
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))

import kit  # noqa: E402
from kit import (  # noqa: E402
    BEAM,
    LOA,
    cube,
    cylinder,
    grid,
    hull_half_beam,
    loft,
    open_prism,
    prism,
    railing,
)

HALF_LOA = LOA / 2
SHEER = 8.8  # Deck 5: the promenade, and the top of the shell plating.

# How far a block is capped below the deck the compartment above it lays. Its
# plating is 0.12 m thick, so this puts the block's top at the plating's
# underside and leaves the walking surface with a single owner.
PLATE = 0.14

# The atrium's void, in ship space. `atrium` in src/data/ship-layout.ts is
# anchored at z 14 and its galleries ring a well x -7..7, z -17..17 in the
# room's own coordinates, which lands here. The weather deck is opened over
# exactly this, so the four-deck void is a four-deck void.
WELL_X = 7.0
WELL_Z = (-3.0, 31.0)
# How far outside the well the deck closes back up. The rake this leaves is
# under the fore and aft galleries, which are plated, so it is never seen.
WELL_RAKE = 0.2

# Stations, close together where the plan is changing fastest. The four either
# side of the atrium well are there to give the opening a square end.
STATIONS = sorted([
    -145.0, -142.0, -138.0, -132.0, -124.0, -114.0, -102.0, -88.0, -72.0,
    -56.0, -40.0, -24.0, -8.0, 8.0, 24.0, 40.0, 56.0, 72.0, 88.0, 102.0,
    114.0, 124.0, 132.0, 138.0, 141.0, 143.0, 144.5, 145.0,
    WELL_Z[0] - WELL_RAKE, WELL_Z[0], WELL_Z[1], WELL_Z[1] + WELL_RAKE,
])

# Where each feature line of a section sits, as a fraction of keel-to-sheer, and
# how far out it stands as a fraction of the half-beam. Together they are the
# ship's body plan: a flat of bottom, a turn of bilge, a wall side, and a sheer.
# Stated as fractions rather than heights so a section still makes sense forward,
# where the keel has risen almost to the sheer and there is no room for a bilge.
SECTION_HEIGHTS = [0.0, 0.012, 0.15, 0.30, 0.49, 0.75, 1.0]
SECTION_WIDTHS = [0.0, 0.55, 0.93, 1.0, 1.0, 1.0, 1.0]

# Stretches of the ship's side a compartment already dresses, from the anchors
# and extents in src/data/ship-layout.ts. The exterior's bands stand down over
# these rather than doubling them up.
CABIN_FOUR_Z = (-81.0, -21.0)   # cabin-deck-four: balcony cabins, deck 4.
CABIN_SEVEN_Z = (49.0, 78.0)    # cabin-deck-seven: balcony cabins, deck 7.
DINING_Z = (49.0, 93.0)         # dining-room: glazes its own shell, deck 2.
# The promenade runs z -130..130 and lays its own planking, so the forecastle
# and the stern deck start clear of it.
PROMENADE_FWD = 131.0
PROMENADE_AFT = -131.0


def keel_y(z):
    """The keel line: flat over the parallel body, rising to the stem forward."""
    t = abs(z) / HALF_LOA
    if z > 0 and t > 0.72:
        return -8.4 + 7.4 * ((t - 0.72) / 0.28) ** 2
    if z < 0 and t > 0.86:
        return -8.4 + 4.2 * ((t - 0.86) / 0.14) ** 2
    return -8.4


def sheer_y(z):
    """The sheer line: level amidships, lifting forward so the bow rides high."""
    t = z / HALF_LOA
    if t > 0.45:
        return SHEER + 2.6 * ((t - 0.45) / 0.55) ** 2
    if t < -0.6:
        return SHEER + 0.8 * ((-t - 0.6) / 0.4) ** 2
    return SHEER


def half_beam_at(z):
    """The plan, with the last few metres drawn in to a stem instead of a slab."""
    beam = hull_half_beam(z)
    if z > 138.0:
        beam *= max(0.05, (145.6 - z) / 7.6)
    return max(0.16, beam)


def well_half_x(z):
    """Half the width of the hole in the weather deck at this station."""
    return WELL_X if WELL_Z[0] <= z <= WELL_Z[1] else 0.0


def hull_ring(z):
    """One transverse section, port sheer down to the keel and up to starboard.

    Carrying the section across the top gives the weather deck for free, so the
    hull is a solid from every angle. That closing surface is dropped `PLATE`
    below the sheer: the promenade lays its own planking with its top face
    exactly at the sheer, and two decks at one height is a seam the player walks
    along.

    The ring is *open* rather than closed, and the strip `loft` therefore leaves
    out — the one from the last vertex back to the first — is the atrium well.
    Everywhere else the two ends meet on the centreline, so the deck reads as
    one unbroken plate; over the well they stand `WELL_X` apart and it is a
    four-deck hole with the atrium's own galleries railed around it. Doing it
    this way keeps the ring the same length at every station, which is the one
    thing `loft` insists on.
    """
    beam = half_beam_at(z)
    keel, sheer = keel_y(z), sheer_y(z)
    gap = well_half_x(z)

    def point(index, sign):
        return (
            sign * beam * SECTION_WIDTHS[index],
            keel + (sheer - keel) * SECTION_HEIGHTS[index],
            z,
        )

    port = [point(index, -1) for index in range(6, 0, -1)]
    starboard = [point(index, 1) for index in range(1, 7)]
    return (
        [(-gap, sheer - PLATE, z)]
        + port
        + [point(0, 1)]
        + starboard
        + [(gap, sheer - PLATE, z)]
    )


def side_strip(name, low, high, mat, outset=0.05):
    """A band painted around the shell between two fractions of its depth."""
    sections = []
    for z in STATIONS:
        beam = half_beam_at(z) + outset
        keel, sheer = keel_y(z), sheer_y(z)
        sections.append([
            (beam, keel + (sheer - keel) * low, z),
            (beam, keel + (sheer - keel) * high, z),
        ])
    loft(f"{name}_stbd", sections, mat, closed=False, cap=False)
    loft(f"{name}_port", [[(-x, y, z) for (x, y, z) in ring] for ring in sections],
         mat, closed=False, cap=False)


def deck_outline(z_aft, z_fore, inset, stations=22):
    """A closed (x, z) outline that follows the hull's plan, inset from it."""
    forward = []
    for index in range(stations + 1):
        z = z_aft + (z_fore - z_aft) * index / stations
        forward.append((max(1.6, hull_half_beam(z) - inset), z))
    return forward + [(-x, z) for (x, z) in reversed(forward)]


def outside(z, span):
    """True when a station is clear of a stretch a compartment already dresses."""
    return z < span[0] or z > span[1]


# ---------------------------------------------------------------------------
# Structure
# ---------------------------------------------------------------------------


def build_hull(mats):
    loft("hull_shell", [hull_ring(z) for z in STATIONS], mats["hull"],
         closed=False, cap=True)
    # Antifouling up to the boot top, and the white strake under the sheer.
    side_strip("boot_top", 0.31, 0.53, mats["boot"])
    side_strip("sheer_strake", 0.955, 1.0, mats["bulkhead"])

    # The bulbous bow, the skeg, and the running gear under the counter.
    cylinder("bulbous_bow", 2.1, 9.0, (0, -5.4, 137.0), mats["hull"], 14, (math.pi / 2, 0, 0))
    cylinder("bulb_nose", 2.1, 2.1, (0, -5.4, 141.4), mats["hull"], 14)
    cube("skeg", (1.6, 4.0, 26.0), (0, -7.4, -128.0), mats["hull"], 0.2)
    for sign in (-1, 1):
        cylinder(f"shaft_bossing_{sign}", 1.1, 22.0, (sign * 6.4, -6.4, -122.0),
                 mats["hull"], 12, (math.pi / 2, 0, 0))
        cylinder(f"propeller_hub_{sign}", 0.9, 1.6, (sign * 6.4, -6.4, -133.6),
                 mats["steel"], 12, (math.pi / 2, 0, 0))
        for blade in range(4):
            # A blade's long axis lies along ship X and is swung about ship Z,
            # which is Blender's Y turned the other way.
            angle = blade / 4 * math.tau
            cube(f"propeller_{sign}_{blade}", (3.4, 0.4, 1.4),
                 (sign * 6.4 + math.cos(angle) * 1.9, -6.4 + math.sin(angle) * 1.9, -134.0),
                 mats["brass"], 0.06, (0.0, -angle, 0.0))
        cube(f"stabiliser_{sign}", (7.0, 0.6, 3.0), (sign * 17.0, -4.6, 18.0), mats["steel"], 0.1)
        cube(f"rudder_{sign}", (0.7, 6.0, 5.0), (sign * 6.4, -5.4, -140.0), mats["steel"], 0.15)
        cylinder(f"bow_thruster_{sign}", 1.4, 1.0, (sign * 14.6, -4.0, 118.0), mats["boot"], 12,
                 (0.0, math.pi / 2, 0.0))


def build_superstructure(mats):
    """Decks stacked on the hull, each one stepped in from the one below it.

    Deck plates and rails for the open decks are deliberately absent: the
    promenade, the pool deck and the sun deck lay their own. Each block is capped
    just under the plating that will sit on it, so from the sea the ship is solid
    and from on deck there is one surface underfoot rather than two.
    """
    # The main house — decks 5, 6 and 7 — capped under the lido at 18.4.
    #
    # Hollow, and open underneath. The atrium void rises to deck 6 and all three
    # stair towers run the full height of the ship, so a floor here would be a
    # steel plate hanging in the air over each of them. The exterior's business
    # is the outboard face; the deck under this block belongs to the promenade.
    open_prism("house_main", deck_outline(-128.0, 128.0, 2.2), SHEER, 18.4 - PLATE, mats["bulkhead"])

    # Deck 9 structures: the sun-deck house aft, the bridge house forward.
    prism("house_aft", deck_outline(-100.0, -16.0, 3.6), 18.4, 21.6 - PLATE, mats["bulkhead"])
    prism("house_fwd", deck_outline(84.0, 108.0, 2.6), 18.4, 21.6, mats["bulkhead"])
    prism("bridge_house", deck_outline(88.0, 104.0, 2.0), 21.6, 25.0, mats["bulkhead"])

    # Bridge wings: the overhangs the ship is conned from alongside, and the only
    # part of her that stands proud of the shell.
    for sign in (-1, 1):
        cube(f"bridge_wing_{sign}", (5.0, 3.4, 5.0), (sign * 14.0, 23.3, 96.0), mats["bulkhead"])
        cube(f"bridge_wing_{sign}_roof", (5.6, 0.2, 5.6), (sign * 14.0, 25.1, 96.0),
             mats["deck"], 0.0)

    # The forecastle: bulwark, mooring deck and the breakwater behind the stem.
    # Forward of the promenade's planking, so nothing else plates it.
    prism("forecastle_bulwark", deck_outline(PROMENADE_FWD, 142.0, 0.0), SHEER, SHEER + 1.4,
          mats["hull"])
    prism("forecastle_deck", deck_outline(PROMENADE_FWD, 142.0, 0.5), SHEER - 0.16, SHEER,
          mats["deck"])
    cube("breakwater", (16.0, 1.2, 0.6), (0, SHEER + 0.6, 133.0), mats["hull"], 0.05)

    # The stern, likewise abaft everything the compartments cover.
    prism("stern_deck", deck_outline(-144.0, PROMENADE_AFT, 0.5), SHEER - 0.16, SHEER,
          mats["deck"])
    for sign in (-1, 1):
        railing(mats, f"rail_stern_{sign}", [(sign * 9.0, -144.0), (sign * 9.0, PROMENADE_AFT)],
                SHEER, spacing=3.0)
    railing(mats, "rail_transom", [(-9.0, -143.6), (9.0, -143.6)], SHEER, spacing=3.0)


# ---------------------------------------------------------------------------
# Dressing — hidden wholesale by the X1 tier
# ---------------------------------------------------------------------------


def build_balconies(mats):
    """Balcony bands: the single most recognisable thing about a modern cruise ship.

    Three bands. Deck 4 is recessed into the shell itself; decks 6 and 7 step out
    of the main house. Each band skips the stretch where a cabin compartment
    authors balconies of its own, so the ship has an unbroken run of them from
    stem to stern without any one balcony existing twice.
    """
    bands = (
        (5.6, 34, 230.0, 0.0, CABIN_FOUR_Z),    # Deck 4, recessed into the shell.
        (12.0, 32, 216.0, 2.2, None),           # Deck 6, in the main house.
        (15.2, 30, 200.0, 2.2, CABIN_SEVEN_Z),  # Deck 7, ditto, a little shorter.
    )
    for band, (y, count, span, inset, skip) in enumerate(bands):
        for z in grid(count, span):
            if skip and not outside(z, skip):
                continue
            face = max(2.0, hull_half_beam(z) - inset)
            tag = f"{band}_{z:.0f}"
            for sign in (-1, 1):
                x = sign * face
                cube(f"balcony_{tag}_{sign}_floor", (2.0, 0.14, 5.4),
                     (x + sign * 0.9, y + 0.07, z), mats["deck"], 0.0)
                cube(f"balcony_{tag}_{sign}_glass", (0.12, 1.1, 5.2),
                     (x + sign * 1.85, y + 0.65, z), mats["glass"], 0.0)
                cube(f"balcony_{tag}_{sign}_cap", (0.24, 0.1, 5.4),
                     (x + sign * 1.85, y + 1.25, z), mats["steel"], 0.0)
                cube(f"balcony_{tag}_{sign}_div", (1.9, 2.4, 0.14),
                     (x + sign * 0.9, y + 1.2, z + 3.1), mats["bulkhead"], 0.0)
                cube(f"balcony_{tag}_{sign}_door", (0.1, 2.0, 1.6),
                     (x - sign * 0.06, y + 1.0, z - 1.0), mats["glass"], 0.0)
                cube(f"balcony_{tag}_{sign}_soffit", (2.1, 0.12, 5.4),
                     (x + sign * 0.95, y + 2.5, z), mats["bulkhead"], 0.0)


def build_windows(mats):
    """Window bands on the shell, wherever no compartment glazes it already.

    Deck 3 has no compartment on it at all, so it runs the whole length. Deck 2
    skips the dining room; the promenade's inboard glazing and the wheelhouse
    front belong to the compartments that own those faces.
    """
    bands = (
        (-0.4, 1.6, 40, 250.0, DINING_Z),  # Deck 2: galley, atrium, stores.
        (2.8, 1.6, 40, 250.0, None),       # Deck 3.
    )
    for band, (y, height, count, span, skip) in enumerate(bands):
        for z in grid(count, span):
            if skip and not outside(z, skip):
                continue
            face = half_beam_at(z) + 0.06
            for sign in (-1, 1):
                cube(f"window_{band}_{sign}_{z:.0f}", (0.12, height, 4.4),
                     (sign * face, y + height / 2, z), mats["glass"], 0.0)
                cube(f"mullion_{band}_{sign}_{z:.0f}", (0.16, height + 0.24, 0.24),
                     (sign * face, y + height / 2, z + 2.4), mats["trim"], 0.0)

    # The sun-deck house on deck 8, the one block at that level with a side to
    # glaze. Sampled at its own stations so the glass sits on the wall.
    for index, offset in enumerate(grid(12, 76.0)):
        z = offset - 58.0
        face = max(2.0, hull_half_beam(z) - 3.6) + 0.06
        for sign in (-1, 1):
            cube(f"window_aft_{sign}_{index}", (0.12, 2.0, 4.4), (sign * face, 20.0, z),
                 mats["glass"], 0.0)
            cube(f"mullion_aft_{sign}_{index}", (0.16, 2.3, 0.24), (sign * face, 20.0, z + 2.4),
                 mats["trim"], 0.0)

    # Wing-house glazing. The wheelhouse front is the bridge compartment's own
    # fore bulkhead; the wings are outboard of it and exterior-only.
    for sign in (-1, 1):
        cube(f"bridge_wing_glass_{sign}", (0.16, 2.2, 4.6), (sign * 16.4, 23.4, 96.0),
             mats["glass"], 0.0)
        cube(f"bridge_wing_glass_fwd_{sign}", (4.6, 2.2, 0.16), (sign * 14.0, 23.4, 98.4),
             mats["glass"], 0.0)


def build_funnels(mats):
    """The funnels, in full, standing over the pool deck's own casings.

    The pool-deck compartment is anchored at z = -10.5 and puts its casings at
    local -30 and -18, so they belong here at -40.5 and -28.5. This one is drawn
    a little larger all round, so where both are resident the compartment's
    casing sits inside it and never fights it for the same face — and a funnel
    that stopped at the deckhead below would be a ship with no funnel from the
    sea. If these two ever disagree on z the ship grows a chimney that is only
    there from the outside.
    """
    for index, z in enumerate((-40.5, -28.5)):
        cube(f"funnel_{index}", (8.4, 11.6, 9.4), (0, 24.2, z), mats["hull"], 0.35)
        cube(f"funnel_{index}_band", (8.8, 1.4, 9.8), (0, 28.4, z), mats["coral"], 0.0)
        cube(f"funnel_{index}_cap", (9.0, 0.5, 10.0), (0, 30.2, z), mats["steel"], 0.0)
        for uptake in range(3):
            cylinder(f"funnel_{index}_uptake_{uptake}", 0.9, 3.0,
                     (-2.6 + uptake * 2.6, 31.4, z), mats["steel"], 12)
        for sign in (-1, 1):
            cube(f"funnel_{index}_wing_{sign}", (2.2, 5.6, 7.0), (sign * 5.2, 21.4, z),
                 mats["hull"], 0.2)
    cube("funnel_logo", (0.2, 3.4, 3.4), (4.3, 26.0, -40.5), mats["neon_pink"], 0.0)


def build_boats(mats):
    """Lifeboats swung out on their davits, clear of the promenade below them.

    Outboard of the shell rather than on it: that is where a real ship stows them
    once they are turned out, it keeps them off the promenade walk and clear of
    the deck 6 balconies, and it is the read that survives from two hundred
    metres away.
    """
    for index, z in enumerate(grid(9, 190.0)):
        for sign in (-1, 1):
            x = sign * 20.4
            arm = sign * 18.6
            outline = [
                (x - 1.7, z - 4.6), (x + 1.7, z - 4.6), (x + 2.2, z),
                (x + 1.7, z + 4.6), (x - 1.7, z + 4.6), (x - 2.2, z),
            ]
            # `prism` bakes its vertices in ship space and leaves the object at
            # the origin, so the outline carries the offset rather than a later
            # translation.
            prism(f"boat_{index}_{sign}", outline, 10.8, 12.6, mats["orange"])
            cube(f"boat_{index}_{sign}_strake", (4.6, 0.24, 9.4), (x, 12.5, z),
                 mats["bulkhead"], 0.0)
            cube(f"boat_{index}_{sign}_canopy", (3.4, 0.9, 8.6), (x, 13.1, z),
                 mats["canvas"], 0.15)
            for davit in (-1, 1):
                cube(f"boat_{index}_{sign}_davit_{davit}", (0.34, 5.0, 0.34),
                     (arm, 13.4, z + davit * 3.8), mats["steel"], 0.0)
                cube(f"boat_{index}_{sign}_arm_{davit}", (3.6, 0.3, 0.3),
                     ((arm + x) / 2, 15.7, z + davit * 3.8), mats["steel"], 0.0)
                cube(f"boat_{index}_{sign}_fall_{davit}", (0.1, 2.2, 0.1),
                     (x, 14.5, z + davit * 3.8), mats["steel"], 0.0)


def build_details(mats):
    """Everything that stops the silhouette reading as a bar of soap."""
    # Foremast, radar and the whistle platform. The mainmast aft belongs to the
    # sun deck, which stands it at its own z.
    cylinder("foremast", 0.5, 14.0, (0, 32.0, 96.0), mats["steel"], 12)
    for index in range(3):
        cube(f"foremast_yard_{index}", (9.0 - index * 2.4, 0.24, 0.24),
             (0, 29.0 + index * 4.0, 96.0), mats["steel"], 0.0)
    cylinder("radar_scanner", 2.6, 0.24, (0, 38.6, 96.0), mats["steel"], 14)
    cylinder("radar_dome", 1.4, 1.6, (0, 37.0, 96.0), mats["bulkhead"], 12)
    for sign in (-1, 1):
        cube(f"whistle_{sign}", (0.7, 1.6, 0.7), (sign * 2.4, 30.6, 94.0), mats["brass"], 0.1)
        cylinder(f"satcom_{sign}", 1.5, 1.5, (sign * 6.0, 22.4, 92.0), mats["bulkhead"], 12)
        cylinder(f"satcom_{sign}_dish", 1.1, 0.3, (sign * 6.0, 23.4, 92.0), mats["bulkhead"], 12)

    # Ground tackle forward, mooring gear aft, and the shell doors between.
    for sign in (-1, 1):
        cylinder(f"anchor_pocket_{sign}", 1.5, 1.0, (sign * 5.2, 2.6, 130.0), mats["boot"], 12,
                 (0.0, math.pi / 2, 0.0))
        cube(f"anchor_{sign}", (0.5, 2.6, 2.0), (sign * 5.4, 2.6, 130.0), mats["steel"], 0.1)
        cube(f"windlass_{sign}", (2.4, 1.4, 3.0), (sign * 5.0, 9.6, 134.0), mats["steel"], 0.1)
        for index, z in enumerate((-142.0, -136.0, 134.0, 140.0)):
            cylinder(f"bollard_{sign}_{index}", 0.35, 1.2, (sign * 8.0, 9.4, z), mats["steel"], 8)
        for index, z in enumerate(grid(7, 210.0)):
            cylinder(f"fairlead_{sign}_{index}", 0.4, 0.5, (sign * half_beam_at(z), 8.2, z),
                     mats["steel"], 8, (0.0, math.pi / 2, 0.0))
        for index, z in enumerate((-92.0, 4.0, 74.0)):
            cube(f"shell_door_{sign}_{index}", (0.14, 3.0, 4.0),
                 (sign * (half_beam_at(z) + 0.04), 2.4, z), mats["trim"], 0.0)

    # Name and markings — the cheapest thing that makes a hull a named vessel.
    # Carried low enough on the bow to stay clear of the deck 4 balconies.
    for index in range(8):
        z = 118.0 - index * 3.4
        for sign in (-1, 1):
            cube(f"name_bow_{sign}_{index}", (0.12, 1.6, 1.3),
                 (sign * (half_beam_at(z) + 0.09), 4.2, z), mats["bulkhead"], 0.0)
        cube(f"name_stern_{index}", (1.3, 1.6, 0.12), (-6.0 + index * 1.7, 4.2, -144.6),
             mats["bulkhead"], 0.0)
    for index, z in enumerate((134.0, -138.0)):
        for draft in range(9):
            for sign in (-1, 1):
                cube(f"draft_mark_{index}_{sign}_{draft}", (0.1, 0.3, 0.7),
                     (sign * (half_beam_at(z) + 0.08), -7.6 + draft * 1.0, z),
                     mats["bulkhead"], 0.0)

    # Navigation and hull lighting. The sidelights are the one place the palette's
    # neon is doing pilotage rather than decoration.
    cube("sidelight_port", (0.5, 0.6, 0.5), (-16.6, 23.4, 94.0), mats["neon_cyan"], 0.0)
    cube("sidelight_stbd", (0.5, 0.6, 0.5), (16.6, 23.4, 94.0), mats["neon_pink"], 0.0)
    cube("masthead_light", (0.5, 0.6, 0.5), (0, 40.2, 96.0), mats["neon_amber"], 0.0)
    cube("stern_light", (0.5, 0.6, 0.5), (0, 22.2, -102.0), mats["neon_amber"], 0.0)
    for index, z in enumerate(grid(18, 240.0)):
        for sign in (-1, 1):
            cube(f"hull_light_{index}_{sign}", (0.28, 0.3, 0.28),
                 (sign * (half_beam_at(z) + 0.1), 4.2, z), mats["neon_amber"], 0.0)
            cube(f"house_light_{index}_{sign}", (0.3, 0.34, 0.3),
                 (sign * max(2.2, hull_half_beam(z) - 2.0), 17.7, z), mats["neon_cyan"], 0.0)


def main():
    print("Building the MS Cabin Mayhem exterior")
    kit.new_scene()
    mats = kit.build_materials()
    root = kit.exterior_root()

    build_hull(mats)
    build_superstructure(mats)
    draw_meshes = kit.join_by_material(root, "STRUCTURE")

    build_balconies(mats)
    build_windows(mats)
    build_funnels(mats)
    build_boats(mats)
    build_details(mats)
    draw_meshes += kit.join_by_material(root, "DRESSING")

    kit.export_exterior(root, draw_meshes)
    print(f"Done: LOA {LOA:.0f} m, beam {BEAM:.0f} m, {draw_meshes} draw meshes")


if __name__ == "__main__":
    main()
