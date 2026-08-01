# Technical Architecture

## Runtime boundary

TypeScript simulation runs at bounded `<= 50 ms` steps. `HostSession` has sole write access to `MissionState`. Presentation takes structured snapshots and cannot alter phase/object/damage state except through explicit host debug actions.

## Aircraft reference frame

Aircraft cabin coordinates are local `(x, y)` meters. Flight model exposes roll, acceleration, turbulence and collision impulse. Cabin simulation applies derived inertial vectors to crew/loose objects; secured cargo remains attached to local anchors. This hybrid approach avoids unstable global-aircraft Rigidbody simulation.

## Physics model

Crew use stable kinematic movement, crouch/sprint/brace states and knockdown threshold. Objects have radius, mass, friction, impact tolerance, damage, secured anchor and owner. Pairwise collision scope remains intentionally small and relevant. Object authority stays host-side.

## Extension seams

- `LobbyService`, `Transport`, `SaveStorage`, `Achievements`, `Invitations`, `Voice` and `Analytics` must be interfaces outside `sim/` when production services are added.
- Static authored definitions belong in `src/data/`; mutable runtime state belongs in `src/sim/`.
- Rendering/audio/network adapters observe domain state; do not import them into deterministic rules.
