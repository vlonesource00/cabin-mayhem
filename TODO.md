# TODO

## In progress

- [ ] Manual full service-flight and two-browser room playtest/tuning - Martim
- [ ] Fresh desktop and narrow-viewport visual pass for the expanded GLB, procedural animation and debrief - Martim
- [ ] Replace priority procedural passenger/NPC and gameplay props with licensed production assets - unassigned

## Backlog

- [ ] Add player/object collision broadphase before more cabin objects.
- [ ] Add profile/settings migration for Cabin Mayhem controls/accessibility.
- [ ] Replace procedural Web Audio with production-recorded cabin sound and passenger voices.
- [ ] Replace priority procedural interaction motion with authored animation and art polish.
- [ ] Split the production JavaScript bundle to remove the known non-blocking Vite chunk-size warning.
- [ ] Add a production relay/TURN and room/lobby experience after the two-player prototype is stable.

## Done

- [x] Vite browser runtime and Tauri Windows wrapper.
- [x] Explicit flight phase state machine.
- [x] Aircraft-local cabin physics, straps, grabbing and throwing.
- [x] Host authority plus latency/jitter/loss test harness.
- [x] Greybox technical scene, debug display and automated Phase 1 tests.
- [x] Three.js first-person aircraft, procedural 3D asset kit and pointer-lock controls.
- [x] Static cockpit/seat fixture collisions and 3D loose-object synchronization.
- [x] Reliable backward movement and first-person pickup/place/throw loop.
- [x] Browser visual pass and Windows `.exe`/MSI/NSIS build.
- [x] Validated authored passenger and service-item data.
- [x] Eight 3D passengers with drink, meal and medical requests.
- [x] Host-validated service delivery, patience, panic, injury, score and mission result.
- [x] Host-authoritative service-cart inventory, selection, dispensing, returns and stock HUD.
- [x] Automatic taxi/takeoff climb plus host-authoritative galley-fire suppression.
- [x] Colorful responsive indie HUD lanes and GitHub Pages deployment workflow.
- [x] Deterministic host-authoritative coffee-machine repair crisis with tool/range/hold validation, pressure, scoring and sitcom feedback.
- [x] Icon-first contextual HUD; telemetry and Chaos Lab live in a closed-by-default `F1` development drawer.
- [x] Free two-player PeerJS/WebRTC rooms with host-only authority, ordered snapshots and disconnect cleanup.
- [x] Responsive landing debrief with score, passenger reviews, incident verdicts and room-preserving replay.
- [x] Blender-authored static cabin GLB, tracked `.blend` source, validated loader and procedural fallback.
- [x] Expanded Blender cabin scenario with flight deck, galleys and cargo hold.
- [x] Procedural Web Audio cabin sound and `M` mute control.
- [x] Snapshot-driven held-item, repair, passenger and crew interaction animation.
- [x] CI-sized Playwright timeout budget and uploaded failure traces.
