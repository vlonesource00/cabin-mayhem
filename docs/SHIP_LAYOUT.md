# Ship Layout

_MS Cabin Mayhem_ — the authored compartment graph. This file describes what
[`src/data/ship-layout.ts`](../src/data/ship-layout.ts) declares; that file is
the source of truth, this one is why. Every compartment listed here is one
authored GLB, one node in the portal graph and one entry in
`public/assets/manifest.json`, and every number below is checked by
`pnpm validate:data` on every run.

## Rules

- **One compartment, one GLB, one budget.** No compartment ships as part of
  another. Streaming granularity is the compartment.
- **Compartments connect only through portals** — doors, hatches, stair-tower
  landings and open deck edges. The portal graph is authored data, not inferred
  from geometry, and both sides of a portal must resolve to the same point in
  ship space.
- **Geometry is presentation.** Collision, interaction volumes and job targets
  live in validated `src/data/` definitions and host simulation rules, never in
  the GLB. A missing or corrupt compartment GLB degrades to greybox and the
  voyage continues.
- **Nothing on the critical path may live in exactly one compartment** unless
  losing it is the point. The helm is the deliberate exception.
- **Everything is authored in GLB.** Procedural geometry exists only as the
  fallback that keeps the voyage running when a GLB is missing or fails
  validation. It is never the shipped look.

## Ship space

The origin is amidships on the centreline at the waterline: **+X to starboard,
+Y up, +Z towards the bow**. The hull never translates, so a compartment's
anchor says where in the actual vessel it sits, and the streamer places a
resident compartment by its delta from the occupied one.

| Quantity           | Value  | Note                                                    |
| ------------------ | ------ | ------------------------------------------------------- |
| Length overall     | 290 m  | Hull spans z ∈ [−145, +145]                             |
| Moulded beam       | 38 m   | Hull spans x ∈ [−19, +19] amidships                     |
| Draught            | 8.4 m  | Keel at y = −8.4, waterline at y = 0                    |
| Air draught        | 45 m   | Waterline to the mast trucks                            |
| Deck-to-deck pitch | 3.2 m  | 2.8 m clear headroom plus 0.4 m of deckhead             |
| Deck 0 floor       | −7.2 m | The tank top, 1.2 m above the keel over a double bottom |
| Topmost deck       | 9      | Sun deck and bridge; funnels and masts are above it     |

`deckFloorY(deck) = deck × 3.2 − 7.2`, so deck 2 — the main deck — is at
−0.8 m, the promenade at deck 5 is +8.8 m, and the sun deck at deck 9 is
+21.6 m. A compartment's `anchor.y` must equal `deckFloorY(deck)`; the
validator rejects a floor that misses the pitch.

The hull is not a box. `halfBeamAt(z)` is the moulded half-beam curve: full
beam through the parallel midbody, fining to a stem forward and narrowing to a
transom aft. The exterior builder lofts the plating on it, the deck-edge
geometry follows it, and [`src/app/deck-plan.ts`](../src/app/deck-plan.ts)
draws the ship's waterplane from the same function — so all three agree by
construction rather than by anyone remembering to update three files.

## Scale and density

The ship is big. Tall and massive, dense with objects and detail inside and
out, and stocked with what a real cruise ship actually has. That is a design
requirement, not a stretch goal, and it is the reason every technique in
[`PERFORMANCE.md`](PERFORMANCE.md) exists.

Density is measured, not eyeballed. Per full-detail compartment:

- **placement before quantity.** A room reads as designed when the furniture
  answers to something — a service route, a sightline, a queue, a bulkhead.
  Scattered props at the right count still read as scattered props.
- at least 40 distinct authored props, and enough repeated dressing that the
  space reads as lived-in rather than as a box with four objects in it,
- every repeated prop through `InstancedMesh` where the instancing is free,
- signs of life that cost nothing per frame: fixed clutter, wear, signage,
  lighting colour and silhouette variation.

The per-compartment `budget` is a sanity rail, not a design constraint: 320
draw meshes and 24 MB, set where a genuinely broken export trips it rather than
where a well-dressed room does. Detail is bought with geometry and paid for by
the LOD tiers and the eviction radius, never by deleting content.

## The authored ship

Fourteen compartments on eight of the ten numbered decks, plus the exterior.
This is the whole graph — there is no longer a gap between "documented" and
"authored".

