# First-person presentation contract

This slice owns presentation only. Host snapshots still decide movement,
interaction, carrying, fire, repair and navigation outcomes.

## Rounded arms

`loadRig(firstPersonRigId)` still validates the authored `CM_FPARMS_ROOT`, all
declared clips and the existing seven-bone contract. At instantiation time,
`src/three/animated-rig.ts` hides only the source `CM_FP_ARMS` render mesh and
adds low-poly capsules, ellipsoids and a rounded cuff to the same animated
`fp_upperArm.*`, `fp_forearm.*` and `fp_hand.*` bones. Clip names, mixer timing,
visibility gating and input code remain unchanged.

Each hand exposes `fp_hand_socket.R` or `fp_hand_socket.L` as a presentation
attachment point. The existing camera-relative carried-object transform remains
the authoritative visual placement path, so tool carrying cannot affect input or
multiplayer state. If the FP GLB is unavailable, `RoundedFirstPersonFallback`
provides the same sockets and a bounded pose-driven camera-space render.

## Lighting and cost bounds

`presentation-lighting.ts` configures:

- ACES filmic tone mapping, sRGB output, 1.0–1.5 device pixel ratio clamp;
- one 1024² PCF-soft directional key with tuned bias/normal bias for contact
  definition;
- one hemisphere light, one shadowless blue rim, and eight shadowless point zones;
- electrical-health flicker/color updates over the fixed zone array;
- existing exponential fog plus emissive materials as the low-cost post-effect
  fallback. No per-frame composer, bloom pass or shadow-casting zone lights.

The runtime keeps `data-lighting-mode="bounded-zones"`,
`data-shadow-mode="directional-pcf-soft-1024"` and
`data-post-fx="fog-emissive-fallback"` on the canvas for browser evidence.
