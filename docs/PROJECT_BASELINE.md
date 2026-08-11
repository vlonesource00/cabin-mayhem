# Project Baseline

> **Baseline date:** 2026-08-11
> **Worker base:** `5d6c3510054cc6206cffd12f12d0d01136fc2de3`
> **Integrated reviewed snapshot:** `54ccc0a848c332c3ca0ba652336aac517ad14596`
> **Status rule:** every status claim below is labelled **Implemented**, **Partial**,
> or **Planned**. Evidence gaps are called out as qualifiers, not as a fourth
> status. The protected [CURRENT_STATUS.md](CURRENT_STATUS.md)
> and [HANDOFF.md](../HANDOFF.md) remain the runtime handoff documents; this page
> does not replace or overwrite them.

## Product north star

_MS Cabin Mayhem_ is a first-person cooperative crew game aboard a moving,
spatially legible cruise ship. Players steer and dodge ocean hazards, keep guests
served, restock and repair the vessel, respond to disasters, repel pirate
boardings, and spend the result of a shift on ship improvements.

The founding inspiration is a detailed moving cruise rather than a static room:
ship motion should affect every deck; work should require carrying, positioning,
and coordination; hazards should create readable chains of consequences; pirates
should justify a small arsenal without turning every shift into a shooter; and
Blender-authored GLBs should make the ship and its people specific without
breaking browser performance.

That is the product direction. It does not change the implementation labels below.

## Status vocabulary

- **Implemented:** present in current source and supported by a focused test or
  validator cited here.
- **Partial:** a bounded slice or reusable primitive exists, but the north-star
  system is not complete.
- **Planned:** design and authoring direction only; no current runtime claim.
- An **evidence gap** means source may exist, but required runtime, hardware, or
  network evidence is missing; it does not change an **Implemented**, **Partial**,
  or **Planned** status.

## Review provenance

| Snapshot                                   | Role                                                                         |
| ------------------------------------------ | ---------------------------------------------------------------------------- |
| `5d6c3510054cc6206cffd12f12d0d01136fc2de3` | Worker base for this documentation correction.                               |
| `54ccc0a848c332c3ca0ba652336aac517ad14596` | Current integrated root HEAD/base beneath the uncommitted candidate changes. |

## Baseline matrix

