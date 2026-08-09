import { describe, expect, it } from 'vitest';
import { ambientActivitySchema } from '../../src/data/ambient-crowd';
import { ambientActivityClip } from '../../src/three/ambient-crowd-presenter';
import { characterRigId, rigContract } from '../../src/three/animation-contract';

describe('ambient crowd presentation contract', () => {
  it('maps every activity to a Blender-authored character clip', () => {
    const authored = new Set(rigContract(characterRigId).clips.map((clip) => clip.name));
    for (const activity of ambientActivitySchema.options)
      expect(authored.has(ambientActivityClip(activity))).toBe(true);
  });
});
