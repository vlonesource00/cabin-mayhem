# Changelog

## Unreleased

- Added free two-player PeerJS/WebRTC rooms with strict command validation and host-authoritative snapshots.
- Added a responsive landing debrief with score, served/missed totals, fire/repair summaries, authored passenger reviews and `Fly another shift` replay.
- Added a Blender-authored, material-batched cabin GLB with validated runtime loading and automatic procedural fallback.
- Known limitation: this GLB replaces the static cabin presentation only. Passenger avatars and interactive props remain procedural; interaction-animation polish and full manual delivery tuning remain open.
- Added procedural Web Audio cabin sound: engine, wind, rumble, fire and alarm beds plus discrete cues projected from authoritative state deltas, with `M` to mute. No audio files ship with the repository.
- Added eight seated 3D passengers with drink, meal and medical requests.
- Added physical service props, host-validated delivery, patience, panic, injury, scoring and mission outcome.
- Added cabin-service HUD, request beacons, tests and next-conversation handoff prompt.
- Added host-authoritative service-cart stock: `1`/`2`/`3` selection, `E` dispense/return, `Shift+E` cart movement and live stock HUD.
- Replaced loose drink/meal/medical staging with deterministic authored cart templates; the extinguisher remains a loose prop.
- Added automatic taxi, rotation assist and climb from `R` throttle; no debug phase skip required to leave ground.
- Added authored galley-fire state, extinguisher-only host validation, passenger-pressure/score consequences, world flames and fire HUD.
- Rebuilt flight HUD into responsive neon indie lanes; added GitHub Pages deployment workflow.
- Rebuilt Phase 1 as a true first-person Three.js aircraft with project-owned procedural 3D assets.
- Added pointer-lock mouse look, camera-relative movement, cabin fixture collisions and 3D prop synchronization.
- Fixed backward movement, fixed-step interaction loss and authoritative crosshair-target pickup; held props now render in the player's hands.
- Prevented Vite from watching Cargo build artifacts during `tauri dev`.

## 0.1.0 — 2026-08-01

- Reframed browser/Tauri prototype as original Cabin Mayhem Phase 1.
- Added host-authoritative flight phases, aircraft-local forces, loose cargo physics, straps, grab/throw ownership and simulated network conditions.
- Added greybox technical test scene with cockpit/cabin/cargo layout and debug triggers.
- Added Phase 1 architecture, network, authoring, test and roadmap documentation.
- Built Windows x64 executable, MSI and NSIS development artifacts.
