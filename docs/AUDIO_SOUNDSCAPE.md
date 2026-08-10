# Audio and soundscape contract

Cabin audio is a presentation-only projection of authoritative snapshots. It
ships no audio assets and the default resumed cruise is silent except for
short, meaningful localized cues.

## Silent ambient state

`CabinAudio` creates the master and effect/UI/event buses when the browser
allows an `AudioContext`, but it creates no generated noise buffer,
`AudioBufferSourceNode`, oscillator bed, zone bed, engine bed, wind bed,
rumble bed, fire bed, or other looped broadband source. `continuousSourceCount()`
is always zero and the canvas reports `data-audio-continuous-sources="0"`.
`missionMix` and soundscape profiles retain their compatibility shape with all
continuous levels at zero.

## Meaningful cues

State deltas still produce bounded one-shot tonal cues for phase changes,
fire, repair, service, impacts, movement, doors, interactions, navigation,
boarding, and shift outcomes. Alarm pulses may repeat only while an alarm is
active. Cue cooldowns and the voice cap prevent a delayed snapshot from
becoming a wall of sound. Existing master, bus, and `M` mute controls remain
available.

The listener and cue positions continue to use authored local ship coordinates
when a cue is spatially meaningful. Zone metadata remains useful for labels
and mix routing, but it never starts ambient playback.

## Verification

`tests/unit/mission-audio.test.ts` verifies the all-zero continuous mix and
uses a fake `AudioContext` that fails if a buffer or buffer source is created.
`tests/unit/soundscape.test.ts` verifies stable zone mapping and silent frames.
The browser seam `data-audio-continuous-sources="0"` is checked by the focused
presentation and portal-pad tests.
