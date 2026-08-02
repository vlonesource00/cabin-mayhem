# Next conversation prompt

Copy everything inside the block below into a new Codex conversation with this repository selected.

```text
[$single-executor](C:\\Users\\Martim Costa\\.codex\\skills\\single-executor\\SKILL.md)

Continue Cabin Mayhem in this repository:
C:\\Users\\Martim Costa\\Desktop\\nigger\\Dear Passengers clone

GitHub repository:
https://github.com/vlonesource00/cabin-mayhem

Cabin Mayhem is an original browser-first first-person airline-disaster game. Vite + TypeScript + Three.js are the game runtime; Tauri v2 + Rust wrap the same web build as a Windows EXE. Do not convert it to another engine or a 2D/top-down game.

Before changing code:
1. Run `git status --short --branch`, `git log -5 --oneline --decorate`, then inspect the actual diff. Preserve uncommitted work.
2. Read `README.md`, `ARCHITECTURE.md`, `HANDOFF.md`, `TODO.md`, `docs/GAME_DESIGN.md`, `docs/TECHNICAL_ARCHITECTURE.md`, `docs/ROADMAP.md`, `docs/TEST_PLAN.md` and `docs/CONTENT_AUTHORING.md`.
3. Inspect `src/sim/types.ts`, `src/sim/host-session.ts`, `src/sim/fire-response.ts`, `src/sim/repair-response.ts`, `src/sim/service-mission.ts`, `src/data/emergencies.ts`, `src/three/cabin-world.ts`, `src/app/cabin-mayhem-app.ts` and current tests.
4. Trust current code, tests and Git over stale prose. Keep docs current when implementation changes.

Current game state:
- Walkable pointer-lock Three.js aircraft with deterministic host-authoritative flight and cabin physics.
- Host-authoritative service-cart pickup/delivery, passenger requests, patience/panic/injury, scoring and mission outcome.
- A galley-fire objective with extinguisher ownership/range validation.
- A deterministic coffee-machine mutiny in a fire-free cruise: carry the toolbox, aim at the rear-galley breaker and hold `E` for three uninterrupted seconds. It uses host-owned repair state, pressure/score effects and fire priority.
- Icon-first neon HUD: compact flight/status chips, one contextual objective, a radio caption and a closed-by-default `F1` development drawer. The active game scene intentionally has no landing-grid overlay.
- Local latency/jitter/loss simulation only; no real multiplayer transport yet.

Important rules:
- `HostSession` is authoritative. UI and Three.js may request interaction but never determine success.
- Client raycasts choose a candidate only; host validates ownership, tool, target and range.
- Keep authored data Zod-validated and fixed-step behavior deterministic.
- Keep procedural meshes original; do not copy any other game's assets or code.

Immediate task:
Add a clear host-authoritative landing debrief that reflects service, fire and repair outcomes. Preserve the current architecture; do not add an event director, random incident system or real multiplayer.

Then add production GLB loading with procedural fallback, followed by audio and interaction-animation hooks. Do not claim completion without fresh test/build evidence and a visual playtest check. Commit or push only when explicitly authorized.

Current evidence/limitations:
- Format, ESLint, TypeScript, data/assets validation, 24 unit tests, 2 integration tests, 5 Playwright journeys, Vite and Tauri EXE/MSI/NSIS builds pass.
- Chromium repair/HUD checks passed at 1366x768 and 412x915. Full manual passenger aiming remains pending because pointer-lock automation is not sufficiently precise; deterministic host/unit coverage validates delivery logic.
- Vite retains a non-blocking production chunk warning above 500 kB.
```
