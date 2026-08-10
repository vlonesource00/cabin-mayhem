# Physical portal-pad navigation

Named destinations remain data for stable labels and Grand Atrium elevator
stops. They are not a global travel chart. `src/data/waypoints.ts` validates
the elevator's D2/D3/D4/D5 stops and the authored destination metadata.

`portalPadDefinitionsFor(compartmentId)` derives one small floor ring from each
authored portal in the occupied compartment. The Grand Atrium adds one ring at
the authored elevator position. `WaypointPadPresenter` renders these rings at
their pad positions; it never creates a player-relative marker or authorizes a
transfer.

The host recomputes the nearby pad from authoritative compartment and position
and publishes `DoorPrompt` with a stable pad id and deterministic option order.
A single-option pad accepts `E` immediately. A multi-option pad keeps wheel
selection local to `CabinInputController`; the compact HUD lists every option,
selected row, and deck. `E` sends the selected option through the existing
`interactionTargetId` command field.

`stepPortalPad` validates the target against the currently reachable pad,
cooldown, destination, and position on the host. A valid door uses the
authored arrival position and heading. An elevator updates its persistent
`waypointDeck` and position atomically, zeros velocity, sets the short
cooldown, and clears the prompt. Invalid or stale ids do not move a player.
There is no client teleport, route timer, walking leg, or progress state.
Existing object interaction precedence, debug teleports, multiplayer command
shape, and F1 Chaos Lab controls remain intact; the F1 waypoint chart and
buttons are gone.

Runtime seams are written to the canvas:

- `data-portal-pad-visible`
- `data-portal-pad-options`
- `data-portal-pad-selected`
- `data-portal-pad-id`

An authored stairwell portal is a junction rather than an empty destination.
Its pad options are the reciprocal real-compartment portals from that
stairwell, excluding the compartment the player is leaving; confirmation
arrives directly at the selected compartment's authored arrival position and
heading. Ring geometry uses normal depth testing with transparent depth writes
disabled, so a wall occludes a pad instead of turning it into an always-on-top
HUD marker.

Focused proof is in `tests/unit/waypoint-travel.test.ts`,
`tests/unit/cabin-input.test.ts`, and
`tests/e2e/waypoint-navigation.spec.ts`. The e2e test proves wrapped wheel
selection, page-scroll suppression, host-validated elevator selection, and
writes the line-of-sight, wall-occluded, stair-destination-picker, and
main-galley-arrival correction evidence under
`test-results/correction-evidence/`.
