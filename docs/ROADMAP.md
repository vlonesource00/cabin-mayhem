# Roadmap

> **Roadmap status:** The current source-backed boundary is in
> [PROJECT_BASELINE.md](PROJECT_BASELINE.md). This page is forward work only.
> **Implemented**, **Partial**, and **Planned** are used literally; missing
> runtime, hardware, or network evidence is called out as an evidence gap.

## North-star outcome

Build a cooperative first-person cruise shift that feels like one moving ship:
crew coordinate across decks, physical work consumes time and stock, hazards
create consequences, pirate defence is a bounded escalation, and upgrades make
later routes meaningfully different. Every slice must keep `HostSession` as the
authority and keep renderer/GLB presentation downstream of snapshots.

## Current checkpoint

**Implemented foundation:** moving ship/ocean state, 14-compartment/8-deck map,
three stair towers, host-derived portal travel, GLB streaming with greybox
fallback, bounded service/fire/repair/navigation state, invasion presentation,
and a deterministic 78-resident crowd.

**Partial slices:** service is an atrium-focused cart/request primitive;
navigation is one collision-course incident; boarding is a two-link invasion
state machine plus presentation; PeerRoom is a host/guest prototype.

**Planned:** task board, cross-deck task economy, progressive disasters,
combat/hit resolution, arsenal progression, persistence, and four-player scaling.
**Partial with evidence gaps:** PeerRoom live two-network proof and hardware
performance measurement.

## Delivery rules

1. Add authoritative data/state before adding UI or animation.
2. Treat every client action as intent. Host validates phase, target,
   compartment, range, ownership, cooldown, and outcome.
3. Keep interaction/collision proxies in data/simulation. A GLB may present them
   but never decides whether an action succeeds.
4. Extend the existing map before adding rooms. A new compartment pays for a
   data entry, symmetric portal pair, Blender source/script, manifest entry,
   asset validation, fallback, spawn/arrival audit, and browser proof.
5. Do not call a slice complete until unit, integration, browser, and applicable
   data/asset gates pass. Performance budgets are rails until hardware evidence
   exists.
6. Preserve the protected [CURRENT_STATUS.md](CURRENT_STATUS.md) and
   [HANDOFF.md](../HANDOFF.md); update them only in their own work orders.

## Next three vertical slices

### A. HUD plus interaction/task board

**Status: Planned.** This slice turns the current compact objective card,
interaction prompt, event log, stock readout, and debrief hooks into one truthful
task surface.

**Player result:** A player can see a bounded list of active work, select one,
see its target compartment/object/guest and current state, and understand why a
host rejected an action. The board reads only authoritative snapshot fields.

**Frozen implementation boundary:**

- Add a versioned task definition/state contract, preferably alongside the
  existing `MissionState` and `src/data/` definitions; do not hide task state in
  DOM attributes or infer completion from animation.
- Start with a small adapter over current service, repair, navigation, fire, and
  invasion objectives. Do not pretend the adapter is the final job economy.
- Submit task selection and task actions as explicit intent. Reject unknown,
  stale, completed, wrong-phase, wrong-target, and wrong-compartment requests on
  the host.
- Keep the board bounded (six visible entries maximum), update on snapshot/HUD
  cadence rather than every render frame, and reuse current icon/feedback
  patterns.

**Dependencies:** current `MissionState`, `HostSession`, `PlayerCommand`,
`cabin-mayhem-app.ts`, and the existing interaction feedback contract. No new
GLB is required.

**Ownership:** simulation owner defines task schema, lifecycle, rejection, and
reward fields; content owner supplies stable task IDs and authored locations;
presentation owner renders the board and accessibility text; test owner covers
same-snapshot host/guest views and stale-intent rejection.

**Acceptance gates:**

- Unit tests prove schema bounds, deterministic ordering, task selection,
  completion/failure transitions, and stale/forged intent rejection.
- Integration tests prove the task state survives `HostSession` stepping and
  simulated latency without client-side authority.
