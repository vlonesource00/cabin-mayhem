# Cabin Mayhem

Original first-person cooperative airline-disaster game, currently Phase 1 moving-aircraft 3D prototype. Browser-first Vite application; Tauri wraps same build as Windows desktop app.

## Run

```powershell
pnpm install
pnpm dev
```

Open `http://127.0.0.1:5173`.

```powershell
pnpm test:unit
pnpm test:integration
pnpm test:e2e
pnpm build
pnpm desktop:build
```

`desktop:build` needs Rust, Windows C++ build tools and WebView2. Generated installers are unsigned during development.

## Controls

- `WASD`: walk
- Mouse: first-person look (`Esc` releases pointer lock)
- Embedded browser fallback: hold left mouse button and drag when pointer lock is unavailable
- `Shift`: sprint
- `Ctrl`: crouch
- `C`: brace against inertial force
- `E`: grab, place, secure or unsecure
- `Q`: throw held item
- `R` / `F`: throttle
- Arrow keys: pitch and roll
- `J` / `L`: yaw
- `B`: brake

Gamepad: left stick move, shoulder sprint, face buttons interact/crouch/brace/throw, triggers throttle/brake.

### First playable drill

1. Select `Enter 3D aircraft`, then click the 3D view to capture the mouse.
2. Use `WASD` to walk; `S` always moves directly backwards from the camera.
3. Press `Esc`, select `Cabin` under Host Debug, then click the 3D view again.
4. Center the crosshair on the service cart until its interaction prompt appears.
5. Press `E` to hold it visibly, `E` again to place it, or `Q` to throw it.
6. Trigger turbulence, an air pocket or a sharp turn to test cabin physics. Use `C` to brace.

## Prototype scope

Walkable Three.js fuselage, cockpit, aisle, 3D seats, overhead bins, shelves, cart, loose cases, heavy crates, cargo straps, two crew, turbulence, air pocket, sharp turn, collision, subsystem damage, deterministic simulated network conditions and host debug controls. Passenger AI, economy, routes, progression and real remote browser transport intentionally wait for Phase 2+.

## Technologies

TypeScript, Three.js/WebGL, Vite, Zod, Vitest, Playwright, ESLint, Prettier and optional Tauri/Rust desktop wrapper.

## Documentation ownership

- [ARCHITECTURE.md](ARCHITECTURE.md): repository structure, systems, dependencies and data flow.
- [TODO.md](TODO.md): local work snapshot only.
- [HANDOFF.md](HANDOFF.md): state for next session.
- [docs/GAME_DESIGN.md](docs/GAME_DESIGN.md): design and Phase 1 boundaries.
- [docs/TECHNICAL_ARCHITECTURE.md](docs/TECHNICAL_ARCHITECTURE.md): runtime architecture.
- [docs/NETWORK_MODEL.md](docs/NETWORK_MODEL.md): authority and transport boundary.
- [docs/TEST_PLAN.md](docs/TEST_PLAN.md): automated/manual checks.

Git commits, pull requests, GitHub Issues and GitHub Projects remain shared-history/task authority; these files do not replace them.
