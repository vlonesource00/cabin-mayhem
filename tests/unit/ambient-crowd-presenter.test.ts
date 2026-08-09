import { describe, expect, it } from 'vitest';
import { ambientActivitySchema, ambientArchetypes } from '../../src/data/ambient-crowd';
import { createAmbientCrowdState } from '../../src/sim/ambient-crowd';
import { ambientActivityClip } from '../../src/three/ambient-crowd-presenter';
import {
  ambientPresentationFor,
  ambientSeatAnchor,
  isAmbientSeatedActivity,
} from '../../src/three/ambient-npc-animation';
import { ambientArchetypeFor } from '../../src/three/ambient-npc-style';
import { characterRigId, rigContract } from '../../src/three/animation-contract';

describe('ambient crowd presentation contract', () => {
  it('maps every activity to a Blender-authored character clip', () => {
    const authored = new Set(rigContract(characterRigId).clips.map((clip) => clip.name));
    for (const activity of ambientActivitySchema.options)
      expect(authored.has(ambientActivityClip(activity))).toBe(true);
  });

  it('derives several stable passenger archetypes from resident ids', () => {
    const residents = Object.values(createAmbientCrowdState(101).residents);
    const first = residents.map((resident) => ambientArchetypeFor(resident.id));
    const second = residents.map((resident) => ambientArchetypeFor(resident.id));

    expect(ambientArchetypes).toHaveLength(6);
    expect(first).toEqual(second);
    expect(new Set(first.map((style) => style.id)).size).toBeGreaterThanOrEqual(4);
    expect(new Set(first.map((style) => style.palette.shirt)).size).toBeGreaterThanOrEqual(4);
  });

  it('keeps seated roots on a stable surface contact contract', () => {
    const resident = Object.values(createAmbientCrowdState(202).residents).find(
      (candidate) => candidate.activity === 'dining',
    );
    expect(resident).toBeDefined();
    if (!resident) return;

    const style = ambientArchetypeFor(resident.id);
    const first = ambientSeatAnchor(resident, style);
    const second = ambientSeatAnchor(resident, style);

    expect(second).toEqual(first);
    expect(first.position).toEqual(resident.position);
    expect(first.rootHeight + first.footContactHeight).toBeCloseTo(first.surfaceHeight);
    expect(first.pelvisDrop).toBe(style.seat.pelvisDrop);
  });

  it('selects seated and non-seated presentation states without inventing assets', () => {
    const resident = Object.values(createAmbientCrowdState(303).residents)[0]!;
    const style = ambientArchetypeFor(resident.id);
    const authored = new Set(rigContract(characterRigId).clips.map((clip) => clip.name));
    const modes = new Set<string>();

    for (const activity of ambientActivitySchema.options) {
      const presentation = ambientPresentationFor({ ...resident, activity }, style);
      modes.add(presentation.mode);
      expect(authored.has(presentation.clip)).toBe(true);
      expect(presentation.rootHeight).toBe(
        isAmbientSeatedActivity(activity) ? presentation.seat?.rootHeight : presentation.rootHeight,
      );
    }

    expect(modes).toEqual(new Set(['standing', 'seated', 'swimming']));
  });

  it('varies authored seated clips deterministically by resident', () => {
    const resident = Object.values(createAmbientCrowdState(404).residents)[0]!;
    const style = ambientArchetypeFor(resident.id);
    const clips = ['guest-seat-a', 'guest-seat-b', 'guest-seat-c', 'guest-seat-d'].map(
      (id) => ambientPresentationFor({ ...resident, id, activity: 'dining' }, style).clip,
    );

    expect(new Set(clips).size).toBeGreaterThan(1);
  });
});
