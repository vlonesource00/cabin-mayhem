# Content Authoring

> Baseline review: 2026-08-11. This document describes the current authored
> contracts and the next content packets. Status labels are **implemented**,
> **partial**, or **planned**; an asset or data definition is not proof that a
> complete player-facing system exists. See [PROJECT_BASELINE.md](PROJECT_BASELINE.md)
> and the protected [CURRENT_STATUS.md](CURRENT_STATUS.md) for the current
> evidence boundary.

## Source of truth

Gameplay authority is split deliberately:

| Concern                                                     | Source of truth                                                                         | Status                                          |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Ship dimensions, compartments, decks, portals and residency | `src/data/ship-layout.ts`                                                               | Implemented                                     |
| Mutable mission state and command validation                | `src/sim/` and `src/sim/host-session.ts`                                                | Implemented, with partial feature coverage      |
| Interaction and service definitions                         | `src/data/service.ts` and `src/sim/service-mission.ts`                                  | Partial                                         |
| Emergency, navigation and boarding definitions              | `src/data/emergencies.ts`, `src/data/invasions.ts` and corresponding `src/sim/` modules | Partial                                         |
| Visual geometry, characters and presentation contracts      | `public/assets/manifest.json`, GLBs and `src/three/` presenters                         | Implemented pipeline, partial gameplay coverage |
| Future task board, economy, upgrades and persistence        | New schemas and host transitions introduced by their roadmap slice                      | Planned                                         |

Authoring rules:

- Give every definition a stable ID, display name, owning compartment or
  route, availability rule, interaction contract, resolution path, cleanup
  path, and test fixture. IDs are data keys, not display text.
- Put mutable outcome state in the host simulation. A renderer may display a
  task, stage an animation, or send intent; it must not award stock, score,
  damage, currency, or completion locally.
- Keep geometry and gameplay data separate. A GLB can provide appearance and
  sockets, but validated data and host rules own collision, range, reachability,
  target identity, and consequences.
- Do not add a catalog entry and call the feature implemented. The definition,
  host transition, player feedback, and acceptance evidence must land together.
- Keep existing dirty/protected docs and assets intact. Add links to them when
  context is needed; do not rewrite their claims in another file.

## Current authored surface

| Content surface                                             | What exists now                                                                                                                                     | Status                           |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| Cruise layout                                               | Fourteen compartments span eight occupied decks, with three stair towers and an authored portal graph.                                              | Implemented                      |
| Compartment visuals                                         | Exterior plus fourteen compartment GLBs are listed in the manifest; streaming loads the current room and nearby portal hops, with greybox fallback. | Implemented foundation           |
| Guest service                                               | Eight authored passengers, drink/meal/medical requests, finite cart stock, taking/restocking, delivery, patience, score and debrief state.          | Partial vertical slice           |
| Repairs and fire                                            | A galley fire/extinguisher path and steering-relay/toolbox repair path have host validation and bounded outcomes.                                   | Partial hazard slice             |
| Navigation                                                  | Bridge obstacle warning/avoidance and impact-to-steering-repair chain exists.                                                                       | Partial vertical slice           |
| Pirate boarding                                             | Two boarding links, pirate/bomber definitions, boarding assets, host phase/pressure state and presentation exist.                                   | Partial presentation/state slice |
| Ambient crowd                                               | Seventy-eight authored residents across eight zones and deterministic presentation culling exist.                                                   | Implemented presentation layer   |
| Task board and cross-deck work routing                      | No authoritative board or general task registry currently exists.                                                                                   | Planned                          |
| Full disasters, weapons, upgrades, currency and persistence | No complete host contracts or acceptance evidence currently exist.                                                                                  | Planned                          |

The current service data is concentrated in the atrium, and most compartments
still rely on authored bounds rather than a full fixture catalogue. Treat a new
room, passenger, job, or prop as a content packet with an explicit route and
verification, not as an isolated mesh drop.

## ID and definition contract

Every new content definition must answer these questions before it is merged:

1. What stable ID is used by data, commands, snapshots, telemetry and tests?
2. Which compartment, deck, portal route, or ship system owns it?
3. Which player intent starts or advances it, and what target/range/tool/item
   validation does the host perform?
4. What state transition marks success, failure, interruption, expiry and
   cleanup?
5. What does the player see and hear at each state, including denial feedback?
6. Which score, stock, passenger, hull, infrastructure, or future progression
   field changes, and exactly once?
7. Which deterministic unit, integration, browser, and (when relevant) live
   room checks prove the contract?

For data modeled with Zod, reject duplicate IDs, unknown references, invalid
compartment ownership, non-finite numbers, impossible ranges, unpaired portals,
and definitions without a terminating outcome. Keep schemas strict at network
boundaries as in the current PeerRoom protocol.

## Task and service authoring

The next task board is **planned**, not a current source contract. Its minimum
task record should contain:

| Field                                 | Required meaning                                                |
| ------------------------------------- | --------------------------------------------------------------- |
| `taskId`, `kind`, `displayName`       | Stable identity and player-facing label                         |
| `phase` / availability                | When the host may offer it, including voyage and incident gates |
| `location` and `targetId`             | Authored compartment/deck plus the exact interaction target     |
| `requiredItem` / `requiredTool`       | What the player must carry or control                           |
| `steps` and durations                 | Ordered work, interruption behavior, and completion timing      |
| `success` / `failure` / `expiry`      | Host-owned state transitions and consequences                   |
| `stock`, passenger, or system effects | Exact bounded mutations, with idempotent resolution             |
| `presentation`                        | Icon, prompt, audio cue, animation/socket and denial feedback   |

