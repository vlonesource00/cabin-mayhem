import * as THREE from 'three';
import type { HandPose } from './interaction-animation';

export type HandSide = 'L' | 'R';

export interface RoundedFirstPersonVisual {
  meshCount: number;
  sockets: Readonly<Record<HandSide, THREE.Object3D>>;
}

const UP = new THREE.Vector3(0, 1, 0);

const namedObject = (root: THREE.Object3D, name: string): THREE.Object3D | undefined => {
  let found: THREE.Object3D | undefined;
  root.traverse((entry) => {
    if (!found && entry.name === name) found = entry;
  });
  return found;
};

const childBone = (parent: THREE.Object3D): THREE.Object3D | undefined =>
  parent.children.find((entry) => /^fp_(upperArm|forearm|hand)\.[LR]$/.test(entry.name));

const directionFor = (parent: THREE.Object3D, fallbackLength: number): THREE.Vector3 =>
  childBone(parent)?.position.clone() ?? new THREE.Vector3(0, fallbackLength, 0);

const markPresentationMesh = (mesh: THREE.Mesh, role: string): void => {
  mesh.name = role;
  mesh.userData.presentation = 'rounded-first-person-arms';
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.frustumCulled = false;
};

const orientAlong = (mesh: THREE.Mesh, direction: THREE.Vector3): void => {
  mesh.position.copy(direction).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(UP, direction.normalize());
};

const addCapsule = (
  parent: THREE.Object3D,
  name: string,
  direction: THREE.Vector3,
  radius: number,
  material: THREE.MeshStandardMaterial,
): THREE.Mesh => {
  const length = direction.length();
  const mesh = new THREE.Mesh(
    new THREE.CapsuleGeometry(radius, Math.max(0.025, length - radius * 2), 4, 8),
    material,
  );
  markPresentationMesh(mesh, name);
  orientAlong(mesh, direction);
  parent.add(mesh);
  return mesh;
};

const addBand = (
  parent: THREE.Object3D,
  name: string,
  direction: THREE.Vector3,
  radius: number,
  material: THREE.MeshStandardMaterial,
): THREE.Mesh => {
  const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(radius, 0.035, 3, 8), material);
  markPresentationMesh(mesh, name);
  const axis = direction.clone().normalize();
  mesh.position.copy(axis).multiplyScalar(Math.max(0.035, direction.length() - 0.035));
  mesh.quaternion.setFromUnitVectors(UP, axis);
  parent.add(mesh);
  return mesh;
};

const addEllipsoid = (
  parent: THREE.Object3D,
  name: string,
  position: THREE.Vector3,
  scale: THREE.Vector3,
  material: THREE.MeshStandardMaterial,
): THREE.Mesh => {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), material);
  markPresentationMesh(mesh, name);
  mesh.position.copy(position);
  mesh.scale.copy(scale);
  parent.add(mesh);
  return mesh;
};

const addSocket = (hand: THREE.Object3D, side: HandSide): THREE.Object3D => {
  const socket = new THREE.Object3D();
  socket.name = `fp_hand_socket.${side}`;
  socket.position.set(0, 0.065, -0.065);
  socket.userData.presentation = 'hand-tool-socket';
  socket.userData.side = side;
  hand.add(socket);
  return socket;
};

const roundedMaterials = (): {
  sleeve: THREE.MeshStandardMaterial;
  cuff: THREE.MeshStandardMaterial;
  skin: THREE.MeshStandardMaterial;
  accent: THREE.MeshStandardMaterial;
} => ({
  sleeve: new THREE.MeshStandardMaterial({ color: 0x263b92, roughness: 0.64, metalness: 0.08 }),
  cuff: new THREE.MeshStandardMaterial({ color: 0xf36e39, roughness: 0.42, metalness: 0.2 }),
  skin: new THREE.MeshStandardMaterial({ color: 0xd19a79, roughness: 0.76, metalness: 0.01 }),
  accent: new THREE.MeshStandardMaterial({ color: 0x15245e, roughness: 0.52, metalness: 0.16 }),
});

