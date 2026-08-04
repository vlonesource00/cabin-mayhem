import { describe, expect, it } from 'vitest';
import { missionCues, missionMix } from '../../src/audio/mission-audio';
import { HostSession } from '../../src/sim/host-session';
import type { MissionState } from '../../src/sim/types';

const clone = (state: MissionState): MissionState => structuredClone(state);
const kinds = (state: MissionState, next: MissionState): string[] =>
  missionCues(state, next, 'crew-alpha').map((cue) => cue.kind);

describe('mission audio projection', () => {
  it('keeps the ground bed quiet and lifts the engine on takeoff', () => {
    const session = new HostSession();
    const ground = missionMix(session.snapshot());
    expect(ground.engine).toBeLessThan(0.2);
    expect(ground.alarm).toBe(0);

    const state = clone(session.snapshot());
    state.voyage.phase = 'takeoff';
    state.voyage.throttle = 1;
    state.voyage.airspeed = 320;
    const climb = missionMix(state);
    expect(climb.engine).toBeGreaterThan(ground.engine);
    expect(climb.wind).toBeCloseTo(1, 5);
  });

  it('clamps every bed to 0..1 under extreme voyage values', () => {
    const state = clone(new HostSession().snapshot());
    state.voyage.airspeed = 4000;
    state.voyage.throttle = 12;
    state.voyage.turbulence = 9;
    state.voyage.airPocket = -7;
    state.fire.status = 'active';
    state.fire.intensity = 5;
    const mix = missionMix(state);
    for (const level of Object.values(mix)) {
      expect(level).toBeGreaterThanOrEqual(0);
      expect(level).toBeLessThanOrEqual(1);
    }
  });

  it('raises the alarm bed while an emergency is unresolved', () => {
    const state = clone(new HostSession().snapshot());
    expect(missionMix(state).alarm).toBe(0);
    state.repair.status = 'active';
    expect(missionMix(state).alarm).toBe(1);
    state.repair.status = 'fixed';
    expect(missionMix(state).alarm).toBe(0);
  });

  it('emits no cues without a previous snapshot', () => {
    expect(missionCues(undefined, new HostSession().snapshot(), 'crew-alpha')).toEqual([]);
  });

  it('derives cues from authoritative deltas rather than event text', () => {
    const previous = new HostSession().snapshot();
    const next = clone(previous);
    next.voyage.phase = 'takeoff';
    next.fire.status = 'active';
    next.repair.status = 'active';
    next.service.served += 2;
    next.service.missed += 1;
    next.events = [];

    expect(kinds(previous, next)).toEqual([
      'phase',
      'fire-start',
      'repair-start',
      'serve-good',
      'serve-good',
      'serve-bad',
    ]);
  });

  it('scales impact loudness with the reported impulse', () => {
    const previous = new HostSession().snapshot();
    const soft = clone(previous);
    soft.cabin.collisionCount += 1;
    soft.cabin.lastImpulse = 1;
    const hard = clone(previous);
    hard.cabin.collisionCount += 1;
    hard.cabin.lastImpulse = 40;

    const softCue = missionCues(previous, soft, 'crew-alpha')[0];
    const hardCue = missionCues(previous, hard, 'crew-alpha')[0];
    expect(softCue?.kind).toBe('impact');
    expect(hardCue?.intensity).toBe(1);
    expect(softCue?.intensity ?? 0).toBeLessThan(hardCue?.intensity ?? 0);
  });

  it('tracks the local player only, so a guest hears its own hands', () => {
    const previous = new HostSession().snapshot();
    const next = clone(previous);
    const bravo = next.cabin.players['crew-bravo'];
    if (bravo) bravo.heldObjectId = 'item-1';

    expect(kinds(previous, next)).toEqual([]);
    expect(missionCues(previous, next, 'crew-bravo').map((cue) => cue.kind)).toEqual(['pickup']);
  });

  it('fires one release cue when the held item leaves the local hands', () => {
    const held = clone(new HostSession().snapshot());
    const alpha = held.cabin.players['crew-alpha'];
    if (alpha) alpha.heldObjectId = 'item-1';
    const empty = clone(held);
    const emptied = empty.cabin.players['crew-alpha'];
    if (emptied) delete emptied.heldObjectId;

    expect(kinds(held, empty)).toEqual(['release']);
  });

  it('stings once when the shift resolves', () => {
    const previous = new HostSession().snapshot();
    const success = clone(previous);
    success.service.outcome = 'success';
    const failed = clone(previous);
    failed.service.outcome = 'failed';

    expect(kinds(previous, success)).toEqual(['shift-success']);
    expect(kinds(previous, failed)).toEqual(['shift-failed']);
    expect(kinds(success, success)).toEqual([]);
  });

  it('treats an air pocket as a rising edge, not a level', () => {
    const previous = new HostSession().snapshot();
    const dropping = clone(previous);
    dropping.voyage.airPocket = -0.8;
    expect(kinds(previous, dropping)).toEqual(['air-pocket']);
    expect(kinds(dropping, dropping)).toEqual([]);
  });
});
