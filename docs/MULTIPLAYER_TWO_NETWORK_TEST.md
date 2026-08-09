# Two-Windows, two-network multiplayer acceptance

This is the required real-world gate for the two-player room. Two browser
contexts on one computer are useful automation, but they are not this test.

## Required setup

- Two physical Windows 11 computers in the same country.
- Different internet connections with different public egress addresses, such
  as home broadband and a phone hotspot. Do not put both machines on the same
  Wi-Fi or VPN exit.
- The exact same repository revision and dependency lockfile on both machines.
- Current Chrome or Edge. Open `chrome://webrtc-internals` before joining so
  the selected ICE candidate pair is captured.

On **both** machines, from the project directory:

```powershell
corepack enable
pnpm install --frozen-lockfile
pnpm typecheck
pnpm build
pnpm exec vite preview --host 127.0.0.1 --port 4173
```

Open `http://127.0.0.1:4173` on each machine. Localhost is intentional: each
machine serves the same static build locally while PeerJS provides internet
signaling and WebRTC carries the encrypted game data.

## Test sequence

1. On network A, select **Host 2-player room** and record the eight-character
   code.
2. Send only that code to the player on network B. They enter it and select
   **Join room**.
3. Both screens must reach `CONNECTED`; one must identify as host and the other
   as guest. Record screenshots of both network HUDs.
4. On the guest, walk independently while the host stands still. Both screens
   must show `crew-bravo` moving, with no host teleport or authority drift.
5. Trigger the collision-course incident. The guest goes to the bridge and uses
   rudder/telegraph input. Both machines must show the same navigation phase,
   countdown, obstacle position, avoidance/impact result, and score.
6. If impact occurs, the guest collects the toolbox, goes to the engine-room
   relay, and holds repair. Both machines must show the same repair progress and
   completion.
7. Close the guest tab after the room was connected. The host must return to a
   waiting/rejoin-safe state and ignore stale guest input.
8. Reopen the same build on the guest, join the same code, and repeat a movement
   plus helm or repair action. A rejoined guest must control `crew-bravo`;
   queued commands from the closed connection must not replay.
9. Try a second guest while the first valid guest is connected or handshaking.
   The host must retain the first slot and reject the extra connection.

## Evidence to keep

- Both Windows versions, browser versions, repository commit/tree ID, and local
  build command results.
- Host and guest screenshots showing role, room code (redact before sharing
  publicly), connected state, and the same authoritative gameplay outcome.
- From `chrome://webrtc-internals`, the selected candidate-pair type and state.
  `srflx`/host candidates prove direct ICE; `relay` proves TURN was used.
  Redact IP addresses, TURN usernames, and credentials.
- Browser console errors and the exact HUD message if connection, reconnect, or
  protocol negotiation fails.

## Pass criteria

Pass only when every gameplay and reconnect step above succeeds on the two
physical machines and the selected WebRTC candidate pair reaches `succeeded`.
Same-country location does not relax the different-network requirement.

## Failure interpretation

- **Host remains waiting:** signaling reached the host room but the guest never
  established/announced a usable data channel, or the guest targeted the wrong
  room/build.
- **Guest reports room not found:** wrong/expired code, host room not open, or
  signaling cannot see the host peer ID.
- **ICE stays checking/failed:** UDP/NAT/firewall path failed. Permit outbound
  WebRTC traffic in Windows Defender Firewall and retry without VPN/proxy.
- **Works on one network but not two:** direct STUN traversal is insufficient
  for one of the NATs. Configure TURN on both builds with `VITE_TURN_URL`,
  `VITE_TURN_USERNAME`, and `VITE_TURN_CREDENTIAL`.
- **Protocol mismatch:** rebuild both machines from the same revision. Protocol
  v2 intentionally rejects mixed builds.

TURN credentials are build-time secrets. Set them in the environment before
`pnpm build`; never commit them or paste them into test evidence.

## Current evidence status

As of 2026-08-09 this gate is **not proven**. Deterministic protocol/runtime
tests pass locally, but the previous opt-in PeerJS smoke left the host waiting
after 20 seconds, and no two-machine/different-network run has been completed.
