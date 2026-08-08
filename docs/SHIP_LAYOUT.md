# Ship Layout

_MS Cabin Mayhem_ — the authored compartment graph. This file is the contract
between design, the Blender build scripts in `tools/blender/` and the streaming
system in `src/three/`. Every compartment listed here is one authored GLB, one
node in the portal graph and one entry in `public/assets/manifest.json`.

## Rules

- **One compartment, one GLB, one budget.** No compartment ships as part of
  another. Streaming granularity is the compartment.
- **Compartments connect only through portals** — doors, hatches, stairwells and
  open deck edges. The portal graph is authored data, not inferred from geometry.
- **Geometry is presentation.** Collision, interaction volumes and job targets
  live in validated `src/data/` definitions and host simulation rules, never in
  the GLB. A missing or corrupt compartment GLB degrades to greybox and the
  voyage continues.
- **Nothing on the critical path may live in exactly one compartment** unless
  losing it is the point. The helm is the deliberate exception.
- **Everything is authored in GLB.** Procedural geometry exists only as the
  fallback that keeps the voyage running when a GLB is missing or fails
  validation. It is never the shipped look.

## Scale and density

The ship is big. Tall and massive, dense with objects and detail inside and out,
and stocked with what a real cruise ship actually has. That is a design
requirement, not a stretch goal, and it is the reason every technique in
[`PERFORMANCE.md`](PERFORMANCE.md) exists.

Fixed dimensions, so geometry authored in different scripts agrees:

| Quantity                | Value | Note                                            |
| ----------------------- | ----- | ----------------------------------------------- |
| Length overall          | 290 m | Hull origin amidships, bow at +Z                |
| Beam                    | 38 m  | Centreline at x = 0                             |
| Draught                 | 8.4 m | Waterline is y = 0 in ship-local space          |
| Deck-to-deck pitch      | 3.2 m | 2.8 m clear headroom plus 0.4 m of deckhead     |
| Superstructure height   | 45 m  | Waterline to the top of the funnel              |
| Exterior decks readable | 14    | What the silhouette shows from outside          |
| Numbered playable decks | 6     | Decks 0–5 below; the rest are exterior geometry |

The two deck counts are deliberate and must not be reconciled by shrinking the
ship. The exterior reads as a full-height liner because that is the fantasy. The
interior graph is the six numbered decks in the tables below, growing toward the
seventy-odd spaces listed under _Beyond the initial set_. Unentered exterior
decks are hull, balconies, windows and railings only — silhouette, no rooms.

Density is measured, not eyeballed. Per full-detail compartment:

- at least 40 distinct authored props, and enough repeated dressing that the
  space reads as lived-in rather than as a box with four objects in it,
- every repeated prop through `InstancedMesh`, which is what makes the number
  above affordable inside the 40-draw-mesh budget,
- signs of life that cost nothing per frame: fixed clutter, wear, signage,
  lighting colour and silhouette variation, rather than more unique meshes.

Detail lives in silhouette, colour and instancing. It does not live in draw
calls. A compartment that is dense and over budget is not shippable, and the
answer is always merging, instancing or LOD — never deleting the content.

## Decks

### Deck 0 — Machinery (below the waterline)

| Compartment      | Purpose                                              | Hazards                    |
| ---------------- | ---------------------------------------------------- | -------------------------- |
| `engine-room`    | Propulsion. Speed and manoeuvre depend on it.        | Breakdown, fire, flooding  |
| `generator-room` | Electrical. Feeds lighting and every powered system. | Power failure, fire        |
| `pump-room`      | Bilge pumps. The flooding counter-measure.           | Flooding, breakdown        |
| `cold-store`     | Provisions. Source for every restock job.            | Power failure spoils stock |
| `crew-quarters`  | Crew bunks and mess. Spawn and respite.              | —                          |

Deck 0 is where breaches flood first and where the ship is lost. It is also the
farthest point from the bridge, which is the whole reason it is down here.

### Deck 1 — Service and lower guest

| Compartment        | Purpose                           | Hazards                      |
| ------------------ | --------------------------------- | ---------------------------- |
| `cabin-corridor-a` | Guest cabins, port and starboard. | Housekeeping, guest requests |
| `main-galley`      | Cooking for every outlet.         | Fire, breakdown              |
| `medical-bay`      | Injury and illness treatment.     | Overload during incidents    |
| `laundry`          | Linen turnaround.                 | Fire, backlog                |
| `waste-bay`        | Refuse and recycling.             | Backlog, smell reputation    |

### Deck 2 — Promenade (the public heart)

| Compartment     | Purpose                                      | Hazards                            |
| --------------- | -------------------------------------------- | ---------------------------------- |
| `atrium`        | Reception. Where guest requests surface.     | Crowding, reputation               |
| `shopping-mall` | Retail outlets. Restock target and revenue.  | Stockouts, looting during boarding |
| `main-dining`   | Seated service at scheduled sittings.        | Stockouts, wave damage             |
| `theatre`       | Shows on a schedule.                         | Power failure ruins a show         |
| `casino`        | Revenue. Very sensitive to lights going out. | Power failure                      |
| `bar`           | Drinks. Highest-frequency restock.           | Stockouts                          |

### Deck 3 — Pool and leisure

| Compartment | Purpose                   | Hazards                             |
| ----------- | ------------------------- | ----------------------------------- |
| `pool-deck` | Pool, loungers, exterior. | Contamination, birds, wave washover |
| `buffet`    | Self-service food.        | Stockouts, contamination            |
| `spa-gym`   | Wellness.                 | Breakdown                           |
| `kids-club` | Supervised chaos.         | Incident multiplier                 |

