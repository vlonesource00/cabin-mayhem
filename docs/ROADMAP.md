# Roadmap

> **Current status (2026-08-10):** The exact implemented checkpoint, runtime
> observations, and proof gaps are in [CURRENT_STATUS.md](CURRENT_STATUS.md).
> Proposal material is inspiration only; roadmap entries are not shipped claims
> unless labeled implemented and backed by current evidence.

Phases 0–4 were the airliner premise. Phases 0–2 shipped; 3 and 4 were never
started and are superseded by [ADR 0001](adr/0001-cruise-ship-pivot.md). The
cruise ship starts at Phase 5.

Every phase has an exit condition that is a thing you can do in the running
game, not a list of files. A phase is not finished until the full verification
suite is green and the frame budget in [`PERFORMANCE.md`](PERFORMANCE.md) holds.

## Shipped (airliner premise)

- **Phase 0** — Vite/Tauri baseline, TypeScript strict, CI, docs, Canvas
  bootstrap, local test tooling.
- **Phase 1** — moving-vehicle technical proof: greybox cabin, host authority,
  simulated client, vehicle-relative force, grabbing, straps, turbulence.
- **Phase 2** — the vertical: automatic flight, passenger service, galley fire,
  breaker repair, two-player WebRTC rooms, landing debrief, Blender cabin GLB
  with procedural fallback, procedural Web Audio, two skeletal rigs with 44
  clips on a Three.js `AnimationMixer`.
- **Phases 3–4** — retired unstarted.

## Phase 5 — pivot foundation

The ship exists, moves, and can be steered.

- Rename `FlightState`→`VoyageState`, `FlightPhase`→`VoyagePhase`,
  `flight-model.ts`→`ship-model.ts`, `PilotInput`→`HelmInput`. Mechanical, one
  commit, tests updated with it.
- Ocean: shader-displaced plane plus the matching wave function on the
  simulation side. Hull pitch, roll and heave derived from it.
- Ship motion model: heading, rudder, telegraph, speed, turning radius,
  momentum. Derived deck acceleration feeds the existing `cabin-simulation`
  unchanged.
- A greybox compartment set — bridge, one corridor, one public room, engine room
  — connected by the portal graph, with the streaming loader in place even
  though everything fits in memory at this size.
- Helm station on the bridge: a player stands at it and steers.
- The collision-course incident end to end: host spawns an obstacle, every
  client gets the warning and countdown, a player has to reach the bridge, the
  host validates the avoidance, clearing throws loose objects and missing
  breaches the hull.

**Exit:** the ship moves on an ocean, you can steer it, and two players can
dodge one iceberg together.

## Phase 6 — interior and streaming

The ship becomes a place. **Mostly landed.**

Done:

- The full compartment list in [`SHIP_LAYOUT.md`](SHIP_LAYOUT.md) — fourteen
  compartments across eight occupied decks, plus the always-resident exterior —
  one Blender build script and one GLB each, under `tools/blender/`.
- Three stair towers as the ship's vertical spine
  ([ADR 0004](adr/0004-stair-tower-traversal.md)); no room-to-room portal
  crosses a deck.
- Streaming against the portal graph: residency, eviction, reduced detail at two
  hops, exterior X0/X1/X2 tiers, greybox fallback.
- Merged geometry per material, one shared palette, real glazing.
- Character LOD tiers and a 78-resident ambient crowd source/presenter slice.
  Normal packaged-start NPC visibility remains unproven; focused `showCrowd()`
  E2E teleport is not normal-start evidence.
- The deck plan on **N**, so a ship this size can be read from inside it.

Outstanding:

- The perf smoke test and the runtime counters that enforce the frame budget.
  This cannot be produced headlessly and is the phase's one real gap.
- Instancing sweep for the repeated dressing that is currently authored as
  joined static geometry.
- meshopt and KTX2, once there are textures and bytes worth compressing.
- The interior design pass: every room populated and arranged with intent, no
  stair to nowhere, no clipping.

**Exit:** you can walk from the tank top to the bridge with no frame over 33 ms
and draw calls under budget throughout — measured on hardware, not asserted.

## Phase 7 — task economy

The ordinary work that fills a voyage.

- Guest requests generalised across decks from the existing service mission.
- Stock: cold store, mall, bar and buffet as outlets with finite inventory,
  restocking as a carry job.
- Pool cleaning, bird fouling, housekeeping, waste and laundry.
- Medical treatment and escort.
- Breakage and repair generalised from `repair-response` to any compartment
  system.
- Reputation and the voyage payout that funds upgrades.

**Exit:** a full voyage with no incidents is still a busy, losable game.

## Phase 8 — disasters

- Fire generalised from `fire-response` to any compartment.
- Hull breach, progressive flooding, bilge pumps, compartment sealing, list.
- Rogue wave and tsunami with a long warning and a securing window.
- Power failure cascading through lighting and powered systems.
- Engine breakdown under manoeuvring pressure.
- Man overboard and tender recovery.
- Incident chaining: collision → breach → flood → power loss → angry guests.

**Exit:** an unattended incident reliably escalates into a related incident, and
a crew of two can just barely hold it together.

## Phase 9 — pirates and defence

- Approach, radar contact, radio chatter, grapples, boarding.
- Boarder AI: pathing, objectives, contesting compartments.
- The arsenal: sidearms, shotguns, rifles, submachine guns, flare guns, mounted
  machine guns, water cannons, stun equipment and automated turrets. Every hit
  host-validated. Combat stays shallow on purpose — no recoil patterns,
  attachments or reload minigames.
