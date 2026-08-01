# Next conversation prompt

Copy everything inside the block below into a new Codex conversation with this repository selected.

```text
[$single-executor](C:\Users\Martim Costa\.codex\skills\single-executor\SKILL.md)

Continue Cabin Mayhem in this exact repository:
C:\Users\Martim Costa\Desktop\nigger\Dear Passengers clone

GitHub repository:
https://github.com/vlonesource00/cabin-mayhem

This is an original browser-first 3D first-person cooperative airline-disaster game. Vite + TypeScript + Three.js are the game runtime. Tauri v2 + Rust wrap the same web build as a Windows EXE. Do not convert it to Unity, Unreal, Canvas 2D or a top-down game.

Before doing anything:
1. Run `git status --short --branch`, `git log -5 --oneline --decorate` and inspect the actual diff. Do not overwrite uncommitted work.
2. Read completely: `README.md`, `ARCHITECTURE.md`, `HANDOFF.md`, `TODO.md`, `docs/GAME_DESIGN.md`, `docs/TECHNICAL_ARCHITECTURE.md`, `docs/ROADMAP.md`, `docs/TEST_PLAN.md`, and `docs/CONTENT_AUTHORING.md`.
3. Inspect `src/sim/types.ts`, `src/sim/host-session.ts`, `src/sim/fire-response.ts`, `src/sim/service-mission.ts`, `src/sim/cabin-simulation.ts`, `src/data/service.ts`, `src/data/emergencies.ts`, `src/three/cabin-world.ts`, `src/app/cabin-mayhem-app.ts` and current tests.
4. Trust current code, tests and Git over stale prose. Update docs when implementation changes.

Current implemented game:
- Walkable pointer-lock first-person 3D aircraft with camera-relative WASD, sprint, crouch and brace.
- Cockpit, passenger cabin, cargo bay, seats, overhead bins, service cart, loose cargo, straps and two crew.
- Host-authoritative deterministic flight/cabin physics with turbulence, air pocket, sharp turn, collision and subsystem damage.
- Real pickup/place/throw loop: `E` interact, `Q` throw, held objects render in front of camera.
- Eight seated 3D passenger actors.
- Drink, meal and medical requests with scheduled activation, patience, panic, injury and satisfaction.
- Finite host-authoritative service-cart stock: `1`/`2`/`3` selects drink/meal/medical, `E` dispenses/returns and `Shift+E` moves the cart.
- Physical 3D bottles, meal trays and medkits are created from authored cart templates; the extinguisher remains loose.
- Host-validated passenger delivery: correct held item + active request + range. Wrong item loses score; correct item is consumed.
- Mission timer, live request priority list, score, served count and success/failure outcome.
- Automatic ground/taxi/takeoff/cruise transitions. Hold `R` for takeoff power; rotation and climb assist are deterministic.
- One host-authoritative galley-fire objective: debug trigger, passenger pressure/score impact, visible flames/HUD and extinguisher/range validation.
- A responsive neon indie-game HUD with separated telemetry, mission, status and debug lanes.
- GitHub Pages workflow at `https://vlonesource00.github.io/cabin-mayhem/`.
- Local simulated latency/jitter/loss harness. It is not real online multiplayer yet.

Important architecture rules:
- `HostSession` owns authoritative mutation. UI and Three.js render snapshots; they do not decide gameplay success.
- Aircraft/cabin simulation uses local 2D cabin coordinates. `cabinToWorld` maps these into Three.js.
- Client raycasts select candidate IDs only. Host validates target, range, ownership and service need.
- Authored cabin/service data must remain Zod-validated.
- Preserve deterministic fixed-step behavior and existing controls.
- Current procedural meshes are original project-owned assets. Never copy Dear Passengers or another game's assets/code.

Immediate task:
Add one bounded, host-authoritative toolbox repair objective. Keep it deterministic and inside the current architecture:
1. Add one authored broken subsystem hotspot and tool requirement without a general event director.
2. Require the held toolbox, host-validated aim and range, with visible progress and final repair state.
3. Make repair pressure/score consequences compatible with the existing service and fire loops.
4. Add focused unit/integration/E2E coverage, then run formatting, lint, type-check, validators, all tests, Vite build and Tauri build.
5. Launch the web game and visually test trigger → acquire toolbox → repair → feedback/reset.

After repair, add the debrief screen, production GLB loading with procedural fallback, then audio/interaction animation hooks.

Do not start real multiplayer until the local service/fire/repair loop is stable. Do not claim completion without current test/build evidence and a live visual/playtest check. If authorized, commit and push only after the checks pass. Report exact files changed, evidence, remaining limitations and the next slice.

Current evidence/limitations:
- Format, ESLint, TypeScript, data/assets, 19 unit tests, 1 integration test, 6 Playwright journeys, Vite, GitHub Pages-base and Tauri EXE/MSI/NSIS builds pass.
- Live browser fire/HUD check passes. Full manual passenger aiming remains pending because in-app pointer-lock automation was not precise enough; deterministic host/unit coverage validates correct/wrong delivery and consumption.
- Vite still reports a non-blocking production chunk warning around 624 kB.
```