- Browser test shows the board at normal start, selects a task, shows its
  interaction prompt, and records a rejected-action message.
- `pnpm validate:data`, `pnpm typecheck`, focused unit/integration tests,
  focused Playwright test, Prettier check, and `git diff --check` pass.

**Out of scope:** currency, persistent progression, a full job catalogue,
four-player balancing, and any new ship deck.

### B. One complete guest/restock/repair loop

**Status: Planned; current service and repair primitives are Partial.** Build
one end-to-end route through existing authored rooms before generalising the
economy.

**Frozen scenario:**

1. Task board assigns one guest request in the atrium.
2. The service outlet/cart has finite stock. If the requested item is absent,
   the crew travels to one authored supply/restock point, takes the matching
   item, and returns it to the outlet/cart.
3. The crew carries the item through the host-validated portal graph and serves
   the correct guest. Wrong item, wrong guest, stale task, out-of-range delivery,
   and duplicate consumption fail without mutating success state.
4. A deterministic service-system fault interrupts the route. The crew obtains
   the host-owned toolbox, reaches the authored repair target, holds the repair,
   and sees pressure, interruption, completion, score, and task resolution on
   the board.

Use the existing `service-mission`, cart ownership, galley fire, and repair
contracts as the starting seam. The first route may use the atrium, main galley,
and engine room; do not expand the ship to make the loop look larger.

**Dependencies:** Slice A task state and HUD; current `service.ts`,
`service-mission.ts`, `repair-response.ts`, `fire-response.ts`,
`HostSession.resolveInteractions`, and host portal travel.

**Ownership:** simulation owner owns stock, request, carry, failure, repair,
score, and terminal state; content owner authors one outlet, one supply point,
one guest, one repair target, timings, and rewards; presentation owner exposes
target/stock/progress/feedback; asset owner reuses current GLBs unless a missing
interaction proxy is proven; test owner owns the full route gate.

**Performance rails:** one task chain, bounded object count, no per-frame DOM
redraw, no new always-resident mesh, and no extra animated resident budget.
Portal streaming must remain within the current residency rule; a failed GLB
must still leave the loop playable in greybox.

**Acceptance gates:**

- Unit tests cover stock depletion/return, matching delivery, task identity,
  ownership, range, interruption, repair pressure, and exactly-once rewards.
- Integration test runs the complete chain from task assignment to repair and
  terminal result through `HostSession`; guest commands cannot advance it
  locally.
- Browser test walks the authored route, shows the board and prompts, proves a
  rejection path, completes the guest request, triggers the fault, completes
  repair, and verifies the final result/debrief.
- Data and asset validators pass; no new content is labelled **Implemented** until the
  browser path covers it.

**Out of scope:** all resort jobs, dynamic economy, reputation simulation,
multi-fault chains, flooding, upgrades, and persistence.

### C. Pirate boarding plus weapon presentation/combat contract

**Status: Planned; invasion state/presentation is Partial.** Convert the
current boarding warning/links/hostile presentation into one explicit combat
contract without turning the slice into a full shooter.

**Frozen scenario:** one scheduled pirate boarding on the promenade, one
boarding pistol and one cutlass presentation, one host-validated defence action,
and one deterministic hit/damage outcome. Existing `boarding-pistol.glb`,
`boarding-cutlass.glb`, pirate character, boarding links, and gear crate are the
starting assets.

**Contract requirements:**

- Extend the command/snapshot schema deliberately; do not overload
  `boardingAction` with weapon semantics. Intent names the actor/action/target;
  host derives phase, compartment, range, cooldown, ammo/availability, and hit.
- Host owns target eligibility, hit result, passenger/infrastructure damage,
  score, and terminal outcome. Client animation and muzzle/impact effects are
  presentation only.
- `InvasionPresenter` consumes semantic weapon state, attaches the authored GLB
  at a validated socket, and selects an Action from the snapshot. Missing assets
  use explicit partial fallback and never create authority.
