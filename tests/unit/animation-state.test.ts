import { describe, expect, it } from 'vitest';
import {
  characterRigId,
  firstPersonRigId,
  rigContract,
  type RigContract,
} from '../../src/three/animation-contract';
import {
  crewClips,
  crewMotion,
  crewOneShotClip,
  crewOneShots,
  crewStance,
  firstPersonClip,
  firstPersonOneShotClip,
  passengerAnimationState,
  passengerClip,
  type CrewMotion,
  type CrewOneShot,
  type CrewStance,
  type PassengerAnimationState,
} from '../../src/three/animation-state';
import { HostSession } from '../../src/sim/host-session';
import type { CabinObject, MissionState, ObjectKind, PassengerState } from '../../src/sim/types';

const characters = rigContract(characterRigId);
const arms = rigContract(firstPersonRigId);

const declares = (rig: RigContract, name: string): boolean =>
  rig.clips.some((clip) => clip.name === name);

const base = (): MissionState => structuredClone(new HostSession().snapshot());

const player = (
  state: MissionState,
  over: Partial<MissionState['cabin']['players'][string]> = {},
) => {
  const existing = state.cabin.players['crew-alpha'];
  if (!existing) throw new Error('crew-alpha missing from the snapshot.');
  Object.assign(existing, over);
  return existing;
};

const object = (kind: ObjectKind): CabinObject => ({
  id: `obj-${kind}`,
  name: kind,
  kind,
  material: 'plastic',
  position: { x: 0, y: 0 },
  velocity: { x: 0, y: 0 },
  radius: 0.2,
  mass: 1,
  friction: 0.5,
  impactTolerance: 5,
  secured: false,
  damage: 0,
});

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

const motions: CrewMotion[] = ['idle', 'walk', 'sprint', 'crouch'];
const stances: CrewStance[] = ['none', 'carry', 'push_cart', 'spray', 'repair', 'brace'];
const oneShots: CrewOneShot[] = ['serve', 'recoil', 'throw', 'stumble', 'celebrate'];
const passengerStates: PassengerAnimationState[] = [
  'idle',
  'wave',
  'impatient',
  'frantic',
  'receive',
  'celebrate',
  'slump',
  'panic',
  'brace',
  'turbulence',
];

describe('clip names exist in the rig contract', () => {
  it('covers every crew motion and stance combination', () => {
    for (const motion of motions)
      for (const stance of stances) {
        const selection = crewClips(motion, stance);
        expect(declares(characters, selection.base), `${motion}/${stance} base`).toBe(true);
        if (selection.layer !== undefined)
          expect(declares(characters, selection.layer), `${motion}/${stance} layer`).toBe(true);
      }
  });

  it('covers every passenger state', () => {
    for (const state of passengerStates)
      expect(declares(characters, passengerClip(state)), state).toBe(true);
  });

  it('covers every crew one-shot on both rigs', () => {
    for (const shot of oneShots) {
      expect(declares(characters, crewOneShotClip(shot)), shot).toBe(true);
      expect(declares(arms, firstPersonOneShotClip(shot)), shot).toBe(true);
    }
  });

  it('covers every first-person clip the projection can produce', () => {
    const kinds: ObjectKind[] = [
      'cart',
      'light-case',
      'heavy-crate',
      'toolbox',
      'supply-bin',
      'drink',
      'meal-tray',
      'medkit',
      'extinguisher',
    ];
    const state = base();
    state.fire.status = 'active';
    state.repair.status = 'repairing';
    for (const kind of [undefined, ...kinds]) {
      for (const over of [{}, { braced: true }, { crouched: true }, { velocity: { x: 4, y: 0 } }]) {
        const local = player(base(), over);
        const clip = firstPersonClip(state, local, kind ? object(kind) : undefined);
        expect(declares(arms, clip), `${String(kind)} ${JSON.stringify(over)}`).toBe(true);
      }
    }
  });

  it('declares every layered clip as one the mask can own', () => {
    // Layers are upper-body only, so they must be loops the contract can hold.
    for (const stance of stances) {
      const layer = crewClips('walk', stance).layer;
      if (layer === undefined) continue;
      expect(characters.clips.find((clip) => clip.name === layer)?.loop).toBe(true);
    }
  });
});

