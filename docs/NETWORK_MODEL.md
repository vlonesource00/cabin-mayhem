# Network Model

## Current model

Solo mode uses `SimulatedTransport` to test latency, jitter and loss locally. Two-player mode uses `PeerRoom`: `crew-alpha` hosts and `crew-bravo` joins through PeerJS signaling, then exchanges data directly over WebRTC. The free cloud broker is the zero-configuration prototype default. A self-hosted PeerServer and TURN credentials can be supplied through Vite environment variables without coupling simulation code to a provider.

## Authority

Host owns active phase, flight state, subsystem damage, cabin objects, cargo straps, object ownership/reservation, collision result, interaction validation and event log. Clients send `PlayerCommand` intent. A held object has one `ownerId`; host rejects/avoids duplicate ownership.

## Wire boundary

The guest sends only strictly validated, sequenced `PlayerCommand` packets. The host validates intent through `HostSession`, steps the simulation, and sends ordered snapshots at 15 Hz. Commands run at 30 Hz and expire after 300 ms to prevent stuck movement. Packets are fenced by protocol version, room code, room epoch and role. Disconnect releases the guest's held object and clears input; a replacement guest receives a fresh full snapshot. Host loss closes the room; host migration is deliberately unsupported.

The room supports exactly two players. Same-city proximity reduces likely direct-path latency but does not bypass NAT. Symmetric NAT or restrictive firewalls may require a configured TURN relay.

## Bandwidth rule

Current two-player rooms send full authoritative snapshots at a bounded 15 Hz because the state is small. Before increasing object/player count, add a public snapshot projection, delta compression and backpressure rather than increasing rate.