- Damage, theft and reputation consequences for a successful boarding.

**Exit:** a boarding can be repelled, and losing one costs the voyage without
ending it.

## Phase 10 — upgrades and persistence

- Save file, currency, the chart-room upgrade console, and the `preparation`
  voyage phase: route selection, weather preview, supply purchase, starting
  assignments.
- Six ship upgrade lines — navigation, engineering, safety, passenger services,
  defence, crew efficiency — each changing an authored number an existing system
  already reads.
- Player progression: cosmetics, titles, inventory slots and task perks that
  never make an unupgraded crewmate useless.
- Difficulty scaling so upgrades open harder routes rather than trivialising old
  ones.

**Exit:** voyage two is measurably different from voyage one because of what you
bought.

## Phase 11 — crew scale

- Public snapshot projection, delta compression, backpressure — the prerequisite
  named in [`NETWORK_MODEL.md`](NETWORK_MODEL.md).
- Crews of one to four; relay-backed networking; drop-in and drop-out joining.
- Solo viability: task pressure scales with crew size.

**Exit:** four players on one ship at the same bandwidth as two are now, and one
player alone can still finish a voyage.

## Phase 12 — polish and release

Onboarding, accessibility, controller hardening, recorded audio, network stress,
final performance pass, signed builds, external playtest.

## Phase numbering

The revised plan numbers the cruise work from zero. This repository continues its
existing numbering because Phases 0–2 already shipped and are referenced by
commit. The mapping, so the two schemes never get confused:

| Plan phase              | Repo phase |
| ----------------------- | ---------- |
| 0 Foundation            | 5          |
| 1 Ship structure        | 5–6        |
| 2 Navigation            | 5          |
| 3 Task system           | 7          |
| 4 Disasters             | 8          |
| 5 Multiplayer expansion | 11         |
| 6 Combat                | 9          |
| 7 Progression           | 10         |
| 8 Polish                | 12         |

Repo ordering differs deliberately in two places. Multiplayer expansion sits late
because it depends on snapshot delta compression, which is real engineering, not
a toggle. Combat sits before progression because upgrades need something to
upgrade.

## 2026-08 navigation incident slice status

The first substantial cruise-ship gameplay slice is now implemented and is the
current Phase 5/Navigation checkpoint. It is deliberately smaller than the
product north star.

### Implemented now: Phase 5 navigation checkpoint

- deterministic collision-course warning, countdown and authored relative sea
  contact, with a 36-second production travel window and a separate 3-second
  debug trigger;
- host-validated bridge/command-center presence before helm input counts;
- avoidance success with the authored +35 score bonus;
- impact with steering-hydraulics damage, score loss and a repair objective at
  the authored engine-room relay station;
- host-validated toolbox, compartment, range and held-object repair resolution;
- authoritative snapshots, PeerRoom validation, disconnect-safe input, HUD
  warning/damage/resolution states, authored relay presentation and a debug
  trigger;
- Blender 5.1 authored vessel source/GLB loaded as the obstacle production path;
  procedural obstacle geometry is only an explicit load-failure or future-kind
  fallback;
- a centralized current-interactable feedback contract covering objects,
  passengers, fire, repair stations, helm and portals.
- a host-owned pirate boarding state machine with passenger/infrastructure
  pressure, link-detachment resolution, score consequences, warning/countdown HUD,
  and a Three.js presenter loading eight validated Blender invasion GLBs with
  authored character, weapon, explosive, link and prop Actions.
- a host-owned 78-resident ambient crowd across eight cruise areas. The source
  and presenter implement Blender-authored passenger rigs, leisure/work
  animation states, and evacuation switching. Instances wait for async rig load,
  then residency/96 m culling and a 24-instance cap apply; normal packaged-start
  visibility is unresolved.

### Planned next phases, not implemented now

- **Remaining invasions/security:** bomb threat and bomber search/disarm, combat
  AI, firearms/melee hit resolution, passenger escort, and persistent damage.
  Pirate approach, boarding pressure, defeat, link detachment and score effects
  now have a first host-authoritative visual slice.
- **Resort jobs:** room service, pool cleaning, DJ performance, cooking with
  chefs, mall/restaurant/bar restocking and consensual guest-request or
  performer photography. The current service loop is not a claim that every job
  exists.
- **Crowds and ship scale:** the first 78-resident state/presenter layer covers
  authored activity and evacuation contracts. Normal-start packaged visibility,
  cross-compartment schedules, shopping, richer reactions, further crowd LOD
  work, and additional resort spaces remain unfinished or unproven.
- **Asset expansion:** the exterior, stairwells and open decks are now authored,
  validated and shipped through the Blender-source to tracked-GLB pipeline. What
  remains is more of the ship — the resort spaces listed at the end of
  [`SHIP_LAYOUT.md`](SHIP_LAYOUT.md) — and bespoke obstacle kinds, each of which
  still needs its own authored source/GLB contract. Do not replace authored
  assets with procedural placeholders.

## Initial scope

The first playable target, matching the revised plan's recommendation: one ship,
six to eight functional compartments — fourteen exist, so this is met on
structure and open on function — one route, one to four players, steering
and iceberg avoidance, one fire, one engine failure, one flooding event, pool
cleaning, shop restocking, guest assistance, basic upgrades. **No boarding
pirates in the first playable** — the ship-operation loop has to be fun without
them.

## Ordering rules

- Performance work never trails content; the budget is enforced from Phase 6.
- No phase starts before its predecessor's exit condition is demonstrated.
- Snapshot deltas land before crew size, not after.