describe('crewMotion', () => {
  it('reads standing below the walk threshold', () => {
    expect(crewMotion(player(base(), { velocity: { x: 0.2, y: 0 } }))).toBe('idle');
  });

  it('reads walking and sprinting from planar speed', () => {
    expect(crewMotion(player(base(), { velocity: { x: 1.5, y: 0 } }))).toBe('walk');
    expect(crewMotion(player(base(), { velocity: { x: 3, y: 3 } }))).toBe('sprint');
  });

  it('lets crouch outrank speed', () => {
    expect(crewMotion(player(base(), { crouched: true, velocity: { x: 5, y: 0 } }))).toBe('crouch');
  });
});

describe('crewStance', () => {
  it('ranks brace above every held item', () => {
    const state = base();
    state.fire.status = 'active';
    const local = player(state, { braced: true });
    expect(crewStance(state, local, object('extinguisher'))).toBe('brace');
  });

  it('sprays only while the fire is actually active', () => {
    const state = base();
    const local = player(state);
    state.fire.status = 'dormant';
    expect(crewStance(state, local, object('extinguisher'))).toBe('carry');
    state.fire.status = 'active';
    expect(crewStance(state, local, object('extinguisher'))).toBe('spray');
  });

  it('repairs only while the host reports repairing', () => {
    const state = base();
    const local = player(state);
    state.repair.status = 'active';
    expect(crewStance(state, local, object('toolbox'))).toBe('carry');
    state.repair.status = 'repairing';
    expect(crewStance(state, local, object('toolbox'))).toBe('repair');
  });

  it('falls back to carry and none', () => {
    const state = base();
    const local = player(state);
    expect(crewStance(state, local, object('cart'))).toBe('push_cart');
    expect(crewStance(state, local, object('supply-bin'))).toBe('carry');
    expect(crewStance(state, local, undefined)).toBe('none');
  });
});

describe('crewClips', () => {
  it('swaps the base clip for carry, cart and brace instead of layering', () => {
    expect(crewClips('walk', 'carry')).toEqual({ base: 'carry_walk' });
    expect(crewClips('idle', 'carry')).toEqual({ base: 'carry_idle' });
    expect(crewClips('crouch', 'carry')).toEqual({ base: 'carry_idle' });
    expect(crewClips('sprint', 'push_cart')).toEqual({ base: 'push_cart' });
    expect(crewClips('idle', 'brace')).toEqual({ base: 'brace' });
  });

  it('layers spray and repair over the locomotion clip', () => {
    expect(crewClips('walk', 'spray')).toEqual({ base: 'walk', layer: 'spray' });
    expect(crewClips('crouch', 'repair')).toEqual({ base: 'crouch_idle', layer: 'repair' });
  });

  it('leaves the locomotion clip alone with no stance', () => {
    expect(crewClips('sprint', 'none')).toEqual({ base: 'sprint' });
  });
});

describe('crewOneShots', () => {
  it('emits nothing without a previous snapshot', () => {
    expect(crewOneShots(undefined, base(), 'crew-alpha')).toEqual([]);
  });

  it('emits nothing when the player is absent from either snapshot', () => {
    expect(crewOneShots(base(), base(), 'nobody')).toEqual([]);
  });

  it('reads serve and recoil from the service counters', () => {
    const previous = base();
    const next = structuredClone(previous);
    next.service.served = previous.service.served + 1;
    next.service.missed = previous.service.missed + 1;
    expect(crewOneShots(previous, next, 'crew-alpha')).toEqual(['serve', 'recoil']);
  });

  it('reads a throw from a released item plus a fresh impulse', () => {
    const previous = base();
    player(previous, { heldObjectId: 'obj-drink' });
    const dropped = structuredClone(previous);
    player(dropped, { heldObjectId: undefined });
    dropped.cabin.lastImpulse = 0;
    expect(crewOneShots(previous, dropped, 'crew-alpha')).toEqual([]);
    const thrown = structuredClone(dropped);
    thrown.cabin.lastImpulse = 4;
    expect(crewOneShots(previous, thrown, 'crew-alpha')).toEqual(['throw']);
  });

  it('reads a stumble from the knockdown edge, not the knockdown value', () => {
    const previous = base();
    const next = structuredClone(previous);
    player(next, { knockdown: 0.8 });
    expect(crewOneShots(previous, next, 'crew-alpha')).toEqual(['stumble']);
    const later = structuredClone(next);
    player(later, { knockdown: 0.4 });
    expect(crewOneShots(next, later, 'crew-alpha')).toEqual([]);
  });

  it('celebrates once, on the transition into success', () => {
    const previous = base();
    previous.service.outcome = 'active';
    const won = structuredClone(previous);
    won.service.outcome = 'success';
    expect(crewOneShots(previous, won, 'crew-alpha')).toEqual(['celebrate']);
    expect(crewOneShots(won, structuredClone(won), 'crew-alpha')).toEqual([]);
  });
});

