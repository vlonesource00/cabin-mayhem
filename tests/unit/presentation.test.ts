import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  RoundedFirstPersonFallback,
  installRoundedFirstPersonVisual,
} from '../../src/three/rounded-first-person-rig';
import {
  buildPresentationLighting,
  presentationLightingBudget,
} from '../../src/three/presentation-lighting';

function firstPersonRigFixture(): { root: THREE.Group; source: THREE.Mesh } {
  const root = new THREE.Group();
  root.name = 'CM_FPARMS_ROOT';
  const armRoot = new THREE.Bone();
  armRoot.name = 'fp_root';
  root.add(armRoot);

  for (const side of ['R', 'L'] as const) {
    const sign = side === 'R' ? 1 : -1;
    const upper = new THREE.Bone();
    upper.name = `fp_upperArm.${side}`;
    upper.position.set(sign * 0.23, 0.02, -0.3);
    const forearm = new THREE.Bone();
    forearm.name = `fp_forearm.${side}`;
    forearm.position.set(-sign * 0.02, 0.23, 0.05);
    const hand = new THREE.Bone();
    hand.name = `fp_hand.${side}`;
    hand.position.set(-sign * 0.03, 0.22, 0.06);
    forearm.add(hand);
    upper.add(forearm);
    armRoot.add(upper);
  }

  const source = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.4, 0.2));
  source.name = 'CM_FP_ARMS';
  root.add(source);
  return { root, source };
}

describe('rounded first-person presentation', () => {
  it('replaces only source arm mesh while preserving animated bones and hand sockets', () => {
    const fixture = firstPersonRigFixture();
    const installed = installRoundedFirstPersonVisual(fixture.root);

    expect(installed?.meshCount).toBeGreaterThanOrEqual(10);
    expect(fixture.source.visible).toBe(false);
    expect(fixture.root.userData.presentationArms).toBe('rounded');
    expect(fixture.root.getObjectByName('fp_hand_socket.R')?.userData.side).toBe('R');
    expect(fixture.root.getObjectByName('fp_hand_socket.L')?.userData.side).toBe('L');

    const roundedMeshes: THREE.Mesh[] = [];
    fixture.root.traverse((entry) => {
      if (
        entry instanceof THREE.Mesh &&
        entry.userData.presentation === 'rounded-first-person-arms'
      )
        roundedMeshes.push(entry);
    });
    expect(roundedMeshes.some((mesh) => mesh.geometry.type === 'CapsuleGeometry')).toBe(true);
    expect(roundedMeshes.some((mesh) => mesh.geometry.type === 'SphereGeometry')).toBe(true);
  });

  it('keeps a rounded, animated-by-pose fallback when authored assets fail', () => {
    const fallback = new RoundedFirstPersonFallback();
    const before = fallback.root.position.y;
    fallback.update(0.6, { push: -0.1, lift: 0.04, roll: 0.2, pitch: -0.15 }, 0.8);

    expect(fallback.root.userData.presentationArms).toBe('rounded-fallback');
    expect(fallback.handSocket('R').userData.presentation).toBe('hand-tool-socket');
    expect(fallback.handSocket('L').userData.presentation).toBe('hand-tool-socket');
    expect(fallback.root.position.y).not.toBe(before);
  });
});

describe('bounded presentation lighting', () => {
  it('uses one shadow key and a fixed non-shadowing zone budget', () => {
    const scene = new THREE.Scene();
    const cabin = new THREE.Group();
    const lighting = buildPresentationLighting(scene, cabin);

    expect(lighting.zoneLights.length).toBeLessThanOrEqual(
      presentationLightingBudget.maxZoneLights,
    );
    expect(lighting.zoneLights.every((light) => !light.castShadow)).toBe(true);
    expect(lighting.key.castShadow).toBe(true);
    expect(lighting.key.shadow.mapSize.x).toBe(presentationLightingBudget.shadowMapSize);
    expect(lighting.key.shadow.normalBias).toBeGreaterThan(0);
    expect(lighting.rim.intensity).toBeGreaterThan(0);

    lighting.updateElectrical(0.35, true, 1.2);
    expect(lighting.zoneLights.every((light) => light.intensity >= 0)).toBe(true);
  });
});