/**
 * Replaces only the first-person GLB's blocky visible mesh. Bones, clips and
 * their timing remain authored data; each new piece is parented to the bone it
 * follows, so the animation mixer keeps driving the same sockets.
 */
export function installRoundedFirstPersonVisual(
  root: THREE.Object3D,
): RoundedFirstPersonVisual | undefined {
  const existingRight = namedObject(root, 'fp_hand_socket.R');
  const existingLeft = namedObject(root, 'fp_hand_socket.L');
  if (existingRight && existingLeft)
    return {
      meshCount: root.userData.roundedFirstPersonMeshCount ?? 0,
      sockets: { R: existingRight, L: existingLeft },
    };

  const armBones: Array<{
    side: HandSide;
    upper: THREE.Object3D;
    forearm: THREE.Object3D;
    hand: THREE.Object3D;
  }> = [];
  const missing: string[] = [];

  for (const side of ['R', 'L'] as const) {
    const upper = namedObject(root, `fp_upperArm.${side}`);
    const forearm = namedObject(root, `fp_forearm.${side}`);
    const hand = namedObject(root, `fp_hand.${side}`);
    if (!upper) missing.push(`fp_upperArm.${side}`);
    if (!forearm) missing.push(`fp_forearm.${side}`);
    if (!hand) missing.push(`fp_hand.${side}`);
    if (!upper || !forearm || !hand) continue;
    armBones.push({ side, upper, forearm, hand });
  }

  if (missing.length > 0) {
    root.userData.roundedFirstPersonMissing = missing.join(',');
    return undefined;
  }

  const materials = roundedMaterials();
  const sockets = {} as Record<HandSide, THREE.Object3D>;
  let meshCount = 0;

  for (const { side, upper, forearm, hand } of armBones) {
    const upperDirection = directionFor(upper, 0.23);
    const forearmDirection = directionFor(forearm, 0.22);
    meshCount += 1;
    addCapsule(upper, `rounded upper arm.${side}`, upperDirection, 0.066, materials.sleeve);
    meshCount += 1;
    addCapsule(forearm, `rounded forearm.${side}`, forearmDirection, 0.06, materials.sleeve);
    meshCount += 1;
    addBand(forearm, `rounded cuff.${side}`, forearmDirection, 0.071, materials.cuff);
    meshCount += 1;
    addEllipsoid(
      hand,
      `rounded palm.${side}`,
      new THREE.Vector3(0, 0.057, 0),
      new THREE.Vector3(0.103, 0.074, 0.083),
      materials.skin,
    );
    meshCount += 1;
    const thumb = addCapsule(
      hand,
      `rounded thumb.${side}`,
      new THREE.Vector3(side === 'R' ? 0.055 : -0.055, 0.035, -0.032),
      0.028,
      materials.skin,
    );
    thumb.rotation.z = side === 'R' ? -0.75 : 0.75;
    meshCount += 1;
    addBand(
      hand,
      `rounded hand accent.${side}`,
      new THREE.Vector3(0, 0.09, 0),
      0.034,
      materials.accent,
    );
    sockets[side] = addSocket(hand, side);
  }

  root.traverse((entry) => {
    if (!(entry instanceof THREE.Mesh) || entry.userData.presentation) return;
    entry.visible = false;
    entry.userData.presentation = 'rounded-first-person-source-hidden';
  });
  root.userData.presentationArms = 'rounded';
  root.userData.roundedFirstPersonMeshCount = meshCount;
  return { meshCount, sockets };
}

const addFallbackSegment = (
  parent: THREE.Object3D,
  name: string,
  start: THREE.Vector3,
  end: THREE.Vector3,
  radius: number,
  material: THREE.MeshStandardMaterial,
): THREE.Mesh => {
  const direction = end.clone().sub(start);
  const mesh = addCapsule(parent, name, direction, radius, material);
  mesh.position.add(start);
  return mesh;
};

