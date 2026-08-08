import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { compartmentById } from '../../src/data/ship-layout';
import { SpectatorCamera } from '../../src/three/spectator-camera';
import { renderToShip } from '../../src/three/coordinates';

const still = { move: { x: 0, y: 0 }, vertical: 0, sprint: false };

function camera(): THREE.PerspectiveCamera {
  return new THREE.PerspectiveCamera(72, 1, 0.05, 2400);
}

/** Run the camera long enough that the exponential approach has settled. */
function fly(
  free: SpectatorCamera,
  view: THREE.PerspectiveCamera,
  input: Parameters<SpectatorCamera['update']>[1],
  seconds: number,
  originId: string,
  yaw = 0,
  pitch = 0,
): void {
  const step = 1 / 60;
  for (let elapsed = 0; elapsed < seconds; elapsed += step)
    free.update(view, input, yaw, pitch, step, originId);
}

describe('spectator camera', () => {
  it('takes over exactly where the first-person camera stood', () => {
    const free = new SpectatorCamera();
    const view = camera();
    view.position.set(3, 1.68, -7);

    free.enterFrom(view, 'atrium');

    const anchor = compartmentById('atrium')!.anchor;
    const at = free.shipPosition();
    expect(at.x).toBeCloseTo(3 + anchor.x);
    expect(at.y).toBeCloseTo(1.68 + anchor.y);
    expect(at.z).toBeCloseTo(-7 + anchor.z);
  });

  it('holds its place in ship space when the render origin moves', () => {
    const free = new SpectatorCamera();
    const view = camera();
    view.position.set(0, 0, 0);
    free.enterFrom(view, 'atrium');
    const parked = free.shipPosition();

    // The crew below walk from the atrium to the bridge: the render origin
    // changes, so the same ship-space point must render somewhere else.
    fly(free, view, still, 0.5, 'bridge');

    expect(free.shipPosition().x).toBeCloseTo(parked.x);
    expect(free.shipPosition().y).toBeCloseTo(parked.y);
    expect(free.shipPosition().z).toBeCloseTo(parked.z);
    expect(renderToShip(view.position, 'bridge').z).toBeCloseTo(parked.z);
  });

  it('flies where the camera points, pitch included', () => {
    const free = new SpectatorCamera();
    const view = camera();
    free.enterFrom(view, 'atrium');

    // Yaw 0 looks down -Z; pitched down 45 degrees, forward must descend.
    fly(
      free,
      view,
      { move: { x: 0, y: -1 }, vertical: 0, sprint: false },
      2,
      'atrium',
      0,
      -Math.PI / 4,
    );

    const at = free.shipPosition();
    const anchor = compartmentById('atrium')!.anchor;
    expect(at.z).toBeLessThan(anchor.z - 10);
    expect(at.y).toBeLessThan(anchor.y - 10);
    expect(at.x).toBeCloseTo(anchor.x, 3);
  });

  it('rises on world-up however the camera is tilted', () => {
    const free = new SpectatorCamera();
    const view = camera();
    free.enterFrom(view, 'atrium');
    const anchor = compartmentById('atrium')!.anchor;

    fly(free, view, { move: { x: 0, y: 0 }, vertical: 1, sprint: false }, 2, 'atrium', 1.1, -1.2);

    const at = free.shipPosition();
    expect(at.y).toBeGreaterThan(anchor.y + 20);
    expect(at.x).toBeCloseTo(anchor.x, 3);
    expect(at.z).toBeCloseTo(anchor.z, 3);
  });

  it('sprints far enough to cross the ship in a few seconds', () => {
    const forward = { move: { x: 0, y: -1 }, vertical: 0, sprint: false };
    const boosted = { ...forward, sprint: true };

    const walk = new SpectatorCamera();
    const walkView = camera();
    walk.enterFrom(walkView, 'atrium');
    fly(walk, walkView, forward, 4, 'atrium');

    const run = new SpectatorCamera();
    const runView = camera();
    run.enterFrom(runView, 'atrium');
    fly(run, runView, boosted, 4, 'atrium');

    const anchor = compartmentById('atrium')!.anchor;
    const walked = anchor.z - walk.shipPosition().z;
    const ran = anchor.z - run.shipPosition().z;
    expect(walked).toBeGreaterThan(50);
    // 290 m LOA: a sprint has to clear the whole hull inside four seconds.
    expect(ran).toBeGreaterThan(290);
    expect(ran / walked).toBeGreaterThan(4);
  });

  it('settles to a stop when the sticks are released', () => {
    const free = new SpectatorCamera();
    const view = camera();
    free.enterFrom(view, 'atrium');
    fly(free, view, { move: { x: 0, y: -1 }, vertical: 0, sprint: true }, 2, 'atrium');
    const moving = free.shipPosition().z;

    fly(free, view, still, 0.5, 'atrium');
    const coasted = free.shipPosition().z;
    fly(free, view, still, 2, 'atrium');

    // It coasts — a hard cut at 80 m/s reads as a bug — but the coast is over
    // within half a second, and what follows is drift measured in centimetres.
    expect(moving - coasted).toBeGreaterThan(3);
    expect(Math.abs(free.shipPosition().z - coasted)).toBeLessThan(0.25);
  });
});