| Area                            | Status                                          | Current evidence and boundary                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Moving ship and ocean           | **Implemented**                                 | `VoyageState`, helm input, speed, heading, turn, pitch/roll, sea state, hull motion, and cabin acceleration are owned by [`ship-model.ts`](../src/sim/ship-model.ts) and [`ocean.ts`](../src/sim/ocean.ts). [`host-session.test.ts`](../tests/unit/host-session.test.ts) covers host-owned progression.                                                                                                                                                                                     |
| Cruise map                      | **Implemented**                                 | [`ship-layout.ts`](../src/data/ship-layout.ts) defines 14 compartments across 8 occupied decks, three stair towers, and the fixed ship-space frame. [`validate-data.ts`](../scripts/validate-data.ts) checks hull containment, deck datum, reachability, paired portals, and door loops.                                                                                                                                                                                                    |
| Exterior and authored interiors | **Partial**                                     | Implemented asset/data foundation: the manifest contains the always-resident exterior plus 14 compartment GLBs. [`compartment-streamer.ts`](../src/three/compartment-streamer.ts) keeps the current room and portal neighbours resident, evicts out-of-range rooms, and uses greybox fallback. Full visual and spawn QA for every room remains an evidence gap.                                                                                                                             |
| Portal/elevator travel          | **Implemented**                                 | [`waypoint-travel.ts`](../src/sim/waypoint-travel.ts) derives physical pads and host-validates destination options. `PlayerState.compartmentId` and `waypointDeck` are authoritative. [`waypoint-travel.test.ts`](../tests/unit/waypoint-travel.test.ts) and [`waypoint-navigation.spec.ts`](../tests/e2e/waypoint-navigation.spec.ts) cover the current contract.                                                                                                                          |
| Host authority                  | **Implemented** for the current state model     | [`HostSession`](../src/sim/host-session.ts) owns `MissionState`, steps simulation, validates interaction/repair/helm/boarding intent, and emits snapshots. [`types.ts`](../src/sim/types.ts) has no authoritative task-board, weapon, upgrade, or save state yet.                                                                                                                                                                                                                           |
| Local/network transport         | **Partial**                                     | [`PeerRoom`](../src/network/peer-room.ts) uses protocol version 4, 15 Hz snapshots, 30 Hz commands, stale-command expiry, strict packet parsing, and host `crew-alpha`/guest `crew-bravo` roles. [`peer-room.test.ts`](../tests/unit/peer-room.test.ts) and runtime contract tests prove serialization and rejection paths. Real two-Windows/two-network behavior remains an evidence gap.                                                                                                  |
| Guest service                   | **Partial**                                     | [`service-mission.ts`](../src/sim/service-mission.ts) and [`service.ts`](../src/data/service.ts) implement eight authored passengers, drink/meal/medical requests, finite cart stock, take/return, matching delivery, patience, score, and mission outcome. Current definitions are a bounded service slice, concentrated in the atrium; there is no cross-deck task economy or task board.                                                                                                 |
| Repair and fire                 | **Partial**                                     | [`fire-response.ts`](../src/sim/fire-response.ts) implements a galley fire requiring an extinguisher. [`repair-response.ts`](../src/sim/repair-response.ts) implements galley-breaker and engine-room steering-relay repair with tool ownership, compartment, range, hold time, pressure, and completion. This is not a ship-wide disaster system.                                                                                                                                          |
| Navigation hazard               | **Partial**                                     | The current navigation incident has host-owned warning, bridge helm avoidance, impact/hydraulics damage, and engine-room repair. [`navigation-incident.ts`](../src/sim/navigation-incident.ts), [`navigation-incident.test.ts`](../tests/unit/navigation-incident.test.ts), and focused Playwright cases support this narrow slice. It is not the full hazard/disaster catalogue.                                                                                                           |
| Pirate boarding                 | **Partial**                                     | [`boarding-invasion.ts`](../src/sim/boarding-invasion.ts) owns warning, approach, aboard, pressure pulses, passenger/infrastructure consequences, and detach-both-links resolution. [`invasion-presenter.ts`](../src/three/invasion-presenter.ts) presents validated pirate/saboteur GLBs, weapons, links, and authored Actions. There is no combat AI, hit resolution, firearm/melee contract, bomb-search loop, or persistent boarding damage.                                            |
| Ambient guests                  | **Implemented** as a bounded presentation slice | [`ambient-crowd.ts`](../src/sim/ambient-crowd.ts) creates 78 deterministic residents in 8 zones. [`ambient-crowd-presenter.ts`](../src/three/ambient-crowd-presenter.ts) uses the passenger GLB, 96 m culling, and a 24-instance presentation cap. [`ambient-crowd-normal-start.spec.ts`](../tests/e2e/ambient-crowd-normal-start.spec.ts) covers a clean atrium start. Full schedules, needs, and cross-deck behaviour remain **Planned**.                                                 |
| HUD and interaction feedback    | **Partial**                                     | [`cabin-mayhem-app.ts`](../src/app/cabin-mayhem-app.ts) exposes phase, speed, heading, stock, objective, interaction, fire, navigation, invasion, debrief, and deck-plan UI. It has no multi-task board or player-facing task history.                                                                                                                                                                                                                                                      |
| GLB/model pipeline              | **Implemented** for current contracts           | [`public/assets/manifest.json`](../public/assets/manifest.json) records 27 project-owned source/runtime entries, including the exterior, 14 compartments, character/arms rigs, navigation vessel, and eight invasion assets. [`validate-assets.ts`](../scripts/validate-assets.ts) checks files, rig roots/clips, compartment roots/portal markers/budgets, and exterior groups. [`validate_invasion_assets.py`](../scripts/validate_invasion_assets.py) checks invasion nodes and Actions. |
| Weapon GLB contracts            | **Partial**                                     | [`src/data/weapons.ts`](../src/data/weapons.ts) defines four weapon GLBs with sockets, four Actions, source and budget contracts. [`validate-weapons.ts`](../scripts/validate-weapons.ts) is the focused validator. These are load-ready asset contracts only: no runtime weapon loader/presenter, equip or weapon intent, hit/damage result, or gameplay combat integration is established.                                                                                                |
| Liveliness GLB contracts        | **Partial**                                     | [`src/data/liveliness-props.ts`](../src/data/liveliness-props.ts) defines six liveliness GLBs with required nodes, three Actions, source and budget contracts. [`validate-liveliness-assets.ts`](../scripts/validate-liveliness-assets.ts) is the focused validator. These are load-ready asset contracts only: no runtime prop loader, interaction/task binding, or gameplay integration is established.                                                                                   |
| Performance                     | **Partial**                                     | [`PERFORMANCE.md`](PERFORMANCE.md) defines frame, transition, draw-call, triangle, mixer, and texture budgets. Asset budgets are validator-backed; no current source/test proves the full authored route on reference hardware, so hardware evidence remains a gap.                                                                                                                                                                                                                         |
| Disasters                       | **Planned**                                     | Fire and repair primitives exist. Progressive flooding, bilge pumps, compartment sealing, list, power loss, incident chaining, and recovery economy are not present as a complete loop.                                                                                                                                                                                                                                                                                                     |
| Upgrades and persistence        | **Planned**                                     | The current `MissionState` has no currency, upgrade tree, profile, save/load, or persistent damage contract. Design must wait until one task loop and one disaster loop have stable numbers.                                                                                                                                                                                                                                                                                                |
| Crew scale                      | **Planned**                                     | The target is one to four players, but current PeerRoom and tests cover one host plus one guest. Snapshot projection/deltas, relevance filtering, solo pressure scaling, and four-player acceptance are planned.                                                                                                                                                                                                                                                                            |

