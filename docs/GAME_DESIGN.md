# Game Design

> **Design status:** This document records the product intent and the boundary
> of the current cruise checkpoint. It does not convert planned systems into
> shipped features. See [PROJECT_BASELINE.md](PROJECT_BASELINE.md) for the
> evidence matrix and [ROADMAP.md](ROADMAP.md) for delivery gates.

## Vision

_MS Cabin Mayhem_ puts one to four crew members inside a detailed, moving cruise
ship. The ship is not a menu backdrop: its momentum, decks,
stairs, cabins, public rooms, exterior walks, machinery, guests, and weather
create the work.

Players steer and dodge hazards, carry the right item to the right person,
restock outlets before they fail, repair damage under pressure, respond to
disasters, repel pirates with a small practical arsenal, and turn a successful
shift into better capability for the next route.

The tone is physical, readable, and cooperative. The comedy comes from
coordination under ship motion and cascading problems, not from making the
simulation arbitrary.

## Design pillars

### A moving, legible ship

The ship must feel like a place. A player should know which deck they occupy,
where the stair tower leads, why the bridge is far from the engine room, and how
an exterior deck relates to the hull. Motion affects the cabin simulation; the
renderer presents the host-owned result.

**Current label: Implemented foundation.** The source has 14 compartments across
8 occupied decks, three stair towers, an exterior asset, portal travel, and
ship/ocean state. Full route performance and all arrival/spawn geometry are not
yet proven.

### Work with consequences

Tasks should be concrete: select a request, find or restock an item, carry it
through space, interact at the correct target, and deal with what changed while
the crew was away. A missed guest should affect satisfaction; a delayed repair
should affect ship state; a wrong action should explain its rejection.

**Current label: Partial.** The current service primitive has eight passengers,
three request types, a finite cart, matching delivery, patience, and score. It
does not yet provide a cross-deck task board or the complete resort economy.

### Hazards are chains

An incident should be a short story: warning, decision, consequence, recovery,
and debrief. Navigation can damage steering; fire can raise pressure; later
disasters will combine system damage, passenger state, ship location, and time.

**Current label: Partial.** One navigation incident, a galley fire, and two
bounded repair targets exist. Flooding, bilge pumps, breach sealing, power loss,
incident chaining, and a full disaster catalogue are planned.

### Defence is an escalation, not the whole game

Pirates are a scripted threat that interrupts the crew's ordinary work. Defence
should ask where to stand, which link or attacker matters, and when to use a
weapon. It should remain shallow enough that service, navigation, repair, and
ship awareness stay central.

**Current label: Partial.** Host-owned boarding phases, boarding links,
passenger/infrastructure pressure, and presentation GLBs exist. Weapon assets
are present, but combat AI, target/hit resolution, firearm/melee semantics,
**Planned:** bomb objectives and persistent boarding damage are not part of the
current boarding slice.

### Specificity without render debt

Blender-authored GLBs define the ship's visual identity, character rigs, crowd
looks, invasion loadouts, and future interaction props. Data definitions and
host simulation define collision, targets, portals, tasks, and outcomes. A bad
GLB must degrade to a playable greybox or explicit partial fallback.

**Current label: Implemented for existing contracts; Partial for full content.**
The manifest, Blender sources, loaders, root/portal/socket/Action checks, and
fallback paths exist. Hardware performance remains an evidence gap.

## Player shift loop

