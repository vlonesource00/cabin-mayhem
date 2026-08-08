# Test Plan

Written for the cruise premise. Checks marked **(shipped)** exist today against
the airliner vertical and mostly survive a rename; the rest land with the phase
that introduces the system.

## Automated

- **Unit:** voyage phase transitions; ship model heading, rudder authority,
  telegraph and turning radius; wave function determinism and hull
  pitch/roll/heave derivation; obstacle spawn bearing and time-to-impact;
  avoidance margin evaluation; secured objects (shipped); collision stability
  (shipped); host grab ownership (shipped); finite outlet stock and returns
  (shipped); hazard tool/target/range/hold validation (shipped as fire and
  repair); flooding rate and pump capacity; weapon hit validation; upgrade
  modifiers applied to the numbers they claim to change; latency delivery
  (shipped); guest needs, delivery validation and patience (shipped); voyage
  outcome, reviews and debrief replay (shipped).
- **Integration:** voyage progression; system damage; hazard priority ordering;
  incident chaining (collision → breach → flood → power loss); debug triggers;
  host/guest command validation; helm input rejected from outside the bridge
  volume; disconnect cleanup and reset; bounded simulation. (All shipped in
  aircraft form except chaining and the helm rule.)
- **Browser:** menu reaches the first-person Three.js scene (shipped); a
  compartment GLB activates and an aborted request falls back to greybox
  (shipped in cabin form); walking through a portal streams the next compartment
  without a dropped frame; the collision warning and countdown appear on both
  clients with the same value; reaching the helm and steering clears the
  obstacle; missing it breaches the hull; responsive HUD and closed `F1` drawer
  (shipped); debrief and reviews on both a successful and a foundered voyage
  (shipped in landing form).
- **Performance:** an authored route walking every deck, asserting the budgets
  in [`PERFORMANCE.md`](PERFORMANCE.md) — frame time, worst-case frame, draw
  calls, triangles, texture memory and active mixer count. Fails the build on
  any breach.
- **Live browser room:** optional two-context PeerJS/WebRTC smoke with
  `LIVE_MULTIPLAYER=1`; host creates a room, guest joins, both receive the same
  host snapshot and disconnect cleanup runs. (shipped)
- **Build:** typecheck, lint, formatting, data and asset validators, Vite build
  and Tauri build. (shipped)

## Manual matrix

Run solo and two local browser players. For the room pass, use one host and one
guest with the same room code and verify that the guest never steps authority
locally.

Exercise pointer-lock and fallback mouse look, keyboard and gamepad input,
compartment and fixture collision, network simulation on and off, low and high
latency, outlet stock take/return/depletion, correct and wrong deliveries,
request expiry, grab race, host reset, every voyage phase, the full incident
list, hazard interruption and completion, and the voyage debrief and replay.

Specifically for the ship: steer from the bridge while the other player is on
deck 0 and confirm both feel the turn; take a hard turn and confirm loose items
move on every deck; let a collision timer expire and confirm the breach,
flooding and list; run the bilge pumps; trigger a rogue wave and confirm the
securing window is long enough to act on; repel one boarding.

For the visual pass, inspect 1366x768 and 412x915. Verify compartment GLBs and
greybox fallback, portal transitions, no debug overlay during gameplay, compact
HUD spacing, captions, the incident warning card and countdown, objective card,
critical icons, tool feedback, hazard feedback and debrief scrolling. Record
FPS, frame-time spikes, draw calls, physics object count, queued packets and any
NaN or stuck object.

For native packaging, close old `cabin-mayhem.exe` processes before
`pnpm desktop:build`, launch the generated Windows app, and repeat the smoke
checks in the Tauri wrapper.

## Acceptance

- No NaN state; players remain inside ship bounds; the ship makes way and
  responds to rudder and telegraph with authored momentum.
- The visible sea and the simulated hull motion agree; a player standing still
  on an empty deck is never thrown by a wave that is not visible.
- Secured items stay anchored; loose objects react to turns, impacts and waves;
  one owner exists per held object.
- Outlet stock cannot go below zero or above authored capacity; correct items are
  consumed exactly once; wrong items do not complete requests.
- Every hazard requires the correct held tool, a valid target and range, and its
  authored hold or repeat; priority ordering between simultaneous hazards is
  deterministic.
- A dodge succeeds only when a player is at the helm and the resulting track
  clears the authored margin. Both clients show the same countdown value at the
  same tick.
- Host validation remains authoritative in solo and two-player flows; disconnect
  releases guest-owned objects and clears guest input.
- A compartment GLB activates only after its root and portal contract validates;
  load or parse failure leaves the greybox scene playable.
- Every budget in [`PERFORMANCE.md`](PERFORMANCE.md) holds on the reference
  machine across the full-ship route, including portal transitions.
- Debrief appears only after the voyage ends, reports score, jobs, incidents,
  hull condition, reviews and payout accurately, and replay resets the room
  without stale state.
- Responsive HUD remains readable at desktop and narrow viewports; `F1` drawer
  starts closed.
- CI, local tests and builds are green, or documented with the exact failing
  command and a reproducible limitation.
