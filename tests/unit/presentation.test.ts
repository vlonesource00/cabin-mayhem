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
import { cabinDepthContract } from '../../src/three/cabin-world';

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

function presentationMeshes(root: THREE.Object3D): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  root.traverse((entry) => {
    if (entry instanceof THREE.Mesh && entry.userData.presentation === 'rounded-first-person-arms')
      meshes.push(entry);
  });
  return meshes;
}

describe('rounded first-person presentation', () => {
  it('replaces only source arm mesh while preserving animated bones and hand sockets', () => {
    const fixture = firstPersonRigFixture();
    const installed = installRoundedFirstPersonVisual(fixture.root);

    expect(installed?.meshCount).toBeGreaterThanOrEqual(10);
    expect(fixture.source.visible).toBe(false);
    expect(fixture.root.userData.presentationArms).toBe('rounded');
    expect(fixture.root.userData.armsProfile).toBe('compact-low');
    expect(fixture.root.getObjectByName('fp_hand_socket.R')?.userData.side).toBe('R');
    expect(fixture.root.getObjectByName('fp_hand_socket.L')?.userData.side).toBe('L');

    const roundedMeshes = presentationMeshes(fixture.root);
    expect(roundedMeshes.some((mesh) => mesh.geometry.type === 'CapsuleGeometry')).toBe(true);
    expect(roundedMeshes.some((mesh) => mesh.geometry.type === 'SphereGeometry')).toBe(true);
    const palm = fixture.root.getObjectByName('rounded palm.R');
    expect(palm?.scale.x).toBeLessThanOrEqual(0.06);
  });

  it('binds GLTF-sanitized bone aliases and does not mistake authored sockets for installation', () => {
    const fixture = firstPersonRigFixture();
    for (const side of ['R', 'L'] as const) {
      for (const role of ['upperArm', 'forearm', 'hand']) {
        const bone = fixture.root.getObjectByName(`fp_${role}.${side}`);
        if (bone) bone.name = role === 'forearm' ? `fp_${role}${side}` : `fp_${role}_${side}`;
      }
      const hand = fixture.root.getObjectByName(`fp_hand_${side}`);
      const authoredSocket = new THREE.Object3D();
      authoredSocket.name = `fp_hand_socket_${side}`;
      hand?.add(authoredSocket);
    }

    const installed = installRoundedFirstPersonVisual(fixture.root);
    const count = presentationMeshes(fixture.root).length;
    const reinstalled = installRoundedFirstPersonVisual(fixture.root);

    expect(installed?.meshCount).toBeGreaterThanOrEqual(10);
    expect(fixture.root.userData.roundedFirstPersonMissing).toBe('');
    expect(fixture.root.userData.presentationArms).toBe('rounded');
    expect(reinstalled?.meshCount).toBe(installed?.meshCount);
    expect(presentationMeshes(fixture.root)).toHaveLength(count);
  });

  it('keeps a rounded, animated-by-pose fallback when authored assets fail', () => {
    const fallback = new RoundedFirstPersonFallback();
    const before = fallback.root.position.y;
    fallback.update(0.6, { push: -0.1, lift: 0.04, roll: 0.2, pitch: -0.15 }, 0.8);

    expect(fallback.root.userData.presentationArms).toBe('rounded-fallback');
    expect(fallback.root.userData.armsProfile).toBe('compact-low');
    expect(fallback.handSocket('R').userData.presentation).toBe('hand-tool-socket');
    expect(fallback.handSocket('L').userData.presentation).toBe('hand-tool-socket');
    expect(fallback.root.position.y).not.toBe(before);
    fallback.root.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(fallback.root);
    expect(bounds.max.y).toBeLessThan(0);

    for (const side of ['R', 'L'] as const) {
      const thumb = fallback.root.getObjectByName(`fallback thumb.${side}`);
      const palm = fallback.root.getObjectByName(`fallback palm.${side}`);
      const socket = fallback.handSocket(side);
      if (!(thumb instanceof THREE.Mesh) || !(palm instanceof THREE.Mesh))
        throw new Error(`fallback hand meshes missing for ${side}`);

      const thumbBounds = new THREE.Box3().setFromObject(thumb);
      const palmBounds = new THREE.Box3().setFromObject(palm);
      const thumbCenter = thumbBounds.getCenter(new THREE.Vector3());
      const palmCenter = palmBounds.getCenter(new THREE.Vector3());
      expect(thumbCenter.distanceTo(palmCenter)).toBeLessThan(0.1);

      const socketPosition = socket.getWorldPosition(new THREE.Vector3());
      expect(thumbBounds.distanceToPoint(socketPosition)).toBeLessThan(0.1);
    }
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

describe('bounded gameplay depth contract', () => {
  it('keeps the ocean far plane while enabling bounded near/logarithmic depth', () => {
    expect(cabinDepthContract).toEqual({
      cameraNear: 0.12,
      cameraFar: 2400,
      logarithmicDepthBuffer: true,
    });
  });
});
