import { describe, expect, it } from 'vitest';
import {
  soundscapeForState,
  soundscapeTransition,
  zoneForCompartment,
} from '../../src/audio/soundscape';
import { HostSession } from '../../src/sim/host-session';
import type { MissionState } from '../../src/sim/types';

const clone = (state: MissionState): MissionState => structuredClone(state);

describe('contextual ship soundscape', () => {
  it('maps authored compartments to stable acoustic zones', () => {
    expect(zoneForCompartment('main-galley')).toBe('galley');
    expect(zoneForCompartment('bridge')).toBe('bridge');
    expect(zoneForCompartment('stairwell-fwd')).toBe('stairwell');
    expect(zoneForCompartment('sun-deck')).toBe('exterior');
    expect(zoneForCompartment('unrecognised-compartment')).toBe('corridor');
  });

  it('emits one deterministic transition when the local player crosses zones', () => {
    const previous = new HostSession().snapshot();
    const next = clone(previous);
    const player = next.cabin.players['crew-alpha'];
    if (!player) throw new Error('local player missing from test snapshot');
    player.compartmentId = 'bridge';

    expect(soundscapeTransition(previous, next, 'crew-alpha')).toEqual({
      from: zoneForCompartment(previous.cabin.players['crew-alpha']?.compartmentId),
      to: 'bridge',
    });
    expect(soundscapeTransition(next, next, 'crew-alpha')).toBeUndefined();
  });

  it('keeps public ambience silent during evacuation and ordinary cruise', () => {
    const normal = new HostSession().snapshot();
    const evacuated = clone(normal);
    const player = evacuated.cabin.players['crew-alpha'];
    if (!player) throw new Error('local player missing from test snapshot');
    player.compartmentId = 'atrium';
    evacuated.crowd.evacuating = true;

    expect(soundscapeForState(evacuated, 'crew-alpha').level).toBe(0);
    expect(soundscapeForState(normal, 'crew-alpha').level).toBe(0);
    expect(soundscapeForState(evacuated, 'crew-alpha').profile.level).toBe(0);
  });
});
