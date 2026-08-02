# Handoff

## Current state

Cabin Mayhem is a browser-first Vite/Three.js first-person game with a Tauri/Rust Windows wrapper. The flight loop, cabin-service vertical and two bounded emergency objectives are complete on `codex/airline-sitcom-repair`. Host authority owns flight, physics, passenger requests, fire, repair, scoring and mission outcome.

The current slice has automatic ground/taxi/takeoff/cruise progression: use `R` to hold takeoff power, then the simulation rotates and climbs. Eight seated passengers request drinks, meals and medical supplies from a finite service cart. A galley fire can be triggered, raises cabin pressure, and must be suppressed by holding the loose extinguisher, aiming at the fire and using `E` within host-validated range. During cruise, after 18 seconds without a fire, the rear-galley coffee-machine breaker faults: carry the loose toolbox, aim at its hotspot and hold `E` for three uninterrupted seconds.

## Last changes

- Added validated `RepairDefinition` data plus deterministic `RepairState` and `repair-response` flow for the coffee-machine mutiny.
- Extended `HostSession` with automatic/debug repair activation, held-tool ownership, target/range validation, interruption, pressure/score consequences and a repair snapshot.
- Added rear-galley breaker glow/sparks/light feedback and toolbox-specific interaction prompts to `CabinWorld`.
- Replaced permanent dashboard panels with a compact flight chip, critical status icons, a contextual objective card and radio caption; `F1` opens the closed-by-default development drawer.
- Added repair unit, host, integration and E2E paths; browser visual checks at 1366x768 and 412x915 found and corrected one narrow caption/status overlap.
- Built current Tauri EXE, MSI and NSIS packages successfully.
- Fixed the airplane ground stall with authored taxi, takeoff, rotation-assist and cruise transitions.
- Added validated `src/data/emergencies.ts` and deterministic `src/sim/fire-response.ts` for the one galley-fire objective.
- Extended `HostSession` with fire trigger, pressure/score consequences, extinguisher/range validation and suppression state.
- Added a visible animated galley fire, interaction prompt, fire HUD status and event caption priority in `CabinWorld` and the app.
- Rebuilt the HUD into non-overlapping neon telemetry, mission, status and debug lanes with an indie-game palette.
- Added focused flight/fire unit tests, integration coverage and Playwright journeys.
- Added GitHub Pages workflow and public-base support; the deployed site is `https://vlonesource00.github.io/cabin-mayhem/`.

- Added validated `src/data/service.ts` definitions for eight passengers and nine service props.
- Added `src/sim/service-mission.ts` for scheduled needs, patience decay, panic, injury, delivery, score and success/failure.
- Extended `HostSession` so service delivery is range- and item-validated by the host; accepted items are consumed.
- Added seated passenger meshes, request beacons and 3D bottle/tray/medkit/extinguisher assets to `CabinWorld`.
- Added mission timer, score, served count and prioritized live-request HUD.
- Added unit and E2E coverage for request types, correct/wrong deliveries, incidents and successful landing.
- Updated README, architecture, design, roadmap and TODO for Slice 2.
- Added `docs/NEXT_CONVERSATION_PROMPT.md` as a copy-ready continuation prompt.
- Replaced loose drink/meal/medical staging with deterministic service-cart inventory templates and finite `3/3/2` stock.
- Added host validation for cart selection, dispensing, returns and `Shift+E` movement.
- Added cart-stock/selection HUD, contextual world prompts, updated controls and unit/E2E coverage.
- Verified the cart live in the in-app browser: medical stock changed `2 → 1 → 2`, held medkit appeared, return prompt appeared and layout remained readable.

## Known problems

- Full end-to-end manual passenger aiming remains pending: in-app pointer-lock automation could exercise cart take/return but could not reliably aim every bottle/meal/medkit delivery. Host/unit tests cover correct/wrong delivery and consumption.
- Network simulation is local only; there is no WebRTC/WebSocket remote client.
- Passenger NPCs are seated deterministic service actors, not walking/navmesh AI.
- Current 3D art is project-owned procedural geometry. Production GLB models, audio and animation polish remain.
- Object collision is pairwise; add broadphase before significantly increasing loose-object count.
- The production JS chunk is about 624 kB and still emits Vite's `>500 kB` chunk warning.
- Windows artifacts are unsigned development builds.

## Next recommended task

Add a clear debrief screen after landing, then production GLB loading with procedural fallback. Keep real two-browser transport until the local service/fire/repair loop is stable.

## Current verification

- Format, ESLint, TypeScript, authored data and asset validation pass.
- Unit: 24/24; integration: 2/2; Playwright: 5/5.
- Vite production build passes; 1366x768 and 412x915 live Chromium repair/HUD visual checks pass.
- Tauri release EXE, MSI and NSIS builds pass.

## Verification commands

```powershell
pnpm format
pnpm lint
pnpm typecheck
pnpm validate:data
pnpm validate:assets
pnpm test:unit
pnpm test:integration
pnpm test:e2e
pnpm build
pnpm desktop:build
```

## Git handoff

Before changing code in a new conversation, run `git status --short --branch` and inspect the current diff. Do not assume this slice was committed or pushed unless Git proves it.
