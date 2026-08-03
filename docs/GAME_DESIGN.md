# Game Design

## Vision

Cabin Mayhem is original cooperative aviation management with physical comedy and cascading consequences. One crew member may fly; everyone can leave stations, handle emergencies, grab cargo, help or make problems worse.

## Pillars

- Shared consequences: flight inputs cause readable cabin consequences.
- Physical comedy with rules: mass, friction, impact tolerance, securing and ownership stay visible.
- Flexible crew roles: same controller; stations/tools change temporary capability.
- Risk with readable cost: later passenger/cargo contracts must trade payout for identifiable risk.
- Escalation: director chains unresolved state and recovery windows, not unrelated random tasks.

## Current playable boundary

One walkable first-person 3D aircraft: cockpit, aisle, seats, overhead bins, shelves, rear cargo zone, finite-stock service cart, loose objects, crates, straps, two crew, eight seated passengers and host debug actions. Holding throttle launches taxi, rotation assist and climb. Players select drink/meal/medical stock, take or return physical items, serve scheduled requests, suppress a triggered galley fire with the loose extinguisher and repair a coffee-machine breaker mutiny with the toolbox. Correct deliveries preserve patience and earn score; fire, repair and other incidents raise pressure, panic and injury. Flight phases are ground, taxi, takeoff, cruise, approach, landed and crashed-ready state. Landing produces an airline-sitcom debrief with reviews and incident verdicts. Two players can share one host-authoritative room through the optional PeerJS/WebRTC adapter.

## Deferred deliberately

No walking passenger navigation, cargo contracts, event director, route selection, economy, progression, recorded/production audio, authored animation clips, matchmaking/lobby service or save migration yet. The static cabin shell has a Blender GLB, but passenger avatars, service contents, loose gameplay props and emergency effects remain procedural. Current passenger behavior is deterministic seated service state, not full autonomous AI.
