# Handoff

## Current state

Cabin Mayhem is a browser-first Vite/Three.js first-person airline-disaster game with an optional Tauri/Rust Windows wrapper. The current branch is `codex/blender-glb-scenario` at `eacf3ce` (`feat: add Blender cabin scenario`). The branch is pushed to `origin`.

The current Slice 2 vertical includes:

- Automatic ground, taxi, takeoff, cruise, approach and landing progression. Hold `R` to taxi, rotate and climb.
- Host-authoritative cabin physics, service-cart stock, passenger requests, delivery validation, patience, panic, injury, score and mission outcome.
- A galley-fire objective with extinguisher ownership, aim and range validation.
- A deterministic coffee-machine mutiny during fire-free cruise: carry the toolbox, aim at the rear-galley breaker and hold `E` for three uninterrupted seconds.
- An icon-first contextual HUD with a compact flight chip, critical status icons, objective card, radio caption and closed-by-default `F1` development drawer.
- Free two-player PeerJS/WebRTC rooms. The host owns the simulation; the guest sends validated commands and renders ordered snapshots.
- A landing debrief with score, served/missed totals, fire and repair verdicts, authored passenger reviews and room-preserving replay.
- A Blender-authored static cabin GLB with runtime validation and automatic procedural fallback. Passenger avatars, service contents, loose gameplay props, emergency effects and interaction proxies remain procedural.

## Last changes

- Added the Blender source file, deterministic generator, exported cabin GLB, manifest entry, runtime loader and loader tests.
- Kept procedural interaction and collision proxies authoritative while GLB visuals replace the static cabin shell after validation.
- Added the passenger-review landing debrief and replay path.
- Added the free two-player `PeerRoom` transport with strict protocol/role/sequence validation and host-only simulation authority.
- Added the repair crisis, repair state flow, host validation, captions, sparks, breaker glow and toolbox prompts.
- Replaced the old dashboard with the compact neon HUD and development drawer.
- Added automatic takeoff progression and the galley-fire response objective.

## Known problems and limits

- GitHub Actions CI #10 for `eacf3ce` is red. The run summary does not expose the failed command yet; the leading hypothesis is a CI-only timeout while the E2E journey waits for `data-asset-mode="glb"` after loading the dynamic GLTFLoader chunk and 1.24 MB GLB. Inspect the failed `CI / verify` step before changing the test.
- The default Playwright suite does not run cloud multiplayer; the live room test is skipped unless `LIVE_MULTIPLAYER=1`. A manual two-browser host/guest playtest is still required.
- Full manual passenger aiming and end-to-end delivery tuning remain pending. Host, unit and browser bridge coverage validates the delivery rules, but pointer-lock aiming needs a human pass.
- The GLB covers the static cabin shell only. Passenger/NPC meshes, service contents, loose props, fire/repair effects, audio and interaction animation remain open.
- The latest local `pnpm desktop:build` attempt was blocked because the existing `src-tauri/target/release/cabin-mayhem.exe` was still running/locked. Close the old executable and rerun; the Vite portion completed before Rust packaging stopped.
- The production JavaScript bundle still emits Vite's non-blocking `>500 kB` chunk warning.
- Loose-object collision is pairwise and should gain a broadphase before the cabin object count grows substantially.
- Windows installers are unsigned development artifacts.

## Next recommended task

1. Open the CI #10 failed step and make the GLB readiness journey deterministic on GitHub Actions if the timeout hypothesis is confirmed.
2. Rerun the complete web gates and the Tauri build after closing any locked executable.
3. Perform a manual solo service flight and a real two-browser host/guest room playtest, including takeoff, item delivery, fire, repair, reset and landing debrief.
4. Continue with audio, interaction animation and replacement passenger/prop assets after the current runtime path is stable.

## Current verification

Local evidence for `eacf3ce`:

- `git diff --check`, Prettier check, ESLint, TypeScript, authored-data validation and asset validation pass.
- Unit: 34 tests pass.
- Integration: 2 tests pass.
- Playwright: 9 tests collected; 8 pass and 1 intentional live-multiplayer test is skipped without `LIVE_MULTIPLAYER`.
- Vite production build passes, with the existing large-chunk warning.
- Prior repair/HUD visual checks passed at 1366x768 and 412x915; the GLB presentation needs a fresh visual pass after CI is repaired.
- Tauri packaging is not currently re-proven on this branch because the latest attempt hit the locked executable described above.

## Verification commands

```powershell
pnpm format:check
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

For the optional live room smoke, set `LIVE_MULTIPLAYER=1` and use two browser contexts with a reachable PeerJS/TURN path. Do not commit TURN credentials.

## Git handoff

Before changing code in a new conversation, run `git status --short --branch`, `git log -5 --oneline --decorate` and inspect the actual diff. Preserve the untracked `.codex-remote-attachments/` folder and do not stage it. Do not assume a slice was committed or pushed unless Git proves it.