| Deck | Compartment        | Label               | Extent (x × y × z) | Anchor z | Exposure | Glazed         |
| ---- | ------------------ | ------------------- | ------------------ | -------- | -------- | -------------- |
| 0    | `engine-room`      | Engine room         | 26 × 6.4 × 44      | −43      | interior | no             |
| 0–9  | `stairwell-aft`    | Aft stair tower     | 11 × 32 × 12       | −15      | interior | no             |
| 1    | `crew-corridor`    | Crew corridor       | 5 × 2.8 × 46       | +14      | interior | no             |
| 1–9  | `stairwell-mid`    | Midship stair tower | 11 × 28.8 × 12     | +43      | interior | no             |
| 2    | `main-galley`      | Main galley         | 24 × 2.8 × 32      | −37      | interior | no             |
| 2–5  | `atrium`           | Grand atrium        | 24 × 12.8 × 46     | +14      | interior | yes            |
| 2    | `dining-room`      | Main dining room    | 28 × 2.8 × 44      | +71      | interior | yes            |
| 4    | `cabin-deck-four`  | Cabin deck four     | 34 × 2.8 × 60      | −51      | interior | yes            |
| 5    | `promenade`        | Promenade deck      | 38 × 3.2 × 260     | 0        | exterior | yes            |
| 5–9  | `stairwell-fwd`    | Forward stair tower | 11 × 16 × 12       | +84      | interior | no             |
| 7    | `cabin-deck-seven` | Cabin deck seven    | 30 × 2.8 × 29      | +63.5    | interior | yes            |
| 8    | `pool-deck`        | Lido pool deck      | 34 × 6 × 119       | −10.5    | exterior | yes            |
| 9    | `sun-deck`         | Sun deck            | 30 × 6 × 74        | −58      | exterior | yes            |
| 9    | `bridge`           | Navigating bridge   | 26 × 3.4 × 12      | +96      | interior | yes, panoramic |

Notes on the ones that are not simply a room on a deck:

- **`atrium` is four decks tall** (2 through 5) with the well punched through
  it, so a guest on the promenade looks down into reception. `decksTall` and
  `size.y` must agree, and the validator checks it.
- **`promenade` is 260 m of teak** wrapping the whole ship at the freeboard
  deck. It is one compartment because it is one continuous walk; it is also the
  only compartment that reaches all three stair towers.
- **`pool-deck` and `sun-deck` have extents taller than a deck** — 6 m against
  a 3.2 m pitch — because they are open to the sky and the extent has to
  contain the funnel casings, awnings and rigging standing on them.
- **The stair towers are hubs, not rooms.** `stairwell-aft` carries eight
  portals, one per landing, at the same x/z and different y. That is what makes
  the ship climbable, and it is why the towers are the leanest compartments
  aboard: standing in one makes eight rooms full-detail residents.
- **`bridge` is `panoramic`.** Its glazing looks down the whole foredeck, so it
  is the one glazed interior that keeps the exterior at X0 (see
  [`PERFORMANCE.md`](PERFORMANCE.md) section 5).

## Portal graph

```text
                                 bridge ─────────┐            [Deck 9]
                                 sun-deck ───┐   │
                                 pool-deck ──┤   │            [Deck 8]
                          cabin-deck-seven ──┼───┤            [Deck 7]
                                 promenade ──┼───┼─ stairwell-fwd   [Deck 5]
                           cabin-deck-four ──┤   │            [Deck 4]
              atrium ── dining-room ─────────┤   │            [Deck 2]
              main-galley ───────────────────┤   │            [Deck 2]
              crew-corridor ─────────────────┤   │            [Deck 1]
              engine-room ───────────────────┘   │            [Deck 0]
                    stairwell-aft ── stairwell-mid┘
```

Read it as: **every room hangs off a stair tower, and the towers are the only
things that connect decks.** No room-to-room door crosses a deck, so crew
movement between decks costs a climb — which is the whole point of putting the
helm nine decks above the engine room.

| Tower           | Decks | Landings                                                                                         |
| --------------- | ----- | ------------------------------------------------------------------------------------------------ |
| `stairwell-aft` | 0–9   | engine-room, crew-corridor, main-galley, atrium, cabin-deck-four, promenade, pool-deck, sun-deck |
| `stairwell-mid` | 1–9   | crew-corridor, atrium, dining-room, promenade, cabin-deck-seven, pool-deck                       |
| `stairwell-fwd` | 5–9   | promenade, cabin-deck-seven, bridge                                                              |

