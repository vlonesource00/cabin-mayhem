# TODO

Local work snapshot. Phases and exit conditions live in
[docs/ROADMAP.md](docs/ROADMAP.md).

## In progress

- [ ] Cruise-ship pivot documentation - Martim
- [ ] Decide Git LFS before Phase 6 starts landing one GLB per compartment - unassigned
- [ ] Decide one Blender version between both collaborators. `passengers.blend` was written by 502.44 and warns of data loss when opened in 5.1; nothing should be skinned until this is settled - unassigned

## Next (Phase 5)

- [ ] Ship motion model: heading, rudder, telegraph, momentum, turning radius, derived deck acceleration.
- [ ] Greybox compartment set (bridge, corridor, public room, engine room) behind the streaming loader.
- [ ] Helm station with positional input authority.
- [ ] Collision-course incident end to end: spawn, warning, countdown, host-validated avoidance, consequences either way.

## Backlog

- [ ] Uniform spatial hash broadphase. The current pairwise loop is O(n²) and blocks the second compartment.
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

## Retired with the pivot

Airliner content is superseded by [ADR 0001](docs/adr/0001-cruise-ship-pivot.md)
and stays in Git history: automatic taxi/takeoff climb, the flight model, the
landing debrief framing, world-prop animation for the cabin scenario, and the
manual service-flight playtest that was pending against it.
