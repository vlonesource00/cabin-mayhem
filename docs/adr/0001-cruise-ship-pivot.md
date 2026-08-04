# ADR 0001 — Pivot from airliner to cruise ship

Status: accepted
Date: 2026-08-03
Supersedes: the aircraft premise recorded in `docs/GAME_DESIGN.md` through `79bb002`

## Context

Cabin Mayhem shipped a complete Slice 2 airliner vertical: host-authoritative
service, galley fire, breaker repair, two-player WebRTC rooms, a landing
debrief, a Blender cabin GLB with procedural fallback and two authored skeletal
rigs. The premise did not hold up in review. An airliner is one corridor with no
room for the number of simultaneous, spatially separated jobs the co-op design
wants, and its emergencies are either trivial or terminal with very little in
between.

A cruise ship fixes both problems. It is many rooms across many decks, it can be
damaged without ending the run, and it gives players a reason to be in different
places at once.

## Decision

Cabin Mayhem becomes a first-person cooperative cruise-ship game. The vessel is
crewed by the players: they steer it, keep guests happy, restock it, repair it
and defend it.

## What is kept

The pivot is a world and content change, not an engine change. These stay:

- `HostSession` as the sole writer of authoritative state, fixed 1/60 s step,
  bounded frame delta.
- The vehicle-local reference frame. The aircraft never moved in world
  coordinates; cabin contents responded to derived acceleration. A ship works the
  same way and needs it more, because an ocean is large enough to lose float
  precision. The hull stays near the origin and the ocean moves under it.
- `cabin-simulation` physics: kinematic crew, loose-object response, friction,
  securing, impact tolerance, ownership.
- `service-mission` structure: authored requests on a deterministic clock,
  finite stock, patience, host-validated delivery, score.
- `fire-response` and `repair-response`, generalised into one hazard system.
- `PeerRoom` authority and fencing rules.
- The `CM_HUMANOID` rig, the arms rig, `AnimationMixer` playback and the clip
  contract in `src/three/animation-contract.ts`.
- `scenario-loader`'s rule that a GLB is presentation only and a load failure is
  non-fatal.
- Every validation, test and CI gate.

## What changes

- `FlightState` → `VoyageState`; `FlightPhase` → `VoyagePhase`;
  `flight-model.ts` → `ship-model.ts`; `PilotInput` → `HelmInput`.
- One static cabin GLB becomes a streamed graph of per-compartment GLBs.
- New systems: ocean and hull motion, the helm and obstacle avoidance, boarding
  defence, upgrades and persistence, and stock economy.

## Name

The project keeps the name **Cabin Mayhem**. A cruise ship has cabins, so the
title still describes the game and the existing `CabinState`, `CabinObject`,
`PassengerState` and `CabinWorld` identifiers stay accurate under the new
premise. Renaming them would be a large mechanical diff across every file and
test for no behavioural gain. Only the aircraft-specific names above are
renamed.

## Consequences

- Roughly 40% of the runtime is reused directly, another 25% is reused with a
  rename or a generalisation, and the rest is new.
- The airliner content — cabin scenario GLB, flight model, takeoff progression,
  landing debrief — is retired. It stays in Git history and the `.blend` sources
  stay tracked until the equivalent ship content replaces them.
- Performance stops being a background concern and becomes a hard gate. One
  aircraft cabin was small enough to brute force. A ship is not. See
  [`PERFORMANCE.md`](../PERFORMANCE.md).
- The two-player room becomes a limit rather than a design. Scaling the crew
  needs snapshot deltas before it needs more sockets.

## Rejected alternatives

- **New repository.** Rejected. The host-authority architecture, the network
  fencing rules, the rig pipeline and the whole CI and validation apparatus are
  the expensive parts, and they are premise-independent.
- **Keep both premises behind a mode switch.** Rejected. Two content pipelines
  and two physics reference frames for a team of two.
- **Rename everything to ship vocabulary.** Rejected. See Name above.