Deck 3 is exterior and open. It is the first place a rogue wave lands, the place
birds foul, and a boarding route.

### Deck 4 — Command

| Compartment  | Purpose                                                      | Hazards                 |
| ------------ | ------------------------------------------------------------ | ----------------------- |
| `bridge`     | **The helm.** Steering, radar, obstacle warnings, telegraph. | Loss of power blinds it |
| `chart-room` | Navigation planning, upgrade console between voyages.        | —                       |
| `radio-room` | Distress, coastguard, pirate chatter.                        | Power failure           |

The bridge is intentionally the single point of steering and intentionally far
from everything else. Reaching it is a cost.

### Deck 5 — Exterior and defence

| Compartment        | Purpose                                      | Hazards                          |
| ------------------ | -------------------------------------------- | -------------------------------- |
| `weather-deck`     | Open top deck, weapon mounts, funnel.        | Boarding, waves, birds           |
| `lifeboat-station` | Evacuation and the tender for man-overboard. | Boarding                         |
| `foredeck`         | Anchor, windlass, forward observation.       | Boarding, collision impact point |

## Beyond the initial set

The twenty-five compartments above are the shippable core, not the ceiling. A
real cruise ship is closer to seventy spaces, and the streaming architecture is
designed so adding one is data plus a GLB, never an engine change. Named
candidates, in rough priority order:

- **Navigation and command** — captain's cabin, officers' mess, communications
  room, emergency control centre
- **Engineering** — fuel bunker, water treatment, electrical switchboard, waste
  processing, workshop, ballast control
- **Guest** — suite deck, additional cabin corridors, library, arcade, cinema,
  nightclub, observation lounge, chapel, art gallery, more restaurants
- **Crew** — crew galley, crew bar, laundry annexe, security office, purser's
  office, storage holds
- **Safety and exterior** — muster stations, additional lifeboat davits, bow
  thruster room, helipad, tender bay

Restricted compartments — a reinforced command centre, a smuggler's hold, an
experimental engine room, a sealed and damaged lower deck — are a separate idea
with real appeal and no gating rule yet. They stay out of the tables until they
have one that is more interesting than "buy the upgrade". Recorded as an open
decision in [`GAME_DESIGN.md`](GAME_DESIGN.md).

Every addition pays the same tolls: one build script, one GLB inside budget, a
symmetric portal pair, and a reason it is not just another empty room.

## Portal graph

```text
weather-deck ─── lifeboat-station
     │                 │
  stairwell-aft   stairwell-fwd ─── foredeck
     │                 │
  bridge ── chart-room ── radio-room        [Deck 4]
     │                 │
  pool-deck ── buffet ── spa-gym ── kids-club   [Deck 3]
     │                 │
  atrium ── mall ── dining ── theatre ── casino ── bar   [Deck 2]
     │                 │
  corridor-a ── galley ── medical ── laundry ── waste   [Deck 1]
     │                 │
  engine ── generator ── pump ── cold-store ── crew-quarters   [Deck 0]
```

Two vertical stairwells, forward and aft, connect every deck. They are the
throttle on crew movement and the reason position matters.

### What is actually authored today

Four compartments exist as GLBs: `atrium`, `cabin-corridor-a`, `bridge` and
`engine-room`. Two honest caveats, both of which have to be paid off before the
graph above is real:

- **The portals `atrium ↔ bridge` and `cabin-corridor-a ↔ engine-room` are
  stand-ins.** In the real graph those routes climb or drop several decks
  through a stairwell. The stairwells are not authored yet, so the streamer
  links the rooms directly. This makes the bridge one hop from the atrium
  instead of several, which flatters both crew-movement timing and the
  residency set. Authoring `stairwell-fwd` and `stairwell-aft` is what retires
  it, and the portal distances in `src/data/ship-layout.ts` will change when it
  happens.
- **The atrium is now 24 m × 46 m, and the playfield is the same.**
  `src/data/phase-one.ts` declares a 24 × 46 playfield, `src/three/coordinates.ts`
  maps it at `CABIN_SCALE = 1` (one sim unit is one metre) to world x ∈ [−12, +12]
  and z ∈ [−23, +23], and the authored room matches it exactly — otherwise guests
  stand outside the furniture. This retires the old 8 m × 18 m box that made the
  room read as an aircraft fuselage. The room is now beam-width for a real ship,
  and every station in `HostSession.teleport` was restaged onto it. The remaining
  gap against [Scale and density](#scale-and-density) is vertical and lateral
  reach: more decks and more compartments, not a wider atrium.

## Streaming and budget

The player is in exactly one compartment. The renderer keeps resident:

- the current compartment at full detail,
- every compartment one portal away at full detail,
- every compartment two portals away at reduced detail,
- nothing beyond that.

Per-compartment budgets, instancing rules, LOD tiers and the frame budget that
enforces all of it are in [`PERFORMANCE.md`](PERFORMANCE.md).

## Authoring

Each compartment is generated by a deterministic Blender script under
`tools/blender/compartments/`, following the pattern already proven by
`build_cabin_scenario.py`: repeatable from source, no manual GUI steps, exported
to a tracked GLB and validated by `pnpm validate:assets` before it can ship.

Compartment GLBs must expose a stable root node `CM_<COMPARTMENT>_ROOT` and
declare their portals as named empties `CM_PORTAL_<TARGET>`, so the streaming
system can bind the graph without hard-coded coordinates.