| Step    | Player experience                                                                                              | Current label                                                                                                              |
| ------- | -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Prepare | Choose a route, inspect risk, assign people, buy supplies, and agree on priorities.                            | **Planned.** The source has voyage phase values but not the complete preparation economy or upgrade console.               |
| Sail    | Read the sea, steer the ship, move through the vessel, and respond to warnings.                                | **Partial.** Moving ship, ocean state, first-person scene, portals, and one navigation incident exist.                     |
| Work    | Serve guests, restock, clean, cook, repair, and keep systems moving.                                           | **Partial.** One bounded service/cart/repair primitive exists; task board and broad job catalogue are planned.             |
| Respond | Handle fire, flooding, collision, weather, guest emergencies, and boarders.                                    | **Partial.** Fire, navigation, repair, and boarding foundations exist; full disaster chains do not.                        |
| Recover | Finish the route, inspect damage and reviews, and understand what was lost.                                    | **Partial.** Current debrief reports bounded service/incident outcomes; it is not yet the full economy/progression result. |
| Improve | Spend payout on navigation, engineering, safety, passenger service, defence, and quality-of-life improvements. | **Planned.** No authoritative upgrade or persistence state exists in the current mission model.                            |

## The ship as a play space

The current authored layout is the first playable vessel, not the final content
ceiling. The design uses:

- A 290 m hull frame, fixed deck datum, and ship-local coordinates.
- Fourteen authored compartments from engine room to bridge, including public
  rooms, cabin decks, open decks, and three stair towers.
- Portal pads, doors, and elevator stops derived from validated data. Travel is a
  host action, not a client teleport.
- One GLB per compartment plus an always-resident exterior. Current residency is
  the occupied room and direct neighbours at full detail, second-hop rooms at
  reduced detail, and nothing beyond.
- Procedural collision/interaction proxies that remain valid if a GLB falls back.

The layout contract is documented in [SHIP_LAYOUT.md](SHIP_LAYOUT.md) and
implemented in [`ship-layout.ts`](../src/data/ship-layout.ts). New rooms should
earn their place by adding a distinct job, hazard, sightline, or recovery route;
room count alone is not progression.

## Work catalogue

| Work type              | Design role                                                                    | Status                                                                                                    |
| ---------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| Guest request          | Match need, item, guest, range, and timing.                                    | **Partial:** drink/meal/medical service slice in current data.                                            |
| Restocking             | Move finite supply from a source to an outlet before guests feel the shortage. | **Planned as a complete cross-deck loop:** current cart take/return is a primitive, not a supply network. |
| Housekeeping           | Clean cabins and public spaces; neglect compounds.                             | **Planned.** Ambient `housekeeping` activity is presentation, not a job system.                           |
| Pool care              | Clean/treat pool systems before guest and reputation penalties.                | **Planned.** Pool-deck GLB and ambient swimming do not prove pool gameplay.                               |
| Cooking and service    | Coordinate galley production and delivery under motion.                        | **Planned.** Current `main-galley` is map content; current service definitions are atrium-focused.        |
| Medical/guest response | Treat or escort an injured/ill guest.                                          | **Planned.** `medical` is a current request type, not a medical bay or escort system.                     |
| Cleaning/waste/laundry | Low-glamour jobs that become urgent when deferred.                             | **Planned.** No economy or schedule exists.                                                               |
| Repair                 | Hold the correct tool at the correct host-authored target under pressure.      | **Partial:** galley breaker and engine-room steering relay.                                               |
| Navigation             | Read the warning, reach the bridge, and clear the track.                       | **Partial:** one host-owned incident.                                                                     |
| Fire response          | Use the correct extinguisher at range; accept pressure and scoring.            | **Partial:** galley fire only.                                                                            |
| Pirate defence         | Detach boarding links, protect guests, then add bounded weapon actions.        | **Partial:** current state/presentation; combat contract is Slice C.                                      |

## Hazards and disaster design

The intended escalation is:

1. **Signal:** warning and location are visible to every player from the host
   snapshot.
2. **Choice:** the crew chooses route, tool, station, or defence action.
3. **Pressure:** time, passenger panic, stock, ship motion, or system integrity
   makes delay meaningful.
4. **Consequence:** host applies deterministic damage, score, passenger, or
   voyage-state changes.
5. **Recovery:** the crew performs a valid repair, pump, delivery, defence, or
   escort action.
6. **Review:** debrief reports what happened without inventing a client outcome.

