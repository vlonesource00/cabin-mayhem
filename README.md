# Cabin Mayhem

Original first-person cooperative cruise-ship game. Players are the whole crew
of one ship: they steer it across an ocean, keep guests fed and unoffended,
restock it, repair what breaks, clean what nobody wants to clean, and fight off
what boards it. Browser-first Vite application; Tauri wraps the same build as a
Windows desktop app.

The premise changed at `79bb002` — see
[ADR 0001](docs/adr/0001-cruise-ship-pivot.md). The engine, host authority,
network model, rig pipeline and CI carry over; the airliner content is retired.

## Run

```powershell
pnpm install
pnpm dev
```

Open `http://127.0.0.1:5173`.

### Free two-player rooms

1. One player selects **Host 2-player room** and copies the eight-character code.
2. The second player opens the same build, enters the code and selects **Join room**.
3. The host remains authoritative; the guest sends controls and receives ship snapshots over an encrypted WebRTC data channel.

Rooms use the free PeerJS cloud for signaling and a direct peer-to-peer connection. Players in the same city will usually get a short route, but restrictive or symmetric NAT can still require TURN. Optional production overrides are `VITE_PEER_HOST`, `VITE_PEER_PORT`, `VITE_PEER_PATH`, `VITE_PEER_SECURE`, `VITE_TURN_URL`, `VITE_TURN_USERNAME` and `VITE_TURN_CREDENTIAL`. Never commit TURN credentials.

## Play online

Pushes to `novo-main-stable` deploy to GitHub Pages. Once a deploy finishes, play at [vlonesource00.github.io/cabin-mayhem](https://vlonesource00.github.io/cabin-mayhem/). Other branches are not deployed; use `pnpm dev` or the desktop build to test them.

```powershell
pnpm test:unit
pnpm test:integration
pnpm test:e2e
pnpm build
pnpm desktop:build
```

`desktop:build` needs Rust, Windows C++ build tools and WebView2. Generated installers are unsigned during development.

## Controls

Planned control surface for the cruise premise. Movement, interaction and
bracing are unchanged from the shipped build; the aircraft controls are replaced
by the helm.

- `WASD`: walk
- Mouse: first-person look (`Esc` releases pointer lock)
- Embedded browser fallback: hold left mouse button and drag when pointer lock is unavailable
- `Shift`: sprint
- `Ctrl`: crouch
- `C`: brace against ship motion, impacts and waves
- `1` / `2` / `3`: select carried stock type
- `E`: take/return stock, serve, place, secure, unsecure, use a tool
- Hold `E`: repair the targeted damaged system while carrying the toolbox
- `Shift+E`: grab and move a trolley
- `Q`: throw held item
- `M`: mute/unmute audio
- `F1`: development drawer (telemetry, stock, incident triggers)

At the helm (bridge only):

- Arrow keys or `A`/`D`: rudder
- `R` / `F`: engine telegraph
- `B`: emergency stop

At a deck weapon mount:

- Mouse: aim
- `E` or left mouse: fire
- `R`: reload or recharge

Gamepad: left stick move, shoulder sprint, face buttons interact/crouch/brace/throw, triggers throttle/brake.

## Prototype scope

The last thing that ran is the airliner vertical at `79bb002`: walkable Three.js
fuselage with a Blender-authored GLB and procedural fallback, host-authoritative
service-cart stock, loose cargo, straps, crew, eight seated passenger NPCs,
drink/meal/medical requests, galley-fire suppression, one breaker repair,
patience, panic, injury, scoring, passenger-review debrief, subsystem damage,
deterministic simulated network conditions, procedurally synthesised audio, two
Blender-authored skeletal rigs with 44 clips on a Three.js `AnimationMixer`, and
free two-player browser rooms.

None of the cruise premise is implemented yet. It is designed and documented;
the first implementation slice is Phase 5 in [docs/ROADMAP.md](docs/ROADMAP.md).

Audio is synthesised in the Web Audio API at runtime, so the repository ships no
audio files. The default E2E suite skips the cloud multiplayer smoke unless
`LIVE_MULTIPLAYER=1`, and native Windows artifacts are unsigned development
builds.

## Technologies

TypeScript, Three.js/WebGL, Vite, Zod, Vitest, Playwright, ESLint, Prettier and optional Tauri/Rust desktop wrapper.

## Documentation ownership

- [ARCHITECTURE.md](ARCHITECTURE.md): repository structure, systems, dependencies and data flow.
- [TODO.md](TODO.md): local work snapshot only.
- [HANDOFF.md](HANDOFF.md): state for next session.
- [docs/NEXT_CONVERSATION_PROMPT.md](docs/NEXT_CONVERSATION_PROMPT.md): copy-ready prompt for a new conversation.
- [docs/adr/](docs/adr/): decision records. Start with [0001 — cruise-ship pivot](docs/adr/0001-cruise-ship-pivot.md).
- [docs/GAME_DESIGN.md](docs/GAME_DESIGN.md): premise, pillars, jobs, incidents, upgrades.
- [docs/SHIP_LAYOUT.md](docs/SHIP_LAYOUT.md): decks, compartments, portal graph, streaming contract.
- [docs/PERFORMANCE.md](docs/PERFORMANCE.md): frame budget, asset budgets and the techniques that hold them.
- [docs/ROADMAP.md](docs/ROADMAP.md): phases and exit conditions.
- [docs/TECHNICAL_ARCHITECTURE.md](docs/TECHNICAL_ARCHITECTURE.md): runtime architecture.
- [docs/NETWORK_MODEL.md](docs/NETWORK_MODEL.md): authority and transport boundary.
- [docs/CONTENT_AUTHORING.md](docs/CONTENT_AUTHORING.md): how to add compartments, jobs, incidents and upgrades.
- [docs/TEST_PLAN.md](docs/TEST_PLAN.md): automated/manual checks.

Git commits, pull requests, GitHub Issues and GitHub Projects remain shared-history/task authority; these files do not replace them.
