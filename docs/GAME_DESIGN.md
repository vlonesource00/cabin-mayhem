# Game Design

## Vision

Cabin Mayhem is an original first-person cooperative cruise-ship game. Players
are the entire crew of one ship: they steer it, keep guests fed and unoffended,
restock it, repair what breaks, clean up what nobody wants to clean up, and
fight back when something boards it. The ship really moves across an ocean, and
everything that happens to it is felt as physical comedy below deck.

The core tension is that the ship always needs a person somewhere else. Every
job takes a crew member out of position, and the ship does not wait.

## Pillars

- **The ship is one shared body.** Steering, damage and sea state produce
  readable consequences on every deck. A hard turn to dodge an iceberg throws
  loose trays across the buffet three decks up.
- **Physical comedy with rules.** Mass, friction, impact tolerance, securing and
  ownership stay visible and simulated. The joke is the physics, not a canned
  animation.
- **Presence is the resource.** There is one helm, one engine room and many
  jobs. Deciding who abandons what is the main decision the crew makes.
- **Readable escalation.** Ignored problems compound into related problems. A
  missed dodge breaches the hull; the breach floods; the flood kills a
  generator; the dark casino makes guests furious. Nothing is a disconnected
  random event.
- **Repair, defend, upgrade.** Damage is survivable and fixable. Money earned
  from a good voyage buys hull, weapons, radar and capacity that make the next
  voyage's jobs tractable.

## The ship

_MS Cabin Mayhem_ — six decks, roughly twenty-five discrete compartments at the
initial scope and room to grow past seventy, from the bilge to the bridge. The
full compartment graph, what each room is for and which hazards live in it are in
[`SHIP_LAYOUT.md`](SHIP_LAYOUT.md).

The hull stays at the local origin. The ocean, weather and obstacle field move
relative to it, which keeps float precision stable and lets the same
vehicle-local physics from the aircraft build carry over unchanged.

## Voyage structure

A voyage is a bounded run with a fixed authored duration, the successor to the
old flight phases:

```text
moored -> preparation -> departure -> open-sea -> (incidents) -> approach -> docked
                                                                          -> foundered
```

`preparation` is the calm before the run: pick the route, read the weather
forecast for it, buy supplies and fuel, spend the last voyage's payout on
upgrades, and agree who starts where. It is the only moment the crew can plan
instead of react, and every choice made there is a number the rest of the voyage
reads.

`open-sea` is where the game is. Incidents are scheduled on the deterministic
mission clock and by escalation, never by a random director.

A voyage ends in a debrief: guest reviews, jobs completed and missed, hull and
system condition, incidents survived, and the payout that funds upgrades.

## Jobs

Jobs are the ordinary work. They are always available, they compete with
incidents for crew attention, and neglecting them loses the voyage slowly rather
than dramatically.

| Job               | Where                         | Loop                                                                                                               |
| ----------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Guest requests    | Cabins, dining, bars, pool    | Take the right item from stock, carry it to the guest who asked. Direct descendant of the current service mission. |
| Restocking        | Cold store, mall, bar, buffet | Move goods from the hold to the outlet that ran dry. Empty outlets stop earning and start annoying.                |
| Pool cleaning     | Pool deck                     | Contamination accumulates; skim and treat it before guests notice.                                                 |
| Bird strikes      | Any exterior deck             | Flocks foul railings, loungers and the pool. Cosmetic, then reputational.                                          |
| Medical           | Medical bay, anywhere         | Injured or ill guests need a medkit or an escort to the bay.                                                       |
| Waste and laundry | Lower decks                   | Deferrable, unglamorous, compounding.                                                                              |
| Housekeeping      | Guest cabins                  | Cabin state decays over a voyage.                                                                                  |

## Incidents

Incidents interrupt. Each has a warning, a window, a required response and a
consequence for failing.

| Incident                 | Warning                                      | Response                                                                                                                     |
| ------------------------ | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **Collision course**     | Radar contact, HUD bearing, impact countdown | Someone reaches the bridge and steers clear before the timer expires. Icebergs, containers, reefs, derelicts, other vessels. |
| **Hull breach**          | Flooding alarm, list to one side             | Patch the breach, run the bilge pumps, seal the compartment.                                                                 |
| **Fire**                 | Smoke, alarm                                 | Extinguisher, correct range and aim. Reuses the existing fire system.                                                        |
| **Power failure**        | Lights out, systems degrade                  | Toolbox to the breaker, hold to repair. Reuses the existing repair system.                                                   |
| **Engine breakdown**     | Speed drops, vibration                       | Engine-room repair under time pressure while the ship cannot manoeuvre.                                                      |
| **Rogue wave / tsunami** | Horizon warning, long countdown              | Secure loose objects, close hatches, brace. Everything unsecured becomes a projectile.                                       |
| **Pirates**              | Radar contact closing, then grapples         | Man the deck weapons, repel boarders, defend key compartments.                                                               |
| **Man overboard**        | Guest alarm                                  | Turn the ship, launch the tender, recover them.                                                                              |
| **Dense fog**            | Visibility collapses                         | Radar becomes the only sensor; warning lead times shorten and speed must come off.                                           |
| **Ship failure**         | A subsystem stops                            | Stuck elevator, dead lighting circuit, broken shop equipment, failed refrigeration. Small, frequent, cumulative.             |
| **Guest incident**       | A guest report                               | Lost child, fight, theft, food shortage, seasickness outbreak. Reputation damage if ignored.                                 |

