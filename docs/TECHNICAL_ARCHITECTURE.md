# Technical Architecture

## Runtime boundary

TypeScript simulation runs at a fixed 1/60 s step with frame delta bounded to
`<= 50 ms`. `HostSession` has sole write access to `MissionState`. Presentation
takes structured snapshots and cannot alter phase, object, guest, job, hazard,
score or damage state except through submitted intent and explicit host debug
actions.

Three.js owns presentation only. `CabinWorld` maps ship-local simulation
coordinates into WebGL space, streams authored compartment GLBs when their
contract validates, retains procedural greybox fallback visuals and synchronises
visible crew, guest and prop state from snapshots. `FirstPersonController`
converts pointer-lock camera direction into host command intent. The DOM layer
owns the contextual HUD, the incident warning and countdown, the closed `F1`
drawer and the voyage debrief; none of these layers resolve gameplay outcomes.

`PeerRoom` is the browser transport adapter. In host mode, local `crew-alpha`
input and validated remote `crew-bravo` input enter the same `HostSession`; in
guest mode the app never steps simulation and only renders host snapshots.
PeerJS supplies free signaling while WebRTC carries gameplay directly. The
deterministic simulation has no PeerJS dependency.

## Ship reference frame

The hull never moves in world coordinates. Deck coordinates are ship-local
`(x, y, z)` metres. `ship-model` exposes heading, rudder angle, telegraph, speed,
turn rate, list, and the pitch/roll/heave induced by sea state, and derives the
acceleration vector felt on every deck. `cabin-simulation` applies that derived
vector to crew and loose objects; secured items stay attached to local anchors.

This is the same hybrid the aircraft used, and it matters more here: an ocean is
large enough to lose float precision if the hull actually translated through it.
The ocean, obstacle field and horizon move relative to a stationary hull.

The visible sea and the felt sea come from the same wave function — the vertex
shader displaces the sea plane, and the simulation evaluates the identical
function at a few hull sample points. They agree without sharing a mesh.

## Compartment streaming

The ship is a portal graph of compartments ([`SHIP_LAYOUT.md`](SHIP_LAYOUT.md)),
each one authored GLB. `compartment-loader` validates a compartment's root node
`CM_<COMPARTMENT>_ROOT` and its declared `CM_PORTAL_<TARGET>` empties before
activation. Residency follows portal distance from the player; loads are async
and pre-warmed at portal approach so a transition never blocks a frame.

Until a compartment's GLB loads, and whenever fetch or contract validation
fails, its procedural greybox remains visible and the voyage continues. On
success, batched GLB visuals replace the greybox while invisible procedural
interaction proxies and simulation collision fixtures remain authoritative.

Budgets and the measurement gates that enforce them are in
[`PERFORMANCE.md`](PERFORMANCE.md).

## Jobs and hazards

`service-mission.ts` activates authored requests on the deterministic mission
clock and owns finite stock, deterministic dispensing and returns, patience
decay, incident-driven panic and injury, delivery validation and score. It
generalises from one cart to per-compartment outlets.

The hazard system generalises `fire-response.ts` and `repair-response.ts` into
one shape: an authored site, a status machine, a required tool, a range, a hold
or repeat action, and a consequence for ignoring it. Fire, hull breach,
breakdown and power failure are instances of it, not separate systems.

`debrief.ts` projects terminal host state into reviews and incident verdicts
without mutating it. `CabinWorld` only raycasts candidate IDs; `HostSession`
checks selection, stock, target, ownership, active request, held tool, item
mapping and distance before mutating state.

## The helm

The bridge helm is a station, not a mode. A player standing in its interaction
volume has their `HelmInput` accepted; everyone else's is discarded. The host
validates avoidance by integrating the resulting track against the obstacle and
comparing to the authored clearance margin. A dodge succeeds because the ship's
simulated track cleared, never because an animation played or a button was
pressed in time.

## Physics model

Crew use stable kinematic movement with crouch, sprint and brace states, static
fixture collision and a knockdown threshold. Objects have radius, mass,
friction, impact tolerance, damage, secured anchor and owner. Object authority
stays host-side.

The current pairwise broadphase is O(n²) and was already at its limit at the
aircraft's object count. A uniform spatial hash is a prerequisite for the second
compartment, not an optimisation.

## Extension seams

- `LobbyService`, `Transport`, `SaveStorage`, `Achievements`, `Invitations`,
  `Voice` and `Analytics` must be interfaces outside `sim/` when production
  services are added. `SaveStorage` becomes load-bearing at Phase 10 for the
  upgrade tree.
- Static authored definitions belong in `src/data/`; mutable runtime state
  belongs in `src/sim/`.
- Rendering, audio and network adapters observe domain state; do not import them
  into deterministic rules.
- `compartment-loader.ts` validates a compartment's root, portal and budget
  contract before it enters the scene. A fetch, parse or contract failure is
  non-fatal: `CompartmentStreamer` substitutes greybox and the voyage continues.
- `PeerRoom` is an adapter around the deterministic host. The simulation remains
  testable without a network service.
