# Roadmap

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

The ship becomes a place.

- All six decks and the full compartment list in
  [`SHIP_LAYOUT.md`](SHIP_LAYOUT.md), one Blender build script and one GLB each.
- Streaming, portal culling, instancing, merged geometry, shared material
  palette, meshopt and KTX2.
- The perf smoke test and the runtime counters that enforce the budgets.
- Character LOD tiers; guest crowd populated at correct cost.

**Exit:** you can walk from the bilge to the bridge with no frame over 33 ms and
draw calls under budget throughout.

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

## Initial scope

The first playable target, matching the revised plan's recommendation: one ship,
six to eight functional compartments, one route, one to four players, steering
and iceberg avoidance, one fire, one engine failure, one flooding event, pool
cleaning, shop restocking, guest assistance, basic upgrades. **No boarding
pirates in the first playable** — the ship-operation loop has to be fun without
them.

## Ordering rules

- Performance work never trails content; the budget is enforced from Phase 6.
- No phase starts before its predecessor's exit condition is demonstrated.
- Snapshot deltas land before crew size, not after.
