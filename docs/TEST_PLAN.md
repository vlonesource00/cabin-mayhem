# Test Plan

## Automated

- Unit: phase transitions, throttle-driven taxi/takeoff climb, finite flight state, turbulence force, secured cargo, collision stability, host grab ownership, finite cart stock/returns, fire suppression range/tool validation, latency delivery, three passenger needs, delivery validation, incident stress and landing outcome.
- Integration: phase progression, system damage, debug triggers, service-state stability, cleanup/reset and bounded simulation.
- Browser: menu reaches the first-person Three.js scene, responsive HUD lanes and runtime object count appear; `R` reaches takeoff without debug phase skips; cart dispenses, returns and moves stock; Fire Alarm shows active fire UI; debug actions give visible feedback.
- Build: typecheck, lint, formatting, data/assets validators, Vite build and Tauri build.

## Manual matrix

Run 1/2 local players, pointer-lock mouse + keyboard/gamepad, cockpit/seat/cabin collision, network simulation on/off, low/high latency, each debug incident, cargo secure/unsecure, cart stock take/return/depletion, grab race, host reset, every phase and emergency collision. Deliver each service-item type, attempt a wrong item, let one request expire, and reach success/failure. Record FPS, physics object count, queued packets and any NaN/stuck object. Real remote multiplayer testing begins only after transport exists.

## Acceptance

No NaN state; players remain inside cabin bounds; held throttle transitions taxi/takeoff and creates non-zero altitude; secured cargo stays anchored; loose objects react to severe aircraft inputs; one owner per held object; cart stock cannot go below zero or above authored capacity; active fire requires nearby held extinguisher and can be suppressed; latency does not break local client intent; correct service items are consumed exactly once; wrong items do not complete requests; incidents change passenger stress; success and failure are reachable; reset cleans simulation.
