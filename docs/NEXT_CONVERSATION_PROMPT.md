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
1. Run `git status --short --branch`, `git log -5 --oneline --decorate`, then inspect the actual diff. Preserve uncommitted work, especially `.codex-remote-attachments/`.
2. Read `README.md`, `ARCHITECTURE.md`, `HANDOFF.md`, `TODO.md`, `docs/GAME_DESIGN.md`, `docs/TECHNICAL_ARCHITECTURE.md`, `docs/ROADMAP.md`, `docs/TEST_PLAN.md` and `docs/CONTENT_AUTHORING.md`.
3. Inspect `src/sim/types.ts`, `src/sim/host-session.ts`, `src/sim/fire-response.ts`, `src/sim/repair-response.ts`, `src/sim/service-mission.ts`, `src/data/emergencies.ts`, `src/network/peer-room.ts`, `src/three/cabin-world.ts`, `src/three/scenario-loader.ts`, `src/app/debrief.ts`, `src/app/cabin-mayhem-app.ts` and current tests.
4. Trust current code, tests, Git and CI logs over stale prose. Keep docs current when implementation changes.

Current game state:
- Walkable pointer-lock Three.js aircraft with deterministic host-authoritative flight and cabin physics.
- Host-authoritative service-cart pickup/delivery, passenger requests, patience/panic/injury, scoring and mission outcome.
- A galley-fire objective with extinguisher ownership/aim/range validation.
- A deterministic coffee-machine mutiny in fire-free cruise: carry the toolbox, aim at the rear-galley breaker and hold `E` for three uninterrupted seconds. Fire has priority.
- Icon-first neon HUD: compact flight/status chips, one contextual objective, radio caption and a closed-by-default `F1` development drawer. The active gameplay scene has no landing-grid overlay.
- Free two-player PeerJS/WebRTC rooms with host-only simulation authority, ordered snapshots and disconnect cleanup. The default E2E suite skips the cloud room smoke unless `LIVE_MULTIPLAYER=1`.
- A landing debrief with score, served/missed totals, fire and repair verdicts, authored passenger reviews and room-preserving replay.
- A Blender-authored static cabin GLB with validated runtime loading and automatic procedural fallback. Passenger avatars, service contents, loose props, emergency effects and interaction proxies remain procedural.
- Procedural Web Audio cabin sound synthesised at runtime from mission snapshots, muted with `M`. The repository ships no audio files.

Open work:
- GitHub Actions CI #10 for commit `eacf3ce` is red. The run summary alone does not prove the failing command; inspect `CI / verify`. If it is the GLB readiness assertion timing out, make the loader/test diagnostic deterministic on the runner and rerun CI.
- Complete a human manual service-flight pass and a real two-browser host/guest room pass, including takeoff, deliveries, fire, repair, reset and landing debrief.
- Add interaction animation and priority passenger/prop asset replacement after the current runtime path is stable.
- Re-run the Tauri package after closing any old locked `cabin-mayhem.exe` process.

Important rules:
- `HostSession` is authoritative. UI and Three.js may request interaction but never determine success.
- Client raycasts choose a candidate only; host validates ownership, tool, target and range.
- Keep authored data Zod-validated and fixed-step behavior deterministic.
- Keep project-owned/generated assets; record every shipped asset in `public/assets/manifest.json`.
- Do not add a random event director, cargo economy, route system or production relay unless the user authorizes that slice.

Immediate task:
1. Inspect the failed GitHub Actions logs for CI #10 and fix only the proven GLB/CI issue.
2. Run format, lint, typecheck, data/assets validation, unit, integration, E2E and Vite build.
3. Run `pnpm desktop:build` after closing the old executable; report if the native toolchain is unavailable.
4. Manually test solo and two-browser room flows, then record exact limitations and update the handoff.
5. Commit or push only when explicitly authorized.

Current local evidence for `eacf3ce`:
- `git diff --check`, format check, ESLint, TypeScript, data validation and asset validation pass.
- 34 unit tests pass; 2 integration tests pass; 9 Playwright tests are collected, with 8 passing and the live multiplayer test skipped without `LIVE_MULTIPLAYER`.
- Vite production build passes with a non-blocking large-chunk warning.
- The latest Tauri build attempt was blocked by a locked existing executable; the web build completed before the native packaging step stopped.
- Full manual passenger aiming and fresh post-GLB visual inspection remain pending.
```
