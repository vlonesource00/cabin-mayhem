# Architecture

## Scope

Slice 2 web/Tauri vertical for Cabin Mayhem. Vite/browser is the intentional platform choice; Tauri packages the same static web application. This replaces the Unity direction from the master brief because the web app was an explicit product decision.

## Folder layout

```text
src/
  app/       menu, 3D game shell, HUD, debug UI, test bridge
  input/     keyboard/gamepad intent collection
  sim/       host authority, flight model, cabin physics, service mission, simulated transport
  three/     Three.js world, project-owned 3D kit, passengers, FPS camera and coordinates
  data/      validated cabin, passenger, request and service-item definitions
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
- `CabinMayhemApp`: presentation coordinator; turns input into intention and reads host snapshots.
- `CabinWorld`: Three.js/WebGL aircraft, lighting, 3D assets, prop synchronization and interaction raycast.
- `FirstPersonController`: pointer-lock mouse look, camera-relative movement and inertial camera feedback.

## Data flow

```text
Keyboard/gamepad or local client
  -> PlayerCommand intent
  -> simulated transport (non-host)
  -> HostSession validation and fixed-step simulation
  -> flight + cabin + service MissionState snapshot
  -> Three.js world + DOM HUD/debug presentation
```

## Dependencies

Runtime: no required online service. `zod` validates authored cabin data. Build/test: Vite, TypeScript, Vitest, Playwright, ESLint, Prettier. Optional desktop shell: Tauri v2, Rust and WebView2.

## Decisions

- Aircraft remains local; cabin responds to derived acceleration. Avoids large-coordinate precision and unstable fully-physical aircraft coupling.
- Only compact intent moves through transport; host creates authoritative state.
- Phase changes use one explicit transition function, never scattered flags.
- Procedural Three.js meshes form a project-owned 3D asset kit; no copied aviation-game content.
- Cart and passenger interaction is host-validated: the client selects a candidate, then host checks selection, finite stock, ownership, held item, request type and range before dispensing, returning or consuming an item.
