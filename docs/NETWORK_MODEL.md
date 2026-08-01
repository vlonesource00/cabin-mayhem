# Network Model

## Current Phase 1 model

Local host is `crew-alpha`; a local simulated client is `crew-bravo`. `SimulatedTransport` tests latency, jitter, loss, queue depth, packet count and byte estimate without a platform service. It is a proof harness, not a claim of real internet multiplayer.

## Authority

Host owns active phase, flight state, subsystem damage, cabin objects, cargo straps, object ownership/reservation, collision result, interaction validation and event log. Clients send `PlayerCommand` intent. A held object has one `ownerId`; host rejects/avoids duplicate ownership.

## Production boundary

Phase 2 must add an interface-compatible browser transport, likely WebRTC/WebSocket relay plus reconnect identity. Do not wire core simulation directly to Steam, Tauri or one relay vendor. Required future cases: join/ready, late join lobby, reconnect snapshot, pilot disconnect, held-object transfer, invalid RPC rejection and cleanup of late messages.

## Bandwidth rule

Send compact input/state deltas; never transmit every transform at maximum frequency. Derive deterministic visual shake and low-risk effects locally where state permits.
