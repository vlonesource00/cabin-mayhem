import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ambientActivitySchema, ambientArchetypes } from '../../src/data/ambient-crowd';
import { createAmbientCrowdState } from '../../src/sim/ambient-crowd';
import {
  AMBIENT_FADE_MAX_SECONDS,
  AMBIENT_FADE_MIN_SECONDS,
  AMBIENT_MAX_VISIBLE_RESIDENTS,
  AmbientCrowdPresenter,
  ambientActivityClip,
} from '../../src/three/ambient-crowd-presenter';
import {
  ambientPresentationFor,
  ambientSeatAnchor,
  ambientTaskFor,
  isAmbientSeatedActivity,
} from '../../src/three/ambient-npc-animation';
import { ambientArchetypeFor } from '../../src/three/ambient-npc-style';
import { characterRigId, rigContract } from '../../src/three/animation-contract';
import type { LoadedRig } from '../../src/three/animated-rig';

const characters = rigContract(characterRigId);

const testRig = (): LoadedRig => {
  const scene = new THREE.Group();
  const root = new THREE.Group();
  root.name = characters.rootNode;
  const head = new THREE.Bone();
  head.name = 'head';
  root.add(head);
  const passenger = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 1.8, 0.5),
    new THREE.MeshStandardMaterial(),
  );
  passenger.name = 'CM_PASSENGER';
  root.add(passenger);
  scene.add(root);
  const clips = new Map(
    characters.clips.map(({ name }) => [name, new THREE.AnimationClip(name, 1)] as const),
  );
  return { contract: characters, scene, clips };
};

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
      expect(ambientTaskFor({ ...resident, activity })).toBe(presentation.task);
      expect(presentation.rootHeight).toBe(
        isAmbientSeatedActivity(activity) ? presentation.seat?.rootHeight : presentation.rootHeight,
      );
      expect(Number.isFinite(presentation.rootHeight)).toBe(true);
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

  it('keeps resident metrics deterministic while culling distant compartments', () => {
    const state = createAmbientCrowdState(505);
    const presenter = new AmbientCrowdPresenter();
    presenter.setRig(testRig());
    presenter.sync(state, 'atrium');

    const metrics = presenter.metrics();
    expect(metrics.residentCount).toBe(78);
    expect(metrics.visibleCount).toBeLessThanOrEqual(AMBIENT_MAX_VISIBLE_RESIDENTS);
    expect(metrics.visibleCount).toBeGreaterThan(0);
    expect(metrics.fadingCount).toBe(metrics.visibleCount);
    expect(Object.values(metrics.taskCounts).reduce((sum, count) => sum + count, 0)).toBe(78);
    for (const root of presenter.group.children) {
      expect(root.userData.residentId).toBeTruthy();
      expect(root.userData.ambientArchetype).toBeTruthy();
      expect(root.userData.ambientTask).toBeTruthy();
      expect(root.userData.ambientFadeDurationMs).toBeGreaterThanOrEqual(
        AMBIENT_FADE_MIN_SECONDS * 1000,
      );
      expect(root.userData.ambientFadeDurationMs).toBeLessThanOrEqual(
        AMBIENT_FADE_MAX_SECONDS * 1000,
      );
    }

    presenter.update(0.05);
    expect(presenter.metrics().fadingCount).toBeGreaterThanOrEqual(0);
    presenter.dispose();
  });

  it('fades residents across compartment travel instead of clearing them', () => {
    const state = createAmbientCrowdState(606);
    const presenter = new AmbientCrowdPresenter();
    presenter.setRig(testRig());
    presenter.sync(state, 'atrium');
    for (let tick = 0; tick < 12; tick += 1) presenter.update(0.05);

    const oldRoot = presenter.group.children.find(
      (root) => root.userData.residentId === 'guest-001',
    );
    expect(oldRoot).toBeDefined();
    expect(presenter.metrics().fadingCount).toBe(0);

    presenter.sync(state, 'bridge');
    expect(presenter.group.children.length).toBeGreaterThan(0);
    expect(presenter.metrics().fadingCount).toBeGreaterThan(0);
    expect(oldRoot?.userData.ambientFadeState).toBe('fading-out');

    for (let tick = 0; tick < 10; tick += 1) presenter.update(0.05);
    expect(oldRoot && presenter.group.children.includes(oldRoot)).toBe(false);
    expect(presenter.metrics().fadingCount).toBe(0);
    presenter.dispose();
  });

  it('caps total rigs while admitting destination residents during a fade', () => {
    const state = createAmbientCrowdState(616);
    const presenter = new AmbientCrowdPresenter();
    presenter.setRig(testRig());
    presenter.sync(state, 'bridge');
    for (let tick = 0; tick < 12; tick += 1) presenter.update(0.05);

    const outgoingIds = new Set(
      presenter.group.children.map((root) => root.userData.residentId as string),
    );
    expect(outgoingIds.size).toBeGreaterThan(0);
    expect(outgoingIds.size).toBeLessThan(AMBIENT_MAX_VISIBLE_RESIDENTS);

    presenter.sync(state, 'cabin-deck-four');
    expect(presenter.group.children.length).toBeLessThanOrEqual(AMBIENT_MAX_VISIBLE_RESIDENTS);
    expect(presenter.visibleCount()).toBeLessThanOrEqual(AMBIENT_MAX_VISIBLE_RESIDENTS);
    expect(presenter.metrics().fadingCount).toBeGreaterThan(0);
    expect(
      presenter.group.children.some((root) => !outgoingIds.has(root.userData.residentId as string)),
    ).toBe(true);

    for (let tick = 0; tick < 12; tick += 1) {
      presenter.update(0.05);
      presenter.sync(state, 'cabin-deck-four');
      expect(presenter.group.children.length).toBeLessThanOrEqual(AMBIENT_MAX_VISIBLE_RESIDENTS);
      expect(presenter.visibleCount()).toBeLessThanOrEqual(AMBIENT_MAX_VISIBLE_RESIDENTS);
    }
    presenter.dispose();
  });

  it('fails closed on invalid resident bounds and preserves evacuation task clip', () => {
    const state = createAmbientCrowdState(707);
    const resident = state.residents['guest-001']!;
    resident.position.x = Number.NaN;
    const presenter = new AmbientCrowdPresenter();
    presenter.setRig(testRig());
    presenter.sync(state, 'atrium');
    expect(presenter.group.children.some((root) => root.userData.residentId === resident.id)).toBe(
      false,
    );
    presenter.dispose();

    const evacuating = { ...resident, position: { x: 2, y: 2 }, activity: 'evacuating' as const };
    const style = ambientArchetypeFor(evacuating.id);
    const presentation = ambientPresentationFor(evacuating, style);
    expect(presentation.task).toBe('evacuate');
    expect(presentation.clip).toBe('sprint');
    expect(characters.clips.some((clip) => clip.name === presentation.clip)).toBe(true);
  });
});
