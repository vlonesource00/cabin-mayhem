# Test Plan

> Baseline review: 2026-08-11. This plan separates source/unit proof from
> integration, browser, live-network, build and hardware evidence. A test name,
> debug trigger, asset manifest entry, or old report does not make an unfinished
> player-facing system implemented. See [PROJECT_BASELINE.md](PROJECT_BASELINE.md),
> [ROADMAP.md](ROADMAP.md), protected [CURRENT_STATUS.md](CURRENT_STATUS.md),
> and [HANDOFF.md](../HANDOFF.md).

## Evidence vocabulary

- **Implemented:** the contract exists in the current source and has the
  applicable focused check. The label does not imply that every browser,
  network, device, or hardware gate has passed recently.
- **Partial:** a bounded slice or presentation/state primitive exists, but at
  least one player-facing contract, route, or evidence layer is missing.
- **Planned:** the behavior and its acceptance gate are specified here or in
  [ROADMAP.md](ROADMAP.md), but it must not be reported as shipped.

Record the exact command, exit result, relevant test count, environment, and
artifact path. If a check is skipped, blocked, stale-server-contaminated, or
not run, record that fact instead of converting it into a pass.

## Current check matrix

| Area                                                    | Current evidence target                                                                                                  | Status                                                        |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------- |
| Layout/data integrity                                   | `pnpm validate:data`; `tests/unit/ship-layout.test.ts`                                                                   | Implemented foundation                                        |
| GLB and manifest integrity                              | `pnpm validate:assets`; focused loader/streamer tests                                                                    | Implemented pipeline                                          |
| Host authority and commands                             | `tests/unit/host-session.test.ts`, `tests/unit/peer-room.test.ts`, `tests/unit/peer-room-runtime.test.ts`                | Implemented foundation                                        |
| Portal travel and streaming                             | `tests/unit/waypoint-travel.test.ts`, `tests/unit/compartment-streamer.test.ts`, `tests/e2e/waypoint-navigation.spec.ts` | Implemented foundation, route proof scoped                    |
| Guest service                                           | `tests/unit/service-mission.test.ts`, host/integration flow                                                              | Partial bounded slice                                         |
| Fire and repair                                         | `tests/unit/fire-response.test.ts`, `tests/unit/repair-response.test.ts`, host-session coverage                          | Partial hazard slice                                          |
| Navigation incident                                     | `tests/unit/navigation-incident.test.ts`, navigation presenter/browser coverage                                          | Partial vertical slice                                        |
| Pirate boarding                                         | `tests/unit/boarding-invasion.test.ts`, invasion asset/presenter tests, `tests/e2e/cabin-mayhem.spec.ts`                 | Partial state/presentation slice                              |
| Ambient crowd                                           | `tests/unit/ambient-crowd.test.ts`, presenter/style tests, `tests/e2e/ambient-crowd-normal-start.spec.ts`                | Implemented presentation layer, route proof scoped            |
| Weapon GLB contracts                                    | `pnpm validate:weapons`; `tests/unit/weapons.test.ts`                                                                    | Partial load-ready contracts; no runtime/gameplay integration |
| Liveliness GLB contracts                                | `pnpm validate:liveliness-assets`; `tests/unit/liveliness-props.test.ts`                                                 | Partial load-ready contracts; no runtime/gameplay integration |
| Task board, full work economy, upgrades and persistence | No current complete contract                                                                                             | Planned                                                       |
| Hardware performance                                    | Rails are documented in `docs/PERFORMANCE.md`; no current hardware smoke is implied                                      | Planned evidence                                              |
| Two independent networked browsers                      | Optional `LIVE_MULTIPLAYER=1` route exists; local simulated transport is not equivalent                                  | Partial evidence                                              |

## Baseline command set

Run these from the repository root. They are source-preserving validation/build
commands and may rewrite generated or ignored output such as `dist`; no source,
commit, push, or protected-path mutation is implied.

```text
pnpm validate:data
pnpm validate:assets
pnpm validate:weapons
pnpm validate:liveliness-assets
npx tsc --noEmit
pnpm exec prettier --check docs/PROJECT_BASELINE.md docs/ROADMAP.md docs/GAME_DESIGN.md docs/CONTENT_AUTHORING.md docs/TEST_PLAN.md
git diff --check
```