## What the current game can honestly demonstrate

1. Start a first-person cruise scene with a GLB exterior/interior foundation.
2. Move through authored portal pads, stair towers, and elevator destinations with
   host-derived compartment/deck state.
3. Steer a host-owned moving ship and propagate motion into the cabin simulation.
4. Carry and return finite service objects, deliver a matching request, suppress a
   galley fire, and complete a bounded repair when the host accepts the intent.
5. Trigger or reach the current navigation incident and the bounded boarding
   invasion presentation.
6. Render deterministic ambient residents and presentation-only invasion assets.

These demonstrations are slices. They do not add the missing task economy,
disaster chain, combat, upgrade, persistence, scaling, or hardware claims.

## Evidence boundary and open risks

| Risk or ambiguity                                              | Baseline treatment                                                                                                                                                                                                                             |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Older docs use different checkpoint labels or protocol wording | Prefer current source contracts. [`peer-room.ts`](../src/network/peer-room.ts) declares protocol version 4. The protected status/handoff pages are linked for history and runtime notes, not copied as new source evidence.                    |
| Spawn safety across the whole ship                             | The supplied status handoff reports a normal-start atrium regression test, but only atrium geometry is specifically audited there. Treat the other 13 compartment arrival/spawn positions as unverified until a focused geometry audit exists. |
| Live multiplayer                                               | Local deterministic transport, packet schemas, and opt-in browser room paths are not the same as two Windows 11 machines on separate networks. Keep that gate open.                                                                            |
| Performance                                                    | GLB byte/mesh budgets are static rails. They do not prove frame time, worst-case transition, resident draw calls, texture memory, or mixer count on hardware.                                                                                  |
| Current dirty checkout                                         | The user-provided Claude paths, including `docs/CURRENT_STATUS.md`, character/crowd files, source, tests, and assets, are outside this documentation lane and must remain untouched.                                                           |

## Do not claim table

| Claim                              | Current label | Evidence required before claiming it                                                                                                                                                                           |
| ---------------------------------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Full cruise task economy           | **Planned**   | Task-board state, cross-deck job data, finite supply flow, rewards/penalties, host validation, and browser proof.                                                                                              |
| Complete guest/restock/repair loop | **Partial**   | One authored loop crossing its task, supply, guest, failure, repair, and resolution states in unit, integration, and browser tests.                                                                            |
| Full disaster system               | **Planned**   | At least one progressive ship-system chain with authoritative damage, recovery, passenger consequence, and browser evidence.                                                                                   |
| Playable pirate combat             | **Planned**   | Host-validated weapon intent, target/range/cooldown rules, deterministic hit/damage result, presentation sync, and two-client proof. Existing GLBs alone do not satisfy this.                                  |
| Arsenal and upgrades               | **Planned**   | Authored upgrade definitions, currency, persistent profile/save contract, modifiers read by simulation, migration/reset tests, and debrief/purchase UI.                                                        |
| Four-player or solo-balanced co-op | **Planned**   | Snapshot projection, pressure scaling, disconnect/rejoin behavior, and acceptance on the target crew sizes.                                                                                                    |
| Two-network multiplayer            | **Partial**   | PeerRoom and an opt-in live route exist, but the procedure and artifacts in [MULTIPLAYER_TWO_NETWORK_TEST.md](MULTIPLAYER_TWO_NETWORK_TEST.md) have not established two Windows machines on separate networks. |
| Full-route hardware performance    | **Planned**   | A repeatable route smoke recording the budgets in [PERFORMANCE.md](PERFORMANCE.md) on the named reference machine.                                                                                             |

The next concrete work is frozen in [ROADMAP.md](ROADMAP.md): HUD/task board,
one complete guest/restock/repair loop, then pirate weapon presentation/combat
contracts.