The first complete task packet is Slice B in [ROADMAP.md](ROADMAP.md): one
guest request, one finite stock route, one delivery, and one deterministic
repair interruption. Author the data so the same host transition can run in a
solo room and a two-player room. Do not hide stock movement or task completion
inside UI callbacks.

For outlets and stock points, author the compartment, target ID, item types,
initial stock, capacity, restock source, carrying limit, and zero-stock
consequence. Stock must never go below zero or above capacity. A wrong item,
wrong target, wrong compartment, out-of-range interaction, stale command, or
non-owner held item must produce a deterministic denial without consuming the
item.

For multi-step work, every step records its own target, tool, duration,
interruptions, and failure consequence. The parent task records ordering,
whether progress decays, and how a second incident competes for the same crew.

## Compartments, portals and walkable content

The current compartment contract is:

- one layout definition in `src/data/ship-layout.ts`;
- one manifest entry and one GLB under `public/assets/`;
- a validated root node named `CM_<COMPARTMENT>_ROOT`;
- one named `CM_PORTAL_<TARGET>` empty per authored portal;
- paired, reachable portal graph data with deck/height/bounds validation; and
- a greybox path that remains playable if the GLB fails to load.

Use authored data for bounds, portals, interaction ranges, spawn points and
fixture identity. Keep the GLB node names aligned with the data IDs. A new
compartment is not ready when it only renders: it must stream from a neighboring
room, preserve player authority across the portal, pass the layout/asset
validators, and have a browser route that records fallback behavior.

Avoid making every room a bespoke high-density scene. Reuse the modular kit,
shared materials and authored repeat rules. Add a new fixture only when it
creates a task, hazard response, navigation choice, or readable ship identity.

## Model and GLB pipeline

Use the following path for new models:

1. Author or update the Blender source under `assets-src/blender/`; keep the
   source change paired with the generated runtime asset.
2. Use the focused deterministic script under `tools/blender/` where one exists.
   Record the source revision and export assumptions in the owning content
   packet.
3. Export the GLB to its scoped `public/assets/` path and register it in
   `public/assets/manifest.json` with source, runtime role, owner and license
   metadata where that manifest entry requires it.
4. Validate the file with `pnpm validate:assets`. Compartment assets must satisfy
   roots, portal markers, mesh budgets and naming; invasion assets must satisfy
   nodes, sockets and animation action contracts.
5. Bind the asset through the appropriate `src/three/` presenter or loader.
   Keep state transitions in `src/sim/`; presenter fallback is explicit and
   observable.
6. Run a browser check from a clean start and through the relevant portal or
   interaction route. Record whether the result used the GLB or greybox path.

The current manifest has 27 asset entries, including the exterior, fourteen
compartment GLBs, character/first-person assets, the navigation obstacle and
the eight invasion assets. That inventory is **implemented** as an asset
catalogue; it does not establish a complete character controller, weapon hit
system, or full ship task loop.

For characters and weapons, author presentation metadata such as action names,
socket names, scale and facing together with the gameplay contract. A pistol,
cutlass, satchel charge, or pirate GLB is **partial** until a host-validated
intent, target/range rule, consequence, feedback path and tests exist.

## Performance and streaming rails

The current authored rails in [PERFORMANCE.md](PERFORMANCE.md) are:

| Rail                        |                                    Target | Evidence status                                           |
| --------------------------- | ----------------------------------------: | --------------------------------------------------------- |
| Reference frame budget      |                          16.6 ms at 1080p | Planned hardware/browser measurement                      |
| Transition worst-case frame |                      No frame above 33 ms | Planned measurement                                       |
| Draw calls                  |                               At most 300 | Static/content rail; no current hardware proof            |
| Resident triangles          |                       At most 1.2 million | Static/content rail; no current hardware proof            |
| Active animation mixers     |                                At most 16 | Static/content rail; no current hardware proof            |
| Texture memory              |                            At most 256 MB | Static/content rail; no current hardware proof            |
| Crowd presentation          | 96 m cull radius and 24 visible residents | Implemented presenter guardrail; route-wide proof planned |

Streaming must keep the current room and its direct neighbors usable, reduce
farther portal hops, evict out-of-range rooms, and keep the exterior resident.
Measure the worst resident set during a full-deck route, boarding
presentation, crowd arrival and portal transition; a manifest count alone is
not a performance result.

## Content packet acceptance checklist

Before calling a packet **implemented**, attach all of the following to its
change or handoff:

- data schema and stable IDs, including invalid-input tests;
- host command/state transition with stale, wrong-target, range, ownership and
  duplicate-resolution tests;
- player-facing prompt, success, denial, interruption and cleanup feedback;
- GLB/manifest/source changes, or an explicit greybox decision;
- focused unit and integration evidence;
- browser evidence for a clean start and the intended route;
- performance impact against the rails above; and
- a short list of what remains **partial** or **planned**.

Do not claim a feature from a catalog entry, a rendered animation, a debug
trigger, a local simulated transport test, or a stale document alone. Link
unresolved runtime evidence to [CURRENT_STATUS.md](CURRENT_STATUS.md) and
[HANDOFF.md](../HANDOFF.md) rather than overwriting those protected files.
