# Network Model

## Current model

Solo mode uses `SimulatedTransport` to test latency, jitter and loss locally. Two-player mode uses `PeerRoom`: `crew-alpha` hosts and `crew-bravo` joins through PeerJS signaling, then exchanges data directly over WebRTC. The free cloud broker is the zero-configuration prototype default. A self-hosted PeerServer and TURN credentials can be supplied through Vite environment variables without coupling simulation code to a provider.

## Authority

Host owns active phase, voyage and ship state, sea state, subsystem damage, deck objects, securing, object ownership/reservation, collision result, obstacle avoidance, hazard resolution, weapon hits, interaction validation and event log. Clients send `PlayerCommand` intent. A held object has one `ownerId`; host rejects/avoids duplicate ownership.

Helm authority is positional: the host accepts `HelmInput` only from a player standing in the bridge helm volume and discards everyone else's. A dodge resolves because the ship's simulated track cleared the obstacle by the authored margin, never because a client reported success.

## Wire boundary

The guest sends only strictly validated, sequenced `PlayerCommand` packets. The host validates intent through `HostSession`, steps the simulation, and sends ordered snapshots at 15 Hz. Commands run at 30 Hz and expire after 300 ms to prevent stuck movement. Packets are fenced by protocol version, room code, room epoch and role. Disconnect releases the guest's held object and clears input; a replacement guest receives a fresh full snapshot. Host loss closes the room; host migration is deliberately unsupported.

The room supports exactly two players. Same-city proximity reduces likely direct-path latency but does not bypass NAT. Symmetric NAT or restrictive firewalls may require a configured TURN relay.

## Operational test boundary

Solo and deterministic simulated-transport tests run without an online service. The default Playwright suite covers room setup through the test bridge but skips the cloud multiplayer smoke unless `LIVE_MULTIPLAYER=1`; a manual two-browser test is still required for real signaling, NAT behavior and same-room synchronization. TURN credentials belong in local environment variables and must never be committed.

## Bandwidth rule

Current two-player rooms send full authoritative snapshots at a bounded 15 Hz because the state is small. Before increasing object/player count, add a public snapshot projection, delta compression and backpressure rather than increasing rate.

The cruise premise raises the object count by roughly an order of magnitude, so that work is no longer conditional — it is Phase 11's first task and a hard prerequisite for crews larger than two. Two additional rules follow from a ship with many compartments:

- **Relevance filtering.** A client only needs full detail for compartments it can see through the portal graph. Distant decks are simulated by the host at full fidelity but sent as coarse summaries.
- **Ship-wide state is small; deck contents are not.** Voyage, sea state, hull condition, incident timers and warnings go in every snapshot uncompressed. Per-object deck state is where deltas and relevance apply.

Warnings and countdowns are authoritative snapshot fields, not client-side timers. Both players see the same number because they read the same tick.
