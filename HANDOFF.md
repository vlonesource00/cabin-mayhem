# Handoff

## Current state

Cabin Mayhem is a browser-first Vite/Three.js first-person airline-disaster game with an optional Tauri/Rust Windows wrapper. The stable project branch is `novo-main-stable`, based on the complete feature line through `73d2c08` (`feat: add procedural interaction animation`).

The current Slice 2 vertical includes:

- Automatic ground, taxi, takeoff, cruise, approach and landing progression. Hold `R` to taxi, rotate and climb.
- Host-authoritative cabin physics, service-cart stock, passenger requests, delivery validation, patience, panic, injury, score and mission outcome.
- A galley-fire objective with extinguisher ownership, aim and range validation.
- A deterministic coffee-machine mutiny during fire-free cruise: carry the toolbox, aim at the rear-galley breaker and hold `E` for three uninterrupted seconds.
- An icon-first contextual HUD with a compact flight chip, critical status icons, objective card, radio caption and closed-by-default `F1` development drawer.
- Free two-player PeerJS/WebRTC rooms. The host owns the simulation; the guest sends validated commands and renders ordered snapshots.
- A landing debrief with score, served/missed totals, fire and repair verdicts, authored passenger reviews and room-preserving replay.
- A Blender-authored static cabin GLB with runtime validation and automatic procedural fallback. Service contents, loose gameplay props, emergency effects and interaction proxies remain procedural.
- Blender-authored skeletal animation: a shared 19-bone humanoid rig (25 clips, crew and passengers) and a separate 7-bone first-person arms rig (19 clips), played through a Three.js `AnimationMixer` layer that crossfades clips selected from host snapshots and layers upper-body actions over locomotion. Each rig degrades independently to the procedural animation layer.

## Last changes

- Added the Blender source file, deterministic generator, exported cabin GLB, manifest entry, runtime loader and loader tests.
- Kept procedural interaction and collision proxies authoritative while GLB visuals replace the static cabin shell after validation.
- Added the passenger-review landing debrief and replay path.
- Added the free two-player `PeerRoom` transport with strict protocol/role/sequence validation and host-only simulation authority.
- Added the repair crisis, repair state flow, host validation, captions, sparks, breaker glow and toolbox prompts.
- Replaced the old dashboard with the compact neon HUD and development drawer.
- Added automatic takeoff progression and the galley-fire response objective.
- Added snapshot-driven procedural cabin audio with mute control and no shipped audio files.
- Added snapshot-driven interaction animation for held items, repairs, passengers and crew.
- Added the two Blender character rigs, their 44 authored clips, the rig contract in `src/three/animation-contract.ts`, GLB skeleton/clip/duration validation in `pnpm validate:assets` and `docs/rig-contract.md`.
- Added the runtime mixer layer in `src/three/animated-rig.ts` and the pure snapshot-to-clip projection in `src/three/animation-state.ts`, wired into `CabinWorld` with per-rig fallback reported through `data-character-rig` and `data-arms-rig`.

## Known problems and limits

- GitHub Actions CI is green for `73d2c08`; the CI timeout budget and Playwright failure-artifact upload are included in the stable line.
- The default Playwright suite does not run cloud multiplayer; the live room test is skipped unless `LIVE_MULTIPLAYER=1`. A manual two-browser host/guest playtest is still required.
- Full manual passenger aiming and end-to-end delivery tuning remain pending. Host, unit and browser bridge coverage validates the delivery rules, but pointer-lock aiming needs a human pass.
- The scenario GLB covers the static cabin shell only. Service contents, loose props and fire/repair effects remain procedural. Cabin audio is runtime Web Audio synthesis and ships no audio files.
- The character rigs are authored but not yet visually reviewed in-game at full frame rate. Clip poses are keyframed by script, so exaggeration and timing are the most likely thing to need a second pass. World animation from the pipeline list (cart wheels, bin doors, coffee-machine tantrum, breaker sparks, extinguisher hose, loose-item squash) and passenger facial shape keys are not implemented.
- Tauri MSI and NSIS packaging was re-proven for `73d2c08`. Windows installers remain unsigned development artifacts.
- The production JavaScript bundle still emits Vite's non-blocking `>500 kB` chunk warning.
- Loose-object collision is pairwise and should gain a broadphase before the cabin object count grows substantially.
- Windows installers are unsigned development artifacts.

## Next recommended task

1. Perform a manual solo service flight and a real two-browser host/guest room playtest, including takeoff, item delivery, fire, repair, reset and landing debrief.
2. Perform fresh 1366x768 and narrow-viewport visual checks of the expanded GLB, the authored character animation and the debrief. Judge clip exaggeration and crossfade timing in motion, then retime in `tools/blender/` and re-export.
3. Extend the animation library to world props: cart wheels and wobble, overhead-bin doors, coffee-machine tantrum, breaker sparks and loose-item squash.
4. Plan production-recorded cabin sound and passenger voices without moving authority into presentation code.

## Current verification

Local and CI evidence for the feature line through `0bf3625` plus the authored-animation slice:

- `git diff --check`, Prettier check, ESLint, TypeScript, authored-data validation and asset validation pass. Asset validation covers 4 project-owned assets and both rigs (2 rigs, 44 authored clips).
- Unit: 96 tests pass.
- Integration: 2 tests pass.
- Playwright: 11 tests collected; 10 pass and 1 intentional live-multiplayer test is skipped without `LIVE_MULTIPLAYER`. Two of those cover the authored rigs: the loaded-GLB path and the aborted-GLB procedural fallback.
- Vite production build passes, with the existing large-chunk warning.
- Prior repair/HUD visual checks passed at 1366x768 and 412x915; the expanded GLB and latest animation pass still need fresh visual inspection.
- Tauri MSI and NSIS packaging passes; generated installers remain unsigned.

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
