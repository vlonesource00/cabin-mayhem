import { describe, expect, it } from 'vitest';
import {
  GesturePlayer,
  gestureDuration,
  handGestures,
  passengerPose,
  reactionSeconds,
  restPose,
} from '../../src/three/interaction-animation';
import { HostSession } from '../../src/sim/host-session';
import type { MissionState, PassengerState } from '../../src/sim/types';

const clone = (state: MissionState): MissionState => structuredClone(state);

const base = (): MissionState => new HostSession().snapshot();

const passenger = (over: Partial<PassengerState> = {}): PassengerState => ({
  id: 'p1',
  name: 'Row 3 Aisle',
  seatPosition: { x: 6, y: 2 },
  servicePosition: { x: 6, y: 2 },
  color: '#ff8a3d',
  need: 'drink',
  requestAt: 4,
  requestStatus: 'pending',
  patience: 1,
  panic: 0,
  injury: 0,
  satisfaction: 1,
  ...over,
});

describe('handGestures', () => {
  it('emits nothing without a previous snapshot', () => {
    expect(handGestures(undefined, base(), 'crew-alpha')).toEqual([]);
  });

  it('reads grab and stow from the held object delta', () => {
    const previous = base();
    const holding = clone(previous);
    holding.cabin.players['crew-alpha']!.heldObjectId = 'obj-1';
    expect(handGestures(previous, holding, 'crew-alpha')).toEqual(['grab']);
    const empty = clone(previous);
    expect(handGestures(holding, empty, 'crew-alpha')).toEqual(['stow']);
  });

  it('reads a serve from the served counter, not from event text', () => {
    const previous = base();
    const next = clone(previous);
    next.service.served += 1;
    next.events = [];
    expect(handGestures(previous, next, 'crew-alpha')).toEqual(['serve']);
  });

  it('only rejects while the local player is holding something', () => {
    const previous = base();
    const emptyHanded = clone(previous);
    emptyHanded.service.missed += 1;
    expect(handGestures(previous, emptyHanded, 'crew-alpha')).toEqual([]);
    const holding = clone(previous);
    holding.service.missed += 1;
    holding.cabin.players['crew-alpha']!.heldObjectId = 'obj-1';
    expect(handGestures(previous, holding, 'crew-alpha')).toEqual(['grab', 'reject']);
  });

  it('scopes the held-item delta to the local player', () => {
    const previous = base();
    const next = clone(previous);
    const bravo = next.cabin.players['crew-bravo'];
    if (bravo) bravo.heldObjectId = 'obj-1';
    expect(handGestures(previous, next, 'crew-alpha')).toEqual([]);
  });
});

describe('GesturePlayer', () => {
  it('rests when no gesture is active and no tool is held', () => {
    const player = new GesturePlayer();
    expect(player.pose(base(), false, 0)).toEqual(restPose);
  });

  it('returns to rest once the gesture duration elapses', () => {
    const player = new GesturePlayer();
    player.push(['serve'], 0);
    const mid = player.pose(base(), false, gestureDuration('serve') / 2);
    expect(mid.push).toBeLessThan(-0.2);
    expect(player.pose(base(), false, gestureDuration('serve') + 0.01)).toEqual(restPose);
  });

  it('bounds how many gestures can stack', () => {
    const player = new GesturePlayer();
    player.push(['serve', 'serve', 'serve', 'serve', 'serve'], 0);
    const pose = player.pose(base(), false, 0.2);
    // Five simultaneous serves would exceed the five-times single-gesture reach.
    expect(Math.abs(pose.push)).toBeLessThan(0.34 * 4);
  });

  it('adds a sustained twist while the host is running a repair hold', () => {
    const state = base();
    state.repair.status = 'repairing';
    const player = new GesturePlayer();
    const withTool = player.pose(state, true, 1.1);
    const withoutTool = player.pose(state, false, 1.1);
    expect(withoutTool).toEqual(restPose);
    expect(withTool.roll).not.toBe(0);
  });
});

describe('passengerPose', () => {
  it('waves harder as patience drops', () => {
    const calm = passengerPose(passenger({ requestStatus: 'active', patience: 1 }), 0, 99);
    const desperate = passengerPose(passenger({ requestStatus: 'active', patience: 0 }), 0, 99);
    expect(desperate.armLift).toBeGreaterThan(calm.armLift);
  });

  it('celebrates a fresh serve and settles afterwards', () => {
    const fresh = passengerPose(passenger({ requestStatus: 'served' }), 0, 0.2);
    expect(fresh.armLift).toBeGreaterThan(0.5);
    const settled = passengerPose(passenger({ requestStatus: 'served' }), 0, reactionSeconds + 1);
    expect(settled).toEqual({ bob: 0, lean: 0, armLift: 0 });
  });

  it('slumps forward on a missed request and never raises an arm', () => {
    const pose = passengerPose(passenger({ requestStatus: 'missed' }), 0, 0.1);
    expect(pose.lean).toBeGreaterThan(0);
    expect(pose.armLift).toBe(0);
  });
});
