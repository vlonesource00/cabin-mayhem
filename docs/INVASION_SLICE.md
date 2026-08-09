# Host-authoritative boarding invasion slice

This slice now includes host-authoritative simulation plus a presentation-only Three.js layer. It renders the authored pirate/saboteur characters, carried equipment, boarding links and gear crate, and drives their Blender Actions from snapshot phase/status. It does not yet claim combat AI, firearms hit resolution, a playable bomb-search/disarm loop, or a complete network UI.

`HostSession` owns the invasion phase, timers, boarding-link status, player compartment/range checks, passenger protection, infrastructure integrity, hull damage, and score changes. Clients submit only `boardingAction` intent. The host rejects unknown action shapes, actions in the wrong phase, mismatched action/target pairs, wrong compartments, and out-of-range actors.

The authored flow is `idle`, `warning`, `approach`, `boarders-aboard`, then `repelled` or `failed`. During the aboard phase, bounded deterministic pressure pulses endanger passengers, injure passengers, damage ship structure, and reduce score. Detaching both the port boarding board and starboard gangway resolves the invasion.

`pirate` is the active enemy kind. `bomber` is the stable simulation key for a hostile boarding saboteur character, not an aircraft or boat. It is an expansion seam only; no saboteur behavior is simulated. Photography direction remains unchanged and consent-safe.

## Frozen GLB asset contract

The visual/Blender pipeline and `InvasionPresenter` use these stable IDs and public paths:

- `pirate-boarder-character`: `/assets/invasions/characters/pirate-boarder.glb`
- `saboteur-boarder-character`: `/assets/invasions/characters/saboteur-boarder.glb`
- `boarding-pistol`: `/assets/invasions/weapons/boarding-pistol.glb`
- `boarding-cutlass`: `/assets/invasions/weapons/boarding-cutlass.glb`
- `satchel-charge`: `/assets/invasions/explosives/satchel-charge.glb`
- `boarding-board`: `/assets/invasions/boarding/boarding-board.glb`
- `pirate-gangway`: `/assets/invasions/boarding/pirate-gangway.glb`
- `pirate-gear-crate`: `/assets/invasions/props/pirate-gear-crate.glb`

Exact required node and Blender Action names are Zod-validated in `src/data/invasions.ts`. Character rigs require stable weapon/explosive sockets. Pirate actions cover idle, running, boarding, aiming, firing, melee, hit reaction, fall, and retreat. Saboteur actions cover boarding, aiming, planting/arming explosives, hit reaction, fall, and retreat. Plank/gangway Actions expose approach, attach, detach/release, and detached states. Satchel Actions expose idle, arm, disarm, and detonate. These are presentation requirements only; animation must consume host semantic state and never decide hits, damage, phase, or outcome.

The visual foundation now satisfies that gate: all eight GLBs exist at the frozen paths, pass asset validation, load through `src/three/invasion-presenter.ts`, validate every required Action/socket, and have player-visible Playwright evidence under ignored `test-results/invasion-evidence/`. This is not a claim that combat, bomber objectives, or every invasion animation transition is complete.

PeerRoom protocol v2 explicitly admits `boardingAction.kind` and `boardingAction.targetId`, rejects extra fields, and keeps phase, compartment, position, distance, damage, and score server-derived. The real two-Windows/two-network gate remains unproven because the live PeerJS smoke stayed in `waiting`.