`npx tsc --noEmit` is expected to emit no files. If a broader validation/build
command writes generated output, record that as generated/ignored output and
leave source and protected paths untouched. Use the project validator scripts
rather than manually editing generated manifests or GLBs.

Focused checks for the current slices:

```text
pnpm exec vitest run tests/unit/host-session.test.ts tests/unit/service-mission.test.ts tests/unit/fire-response.test.ts tests/unit/repair-response.test.ts tests/unit/navigation-incident.test.ts tests/unit/boarding-invasion.test.ts tests/unit/peer-room.test.ts
pnpm exec vitest run tests/unit/compartment-loader.test.ts tests/unit/compartment-streamer.test.ts tests/unit/waypoint-travel.test.ts tests/unit/ambient-crowd.test.ts tests/unit/ambient-crowd-presenter.test.ts tests/unit/invasion-assets.test.ts tests/unit/invasion-presenter.test.ts
pnpm exec vitest run tests/integration/phase-one-flow.test.ts
pnpm exec playwright test tests/e2e/waypoint-navigation.spec.ts tests/e2e/presentation.spec.ts tests/e2e/ambient-crowd-normal-start.spec.ts --workers=1
```

Run the broader project commands only when their scope is intended and their
output can be retained:

```text
pnpm lint
pnpm test:unit
pnpm test:integration
pnpm test:e2e
pnpm build
```

`pnpm build` includes data validation, existing asset validation, the focused
weapon and liveliness validators, typecheck and the Vite build. Those two
focused validators establish load-ready GLB contracts only; they do not replace
a runtime loader, gameplay integration, browser route, or live network proof.

## Vertical-slice acceptance gates

### Slice A: HUD and interaction/task board — Planned

Unit and integration gates:

- task definitions reject duplicate IDs, unknown targets, invalid phases and
  missing resolution paths;
- the host snapshot exposes task identity, location, state, assignee, timer and
  denial/completion reason without renderer-owned state;
- selecting, claiming, abandoning and completing a task is idempotent;
- stale target, wrong compartment, wrong range, wrong item, non-owner item and
  guest-local mutation are rejected deterministically; and
- task cards are derived from the snapshot and disappear only after the host
  outcome is observed.

Browser gates:

- a clean start shows the current phase/objective and opens the board;
- a player can select one offered task, navigate to its target, see the
  interaction prompt and receive explicit success/denial feedback;
- a second local client sees the same task state and cannot claim a task the
  host has already assigned; and
- the HUD remains readable at 1366x768 and 412x915, with no debug-only control
  required for the normal flow.

Performance gate: board updates are snapshot/event driven, not a per-frame DOM
rebuild; the current HUD cadence and streaming/crowd rails remain within the
documented budgets.

### Slice B: one complete guest/restock/repair loop — Planned

Use one deterministic scenario:

1. The host offers one guest request with a known item and deadline.
2. A crew member takes finite stock from the authored outlet.
3. A restock task or route is required when the outlet is depleted.
4. The crew member delivers to the correct guest target.
5. A deterministic fault interrupts or follows the work, requiring the authored
   tool at the authored repair target.
6. The host resolves success, failure or expiry once and updates passenger,
   stock, repair, score and debrief fields consistently.

Unit/integration gates cover item conservation, request patience, restock
capacity, wrong-target denial, interruption, repair ownership/range/tool
validation, duplicate commands, disconnect cleanup and serialized snapshots.
Browser gates cover the complete route from task board to outlet to guest to
repair and back to debrief in solo and two-local-client modes. The flow must
work without a debug trigger after setup; debug triggers may remain as focused
test fixtures.

Performance gate: the route uses the existing room streamer, keeps only the
required resident set, and does not add an unbounded task, passenger, item, or
animation loop. Record frame time, draw calls, resident triangles, mixers and
texture memory when the route is measured.

### Slice C: pirate boarding and weapon presentation/combat contract — Planned

The existing boarding state and eight invasion assets are a **partial** base.
The slice must choose one deterministic pirate event and define:

- a host-validated weapon intent separate from the existing boarding-link
  action;
- weapon ownership, equipped item, target identity, range, facing/line or
  authored hit volume, cooldown and stale-command rules;
- a host-owned hit result that changes hostile state, passenger protection or
  infrastructure exactly once;
- visible pistol/cutlass presentation with explicit GLB/fallback status,
  muzzle/impact feedback and denial feedback; and
