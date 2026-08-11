# Cabin Mayhem

Original first-person cooperative cruise-ship game. Players are the whole crew
of one ship: they steer it across an ocean, keep guests fed and unoffended,
restock it, repair what breaks, clean what nobody wants to clean, and fight off
what boards it. Browser-first Vite application; Tauri wraps the same build as a
Windows desktop app.

The premise changed at `79bb002` — see
[ADR 0001](docs/adr/0001-cruise-ship-pivot.md). The engine, host authority,
network model, rig pipeline and CI carry over; the airliner content is retired.

> **Current status (2026-08-10):** The committed checkpoint is `551c2f7`.
> See [docs/CURRENT_STATUS.md](docs/CURRENT_STATUS.md) for implemented state,
> unresolved NPC and hydraulics observations, proof gaps, and next actions.

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

## Current checkpoint scope

The current runtime is first-person and cruise-ship shaped: 14 Blender-authored
compartments on 8 decks, three stair towers, waypoint/elevator travel, a
bridge/commander room, host-authoritative navigation and invasion slices, GLB
crowd/invasion assets, and procedural bounded audio. This is a checkpoint, not
the complete cruise product; see [docs/CURRENT_STATUS.md](docs/CURRENT_STATUS.md)
and [docs/ROADMAP.md](docs/ROADMAP.md).

The source creates 78 ambient residents, but normal packaged NPC visibility is
not proven. A 2026-08-10 user screenshot shows no atrium NPCs and also shows
`MOORED` with `IMPACT: HYDRAULICS DAMAGED`; that source-vs-runtime mismatch is
unresolved. Do not treat the focused `showCrowd()` E2E path or the debug trigger
as normal-start proof.

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
- [docs/CURRENT_STATUS.md](docs/CURRENT_STATUS.md): current evidence, open runtime observations, and proof gaps.

Git commits, pull requests, GitHub Issues and GitHub Projects remain shared-history/task authority; these files do not replace them.
