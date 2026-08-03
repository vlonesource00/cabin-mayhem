# Test Plan

## Automated

- Unit: phase transitions, throttle-driven taxi/takeoff climb, finite flight state, turbulence force, secured cargo, collision stability, host grab ownership, finite cart stock/returns, fire suppression range/tool validation, repair tool/target/range/hold validation, latency delivery, passenger needs, delivery validation, incident stress, landing outcome, passenger reviews and debrief replay.
- Integration: phase progression, system damage, fire priority over repair, debug triggers, service-state stability, host/guest command validation, disconnect cleanup/reset and bounded simulation.
- Browser: menu reaches the first-person Three.js scene; the authored GLB activates; an aborted GLB request uses the procedural fallback; responsive HUD and closed `F1` drawer appear; `R` reaches takeoff without debug phase skips; cart dispenses/returns/moves stock; Fire Alarm and repair show active objective UI; failed and successful landing show the debrief and reviews.
- Live browser room: optional two-context PeerJS/WebRTC smoke with `LIVE_MULTIPLAYER=1`; host creates a room, guest joins, both receive the same host snapshot and disconnect cleanup runs.
- Build: typecheck, lint, formatting, data/assets validators, Vite build and Tauri build.

## Manual matrix

Run solo and two local browser players. For the room pass, use one host and one guest with the same room code and verify that the guest never steps authority locally. Exercise pointer-lock and fallback mouse look, keyboard/gamepad input, cockpit/seat/cabin collision, network simulation on/off, low/high latency, cart stock take/return/depletion, correct and wrong deliveries, request expiry, grab race, host reset, every flight phase, fire, repair interruption/completion and landing debrief/replay.

For the visual pass, inspect 1366x768 and 412x915. Verify the GLB cabin shell, passenger/prop procedural fallback, no landing-grid overlay during gameplay, compact HUD spacing, captions, objective card, critical icons, toolbox/breaker feedback, fire feedback and debrief scrolling. Record FPS, physics object count, queued packets and any NaN/stuck object.

For native packaging, close old `cabin-mayhem.exe` processes before `pnpm desktop:build`, launch the generated Windows app, and repeat the smoke checks in the Tauri wrapper.

## Acceptance

- No NaN state; players remain inside cabin bounds; held throttle transitions taxi/takeoff and creates non-zero altitude.
- Secured cargo stays anchored; loose objects react to severe aircraft inputs; one owner exists per held object.
- Cart stock cannot go below zero or above authored capacity; correct service items are consumed exactly once; wrong items do not complete requests.
- Active fire requires a nearby held extinguisher and can be suppressed. A repair requires the toolbox, valid breaker target/range and three uninterrupted seconds; fire remains higher priority.
- Host validation remains authoritative in solo and two-player flows; disconnect releases guest-owned objects and clears guest input.
- The static GLB activates only after its root/mesh contract validates; load or parse failure leaves the procedural scene usable.
- Debrief appears only after landing, reports score/served/missed/fire/repair/reviews accurately, and replay resets the room without stale state.
- Responsive HUD remains readable at desktop and narrow viewports; active gameplay has no landing-grid overlay; `F1` drawer starts closed.
- CI, local tests and builds are green, or documented with the exact failing command and a reproducible limitation.