- a clean repelled/failed outcome that is visible in the mission snapshot and
  debrief.

Unit/integration gates cover malformed weapon commands, target spoofing, range,
cooldown, ownership, duplicate hits, disconnected players and snapshot
serialization. Browser gates cover warning, boarding, weapon equip/presentation,
one successful host-resolved hit, one rejected hit, link/infrastructure outcome,
and repelled or failed debrief. A rendered pirate or weapon, a boarding phase,
or a debug damage call alone is not combat evidence.

Performance gate: the event is bounded by authored hostile count, active
animation mixers, resident asset budget and the current crowd/streamer rails.

## Manual browser and network matrix

For every player-facing slice, test a clean room and a room with a second local
browser context. Exercise pointer lock and fallback mouse look, keyboard input,
portal travel, collision bounds, narrow HUD layout, interaction denial, reload
or reconnect behavior, and visible GLB-to-greybox fallback where relevant.

For a local two-client pass, verify that the guest sends intent only, receives
host snapshots, sees the same task/incident/boarding phase and cannot advance a
state by mutating renderer data. Check host reset and disconnect cleanup.

For live PeerJS/WebRTC proof, use the existing opt-in route with
`LIVE_MULTIPLAYER=1`. Record the room setup, browser contexts, protocol version
(currently `4` in `src/network/peer-room.ts`), host/guest roles, join result,
matching snapshot tick/state, reconnect or disconnect result, and any network
environment limitation. A simulated transport unit test is not a substitute
for this evidence, and a single browser is not a two-network proof.

## Performance and asset evidence

The authored rails from [PERFORMANCE.md](PERFORMANCE.md) are 16.6 ms at 1080p,
no transition frame above 33 ms, at most 300 draw calls, 1.2 million resident
triangles, 16 active mixers, and 256 MB texture memory. Current crowd presenter
guards are a 96 m cull radius and 24 visible residents. These are acceptance
targets, not a claim that current hardware evidence exists.

When measuring, use a fixed browser viewport and record:

- median and worst frame time during clean start, portal transition, crowd
  arrival, boarding presentation and the Slice B task route;
- draw calls, resident triangle count, active mixers and texture memory;
- network packet/queue metrics and snapshot age for two clients; and
- console errors, failed GLB loads, NaN values, stuck objects and fallback use.

The normal asset gate is `pnpm validate:assets`, `pnpm validate:weapons`, and
`pnpm validate:liveliness-assets`, followed by a browser check that confirms the
expected runtime asset is actually loaded. `validate-weapons.ts` covers the four
weapon GLB source/runtime, socket, Action, container and budget contracts;
`validate-liveliness-assets.ts` covers the six liveliness GLB schema, source,
runtime, node, Action and budget contracts. These are load-ready checks only,
not proof of runtime/gameplay integration. The data gate is
`pnpm validate:data`; none of these validators proves a complete gameplay loop.

## Result record

Every acceptance report should contain:

```text
Slice / commit or worktree: <name and hash>
Environment: <browser, viewport, OS, network mode>
Commands: <exact commands>
Results: <pass/fail/skip and counts>
Browser evidence: <artifact paths or not run>
Network evidence: <simulated/live/not run>
Performance evidence: <measurements or not run>
Known gaps: <partial/planned items only>
Preserved state: <unrelated dirty paths untouched>
```

The protected [CURRENT_STATUS.md](CURRENT_STATUS.md) and [HANDOFF.md](../HANDOFF.md)
remain the places for live-session notes. Update them only under their own
ownership rules; this plan must not overwrite them.

## Do not claim

Do not report the following as implemented without the listed evidence:

| Claim                              | Minimum evidence                                                                     |
| ---------------------------------- | ------------------------------------------------------------------------------------ |
| Full crew task economy             | Authoritative task registry, board, stock/effects, expiry and browser loop           |
| Complete guest/restock/repair loop | Slice B end-to-end host, solo and two-client proof                                   |
| Disaster system                    | At least one warning-to-consequence chain with recovery and tests                    |
| Pirate combat                      | Host weapon intent, hit validation, consequence, presentation and browser proof      |
| Arsenal/upgrades/persistence       | Validated progression state, application, save/load or explicit persistence contract |
| Scaled cruise/network release      | Full-route performance measurement plus live multi-browser/network evidence          |
| Finished GLB art                   | Source, manifest, validator, loaded browser route, fallback and budget evidence      |
