# First-person presentation contract

> **Current status (2026-08-10):** First-person presentation is part of the
> current cruise checkpoint. NPC visibility in normal packaged startup remains
> unresolved; see [CURRENT_STATUS.md](CURRENT_STATUS.md).

This slice owns presentation only. Host snapshots still decide movement,
interaction, carrying, fire, repair, navigation, and portal-pad outcomes.

## Rounded arms

`loadRig(firstPersonRigId)` still validates the authored `CM_FPARMS_ROOT`,
declared clips, and the existing hand-bone contract. `installRoundedFirstPersonVisual`
keeps the replacement geometry on the authored `fp_upperArm.*`,
`fp_forearm.*`, and `fp_hand.*` bones, preserving clip timing and hand sockets.

When that binding cannot be used, `RoundedFirstPersonFallback` uses a
camera-local, compact-low pose: smaller rounded segments and palms sit below
the view centre in the lower corners, leaving the interaction target and
passengers readable. `fp_hand_socket.R` and `fp_hand_socket.L` remain stable
tool attachment points.

The canvas reports `data-arms-profile="compact-low"` alongside the existing
rig, socket, and source seams. No fallback geometry changes simulation or
multiplayer state.

The gameplay depth contract preserves the 2400 m ocean far plane while using a
0.12 m camera near plane and WebGL logarithmic depth buffering. This reduces
near-surface Z precision loss without changing the authored arm geometry or
world scale; the canvas publishes the three values for deterministic evidence.

## Evidence

`tests/unit/presentation.test.ts` verifies sockets, the compact marker, and
the fallback bounds below camera centre. The focused Playwright presentation
test writes `test-results/correction-evidence/compact-arms.png` and checks
the compact profile plus silent continuous-audio seam.
