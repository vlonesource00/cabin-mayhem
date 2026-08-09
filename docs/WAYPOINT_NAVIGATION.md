# Waypoint navigation

Cabin Mayhem now exposes named, host-routed destinations across the existing cruise layout:

- engine room / steering relay, crew corridor, galley, Grand Atrium, dining room;
- cabin decks four and seven, promenade, pool deck, sun deck, and bridge;
- Grand Atrium elevator stops on decks 2, 3, 4, and 5.

`src/data/waypoints.ts` is the typed source of truth. Zod validation checks unique IDs, known
compartments, deck bounds, walkable waypoint positions, and elevator stop coverage. The route
planner uses existing portals, stairwell landings, and the parsed Grand Atrium elevator. Its
neighbour order is fixed, so equal inputs produce equal routes.

The waypoint request is only a destination intent. `stepCabin` admits it on the host, checks
authority, door cooldowns, portal blocks, and walkable fixture segments, then advances a bounded
state machine of walking, door, and elevator legs. Compartments change only when a door leg
completes; elevator movement changes deck state only when its timed leg completes. Existing WASD
movement, normal door interaction, collision handling, debug/test teleports, and the multiplayer
command shape remain compatible. A direct debug teleport cancels any stale route on the next host
step.

Focused coverage lives in `tests/unit/waypoint-travel.test.ts` and
`tests/e2e/waypoint-navigation.spec.ts`. The e2e test captures the runtime waypoint chart and
Grand Atrium elevator panel under `test-results/navigation-evidence/` when Playwright runs.
