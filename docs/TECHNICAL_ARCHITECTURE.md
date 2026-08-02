# Technical Architecture

## Runtime boundary

TypeScript simulation runs at bounded `<= 50 ms` steps. `HostSession` has sole write access to `MissionState`. Presentation takes structured snapshots and cannot alter phase, object, passenger, score or damage state except through submitted intent and explicit host debug actions.

Three.js owns presentation only. `CabinWorld` maps aircraft-local simulation coordinates into WebGL space, creates project-owned procedural meshes and synchronizes visible crew, passenger and prop state from snapshots. `FirstPersonController` converts pointer-lock camera direction into host command intent.

The static cabin presentation loads `cabin-mayhem-scenario.glb` through `scenario-loader.ts`. The authored Blender root and minimum mesh contract are validated before activation. Until load succeeds, and whenever fetch/parse validation fails, the procedural cabin remains visible. On success, material-batched GLB visuals replace procedural rendering while invisible procedural interaction proxies and simulation collision fixtures remain authoritative.

`PeerRoom` is the browser transport adapter. In host mode, local `crew-alpha` input and validated remote `crew-bravo` input enter the same `HostSession`; in guest mode the app never steps simulation and only renders host snapshots. PeerJS supplies free signaling while WebRTC carries gameplay directly. The deterministic simulation has no PeerJS dependency.

## Passenger service

`service-mission.ts` activates authored requests on the deterministic mission clock. It owns finite cart stock, deterministic item dispensing/returns, patience decay, incident-driven panic/injury, delivery validation and score/outcome. `fire-response.ts` owns the authored galley hotspot and active/suppressed state. `CabinWorld` only raycasts candidate cart/passenger/fire IDs; `HostSession` checks cart selection, stock, target, ownership, active request, held extinguisher, item mapping and distance before mutating state.

## Aircraft reference frame

Aircraft cabin coordinates are local `(x, y)` meters. Flight model exposes roll, acceleration, turbulence and collision impulse. Cabin simulation applies derived inertial vectors to crew/loose objects; secured cargo remains attached to local anchors. This hybrid approach avoids unstable global-aircraft Rigidbody simulation.

## Physics model

Crew use stable kinematic movement, crouch/sprint/brace states, static cabin fixture collision and knockdown threshold. Flight automatically transitions ground → taxi → takeoff from throttle/airspeed and applies rotation assist before climb. Objects have radius, mass, friction, impact tolerance, damage, secured anchor and owner. Pairwise collision scope remains intentionally small and relevant. Object authority stays host-side.

## Extension seams

- `LobbyService`, `Transport`, `SaveStorage`, `Achievements`, `Invitations`, `Voice` and `Analytics` must be interfaces outside `sim/` when production services are added.
- Static authored definitions belong in `src/data/`; mutable runtime state belongs in `src/sim/`.
- Rendering/audio/network adapters observe domain state; do not import them into deterministic rules.
