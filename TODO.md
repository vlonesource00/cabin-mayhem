# TODO

Local work snapshot. Phases and exit conditions live in
[docs/ROADMAP.md](docs/ROADMAP.md).

## In progress

- [ ] Interior design pass. The exterior reads as a ship; the insides now need
      the same standard — placement that makes sense, rooms that are designed
      rather than filled, no stair to nowhere, no clipping. This is the open
      quality bar, not a checklist item.
- [ ] Decide Git LFS. Fourteen compartment GLBs plus the exterior are tracked in
      the repo and the largest is 8 MB. Not urgent, decided before it is - unassigned
- [ ] Decide one Blender version between both collaborators. `passengers.blend` was written by 502.44 and warns of data loss when opened in 5.1; nothing should be skinned until this is settled - unassigned

## Next (Phase 5)

- [x] Ship motion model: heading, rudder, telegraph, momentum, turning radius, derived deck acceleration.
- [x] Compartment set (atrium, cabin-corridor-a, bridge, engine-room) behind the streaming loader and
      portal graph. The airliner cabin is gone from the code and from the authored geometry.
- [x] Widen the ship. `CABIN_SCALE = 1` in `src/three/coordinates.ts` now maps a 24 x 46 metre
      playfield onto a 24 m x 46 m atrium, 12.8 m tall, and every compartment, station, prop and
      teleport target was restaged onto it. The fuselage footprint is gone.
- [x] Compartment traversal. `PlayerState.compartmentId`, host-owned portal movement and
      snapshot-driven compartment streaming now connect the authored rooms. The direct bridge and
      engine-room links remain honest stairwell stand-ins, tracked below.
- [x] Author the stair towers. Three of them — aft (decks 0–9), midship (1–9) and forward (5–9) —
      are now the ship's only vertical connection, and the stand-in portals that skipped decks are
      gone. [ADR 0004](docs/adr/0004-stair-tower-traversal.md).
- [x] Exterior and open decks. One always-resident `ship-exterior.glb`: hull, sheer,
      superstructure, balconies, windows, funnels, masts, lifeboats and davits, plus the promenade,
      lido pool deck and sun deck as authored exterior compartments. Glazing is real — `glass_clear`
      exports `alphaMode: BLEND` and the loader makes it safe. Budgets and the X0/X1/X2 tiers are in
      [docs/PERFORMANCE.md](docs/PERFORMANCE.md). [ADR 0003](docs/adr/0003-ship-layout-redesign.md).
- [x] Deck plan. Hold **N** during a voyage: the ship in section and the current deck in plan, at
      one true scale, drawn from the layout data rather than from anything loaded.
- [x] Helm station with positional input authority at the authored bridge interaction area.
- [x] Collision-course incident end to end: deterministic contact, warning, countdown,
      host-validated avoidance, impact damage, engine-room relay repair and score transitions.
- [x] Blender 5.1 navigation-vessel source/GLB, manifest validation and normal-path
      authored obstacle loading with explicit fallback coverage.
- [x] Current interactable feedback contract: objects, passenger service, fire,
      toolbox repairs, helm, doors/portals and station feedback.

## Backlog

- [ ] Uniform spatial hash broadphase. The current pairwise loop is O(n²). Not blocking anything
      today — loose-object counts are per-compartment — but it is the known fix when it does bite.
- [ ] Perf smoke test on real hardware: frame time, draw calls, triangles, texture memory and mixer
      count along an authored route through every deck. Cannot be written from the agent side;
      `requestAnimationFrame` never fires here. The largest verification gap in the project.
- [ ] Public snapshot projection, delta compression and backpressure. Prerequisite for crews above two.
- [ ] Split the production JavaScript bundle to remove the known non-blocking Vite chunk-size warning.
- [ ] Join and skin the 22 T-pose characters to the shared `CM_HUMANOID` skeleton so the cast inherits authored clips. Blocked on the Blender version decision.
- [ ] Replace procedural Web Audio with production-recorded ship sound and guest voices.
- [ ] Profile/settings migration for controls and accessibility.
- [ ] Production relay/TURN and a room/lobby experience.

## Done

