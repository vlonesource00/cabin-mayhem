import { describe, expect, it } from 'vitest';
import {
  audioBusCeilings,
  audioBusLevel,
  audioBusNames,
  clampAudioVolume,
  defaultAudioBusVolumes,
  effectiveMasterGain,
} from '../../src/audio/audio-mix';

describe('audio mix controls', () => {
  it('clamps unsafe volume input and makes mute a zero-gain fade target', () => {
    expect(clampAudioVolume(-1)).toBe(0);
    expect(clampAudioVolume(1.5)).toBe(1);
    expect(clampAudioVolume(Number.NaN)).toBe(0);
    expect(effectiveMasterGain(0.7, true)).toBeCloseTo(0.7);
    expect(effectiveMasterGain(0.7, false)).toBe(0);
  });

  it('keeps default bus output below each conservative ceiling', () => {
    for (const bus of audioBusNames) {
      expect(audioBusLevel(bus, defaultAudioBusVolumes[bus])).toBeLessThanOrEqual(
        audioBusCeilings[bus],
      );
      expect(audioBusLevel(bus, defaultAudioBusVolumes[bus])).toBeLessThan(1);
    }
  });
});