- Keep combat shallow: no tactical AI, attachment tree, persistent wounds,
  bomb-search/disarm, or arsenal upgrade tree in this slice.

**Dependencies:** current `boarding-invasion.ts`, `invasions.ts`,
`invasion-presenter.ts`, protocol parser, host action validation, and Slice A
feedback. Slice B is not a code dependency for combat, but its task-state
contract should be stable before shared HUD work is accepted.

**Ownership:** simulation owner defines weapon intent, hit/damage state, and
rejection rules; content owner defines one event and balance numbers; Blender
owner validates roots/sockets/Actions; presentation owner maps snapshot state to
weapon/character animation; network owner updates protocol schemas; test owner
proves deterministic host/guest results.

**Performance rails:** reuse loaded invasion assets, cap active hostiles at the
current authored event count, avoid per-hostile DOM, keep mixer count within
[`PERFORMANCE.md`](PERFORMANCE.md), and verify partial asset fallback.

**Acceptance gates:**

- Asset validation proves source/runtime paths, required nodes, sockets, and
  Actions for the two weapon assets and pirate rig.
- Unit tests prove valid and invalid intent, target/range/cooldown rejection,
  deterministic hit/damage, duplicate-action handling, and snapshot parsing.
- Integration test proves a second client sees the same weapon state, hit result,
  damage, and score under simulated transport.
- Browser test renders the weapon presentation, drives one real host-approved
  defence, shows the hit/outcome feedback, and proves animation cannot create a
  hit by itself.

**Out of scope:** full combat AI, firearms/melee variety, bomb objectives,
persistent damage, player progression, and separate-network acceptance.

## Ordered follow-on phases

### D. Disaster chain

**Status: Planned.** Generalise the current fire/repair primitives into one
authoritative chain: breach, progressive flooding, bilge pump, compartment
sealing, power loss, passenger consequence, and recovery. Exit requires one
complete chain in unit, integration, and browser tests; no phase is claimed from
the presence of `fire-response.ts` alone.

### E. Upgrades and persistence

**Status: Planned.** Add currency and a save/profile boundary only after Slice B
has stable task values and Phase D has stable damage values. Each upgrade must
modify a number an existing simulation system reads. Exit requires save/load,
reset, migration, debrief payout, and host/session tests; no client-only upgrade
state is acceptable.

### F. Crew scale and network proof

**Status: Planned.** Add snapshot projection, deltas, relevance
filtering, backpressure, solo task-pressure scaling, drop/rejoin behavior, and
four-player room tests. Then execute the two-Windows/two-network procedure.
Exit requires measured packet behavior and evidence from separate machines;
local two-context Playwright is insufficient.

### G. Ship/content expansion and release rails

**Status: Planned.** Add jobs, guest behaviours, safety/disaster props, and new
rooms only when they pay for their data, portal, GLB, fallback, spawn audit, and
performance evidence. Finish with a full-route hardware smoke, narrow/desktop
browser pass, packaged build pass, and a handoff that separates source proof
from runtime proof.

## Dependency gates

| Gate               | Must be true before next gate                                                                           |
| ------------------ | ------------------------------------------------------------------------------------------------------- |
| Map foundation     | Layout/data/asset contracts pass; portal travel and fallback remain playable. **Current: Implemented.** |
| A: task surface    | One authoritative task lifecycle and rejection contract.                                                |
| B: task loop       | One guest/restock/repair chain passes end to end.                                                       |
| C: combat contract | One pirate weapon action has deterministic host result and presentation sync.                           |
| D: disasters       | One recoverable ship-system chain has measured consequences.                                            |
| E: progression     | Numbers persist and reset safely; upgrades affect existing simulation.                                  |
| F: scale/release   | Network, hardware performance, and full-route evidence are current.                                     |

Any failed gate returns to the owning slice. Do not widen scope by adding more
rooms, weapons, jobs, or upgrade lines while the prior gate lacks its evidence.
