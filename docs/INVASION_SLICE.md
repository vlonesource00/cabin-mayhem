# Host-authoritative boarding invasion slice

> **Current status (2026-08-10):** This host-authoritative invasion slice is part
> of the current checkpoint. Its asset and presenter contracts do not prove the
> separate NPC-visibility or hydraulics runtime observations are resolved. See
> [CURRENT_STATUS.md](CURRENT_STATUS.md) and [ROADMAP.md](ROADMAP.md).

This slice now includes host-authoritative simulation plus a presentation-only Three.js layer. It renders the authored pirate/saboteur characters, carried equipment, boarding links and gear crate, and drives their Blender Actions from snapshot phase/status. Pirate boarding and saboteur boarding are separate deterministic event variants with player-facing warning, approach, aboard, repelled, and failed metadata. It does not yet claim combat AI, firearms hit resolution, a playable bomb-search/disarm loop, or a complete network UI.

`HostSession` owns the invasion phase, timers, boarding-link status, player compartment/range checks, passenger protection, infrastructure integrity, hull damage, and score changes. Clients submit only `boardingAction` intent. The host rejects unknown action shapes, actions in the wrong phase, mismatched action/target pairs, wrong compartments, and out-of-range actors.

The authored flow is `idle`, `warning`, `approach`, `boarders-aboard`, then `repelled` or `failed`. During the aboard phase, bounded deterministic pressure pulses endanger passengers, injure passengers, damage ship structure, and reduce score. Detaching both the port boarding board and starboard gangway resolves the invasion.

`pirate` is the active enemy kind. `bomber` is the stable simulation key for a hostile boarding saboteur character, not an aircraft or boat. Both variants use the same bounded host phase machine and crowd evacuation signal; bomber-specific combat or explosive resolution is not simulated. Photography direction remains unchanged and consent-safe.

## Event catalog and trigger boundary

`boardingEventCatalog` in `src/data/invasions.ts` is the deterministic event catalog:

- `pirate-boarding-alpha` / `pirate`: `open-sea` after 55 seconds, active service, and clear navigation.
- `saboteur-boarding-alpha` / `bomber`: `open-sea` after 110 seconds, active service, and clear navigation.

`HostSession` calls `triggerBoardingEvent` for both paths. Its automatic catalog walk passes the authoritative voyage phase, current phase elapsed seconds, service outcome, and navigation-clear state as a `scheduled` request; it records the selected event and completed terminal events so pirate and saboteur entries do not retrigger every tick. The public `boarding-invasion`, `invasion`, and `boarding-invasion-debug` hooks are explicit `debug` requests; only the `-debug` hook applies the bounded timing overrides. A `scheduled` request is rejected outside `open-sea`, before its authored cruise condition, without active service, or while navigation is unresolved. A `debug` request requires an explicit caller flag. This keeps a fresh moored start quiet while retaining a safe test trigger. The lower-level `activateBoardingInvasion` function remains a state-machine primitive; it does not replace HostSession authority.

`InvasionPresenter` publishes `eventId`, `enemyKind`, `phaseLabel`, `alert`, `objective`, `evacuationSignal`, passenger/infrastructure snapshots, and the selected character/loadout contract on `group.userData`. `evacuationSignal` is true for `warning`, `approach`, and `boarders-aboard`, matching the host crowd's `evacuating` state. Presenter metadata and animation never decide damage, hits, phase, score, or defense action validity.

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

The visual foundation now satisfies the asset contract: all eight GLBs exist at the frozen paths, pass asset validation, load through `src/three/invasion-presenter.ts`, and validate every required Action/socket. A browser screenshot/evidence run was not performed for this correction, so no current player-visible Playwright result is claimed here. This is not a claim that combat, bomber objectives, or every invasion animation transition is complete.

PeerRoom protocol v3 explicitly admits `boardingAction.kind` and `boardingAction.targetId`, rejects extra fields, validates the crowd snapshot, and keeps phase, compartment, position, distance, damage, and score server-derived. The real two-Windows/two-network gate remains unproven because the live PeerJS smoke stayed in `waiting`.
