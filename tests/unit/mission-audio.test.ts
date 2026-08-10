import { describe, expect, it, vi } from 'vitest';
import { CabinAudio } from '../../src/audio/cabin-audio';
import { missionCues, missionMix } from '../../src/audio/mission-audio';
import { HostSession } from '../../src/sim/host-session';
import type { MissionState } from '../../src/sim/types';

const clone = (state: MissionState): MissionState => structuredClone(state);
const kinds = (state: MissionState, next: MissionState): string[] =>
  missionCues(state, next, 'crew-alpha').map((cue) => cue.kind);

describe('mission audio projection', () => {
  it('builds no ambient buffers or continuous sources after resume', () => {
    let bufferCalls = 0;
    let bufferSourceCalls = 0;
    const listener = {
      positionX: { setTargetAtTime: vi.fn() },
      positionY: { setTargetAtTime: vi.fn() },
      positionZ: { setTargetAtTime: vi.fn() },
      setPosition: vi.fn(),
    };
    class SilentAudioContext {
      public readonly currentTime = 0;
      public readonly destination = {};
      public readonly listener = listener;
      public createGain(): unknown {
        return {
          connect: vi.fn(),
          gain: { value: 0, setTargetAtTime: vi.fn() },
        };
      }
      public createDynamicsCompressor(): unknown {
        return {
          connect: vi.fn(),
          threshold: { value: 0 },
          knee: { value: 0 },
          ratio: { value: 0 },
          attack: { value: 0 },
          release: { value: 0 },
        };
      }
      public createBuffer(): never {
        bufferCalls += 1;
        throw new Error('ambient buffers are forbidden');
      }
      public createBufferSource(): never {
        bufferSourceCalls += 1;
        throw new Error('ambient buffer sources are forbidden');
      }
      public resume(): Promise<void> {
        return Promise.resolve();
      }
      public close(): Promise<void> {
        return Promise.resolve();
      }
    }

    vi.stubGlobal('AudioContext', SilentAudioContext);
    const audio = new CabinAudio();
    const state = new HostSession().snapshot();
    const localPlayer = state.cabin.players['crew-alpha'];
    if (!localPlayer) throw new Error('local player missing from test snapshot');
    localPlayer.position = { x: 12.5, y: -7.25 };
    audio.resume();
    audio.update(state, 'crew-alpha');

    expect(bufferCalls).toBe(0);
    expect(bufferSourceCalls).toBe(0);
    expect(audio.continuousSourceCount()).toBe(0);
    expect(listener.positionX.setTargetAtTime).toHaveBeenLastCalledWith(12.5, 0, 0.05);
    expect(listener.positionY.setTargetAtTime).toHaveBeenLastCalledWith(1.6, 0, 0.05);
    expect(listener.positionZ.setTargetAtTime).toHaveBeenLastCalledWith(-7.25, 0, 0.05);
    expect(listener.setPosition).not.toHaveBeenCalled();
    audio.dispose();
    vi.unstubAllGlobals();
  });

  it('keeps every continuous mission bed silent in every voyage phase', () => {
    const session = new HostSession();
    const moored = missionMix(session.snapshot());

    const state = clone(session.snapshot());
    state.voyage.phase = 'departure';
    state.voyage.telegraph = 1;
    state.voyage.speed = 24;
    const under = missionMix(state);
    expect(Object.values(moored)).toEqual([0, 0, 0, 0, 0]);
    expect(Object.values(under)).toEqual([0, 0, 0, 0, 0]);
  });

  it('keeps the compatibility mix shape bounded under extreme voyage values', () => {
    const state = clone(new HostSession().snapshot());
    state.voyage.speed = 4000;
    state.voyage.telegraph = 12;
    state.voyage.turbulence = 9;
    state.voyage.airPocket = -7;
    state.fire.status = 'active';
    state.fire.intensity = 5;
    const mix = missionMix(state);
    for (const level of Object.values(mix)) {
      expect(level).toBeGreaterThanOrEqual(0);
      expect(level).toBeLessThanOrEqual(1);
    }
    expect(mix).toEqual({ engine: 0, wind: 0, rumble: 0, fire: 0, alarm: 0 });
  });

  it('does not turn alarms into a continuous bed', () => {
    const state = clone(new HostSession().snapshot());
    expect(missionMix(state).alarm).toBe(0);
    state.repair.status = 'active';
    expect(missionMix(state).alarm).toBe(0);
    state.repair.status = 'fixed';
    expect(missionMix(state).alarm).toBe(0);
  });

  it('emits no cues without a previous snapshot', () => {
    expect(missionCues(undefined, new HostSession().snapshot(), 'crew-alpha')).toEqual([]);
  });

  it('derives cues from authoritative deltas rather than event text', () => {
    const previous = new HostSession().snapshot();
    const next = clone(previous);
    next.voyage.phase = 'departure';
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

  it('raises alarms for navigation and boarding threats', () => {
    const state = clone(new HostSession().snapshot());
    expect(missionMix(state).alarm).toBe(0);
    state.navigation.phase = 'warning';
    expect(missionMix(state).alarm).toBe(0);
    state.navigation.phase = 'idle';
    state.invasion.phase = 'approach';
    expect(missionMix(state).alarm).toBe(0);
  });

  it('derives movement, door, interaction, navigation and boarding cues from state deltas', () => {
    const previous = new HostSession().snapshot();
    const next = clone(previous);
    const player = next.cabin.players['crew-alpha'];
    if (!player) throw new Error('local player missing from test snapshot');
    player.velocity = { x: 2, y: 0 };
    player.compartmentId = 'bridge';
    player.lastAction = 'Holding toolbox';
    next.navigation.phase = 'warning';
    next.invasion.phase = 'warning';

    expect(kinds(previous, next)).toEqual(
      expect.arrayContaining([
        'movement-start',
        'door',
        'interaction',
        'navigation-warning',
        'boarding-warning',
      ]),
    );
    expect(kinds(next, next)).toEqual([]);
  });

  it('caps counter-derived service cues so delayed snapshots do not spam voices', () => {
    const previous = new HostSession().snapshot();
    const next = clone(previous);
    next.service.served += 20;
    next.service.missed += 20;
    const emitted = missionCues(previous, next, 'crew-alpha').map((cue) => cue.kind);
    expect(emitted.filter((kind) => kind === 'serve-good')).toHaveLength(2);
    expect(emitted.filter((kind) => kind === 'serve-bad')).toHaveLength(2);
  });
});