The first complete disaster should reuse current fire/repair contracts and add
only one new failure chain. A larger incident catalogue comes after one chain is
measured and fun.

## Pirate and arsenal design

Pirates should create a clear boarding lane, not a second game. Initial defence
should have:

- A warning and approach window.
- A physical boarding board and gangway that can be detached.
- A small number of hostiles with readable positions and objectives.
- A weapon presentation contract for one pistol and one cutlass.
- Host-validated target, range, cooldown/availability, hit, damage, and score.
- Passenger protection and ship-infrastructure stakes.

The arsenal can grow later through water cannons, stun equipment, turrets, and
firearms, but each weapon must change a bounded simulation value or action. A GLB
with an `Aim` or `Fire` Action is not a working weapon.

## Authority and co-op contract

`HostSession` decides phase, voyage, player compartment, portal travel,
interactions, object ownership, service results, fire/repair state, navigation,
boarding state, crowd state, score, and events. A client may raycast or highlight
a candidate, then submit intent. The host rechecks everything from its own state.

Presentation follows the snapshot:

- HUD explains current host state and rejected intent.
- Three.js presents loaded GLBs, animation, feedback, and camera framing.
- Animation never decides delivery, repair, dodge, hit, damage, or score.
- Network role changes who steps simulation; it does not create a second ruleset.

Current transport is a protocol-4 host/guest prototype with local simulated
latency/loss tests and opt-in PeerJS/WebRTC room code. Separate-machine,
separate-network acceptance is still a proof gate.

## Progression design

Progression is deliberately deferred until the task and disaster numbers are
real. The eventual lines are:

- **Navigation:** radar range, rudder response, warning lead, autopilot support.
- **Engineering:** propulsion, fuel economy, repair speed, pump capacity.
- **Safety:** hull integrity, fire suppression, compartment sealing, evacuation.
- **Passenger service:** stock capacity, patience margin, service speed, guest
  satisfaction.
- **Defence:** boarding detection, weapons, turrets, armour, security doors.
- **Quality of life:** inventory, cosmetics, task affordances, accessibility.

Every upgrade must modify a value an existing host system reads. Persistence
must include profile version, currency, reset, migration, and failure handling;
otherwise it is decoration, not progression.

## Crew size

The product target is one to four players. The current proven mode is one host
plus one guest, with host `crew-alpha` and guest `crew-bravo`. Solo support is a
valid product goal, but task pressure cannot simply assume four workers. Scale
work must add explicit pressure rules, snapshot relevance/deltas, and reconnect
tests before claiming four-player co-op.

## Current boundary

**Implemented:** first-person cruise scene; ship/ocean foundation; authored
compartments and portal travel; host authority; GLB/fallback contracts; bounded
service, fire, repair, and navigation slices; host-owned ambient crowd; authored
boarding presentation; current HUD/debrief.

**Partial:** full player-visible crowd at normal start is now covered for the
atrium, but other arrival positions remain unverified; invasion assets present
without combat; local/opt-in room paths without two-network proof; performance
rails without hardware smoke; service primitives without task board/economy.

**Planned:** task board; one complete guest/restock/repair loop; pirate weapon
contract; disaster chain; upgrades/persistence; scale; more jobs and content.

## Deliberate non-claims

Do not claim any of the following from the current map, GLBs, HUD labels, or
design prose alone:

- A complete cruise-job catalogue or economy.
- Progressive flooding, bilge pumps, power-loss chaining, or full disasters.
- Playable firearms/melee combat, combat AI, bomb search/disarm, or persistent
  pirate damage.
- Arsenal upgrades, route progression, currency, save/load, or player profiles.
- Four-player balance, solo pressure scaling, or separate-network multiplayer.
- Hardware frame-rate, draw-call, texture-memory, or transition guarantees.
- Autonomous guest needs/schedules merely because 78 ambient residents exist.

Next implementation decisions are frozen in [ROADMAP.md](ROADMAP.md), starting
with the task surface rather than adding more map or more assets.
