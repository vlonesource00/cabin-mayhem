# Architecture

## Scope

Slice 2 web/Tauri vertical for Cabin Mayhem. Vite/browser is the intentional platform choice; Tauri packages the same static web application. The current vertical includes host-authoritative service, fire, repair, landing debrief, optional two-player WebRTC rooms and a Blender-authored static cabin GLB with procedural fallback. This replaces the Unity direction from the master brief because the web app was an explicit product decision.

## Folder layout

```text
  src/
  app/       menu, 3D game shell, HUD, debug UI, test bridge
  audio/     procedural Web Audio beds and cues projected from mission state
  input/     keyboard/gamepad intent collection
  sim/       host authority, flight model, cabin physics, service/fire/repair rules, simulated transport
  network/   optional PeerJS/WebRTC room transport
  three/     Three.js world, GLB loader, procedural fallback, passengers, FPS camera and coordinates
  data/      validated cabin, passenger, request and service-item definitions
assets-src/  tracked Blender source assets and generators
public/      runtime assets and asset manifest
tests/       unit, integration and browser journeys
docs/        game, network, authoring, test and roadmap records
src-tauri/   optional Rust native shell
```

## Main systems

- `HostSession`: only owner of phase, automatic takeoff progression, flight, cabin objects, passenger service, fire state, score, damage, reservation and events.
- `flight-model`: compact aircraft state; derives cabin acceleration without moving aircraft world coordinates.
- `cabin-simulation`: aircraft-local kinematic crew plus selective loose-object physics, friction, straps and collision impulses.
- `simulated-transport`: deterministic latency, jitter and packet loss harness for local host/client proof.
- `service-mission`: deterministic requests, finite cart inventory, passenger pressure, delivery validation, scoring and terminal outcome.
- `fire-response`: authored galley hotspot, deterministic active/suppressed state and host-validated extinguisher use.
- `repair-response`: authored coffee-machine breaker fault, toolbox/target/range/hold validation, pressure and score consequences, fire priority and recovery.
- `PeerRoom`: two-player PeerJS/WebRTC adapter. It transports validated commands and ordered host snapshots but never owns simulation rules.
- `debrief`: pure landing result projection for score, service totals, incident verdicts, authored reviews and room-preserving replay.
- `CabinMayhemApp`: presentation coordinator; turns input into intention and reads host snapshots.
- `CabinWorld`: Three.js/WebGL aircraft, lighting, GLB/procedural visuals, prop synchronization and interaction raycast.
- `scenario-loader`: validates and loads the authored Blender GLB, then leaves procedural visuals active on failure.
- `FirstPersonController`: pointer-lock mouse look, camera-relative movement and inertial camera feedback.
- `interaction-animation`: pure projection of snapshots into held-item hand poses, seated passenger reactions and crew limb motion. Gestures come from authoritative state deltas and never gate a host outcome.
- `mission-audio`: pure projection of a snapshot into continuous bed levels and discrete cues derived from authoritative state deltas, never from event wording.
- `CabinAudio`: Web Audio graph that synthesises every bed and cue at runtime. It ships no audio files, reads snapshots only and never writes to the simulation.

## Data flow

```text
Keyboard/gamepad or remote client
  -> PlayerCommand intent
  -> SimulatedTransport or PeerRoom
  -> HostSession validation and fixed-step simulation
  -> flight + cabin + service + emergency MissionState snapshot
  -> Three.js world + DOM HUD/debug/debrief presentation + procedural audio
```

## Dependencies

Runtime: no required online service in solo mode. Two-player rooms use the free PeerJS cloud for signaling and direct WebRTC data channels; TURN is optional. `zod` validates authored cabin and emergency data. Build/test: Vite, TypeScript, Vitest, Playwright, ESLint, Prettier. Optional desktop shell: Tauri v2, Rust and WebView2.

## Decisions

- Aircraft remains local; cabin responds to derived acceleration. Avoids large-coordinate precision and unstable fully-physical aircraft coupling.
- Only compact intent moves through transport; host creates authoritative state.
- Phase changes use one explicit transition function, never scattered flags.
- The static cabin presentation is project-owned Blender geometry loaded from a tracked `.blend`/GLB pair. Procedural meshes remain the fallback and continue to represent passengers, gameplay props, emergency effects and interaction/collision proxies.
- Cart and passenger interaction is host-validated: the client selects a candidate, then host checks selection, finite stock, ownership, held item, request type and range before dispensing, returning or consuming an item.
- Rendering and debrief projection cannot mutate simulation state. The host alone resolves fire, repair, score, outcome and replay reset.