/** Lightweight camera-space fallback used while authored assets are absent. */
export class RoundedFirstPersonFallback {
  public readonly root = new THREE.Group();
  private readonly arms: Array<{ side: HandSide; group: THREE.Group }> = [];
  private readonly sockets = {} as Record<HandSide, THREE.Object3D>;

  public constructor() {
    this.root.name = 'rounded first-person fallback';
    this.root.userData.presentationArms = 'rounded-fallback';
    this.root.position.set(0, -0.06, 0);
    const materials = roundedMaterials();

    for (const side of ['R', 'L'] as const) {
      const sign = side === 'R' ? 1 : -1;
      const shoulder = new THREE.Vector3(sign * 0.23, 0.02, -0.3);
      const elbow = new THREE.Vector3(sign * 0.21, 0.25, -0.25).sub(shoulder);
      const wrist = new THREE.Vector3(sign * 0.18, 0.47, -0.19).sub(shoulder);
      const handEnd = new THREE.Vector3(sign * 0.17, 0.59, -0.17).sub(shoulder);
      const group = new THREE.Group();
      group.name = `rounded fallback arm.${side}`;
      group.position.copy(shoulder);
      addFallbackSegment(
        group,
        `fallback upper arm.${side}`,
        new THREE.Vector3(),
        elbow,
        0.066,
        materials.sleeve,
      );
      addFallbackSegment(group, `fallback forearm.${side}`, elbow, wrist, 0.06, materials.sleeve);
      addFallbackSegment(
        group,
        `fallback cuff.${side}`,
        new THREE.Vector3().lerpVectors(elbow, wrist, 0.74),
        wrist,
        0.071,
        materials.cuff,
      );
      addEllipsoid(
        group,
        `fallback palm.${side}`,
        handEnd.clone().multiplyScalar(0.93),
        new THREE.Vector3(0.103, 0.074, 0.083),
        materials.skin,
      );
      const thumb = addFallbackSegment(
        group,
        `fallback thumb.${side}`,
        new THREE.Vector3(sign * -0.012, 0.48, 0.103),
        new THREE.Vector3(sign * -0.06, 0.53, 0.071),
        0.028,
        materials.skin,
      );
      thumb.rotation.z = side === 'R' ? -0.5 : 0.5;
      addEllipsoid(
        group,
        `fallback hand accent.${side}`,
        new THREE.Vector3(handEnd.x, handEnd.y + 0.02, handEnd.z),
        new THREE.Vector3(0.035, 0.028, 0.035),
        materials.accent,
      );
      const socket = new THREE.Object3D();
      socket.name = `fp_hand_socket.${side}`;
      socket.position.set(handEnd.x, handEnd.y + 0.02, handEnd.z - 0.065);
      socket.userData.presentation = 'hand-tool-socket';
      socket.userData.side = side;
      group.add(socket);
      this.sockets[side] = socket;
      this.arms.push({ side, group });
      this.root.add(group);
    }
  }

  public handSocket(side: HandSide): THREE.Object3D {
    return this.sockets[side];
  }

  public update(elapsed: number, pose: HandPose, stride = 0): void {
    const bob = Math.sin(elapsed * (5.5 + stride * 2.5)) * (0.004 + stride * 0.012);
    this.root.position.y = -0.06 + pose.lift * 0.14 + bob;
    this.root.position.z = pose.push * 0.12;
    for (const arm of this.arms) {
      const sign = arm.side === 'R' ? 1 : -1;
      const swing = Math.sin(elapsed * (4.5 + stride * 4)) * stride * 0.08;
      arm.group.rotation.x = pose.pitch * (arm.side === 'R' ? 0.55 : 0.28) + swing * sign;
      arm.group.rotation.y = pose.roll * 0.18 * sign;
      arm.group.rotation.z = pose.roll * 0.4 * sign;
    }
  }
}
