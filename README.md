# Cabin Mayhem

Original first-person cooperative airline-disaster game, currently at the Slice 2 cabin-service vertical. Browser-first Vite application; Tauri wraps the same build as a Windows desktop app.

## Run

```powershell
pnpm install
pnpm dev
```

Open `http://127.0.0.1:5173`.

### Free two-player rooms

1. One player selects **Host 2-player room** and copies the eight-character code.
2. The second player opens the same build, enters the code and selects **Join room**.
3. The host remains authoritative; the guest sends controls and receives cabin snapshots over an encrypted WebRTC data channel.

Rooms use the free PeerJS cloud for signaling and a direct peer-to-peer connection. Players in the same city will usually get a short route, but restrictive or symmetric NAT can still require TURN. Optional production overrides are `VITE_PEER_HOST`, `VITE_PEER_PORT`, `VITE_PEER_PATH`, `VITE_PEER_SECURE`, `VITE_TURN_URL`, `VITE_TURN_USERNAME` and `VITE_TURN_CREDENTIAL`. Never commit TURN credentials.

## Play online

Pushes to `main` deploy to GitHub Pages. Once a deploy finishes, play at [vlonesource00.github.io/cabin-mayhem](https://vlonesource00.github.io/cabin-mayhem/). Feature branches are not deployed; use `pnpm dev` or the desktop build to test them.

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
- `1` / `2` / `3`: select drink, meal or medical cart stock
- `E`: take/return cart stock, serve, place, secure or unsecure
- Hold `E`: repair the active rear-galley breaker while carrying the red toolbox
- `Shift+E`: grab and move the service cart
- `Q`: throw held item
- `R` / `F`: throttle; holding `R` taxis, rotates and climbs automatically
- Arrow keys: pitch and roll
- `J` / `L`: yaw
- `B`: brake
- `F1`: open/close the development drawer (telemetry, stock and Chaos Lab triggers)

Gamepad: left stick move, shoulder sprint, face buttons interact/crouch/brace/throw, triggers throttle/brake.

### First service drill

1. Select `Solo shift`, then click the 3D view to capture the mouse.
2. Use `WASD` to walk; `S` always moves directly backwards from the camera.
3. Press `Esc`, tap `F1`, select `Cabin` in the development drawer, then click the 3D view again.
4. Aim at the service cart, select drink/meal/medical with `1`/`2`/`3`, then press `E`; stock decreases and the held 3D item appears in front of the camera.
5. Read the request panel, aim at the matching glowing passenger and press `E` to deliver. Aim back at the cart and press `E` to return unused stock.
6. Wrong deliveries cost score. Fire Alarm starts a galley fire: grab the loose red extinguisher, aim at flames and press `E`. During cruise the coffee machine can mutiny: grab the red toolbox, aim at the rear-galley breaker and hold `E` for three seconds.
7. Serve at least three requests and complete the flight phases to earn a successful result.

## Prototype scope

Walkable Three.js fuselage with a Blender-authored GLB/procedural fallback, cockpit, aisle, seats, bins, shelves, host-authoritative service-cart stock, loose cargo, straps, two crew, eight seated passenger NPCs, drink/meal/medical requests, galley-fire suppression, one coffee-machine breaker repair crisis, service props, patience, panic, injury, scoring, passenger-review debrief, incidents, subsystem damage, deterministic simulated network conditions and free two-player browser rooms. Economy, routes, progression and production audio remain future work.

The Blender asset currently covers the static cabin shell only; passenger avatars, service contents, loose gameplay props, emergency effects and interaction animation remain procedural or pending. The default E2E suite skips the cloud multiplayer smoke unless `LIVE_MULTIPLAYER=1`, and native Windows artifacts are unsigned development builds.

## Technologies

TypeScript, Three.js/WebGL, Vite, Zod, Vitest, Playwright, ESLint, Prettier and optional Tauri/Rust desktop wrapper.

## Documentation ownership

- [ARCHITECTURE.md](ARCHITECTURE.md): repository structure, systems, dependencies and data flow.
- [TODO.md](TODO.md): local work snapshot only.
- [HANDOFF.md](HANDOFF.md): state for next session.
- [docs/NEXT_CONVERSATION_PROMPT.md](docs/NEXT_CONVERSATION_PROMPT.md): copy-ready prompt for a new Codex conversation.
- [docs/GAME_DESIGN.md](docs/GAME_DESIGN.md): design and Phase 1 boundaries.
- [docs/TECHNICAL_ARCHITECTURE.md](docs/TECHNICAL_ARCHITECTURE.md): runtime architecture.
- [docs/NETWORK_MODEL.md](docs/NETWORK_MODEL.md): authority and transport boundary.
- [docs/TEST_PLAN.md](docs/TEST_PLAN.md): automated/manual checks.

Git commits, pull requests, GitHub Issues and GitHub Projects remain shared-history/task authority; these files do not replace them.