describe('passengerAnimationState', () => {
  const calm = (): MissionState => {
    const state = base();
    state.flight.turbulence = 0;
    return state;
  };

  it('ranks injury above everything', () => {
    const state = calm();
    state.flight.turbulence = 1;
    expect(passengerAnimationState(passenger({ injury: 0.9, panic: 1 }), state, 0)).toBe('slump');
  });

  it('ranks panic above turbulence and requests', () => {
    const state = calm();
    state.flight.turbulence = 1;
    expect(
      passengerAnimationState(passenger({ panic: 0.9, requestStatus: 'active' }), state, 99),
    ).toBe('panic');
  });

  it('splits a fresh delivery by satisfaction', () => {
    const state = calm();
    const served = passenger({ requestStatus: 'served', satisfaction: 0.9 });
    expect(passengerAnimationState(served, state, 0.2)).toBe('celebrate');
    expect(passengerAnimationState({ ...served, satisfaction: 0.3 }, state, 0.2)).toBe('receive');
  });

  it('lets a stale delivery fall back to idle', () => {
    const state = calm();
    const served = passenger({ requestStatus: 'served', satisfaction: 0.9 });
    expect(passengerAnimationState(served, state, 30)).toBe('idle');
  });

  it('separates bracing turbulence from mild turbulence', () => {
    const state = calm();
    state.flight.turbulence = 0.5;
    expect(passengerAnimationState(passenger(), state, 99)).toBe('brace');
    state.flight.turbulence = 0.25;
    expect(passengerAnimationState(passenger(), state, 99)).toBe('turbulence');
  });

  it('escalates an unanswered request as patience drains', () => {
    const state = calm();
    const waiting = (patience: number): PassengerState =>
      passenger({ requestStatus: 'active', patience });
    expect(passengerAnimationState(waiting(0.9), state, 99)).toBe('wave');
    expect(passengerAnimationState(waiting(0.4), state, 99)).toBe('impatient');
    expect(passengerAnimationState(waiting(0.1), state, 99)).toBe('frantic');
  });

  it('sits still when nothing is happening', () => {
    expect(passengerAnimationState(passenger(), calm(), 99)).toBe('idle');
  });
});

describe('firstPersonClip', () => {
  it('prefers the stance clip over the carry clip', () => {
    const state = base();
    state.fire.status = 'active';
    expect(firstPersonClip(state, player(state), object('extinguisher'))).toBe('fp_spray');
  });

  it('maps each service item to its own carry pose', () => {
    const state = base();
    const local = player(state);
    expect(firstPersonClip(state, local, object('drink'))).toBe('fp_carry_drink');
    expect(firstPersonClip(state, local, object('meal-tray'))).toBe('fp_carry_meal');
    expect(firstPersonClip(state, local, object('medkit'))).toBe('fp_carry_medical');
  });

  it('falls back to the drink pose for uncategorised props', () => {
    const state = base();
    expect(firstPersonClip(state, player(state), object('heavy-crate'))).toBe('fp_carry_drink');
  });

  it('reads locomotion with empty hands', () => {
    const state = base();
    expect(firstPersonClip(state, player(state, { velocity: { x: 0, y: 0 } }), undefined)).toBe(
      'fp_idle',
    );
    expect(firstPersonClip(state, player(state, { velocity: { x: 1.2, y: 0 } }), undefined)).toBe(
      'fp_walk',
    );
    expect(firstPersonClip(state, player(state, { velocity: { x: 4, y: 0 } }), undefined)).toBe(
      'fp_sprint',
    );
  });
});