The obstacle field is not just icebergs: floating containers, reefs, derelicts,
drifting mines, rock formations, whirlpools, waterspouts and other vessels all
resolve through the same collision-course machinery with different sizes,
clearance margins and consequences. Large sea creatures are the same shape of
problem with a different silhouette.

Incidents chain. Collision causes breach causes flood causes power loss causes
angry guests in a dark casino. That chain is the difficulty curve, not a
difficulty slider.

### The dodge, specifically

This is the mechanic the whole crew layout exists to serve.

1. The host spawns an obstacle on a collision bearing at a known distance, with
   a time-to-impact derived from closing speed.
2. Every client shows the same authoritative warning: what it is, which bearing,
   and a countdown.
3. A crew member has to physically get to the bridge. Nobody steers from the
   buffet.
4. The host validates avoidance: a player is at the helm, rudder input is
   applied, and the resulting track clears the obstacle by the authored margin.
5. Clearing it costs speed and throws everything loose on every deck. Missing it
   breaches the hull.

The cost of success is deliberate. Dodging is never free, and the crew feels it
in the mess it makes elsewhere.

## Defence and upgrades

Pirates are a major scripted event, not a constant combat mode, and they arrive
only once the ship-operation loop is fun without them. The attack runs in
stages: vessel detected, warning, approach and incoming fire, defensive stations
manned, boarders land, key compartments contested, survivors retreat, damage
repaired, salvage collected.

The arsenal is a real one — pistols, shotguns, rifles, submachine guns, flare
guns, mounted machine guns — alongside water cannons, stun equipment and
automated turrets. Combat stays mechanically simpler than a dedicated shooter:
no recoil patterns, attachment trees or reload minigames. It is a tool you pick
up during one incident, not the game's core verb.

Upgrades are bought with voyage payouts and persist between runs:

- **Navigation** — radar range, rudder response, autopilot, earlier hazard
  warnings, storm prediction
- **Engineering** — engine power, fuel economy, repair speed, automatic pumps,
  redundant electrical
- **Safety** — lifeboats, fire suppression, reinforced doors, medical capacity,
  emergency lighting
- **Passenger services** — better restaurants, larger retail, improved cabins,
  new entertainment, higher passenger capacity
- **Defence** — weapons, turrets, armour, boarding detection, security doors
- **Crew efficiency** — faster trolleys, larger carry capacity, better tools,
  cleaning robots, comms

Every upgrade must change an authored number that an existing system already
reads. An upgrade that needs a new subsystem is a new slice, not an upgrade.

Players unlock cosmetics and small conveniences of their own — uniforms, tool
skins, accessories, emotes, titles, extra inventory slots, task perks. Player
progression must never make an unupgraded player useless on someone else's ship.

## Authority

Unchanged and non-negotiable: `HostSession` decides everything. The client
raycasts a candidate and submits intent; the host validates tool, target,
ownership, range and state. Presentation, audio and animation are pure
projections of authoritative snapshots.

**Animation never decides whether a dodge, a repair, a delivery, a suppression
or a hit succeeds.** Neither does the renderer, the HUD or the audio layer.

## Current playable boundary

The airliner vertical at `79bb002` is the last thing that ran. The cruise
premise is designed and documented; none of it is implemented yet. The first
implementation slice is Phase 5 in [`ROADMAP.md`](ROADMAP.md).

## Crew size

The target is one to four players. One player is a valid session: task pressure
scales down with crew size and, later, hired AI crew can cover a station. Two is
what the current room code supports, and four needs snapshot delta compression
first — see Phase 11 in [`ROADMAP.md`](ROADMAP.md). Drop-in and drop-out joining
comes with that same slice.

## Camera

First person, settled in [ADR 0002](adr/0002-first-person-camera.md). The
authored `CM_FPARMS_ROOT` arms rig, pointer-lock capture and camera-forward
interaction raycasting all stay. You see crewmates when they are in front of you,
on the shared humanoid rig; you never see yourself.

## Open decisions

- **Hidden compartments.** Restricted areas — a reinforced command centre, a
  smuggler's hold, a sealed lower deck — are an attractive progression hook but
  need a gating rule that is not just "buy the upgrade". Not scoped yet.

## Deferred deliberately

Weather beyond scripted sea state and fog, autonomous guest pathfinding across
decks, ports and shore excursions, recorded audio, matchmaking, and any economy
beyond the voyage payout and cosmetic player unlocks.