`pnpm validate:data` proves the graph is symmetric, that both sides of every
portal land on the same ship-space point, that it is reachable from
`defaultCompartmentId` and that it is loop-free in the sense that matters (no
portal that is its own return).

## Reading the ship in game

Hold **N** during a voyage to raise the deck plan: a longitudinal section of
the whole vessel and a plan of the deck being walked, both at one true scale,
with the occupied compartment marked. It is built by
[`src/app/deck-plan.ts`](../src/app/deck-plan.ts) from the layout data alone —
not from the loaded GLBs — so it stays honest when nothing has streamed in and
a room that moves in the data moves on the plan with no one redrawing anything.

## What the exterior owns

The exterior is not a compartment. It is never occupied, never evicted, never a
portal target, and it is resident from the first frame because it is what the
crew sees from every open deck and through every window. The ownership line
(ADR 0003):

- **The exterior owns** the shell, the plating, the sheer, the superstructure
  block, balconies, windows seen from outside, funnels, masts, lifeboats and
  every rail permanently outboard of or above the compartment volumes.
- **A compartment owns** whatever stands on its own deck.

Nothing is authored twice. If a rail belongs to the promenade's deck it is the
promenade's; if it is the balcony line of a cabin tier nobody enters, it is the
exterior's.

## Streaming and budget

The player is in exactly one compartment. The renderer keeps resident:

- the current compartment at full detail,
- every compartment one portal away at full detail,
- every compartment two portals away at reduced detail,
- nothing beyond that,
- the exterior, always, at the tier `exteriorTier(origin)` returns.

Per-compartment budgets, instancing rules, LOD tiers and the frame budget that
enforces all of it are in [`PERFORMANCE.md`](PERFORMANCE.md).

## Authoring

Each compartment is generated by a deterministic Blender script under
[`tools/blender/compartments/`](../tools/blender/compartments/): repeatable from
source, no manual GUI steps, exported to a tracked GLB and validated by
`pnpm validate:assets` before it can ship. `build_compartments.py` builds all
fourteen in one headless run (over ten minutes); `build_exterior.py` builds the
hull alone in seconds. Shared geometry helpers live in `kit.py`.

Compartment GLBs must expose a stable root node `CM_<COMPARTMENT>_ROOT` and
declare their portals as named empties `CM_PORTAL_<TARGET>`, so the streaming
system binds the graph without hard-coded coordinates. The exterior additionally
splits its meshes into `CM_STRUCTURE_*` and `CM_DRESSING_*`, because the X1 tier
hides the dressing and the loader refuses an export that lost the distinction.

Glazing is authored as `glass` (tinted, only ever seen from outside) and
`glass_clear` (a pane the crew stands behind, exported `alphaMode: BLEND` at
0.17 opacity). `dressLoadedMesh` in
[`src/three/compartment-loader.ts`](../src/three/compartment-loader.ts) then
turns off depth writes, culls the back face — Blender exports every material
double sided, which would tint a closed pane twice — and stops the pane casting
a shadow, since a shadow map has no notion of opacity.

## Beyond the authored set

Fourteen compartments is the working ship, not the ceiling. A real cruise liner
is closer to seventy spaces, and the architecture is designed so adding one is
data plus a GLB, never an engine change. Named candidates, in rough priority
order:

- **Engineering** — generator room, pump room, cold store, workshop, ballast
  control, water treatment
- **Guest** — shopping arcade, theatre, casino, bars, spa and gym, kids' club,
  library, observation lounge, more cabin tiers
- **Crew** — crew mess, crew bar, laundry, medical bay, purser's office, stores
- **Command** — chart room, radio room, captain's cabin, emergency control
- **Safety and exterior** — muster stations, lifeboat davits at deck level,
  foredeck and windlass, tender bay

Restricted compartments — a reinforced command centre, a smuggler's hold, a
sealed and damaged lower deck — stay out of the table until they have a gating
rule more interesting than "buy the upgrade". Recorded as an open decision in
[`GAME_DESIGN.md`](GAME_DESIGN.md).

Every addition pays the same tolls: one build script, one GLB inside budget, a
symmetric portal pair onto a stair tower, and a reason it is not just another
empty room.