- [x] Vite browser runtime and Tauri Windows wrapper.
- [x] Explicit phase state machine.
- [x] Vehicle-local physics, securing, grabbing and throwing.
- [x] Host authority plus latency/jitter/loss test harness.
- [x] Greybox technical scene, debug display and automated tests.
- [x] Three.js first-person world, procedural 3D asset kit and pointer-lock controls.
- [x] Static fixture collisions and 3D loose-object synchronisation.
- [x] Reliable backward movement and first-person pickup/place/throw loop.
- [x] Browser visual pass and Windows `.exe`/MSI/NSIS build.
- [x] Validated authored passenger and service-item data.
- [x] Eight 3D passengers with drink, meal and medical requests.
- [x] Host-validated service delivery, patience, panic, injury, score and mission result.
- [x] Host-authoritative service-cart inventory, selection, dispensing, returns and stock HUD.
- [x] Host-authoritative galley-fire suppression.
- [x] Colorful responsive indie HUD lanes and GitHub Pages deployment workflow.
- [x] Deterministic host-authoritative repair crisis with tool/range/hold validation, pressure and scoring.
- [x] Icon-first contextual HUD; telemetry and Chaos Lab in a closed-by-default `F1` drawer.
- [x] Free two-player PeerJS/WebRTC rooms with host-only authority, ordered snapshots and disconnect cleanup.
- [x] Responsive debrief with score, reviews, incident verdicts and room-preserving replay.
- [x] Blender-authored static GLB, tracked `.blend` source, validated loader and procedural fallback.
- [x] Procedural Web Audio and `M` mute control.
- [x] Snapshot-driven held-item, repair, passenger and crew interaction animation.
- [x] Two Blender-authored skeletal rigs, 44 clips, `AnimationMixer` playback and a validated clip contract.
- [x] CI-sized Playwright timeout budget and uploaded failure traces.
- [x] Branch consolidation onto `novo-main-stable` with protection enabled.
- [x] Camera settled as first person in [ADR 0002](docs/adr/0002-first-person-camera.md). Phase 6 unblocked.
- [x] Mechanical voyage rename: `VoyageState`, `VoyagePhase`, `HelmInput`, `src/sim/ship-model.ts`, `MissionState.voyage`, `PlayerCommand.helm`, `voyage` event type.
- [x] Ocean: one wave table shared by the simulation and a generated vertex shader, hull pitch/roll/heave fitted to it, drift under a hull that never translates.
- [x] Compartment streaming: Zod-validated portal graph, contract-checked GLB loading, greybox fallback, residency and eviction, four authored rooms inside budget.
- [x] Retired the airliner from the runtime: no fuselage geometry, no scenario loader, no aeroplane copy or icons.
- [x] The ship itself: fourteen compartments across eight occupied decks plus the exterior, one
      ship space, one deck formula, one beam curve, authored by deterministic headless Blender
      scripts under `tools/blender/`.
- [x] Deck plan on **N**, built as a pure string-returning function so it is testable in a suite
      with no DOM.

## Retired with the pivot

Airliner content is superseded by [ADR 0001](docs/adr/0001-cruise-ship-pivot.md)
and stays in Git history: automatic taxi/takeoff climb, the flight model, the
landing debrief framing, world-prop animation for the cabin scenario, and the
manual service-flight playtest that was pending against it.

## Cruise north-star backlog after navigation and boarding slices

- [x] Pirate boarding foundation: warning/approach/aboard phases,
      passenger/infrastructure pressure, host-validated boarding-link detachment,
      score outcomes, eight Blender GLBs, authored Actions, HUD and browser proof.
- [ ] Complete security incidents: bomb threat, bomber search/disarm, combat AI,
      firearms/melee hit resolution, passenger escort and persistent damage.
- [ ] Resort jobs: room service, pool cleaning, DJ performance, cooking with
      chefs, mall/restaurant/bar restocking and consensual guest-request or
      performer photography.
- [ ] Dense passenger population: authored social, dining, shopping, work,
      sunbathing, reaction and evacuation behaviours with host-owned safety state.
- [x] Massive ship expansion: exterior, open decks and stairwells, all authored in Blender and
      tracked as validated GLB runtime assets.
- [ ] More of the ship. Fourteen compartments is the working vessel, not the ceiling — shopping
      arcade, theatre, casino, bars, spa, crew mess, medical bay, more cabin tiers. Candidates and
      the cost of adding one are listed in [docs/SHIP_LAYOUT.md](docs/SHIP_LAYOUT.md).

Unchecked items are planned slices, not implemented claims. Preserve the current
exterior and compartment work while each one is built and tested as a
host-authoritative vertical.
