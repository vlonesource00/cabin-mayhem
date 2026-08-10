# Next conversation prompt

Copy everything inside the block below into a new conversation with this
repository selected. It is self-contained: it carries the constants, conventions
and fault classes that are expensive to re-derive, so a fresh session can resume
the cruise-map work without re-reading the whole 3600-line builder.

```text
/opus5-long-work

Continue Cabin Mayhem in this repository:
C:\Users\Martim Costa\Desktop\nigger\Dear Passengers clone

Cabin Mayhem is an original cooperative cruise-ship game. Vite + TypeScript +
Three.js are the game runtime; Tauri v2 + Rust wrap the same web build as a
Windows EXE. Do not convert it to another engine or a 2D/top-down game.

CURRENT BRANCH: luna-attempt-at-cruise-map-design, at dc1a20b.
Stable branch: novo-main-stable (protected: PR, `verify` green, one approval).
Do not merge into novo-main-stable without being told to.
Never commit TURN credentials. Never stage .codex-remote-attachments/.

== THE STANDING INSTRUCTION ==

"ye but the map isn't finished so get to work, continue with the map task just
like u were doing"

The task is the cruise-ship map: a full boat on the water, exterior AND
interior, balconies, windows, outside areas, genuinely stacked decks, reading
and feeling like a real cruise ship in size and presence. Portals between decks
are allowed provided the exterior still reads as a boat.

Constraints the user has stated and that are still in force, verbatim:
- "outside looks insanely good but its needs MUCH MUCH MUCH more detail inside,
  in terms of placement logic (where things are have to make sense), actual
  design of the rooms and etc." (traversal is done and green; interior detail is
  the work in progress)
- "ensure there's no z clipping, no stair going no where, that things are
  populated with stuff and design with very high end detail, we can take as much
  time as u want"
- "estimate how much of this task is left and then continue, try to achieve the
  perfectionism while not taking as long" — keep the quality bar, batch the
  remaining builders, do fewer larger verification runs rather than an
  exhaustive hand-audit per room.
- "forget about debt, forget about max size per file and strict performance, the
  game has to feel good and look good." Per-GLB mesh/byte budgets are no longer
  gates; raise them rather than trim the ship.
- The old dressing was "just gibberish of objects randomly set up" — arrangements
  must be deliberate.
- "build" means the Tauri release package (`pnpm desktop:build`), not just
  `pnpm build`.

== WHERE THE WORK STANDS ==

Working tree: one uncommitted modification to
tools/blender/compartments/build_compartments.py (the build_pool_deck rewrite).
Nothing has been committed, compiled, built or Blender-run since that edit.

Rooms finished to the required standard:
atrium, dining-room, cabin-deck-four, cabin-deck-seven, main-galley,
engine-room, crew-corridor, bridge, sun-deck, pool-deck (new, UNVERIFIED).

Still to rewrite in build_compartments.py:
1. build_promenade  (around line 2806)
2. tower_dressing   (around line 3599 after the pool-deck rewrite shifted it)

Both designs are fully derived and recorded below — write them, do not redesign
them.

== SHIP SPACE AND DECK DATUM ==

Origin amidships on the centreline at the waterline. +X starboard, +Y up,
+Z bow. LOA 290 (z in [-145, 145]), beam 38 (x in [-19, 19]), draught 8.4,
air draught 45.

deckFloorY(deck) = deck * DECK_PITCH + DECK_ZERO_Y = deck * 3.2 - 7.2
DECK_PITCH 3.2, DECKHEAD 0.4, DECK_ZERO_Y -7.2, TOP_DECK 9.
Deck 4 = 5.6; deck 5 promenade = SHEER = 8.8; deck 7 = 15.2; deck 8 lido = 18.4;
deck 9 = 21.6. Clear height inside an ordinary compartment is 2.8.

A compartment is authored about its OWN floor centre: floor plane y = 0, origin
midway along x and z.

== kit.py API SURFACE (the facts that are expensive to re-derive) ==

build_compartments.py imports exactly:
    import kit
    from kit import (DECK_PITCH, cube, cylinder, grid, hull_half_beam, railing,
                     window_band, yaw_towards)
So CLIMB_RUN_Z, SWITCHBACK_HALF_Z, WELL_CENTRE_X, WELL_HALF_X, FLIGHT_RUN,
LANDING_DEPTH, LOA, BEAM, TOP_DECK must be referenced as kit.<NAME>.

kit.PALETTE keys — the ONLY valid mats[...] keys:
    deck, carpet, bulkhead, trim, wood, brass, steel, teal, coral, glass, hull,
    boot, orange, canvas, water
kit.EMISSIVE keys: neon_cyan, neon_pink, neon_amber, screen

kit.cube(name, size, position, mat, bevel=0.03, rotation=(0,0,0))
    Box CENTRED on position. `dimensions` sets local scale ignoring rotation, so
    rotated boxes are safe.
kit.cylinder(name, radius, depth, position, mat, verts, rotation=(0,0,0))
    Axis default vertical (ship +Y); rotation=(pi/2,0,0) lays it along ship z;
    rotation=(0,pi/2,0) lays it along ship x.
kit.grid(count, span): step = span/count;
    returns [-span/2 + step*(i+0.5) for i in range(count)]; [] for count <= 0.
kit.world_location(x, y, z) -> (x, -z, y)  (glTF export_yup maps Blender
    (x,y,z) to glTF (x,z,-y)).
kit.mesh_from runs fix_normals -> normals_make_consistent(inside=False). A solid
    prism's bottom face points downward and renders black from below.

kit.shell wall convention: each wall band is a cube CENTRED on `fixed`,
    thickness 0.14, so the INTERIOR FACE IS AT half - 0.07. ENV_Deck is
    (width, 0.12, length) at y -0.06 (top at y 0); ENV_Deckhead at height + 0.06.
    Door cut door_w = 1.6, door_h = 2.1. Portal side classification order:
    pz >= half_z - 0.5 -> fore; pz <= -half_z + 0.5 -> aft;
    px <= -half_x + 0.5 -> port; else starboard.

kit.window_band(mats, name, span, y, sill, head, fixed, vertical,
                thickness=0.08, mullion=2.6)
    Glass cube of thickness 0.08 centred on `fixed`; mullions at
    bays = max(1, round(extent/2.6)) + 1 positions.

kit.railing(mats, name, points, y, height=1.12, spacing=2.4, mat="steel")
    Per segment two rails (run, 0.05, 0.05) at y+height and y+height*0.55, yawed
    by yaw_towards(dx, dz); then posts = max(2, int(run/spacing)+1) posts of
    (0.06, height, 0.06) at y+height/2, INCLUSIVE OF BOTH ENDS.
    ** Two abutting rail calls sharing a corner draw two identical coincident
    posts — cross rails must be inset about 0.3. A single multi-point polyline
    also duplicates a post at every interior vertex. **

kit.hull_half_beam(z): t = clamp(z/(LOA/2), -1, 1); parallel = 0.45;
    full = BEAM/2; if abs(t) <= 0.45 return full; else
    fraction = (abs(t)-0.45)/0.55, and for t>0 return full-(full-2.2)*f**1.6,
    for t<0 return full-(full-9.5)*f**1.4.
    Derived: hull_half_beam(+-65.25)=19.0; fore 80->17.74, 100->14.56,
    110->12.24, 114->11.12, 118->10.43, 120->9.69, 126->8.03, 128->7.51,
    130->7.04; aft -80->18.08, -100->15.99, -120->13.41, -127->12.36,
    -130->11.93.

build_compartments.py local helper, lines 44-54:
    def wall_segments(start, end, doors, door_w=1.6):
        edges = [start]
        for centre in sorted(doors):
            edges.extend([centre - door_w/2, centre + door_w/2])
        edges.append(end)
        return [(edges[i], edges[i+1]) for i in range(0, len(edges)-1, 2)
                if edges[i+1] - edges[i] > 0.05]

Other local helpers already in the file: counter(), shelf_unit(), ladder(),
pipe_run(), gauge_panel(), hazard_lane(), slab(), stair_flight(), slope_rail(),
planter(), bench(), lounge_set(), shop_unit().
    counter(..., lip=...) only produces a Z-AXIS upstand, so a fore-and-aft
    bench must use lip=0.

== ROTATION ALGEBRA (established; reuse exactly) ==

- Yaw about ship +Y  => rotation=(0, 0, yaw) with yaw_towards(dx, dz).
- Rotation about +Z  => rotation=(0, theta, 0); up = (sin t, cos t, 0).
- Rotation about +X  => rotation=(a, 0, 0); length axis becomes ship
  (0, sin a, -cos a), height axis (0, cos a, sin a).
- For a run from (y_foot, z_foot) to (y_head, z_head): a = atan2(dy, -dz) aligns
  the length axis (this is slope_rail's `pitch`), but its height axis points
  DOWN when dz > 0. Use a = atan2(dy, -dz) + pi when you also need a correct up.
- Raked panel in the x-y plane (rotation=(0, a, 0)), height h, thickness t:
  x half-extent = (h*|sin a| + t*cos a)/2; bottom-edge midpoint at
  (x_foot, y_foot, z) => centre (x_foot + h/2*sin a, y_foot + h/2*cos a, z).
- A yaw (0,0,theta) can NEVER place a spoke in a raked wheel's plane.

== STAIR TOWERS ==

Unrolled mapping lives in src/sim/compartment-space.ts: each deck takes one
FLIGHT_RUN (6 m); the first LANDING_DEPTH (2.4 m) is the flat landing running
aft->forward, the remainder is the flight climbing forward->aft.
kit.py: FLIGHT_RUN 6.0, LANDING_DEPTH 2.4, SWITCHBACK_HALF_Z 6.0,
CLIMB_RUN_Z 5.0, WELL_CENTRE_X 4.3, WELL_HALF_X 1.2; WELL_ENTRY 0.2 (TS only).
On a flight, blend = min(1, frac/WELL_ENTRY) pulls x from deck-x to well-x —
that funnel is geometry, not error. The switchback discontinuity is real; tests
sample inside runs, never across lips.
A stair tower's `deck` field says only where the shaft STARTS.

For an 11 x H x 12 tower: half_x 5.5, half_z 6.0, well_x0 3.1, well_x1 5.5,
well_z0 1.0. The aft landing plate covers z in [-6, 1] full width; the inboard
plate covers x in [-5.5, 3.1] over z in [1, 6]; the outboard plate is NOT drawn
(half_x - well_x1 = 0 < 0.05). The stair well opening is x in [3.1, 5.5],
z in [1, 6]; treads run z 6 -> 1 at 0.3125 per tread. Interior bulkhead faces:
x = +-5.43, z = +-5.93.

== ROOMS AND TOWERS TABLES (unchanged, for reference) ==

ROOMS: engine-room d0; crew-corridor d1; main-galley d2; atrium d2;
dining-room d2; cabin-deck-four d4; promenade d5 (portals at x -5.5,
z -15 / 43 / 84); cabin-deck-seven d7; pool-deck d8 (portals at x 5.5,
z -4.5 and 53.5); sun-deck d9; bridge d9.

TOWERS: stairwell-aft base 0, (11, 32, 12), 8 portals;
stairwell-mid base 1, (11, 28.8, 12), 6 portals;
stairwell-fwd base 5, (11, 16, 12), 3 portals.

Landing/door audit: stairwell-aft has 10 landings (32 // 3.2) but only 8 doors —
levels y 19.2 and 22.4 have NONE. stairwell-mid 9 landings, 6 doors.
stairwell-fwd 5 landings, 3 doors. Base decks 0, 1, 5, so landing index i is
deck base_deck + i, and every tower deck number is a single digit 0-9.

== PENDING REWRITE 1: build_promenade ==

Current on-disk faults to fix: deck chairs are flat slabs with a detached back;
jogging track marks float at y 0.07 above a deck whose top is y 0.00; lifebuoys
float with a bracket that does not reach them; fixtures use fixed insets even
where the walk narrows to 1.54 m forward; promenade_soffit covers x in
[-5.5, 5.5], i.e. INSIDE the deckhouse — it roofs nothing the player walks under.

Structural facts that must survive: doors = [-15.0, 43.0, 84.0] cut ONLY into
the PORT deckhouse face; house_x = 5.5; 52 hull-cut plating stations over span
260 (z in [-130, 130]); window_band bays of about 6 m. It is not a `shell` — the
doors are in the inboard face, which is exactly the case shell's portal-to-side
classification gets wrong, so it is authored by hand.

Design, settled:
- house_x 5.5; exposed deckhouse face at face_x 5.60; canopy outboard edge
  canopy_x 10.10; beam(z) = min(19, hull_half_beam(z)).
- Three-band plating per station: steel waterway 0.30 wide at house_x + 0.15,
  teak field, trim covering board 0.55 wide at half - 0.275 — all at y -0.06,
  thickness 0.12, edge to edge.
- Covered strip replacing promenade_soffit: canopy per station
  cap = min(canopy_x, half - 1.6) at y 3.28 (bottom 3.20) with a fascia
  (0.20, 0.42, step) at cap - 0.10, y 3.07; columns every 4th station at
  cap - 0.35 (r 0.11, h 3.20) with base and capital (capital r 0.18 reaches the
  fascia).
- Rail authored BY HAND, not via kit.railing: one point list x = beam(z) - 0.30
  over 52 stations; three bars per segment at y 1.12 / 0.74 / 0.36 yawed
  (0, 0, yaw_towards(dx, dz)); posts 1.09 tall drawn once per point. End cross
  rails inset 0.30 (z +-129.7, x +-(beam - 0.60)).
- Deckhouse face: sill (y 0..1.0) and head (y 2.4..3.2) at |x| 5.40..5.60 via
  wall_segments; per-bay kick and rubbing strake between piers spanning
  (low + 0.18, high - 0.18); piers (0.16, 3.20, 0.36) at face_x + 0.08 on every
  bay boundary including both ends.
- Port door bays at z -15 / 43 / 84: jambs (0.34, 2.34, 0.26) at x -5.77,
  z centre +- 0.93; head (0.34, 0.36, 2.12) at y 2.52; lit sign
  (0.08, 0.44, 1.70) at x -5.98; mat 2.40 wide at x -7.40; wind screens 3.20
  wide spanning x -9.00..-5.80 at z centre +- 2.70 with posts at x -9.06.
- Zoning along z in [-130, 130]: aft terrace -128..-106 (benches at x +-5.91
  with back = -sign, planters at +-7.50, z offset +2.40 between benches);
  steamer-chair groups where half >= 18 (|z| <= about 72) at x_head = half - 7.6
  with a pedestal table at x_head + 0.75 between paired chairs at z +- 0.85;
  cafe terrace z -6..30 at x +-7.05; observation zone z 88..112 with rail
  telescopes at half - 1.30; chain barrier across the walk at z 118; the narrow
  forward tip beyond that carries only rail, covering board and lights.
- Jogging lane 1.40 wide at half - 2.60, y 0.02, only where half >= 13, with
  0.14-wide neon_cyan edge stripes at +-0.77 at the SAME y so they abut rather
  than overlap.
- Lifebuoy stations: back plate 0.06 thick at half - 0.50, buoy (r 0.38,
  depth 0.12, rotation=(0, pi/2, 0)) centred at half - 0.59 so the faces touch
  exactly, plus a post from the deck to the plate.
- Deck lights at half - 0.95 (x half-extent 0.12).
- Nested steamer(name, sign, x_head, z, lean=0.55) helper: legs at o 0.22/1.62
  (0.06 sq, h 0.36) at z +- 0.30; side rails (1.62, 0.07, 0.07) at o 0.92,
  y 0.395; armrests (1.10, 0.06, 0.09) at o 0.75, y 0.66 with posts at o 0.22
  and 1.25; FIVE seat slats (0.20, 0.05, 0.62) at o = 0.36 + i*0.30, y 0.455;
  raked back h 0.92, t 0.09 with a = -sign*lean and centre
  (px(0.18) + sin(a)*h/2, 0.46 + cos(a)*h/2, z). Five slats not six, because six
  put the first slat 0.019 inside the back panel.

== PENDING REWRITE 2: tower_dressing ==

Current on-disk faults: deck_sign is (1.2, 0.5, 0.08) — 1.2 m of X extent on an
X-NORMAL bulkhead, so its long axis points into the room, and it floats 0.14
clear of the interior face at -5.43 (mount at -half_x + 0.07 + t/2). deck_number
at x 5.25 spans [4.95, 5.55], PENETRATING the starboard interior face at 5.43,
same wrong-axis fault. landing_mat at level + 0.07 floats 0.06 above the plate
top (convention for flat inlays is 0.01-0.02). handrail is a single 7 m bar at
x -5.15 with no stanchions. extinguisher floats 0.2 off the wall with no
bracket; fire_plan floats 0.14 off the face. landing_light floats with no
fitting. Nothing marks which decks actually have a door — which is exactly the
"no stairs going nowhere" requirement.

Design, settled:
- New signature: tower_dressing(mats, size, landings, portals, base_deck).
  main() must be updated to pass portals and base_deck.
- Add a _tower_doors(portals, size, level) helper matching kit's classification
  order (fore -> aft -> port -> starboard) with abs(py - level) > 1e-6
  filtering.
- Constants via kit.CLIMB_RUN_Z, kit.WELL_CENTRE_X, kit.WELL_HALF_X,
  kit.SWITCHBACK_HALF_Z (they are NOT in the `from kit import` list).
- A cleared circulation cross: x in [-1.2, 1.2] over full z and z in [-1.2, 1.2]
  over full x; every fixture goes in the four quadrants.
- Seven-segment deck numbers as real geometry:
      SEGMENTS = {"a": (0.0, 1.0, True), "g": (0.0, 0.0, True),
                  "d": (0.0, -1.0, True), "f": (-1.0, 0.5, False),
                  "b": (1.0, 0.5, False), "e": (-1.0, -0.5, False),
                  "c": (1.0, -0.5, False)}
      DIGIT_SEGMENTS = {0:"abcdef", 1:"bc", 2:"abged", 3:"abgcd", 4:"fgbc",
                        5:"afgcd", 6:"afgecd", 7:"abc", 8:"abcdefg", 9:"abgfcd"}
  bar thickness t = min(w, h) * 0.16; horizontal segments span w - t across with
  y-extent t; vertical segments have across-extent t, length (h - t)/2, centred
  at y = cy + up*(h - t)/2; across offset a = across_factor * (w - t)/2. For an
  X-NORMAL wall: box (depth, y_ext, across_ext) at (cx, y, cz + a). For
  Z-NORMAL: box (across_ext, y_ext, depth) at (cx + a, y, cz). All tower deck
  numbers are single digits, so no multi-digit layout is needed.
- Decks WITH a real door get a lit threshold sill (z -5.80, depth 0.26,
  y level + 0.015), a floor mat, an exit sign above at y level + 2.35 on the
  wall face, and a bench. Decks WITHOUT get a blank "no exit" plate.
- Handrail at x -5.35 (0.06 square) with brackets 0.16 wide centred at -5.35 so
  they touch the wall face at -5.43; run split by wall_segments around any port
  door.
- Fire stations every third deck with brackets that actually touch their bottle;
  deckhead luminaires flush at level + 3.03 so their top (level + 3.08) meets
  the plate bottom; landing mats at y level + 0.015.
- Brass nosings on each tread:
  cube((2.4, 0.03, 0.08), (4.3, top + 0.015, 6 - run*t - 0.04)) with
  run = kit.CLIMB_RUN_Z / 16.

== THE STANDARD FAULT CLASSES TO AUDIT EVERY ROOM AGAINST ==

Buried plinths. Floating wall trim. Coincident SAME-FACING floor inlays.
Paint under posts and wheels. Window-mullion collisions. Duplicate railing
corner posts. Sub-parts overtopping their host. Mounted chains
(board -> bracket -> ring) leaving an air gap. Stairs that go nowhere.

Coincident-face rule: stacked boxes whose touching faces point OPPOSITE ways are
benign. The real faults are (a) two coplanar SAME-FACING surfaces, and (b)
genuine interpenetration of distinct props. Flat inlays are floated 0.01-0.02
above the deck. Coplanar-but-non-overlapping is fine. Small mounted sub-parts
penetrating their own host backplate are benign and must not be chased.

Draw-mesh count is a MATERIAL count, not a prop count — everything is joined per
material at export. Density is never paid for by deleting content.

Authoring pattern applied from the galley onward: paint the circulation lanes
FIRST, then set every fixture back off them, and derive each stacked prop's y
from the surface height a helper RETURNED rather than from a hand-copied
constant.

Exterior/compartment ownership rule (ADR D7): the exterior owns the shell and
everything permanently outboard of or above the compartment volumes; a
compartment owns what stands on its own deck.

== TOOLING ==

Blender 5.1.2 at C:\Program Files\Blender Foundation\Blender 5.1\blender.exe
(not on PATH). Invoke as:
    blender.exe --background --factory-startup --python <script>

For single-room iteration there is a scratchpad script build_one.py that sets
ONLY=<compartment-id> and runs one builder through kit.new_scene /
build_materials / compartment_root / export. Recreate it if the scratchpad is
gone; it is 15 lines.

LIVE IN-BROWSER VERIFICATION IS IMPOSSIBLE in this environment —
requestAnimationFrame does not fire because the Browser pane is not displayed.
All verification is headless unit tests + typecheck + build.

TypeScript uses noUncheckedIndexedAccess; authored data is Zod-validated; the
simulation is deterministic fixed-step (1/60 s) with frame delta clamped to
50 ms. HostSession owns phase, voyage, guests, jobs, hazards and score.
PlayerCommand is replicated over PeerJS/WebRTC, so local-only view state must
NEVER be added to it.

Known grep rendering artefact — do NOT "fix" it: grep renders / as \ in some
contexts, e.g. wall_segments(-span \ 2, ...). The file on disk is correct.

== WHAT TO DO NEXT, IN ORDER == (all three are DONE; kept for the record)

1. Write build_promenade and tower_dressing to the designs above, including the
   new tower_dressing signature, the _tower_doors helper, the seven-segment
   numeral helper, and the matching main() call change.
2. Run ONE full Blender pass over all fourteen compartments:
   blender.exe --background --factory-startup --python
   tools/blender/compartments/build_compartments.py
   This is mandatory — the crew-corridor shell size changed and the pool deck
   has been rewritten.
3. Then: pnpm validate:data, pnpm validate:assets, npx tsc --noEmit,
   npx vitest run tests/unit, pnpm build, pnpm desktop:build (close any running
   cabin-mayhem.exe first).

Build-evidence baseline from before the bridge rewrite, for comparison:
    engine-room 15 meshes 2452.8 kB      crew-corridor 15 / 1502.0 kB
    main-galley 15 / 2925.6 kB           atrium 14 / 3529.0 kB
    dining-room 14 / 8190.8 kB           cabin-deck-four 14 / 5085.4 kB
    promenade 10 / 1559.2 kB             cabin-deck-seven 14 / 1706.6 kB
    pool-deck 17 / 921.0 kB              sun-deck 9 / 478.1 kB
    bridge 12 / 186.2 kB                 stairwell-aft 8 / 433.3 kB
    stairwell-mid 8 / 377.7 kB           stairwell-fwd 8 / 208.9 kB
    ship-exterior.glb 20 / 1929.3 kB

Build evidence AFTER the pass (14 compartments, 39.08 MB total, exit 0, only the
benign "No mesh data to join" warnings for material groups with no users):
    engine-room 15 / 2452.8 kB           crew-corridor 15 / 1502.0 kB
    main-galley 15 / 2925.6 kB           atrium 15 / 3530.2 kB
    dining-room 15 / 8192.0 kB           cabin-deck-four 15 / 5086.6 kB
    promenade 15 / 5117.1 kB             cabin-deck-seven 15 / 1707.8 kB
    pool-deck 17 / 3618.6 kB             sun-deck 15 / 2664.5 kB
    bridge 17 / 801.5 kB                 stairwell-aft 12 / 1024.3 kB
    stairwell-mid 12 / 893.6 kB          stairwell-fwd 12 / 499.2 kB
Rails are 320 draw meshes / 24 MB per compartment, so every room has room to
grow. Draw meshes count MATERIALS, not props — geometry is joined per material
at export.

== DONE SINCE THE TWO REWRITES ==

- Atrium well punched through the hull's y 8.66 weather-deck closure: hull_ring
  is an OPEN ring ordered port-top -> keel -> starboard-top with the top ends at
  +-gap(z) (gap = atrium half-width 12.0 inside z in [-9, 37], 0 elsewhere),
  lofted with closed=False, cap=True. house_main's solid bottom at y 8.80 is cut
  to match.
- Real glazing: glass_clear exports alphaMode BLEND at 0.17 opacity and
  dressLoadedMesh makes it safe (depthWrite false; side FrontSide, because
  Blender writes doubleSided on every material; no shadow casting or receiving).
- Deck plan on N — src/app/deck-plan.ts, a pure layout-data-to-SVG-string
  function, so it is testable in a suite with no DOM.
- Documentation remade: docs/SHIP_LAYOUT.md (rewritten in full),
  docs/PERFORMANCE.md, ARCHITECTURE.md, HANDOFF.md, TODO.md, docs/ROADMAP.md,
  plus docs/adr/0003-ship-layout-redesign.md and
  docs/adr/0004-stair-tower-traversal.md.
- The stale ship id gullwing-technical-fuselage is now ms-cabin-mayhem-atrium.
- Full Blender pass over all fourteen compartments, then validate:data,
  validate:assets, tsc --noEmit, vitest tests/unit, build and desktop:build — all
  green. Evidence is in HANDOFF.md under "Current verification".

== STILL OUTSTANDING ==

- The interior design pass. This is the open quality bar and it needs a human at
  the keyboard: rooms designed rather than filled, placement that makes sense,
  no stair to nowhere, no clipping.
- The perf smoke test on real hardware. requestAnimationFrame never fires in the
  agent environment, so nothing has been seen rendering and no frame-time,
  draw-call or texture-memory figure has been measured.
- Update .ordo/ledger.md — its "Next action" is stale (still says "Interior
  detail. Raise the per-compartment asset budgets...").

== DEFERRED, AWAITING THE USER'S CALL ==

- luna-attempt-at-cruise-map-design is an ORPHAN BRANCH: git merge-base --all
  against new-idea-vlone returns nothing. It cannot be merged back without
  --allow-unrelated-histories.
- claude-protected-pre-luna-cruise-map-2026-08-09 is a stash commit object
  promoted to a branch, so its tree holds only files that were TRACKED.
  Untracked files — build_exterior.py, compartment-space.ts,
  spectator-camera.ts, .ordo/ledger.md, and every .glb/.blend asset — live only
  in the separate parent 5089995. stash@{0} and HEAD are the complete copies.
- Whether to take over Luna's four items: rip out the 755-line auto-walk
  src/sim/waypoint-travel.ts in favour of the door-circle teleport prompt the
  user described; fix floating NPCs; replace synthesized-noise audio with
  sampled audio; the arm rig.

Explicit non-goals of the current slice: uniform spatial-hash broadphase; helm
positional authority; the collision-course incident end to end; snapshot delta
compression; the pirates / tsunami / birds / mall / upgrades verticals.

Open decisions to settle: Git LFS (assets about 19.6 MB and rising); one Blender
version; the gating rule for restricted compartments.

== PROTOCOL ==

Use .ordo/ledger.md only for durable project state, never as a transcript. Do
not re-read unchanged files. Run evidence-producing checks once after
implementation. No writer-verifier subagent pairs. Stop when the acceptance
criteria are met; do not gold-plate.
```
