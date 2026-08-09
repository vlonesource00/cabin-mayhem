# Audio soundscape

Cabin audio is a presentation-only projection of authoritative snapshots. It
creates no simulation outcomes, ships no binary audio assets, and stays silent
until the browser permits a user-gesture `AudioContext` resume.

## Mix shape

The graph has one compressed master and four independently controllable buses:

- `ambience`: gated filtered-noise zone bed plus underway engine/wind beds.
- `effects`: movement, pickup, doors, impacts and interaction clicks.
- `ui`: phase, service, success and recovery cues.
- `events`: fire, alarm, navigation and boarding cues.

Bus and master values are clamped to `0..1`, automated with short gain fades,
and kept below conservative bus ceilings before the master compressor. `M`
continues to toggle the existing app mute path through `CabinAudio.setEnabled`;
call `setVolume` or `setBusVolume` for a settings control without bypassing the
fade or safety clamps.

## Context and spatial behavior

The local player's authored compartment maps to a stable zone profile. Zone
changes retune the filtered noise bed through a short crossfade. The listener,
zone bed, and one-shot cues use Web Audio `PannerNode` inverse-distance settings
when their position is known. Unknown compartments fall back to a corridor
profile, keeping snapshot playback deterministic.

The old permanent engine oscillator is gone. Continuous levels start only for a
non-zero mission or zone condition, and one-shot oscillators exist only inside
bounded cues. Alarm pulses are scheduled on a cadence while an alarm is active;
they are not a permanently running oscillator. Cue cooldowns, a four-cue update
cap, voice cap, and ambience ducking prevent repeated snapshots from becoming a
wall of sound.

## Verification

```text
pnpm typecheck
pnpm vitest run tests/unit/mission-audio.test.ts tests/unit/audio-mix.test.ts tests/unit/soundscape.test.ts
pnpm eslint src/audio tests/unit/mission-audio.test.ts tests/unit/audio-mix.test.ts tests/unit/soundscape.test.ts
```

Manual browser check: start a voyage, click the world to grant the audio
gesture, walk from the atrium through a stairwell to the bridge, press `M`
twice, trigger navigation/boarding debug states, and confirm zone fade, door,
alarm, navigation, boarding and mute changes. Automated browser assertions can
verify graph/debug state and console errors, but cannot establish that a human
speaker is audibly reproducing sound; record that limitation with any smoke
evidence.

Design references: [W3C Web Audio API](https://www.w3.org/TR/webaudio/) and the
[Three.js PositionalAudio guidance](https://threejs.org/docs/#api/en/audio/PositionalAudio).
