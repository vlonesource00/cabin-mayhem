import * as THREE from 'three';
import { compartmentById, residency } from '../data/ship-layout';
import type { AmbientArchetype } from '../data/ambient-crowd';
import type { AmbientCrowdState, AmbientResidentState } from '../sim/types';
import { cabinToWorld } from './coordinates';
import { instantiate, type LoadedRig, type RigInstance } from './animated-rig';
import {
  ambientNpcTasks,
  ambientPresentationFor,
  ambientTaskFor,
  type AmbientNpcTask,
  type AmbientPresentationState,
} from './ambient-npc-animation';
import {
  ambientArchetypeFor,
  ambientStableHash,
  applyAmbientNpcStyle,
  disposeAmbientNpcStyle,
} from './ambient-npc-style';

export { ambientActivityClip } from './ambient-npc-animation';

/** Residents beyond this render radius never enter the presentation pool. */
export const AMBIENT_CULL_RADIUS = 96;
/** Hard presentation budget, independent of the authoritative 78-resident manifest. */
export const AMBIENT_MAX_VISIBLE_RESIDENTS = 24;
export const AMBIENT_FADE_MIN_SECONDS = 0.18;
export const AMBIENT_FADE_MAX_SECONDS = 0.32;

interface AmbientTarget {
  position: THREE.Vector3;
  rotationY: number;
  rotationZ: number;
  presentation: AmbientPresentationState;
}

interface AmbientCandidate {
  resident: AmbientResidentState;
  style: AmbientArchetype;
  target: AmbientTarget;
  distanceSq: number;
}

type FadeDirection = -1 | 0 | 1;

interface AmbientInstance {
  rig: RigInstance;
  style: AmbientArchetype;
  resident: AmbientResidentState;
  target: AmbientTarget;
  opacity: number;
  fadeDirection: FadeDirection;
  fadeDuration: number;
  taskCycle: number;
  contactCorrection: number;
  contactError: number;
  basePosition: THREE.Vector3;
}

export interface AmbientCrowdMetrics {
  residentCount: number;
  visibleCount: number;
  fadingCount: number;
  taskCounts: Record<AmbientNpcTask, number>;
}

const finiteVector = (value: THREE.Vector3): boolean =>
  Number.isFinite(value.x) && Number.isFinite(value.y) && Number.isFinite(value.z);
const finiteMatrix = (value: THREE.Matrix4): boolean =>
  value.elements.every((entry) => Number.isFinite(entry));
const maximumContactCorrection = 2;
const maximumContactError = 0.03;

interface ContactBounds {
  minY: number;
  maxY: number;
}

function finiteBounds(bounds: THREE.Box3): boolean {
  return (
    !bounds.isEmpty() &&
    finiteVector(bounds.min) &&
    finiteVector(bounds.max) &&
    bounds.min.x <= bounds.max.x &&
    bounds.min.y <= bounds.max.y &&
    bounds.min.z <= bounds.max.z
  );
}

function posedBoundsInParentSpace(
  root: THREE.Object3D,
  parentMatrixWorldInverse: THREE.Matrix4,
): ContactBounds | undefined {
  let minimum = Number.POSITIVE_INFINITY;
  let maximum = Number.NEGATIVE_INFINITY;
  let found = false;
  let invalid = false;
  root.traverse((entry) => {
    if (!(entry instanceof THREE.Mesh) || !entry.visible) return;
    const bounds =
      entry instanceof THREE.SkinnedMesh
        ? (entry.computeBoundingBox(), entry.boundingBox)
        : (entry.geometry.computeBoundingBox(), entry.geometry.boundingBox);
    if (!bounds || !finiteBounds(bounds) || !finiteMatrix(entry.matrixWorld)) {
      invalid = true;
      return;
    }
    const presentationBounds = bounds
      .clone()
      .applyMatrix4(entry.matrixWorld)
      .applyMatrix4(parentMatrixWorldInverse);
    if (!finiteBounds(presentationBounds)) {
      invalid = true;
      return;
    }
    found = true;
    minimum = Math.min(minimum, presentationBounds.min.y);
    maximum = Math.max(maximum, presentationBounds.max.y);
  });

  return !invalid && found && Number.isFinite(minimum) && Number.isFinite(maximum)
    ? { minY: minimum, maxY: maximum }
    : undefined;
}

function dampAngle(current: number, target: number, alpha: number): number {
  const difference = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return current + difference * alpha;
}

function ambientTarget(
  resident: AmbientResidentState,
  style: AmbientArchetype,
  originCompartmentId: string,
): AmbientTarget {
  const presentation = ambientPresentationFor(resident, style);
  return {
    position: cabinToWorld(
      resident.position,
      presentation.rootHeight,
      resident.compartmentId,
      originCompartmentId,
    ),
    rotationY: Math.atan2(resident.facing.x, resident.facing.y) + presentation.yawOffset,
    rotationZ: presentation.rotationZ,
    presentation,
  };
}

function hasFiniteResidentPosition(resident: AmbientResidentState): boolean {
  return (
    Number.isFinite(resident.position.x) &&
    Number.isFinite(resident.position.y) &&
    Number.isFinite(resident.facing.x) &&
    Number.isFinite(resident.facing.y)
  );
}

function hasFiniteTarget(target: AmbientTarget): boolean {
  return (
    Number.isFinite(target.position.x) &&
    Number.isFinite(target.position.y) &&
    Number.isFinite(target.position.z) &&
    Number.isFinite(target.rotationY) &&
    Number.isFinite(target.rotationZ) &&
    Number.isFinite(target.presentation.rootHeight)
  );
}

function ambientFadeDuration(residentId: string): number {
  const span = AMBIENT_FADE_MAX_SECONDS - AMBIENT_FADE_MIN_SECONDS;
  return AMBIENT_FADE_MIN_SECONDS + (ambientStableHash(residentId) % 15) * (span / 14);
}

function ambientTaskCycle(task: AmbientNpcTask, elapsed: number, phase: number): number {
  if (task !== 'service') return -1;
  const time = Number.isFinite(elapsed) ? Math.max(0, elapsed) : 0;
  const offset = Number.isFinite(phase) ? Math.max(0, Math.min(1, phase)) * 4.5 : 0;
  return Math.floor((time + offset) / 4.5);
}

function setAmbientOpacity(root: THREE.Object3D, opacity: number): void {
  const clamped = Math.max(0, Math.min(1, opacity));
  root.userData.ambientOpacity = clamped;
  root.traverse((entry) => {
    if (!(entry instanceof THREE.Mesh) || !entry.visible) return;
    const materials = Array.isArray(entry.material) ? entry.material : [entry.material];
    for (const material of materials) {
      material.transparent = clamped < 0.999;
      material.opacity = clamped;
      material.depthWrite = clamped >= 0.999;
      material.needsUpdate = true;
    }
  });
}

function createTaskCounts(): Record<AmbientNpcTask, number> {
  return Object.fromEntries(ambientNpcTasks.map((task) => [task, 0])) as Record<
    AmbientNpcTask,
    number
  >;
}

/** Presentation-only pool of Blender-authored passenger rigs for nearby occupied compartments. */
export class AmbientCrowdPresenter {
  public readonly group = new THREE.Group();
  private rig?: LoadedRig;
  private readonly instances = new Map<string, AmbientInstance>();
  private compartmentId = '';
  private originValid = false;
  private lastState?: AmbientCrowdState;

  public constructor() {
    this.group.name = 'ambient cruise crowd';
  }

  public setRig(rig: LoadedRig): void {
    if (this.rig === rig) return;
    this.clear();
    this.rig = rig;
    if (this.lastState && this.compartmentId) this.sync(this.lastState, this.compartmentId);
  }

  public sync(state: AmbientCrowdState, originCompartmentId: string): void {
    this.lastState = state;
    this.compartmentId = originCompartmentId;
    this.originValid = compartmentById(originCompartmentId) !== undefined;

    if (!this.originValid) {
      for (const entry of this.instances.values()) this.fadeOut(entry);
      this.group.visible = false;
      return;
    }

    const { candidates, targets } = this.candidates(state, originCompartmentId);
    const admittedCandidates = this.admitCandidates(candidates);
    const candidateIds = new Set(admittedCandidates.map((candidate) => candidate.resident.id));

    for (const [id, entry] of this.instances) {
      const resident = state.residents[id];
      const target = targets.get(id);
      if (!resident || !target || !candidateIds.has(id)) {
        if (resident && target) {
          entry.resident = resident;
          this.copyTarget(entry.target, target);
        }
        this.fadeOut(entry);
      } else {
        this.updateEntry(
          entry,
          {
            resident,
            style: entry.style,
            target,
            distanceSq: target.position.lengthSq(),
          },
          state.elapsed,
        );
      }
    }

    if (!this.rig) {
      this.group.visible = false;
      return;
    }

    for (const candidate of admittedCandidates) {
      if (this.instances.has(candidate.resident.id)) continue;
      this.createEntry(candidate, state.elapsed);
    }
    this.group.visible = this.instances.size > 0;
  }

  public update(delta: number): void {
    const clamped = Math.max(0, Math.min(0.05, delta));
    const alpha = 1 - Math.exp(-clamped * 14);
    const completed: string[] = [];

    for (const [id, entry] of this.instances) {
      entry.rig.update(clamped);
      if (entry.fadeDirection !== 0 && clamped > 0) {
        entry.opacity = Math.max(
          0,
          Math.min(1, entry.opacity + (entry.fadeDirection * clamped) / entry.fadeDuration),
        );
        setAmbientOpacity(entry.rig.root, entry.opacity);
        if (entry.opacity <= 0 && entry.fadeDirection === -1) {
          completed.push(id);
        } else if (entry.opacity >= 1 && entry.fadeDirection === 1) {
          entry.opacity = 1;
          entry.fadeDirection = 0;
          entry.rig.root.userData.ambientFadeState = 'visible';
          setAmbientOpacity(entry.rig.root, 1);
        }
      }

      if (!this.instances.has(id)) continue;
      if (alpha === 0) continue;
      entry.rig.root.position.lerp(entry.target.position, alpha);
      entry.rig.root.rotation.y = dampAngle(
        entry.rig.root.rotation.y,
        entry.target.rotationY,
        alpha,
      );
      entry.rig.root.rotation.z = THREE.MathUtils.lerp(
        entry.rig.root.rotation.z,
        entry.target.rotationZ,
        alpha,
      );
      this.alignToFloor(entry);
    }

    for (const id of completed) {
      const entry = this.instances.get(id);
      if (entry) this.disposeEntry(id, entry);
    }
    this.group.visible = Boolean(this.rig && this.originValid && this.instances.size > 0);
  }

  public visibleCount(): number {
    return this.originValid ? this.instances.size : 0;
  }

  public floatingCount(): number {
    let count = 0;
    for (const entry of this.instances.values()) {
      if (
        entry.target.presentation.mode !== 'swimming' &&
        (!Number.isFinite(entry.contactError) || entry.contactError > maximumContactError)
      )
        count += 1;
    }
    return count;
  }

  public contactMax(): number {
    let max = 0;
    for (const entry of this.instances.values()) {
      if (entry.target.presentation.mode === 'swimming') continue;
      if (!Number.isFinite(entry.contactError)) return Number.POSITIVE_INFINITY;
      max = Math.max(max, entry.contactError);
    }
    return max;
  }

  public contactErrors(): Record<string, number> {
    return Object.fromEntries(
      [...this.instances.entries()].map(([id, entry]) => [id, entry.contactError]),
    );
  }

  public clipStates(): Record<string, { mode: AmbientPresentationState['mode']; clip: string }> {
    return Object.fromEntries(
      [...this.instances.entries()].map(([id, entry]) => [
        id,
        { mode: entry.target.presentation.mode, clip: entry.target.presentation.clip },
      ]),
    );
  }

  public metrics(): AmbientCrowdMetrics {
    const taskCounts = createTaskCounts();
    const residents = Object.values(this.lastState?.residents ?? {});
    for (const resident of residents) taskCounts[ambientTaskFor(resident)] += 1;
    return {
      residentCount: residents.length,
      visibleCount: this.visibleCount(),
      fadingCount: [...this.instances.values()].filter((entry) => entry.fadeDirection !== 0).length,
      taskCounts,
    };
  }

  public dispose(): void {
    this.clear();
    this.lastState = undefined;
    this.originValid = false;
    this.group.removeFromParent();
  }

  private candidates(
    state: AmbientCrowdState,
    originCompartmentId: string,
  ): { candidates: AmbientCandidate[]; targets: Map<string, AmbientTarget> } {
    const allowed = residency(originCompartmentId);
    const targets = new Map<string, AmbientTarget>();
    const candidates: AmbientCandidate[] = [];

    for (const resident of Object.values(state.residents)) {
      if (!compartmentById(resident.compartmentId)) continue;
      if (!allowed.has(resident.compartmentId)) continue;
      if (!hasFiniteResidentPosition(resident)) continue;
      const style = this.instances.get(resident.id)?.style ?? ambientArchetypeFor(resident.id);
      const target = ambientTarget(resident, style, originCompartmentId);
      if (!hasFiniteTarget(target)) continue;
      targets.set(resident.id, target);
      const distanceSq = target.position.lengthSq();
      if (!Number.isFinite(distanceSq) || distanceSq > AMBIENT_CULL_RADIUS ** 2) continue;
      candidates.push({ resident, style, target, distanceSq });
    }

    candidates.sort(
      (left, right) =>
        left.distanceSq - right.distanceSq || left.resident.id.localeCompare(right.resident.id),
    );
    return { candidates: candidates.slice(0, AMBIENT_MAX_VISIBLE_RESIDENTS), targets };
  }

  /**
   * Fading entries still own a rig slot. Retain existing candidates, then admit
   * only as many new residents as the live presentation budget permits.
   */
  private admitCandidates(candidates: AmbientCandidate[]): AmbientCandidate[] {
    let availableSlots = Math.max(0, AMBIENT_MAX_VISIBLE_RESIDENTS - this.instances.size);
    const admitted: AmbientCandidate[] = [];

    for (const candidate of candidates) {
      if (this.instances.has(candidate.resident.id)) {
        admitted.push(candidate);
        continue;
      }
      if (availableSlots <= 0) continue;
      admitted.push(candidate);
      availableSlots -= 1;
    }

    return admitted;
  }

  private createEntry(candidate: AmbientCandidate, elapsed: number): void {
    if (!this.rig) return;
    const rig = instantiate(this.rig, 'CM_PASSENGER');
    applyAmbientNpcStyle(rig.root, candidate.style);
    const task = candidate.target.presentation.task;
    const entry: AmbientInstance = {
      rig,
      style: candidate.style,
      resident: candidate.resident,
      target: {
        position: candidate.target.position.clone(),
        rotationY: candidate.target.rotationY,
        rotationZ: candidate.target.rotationZ,
        presentation: candidate.target.presentation,
      },
      opacity: 0,
      fadeDirection: 1,
      fadeDuration: ambientFadeDuration(candidate.resident.id),
      taskCycle: ambientTaskCycle(task, elapsed, candidate.resident.phase),
      contactCorrection: 0,
      contactError: 0,
      basePosition: new THREE.Vector3(),
    };
    rig.root.name = `ambient:${candidate.resident.id}:${candidate.resident.activity}`;
    rig.root.userData.residentId = candidate.resident.id;
    rig.root.userData.ambientArchetype = candidate.style.id;
    rig.root.userData.ambientTask = task;
    rig.root.userData.ambientPresentationMode = candidate.target.presentation.mode;
    rig.root.userData.ambientSeatAnchor = candidate.target.presentation.seat;
    rig.root.userData.ambientFadeState = 'fading-in';
    rig.root.userData.ambientFadeDurationMs = Math.round(entry.fadeDuration * 1000);
    rig.root.position.copy(candidate.target.position);
    rig.root.rotation.y = candidate.target.rotationY;
    rig.root.rotation.z = candidate.target.rotationZ;
    rig.play({ base: candidate.target.presentation.clip });
    rig.update(candidate.resident.phase * 1.8);
    setAmbientOpacity(rig.root, 0);
    this.instances.set(candidate.resident.id, entry);
    this.group.add(rig.root);
    this.alignToFloor(entry);
  }

  private updateEntry(entry: AmbientInstance, candidate: AmbientCandidate, elapsed: number): void {
    const previousTask = entry.target.presentation.task;
    const previousCycle = entry.taskCycle;
    this.copyTarget(entry.target, candidate.target);
    entry.resident = candidate.resident;
    const presentation = candidate.target.presentation;
    entry.rig.root.name = `ambient:${candidate.resident.id}:${candidate.resident.activity}`;
    entry.rig.root.userData.ambientTask = presentation.task;
    entry.rig.root.userData.ambientPresentationMode = presentation.mode;
    entry.rig.root.userData.ambientSeatAnchor = presentation.seat;
    entry.rig.play({ base: presentation.clip });

    const cycle = ambientTaskCycle(presentation.task, elapsed, candidate.resident.phase);
    if (presentation.task === 'service') {
      if (previousTask === 'service' && previousCycle >= 0 && cycle !== previousCycle)
        entry.rig.trigger('serve');
      entry.taskCycle = cycle;
    } else {
      entry.taskCycle = -1;
    }
    this.fadeIn(entry);
  }

  private copyTarget(target: AmbientTarget, next: AmbientTarget): void {
    target.position.copy(next.position);
    target.rotationY = next.rotationY;
    target.rotationZ = next.rotationZ;
    target.presentation = next.presentation;
  }

  private alignToFloor(entry: AmbientInstance, sample = 0): void {
    const root = entry.rig.root;
    if (sample > 0) entry.rig.update(sample);

    // Rebase from the current target each frame so correction never compounds.
    entry.basePosition.copy(root.position);
    entry.basePosition.y = entry.target.position.y;
    root.position.copy(entry.basePosition);

    if (entry.target.presentation.mode === 'swimming') {
      root.visible = entry.opacity > 0;
      root.updateMatrixWorld(true);
      entry.contactCorrection = 0;
      entry.contactError = 0;
      root.userData.ambientContactStatus = 'excluded-swimming';
      root.userData.ambientContactError = 0;
      return;
    }

    root.parent?.updateMatrixWorld(true);
    root.updateMatrixWorld(true);
    const parentMatrixWorld = root.parent?.matrixWorld ?? new THREE.Matrix4();
    const parentMatrixWorldInverse = parentMatrixWorld.clone().invert();
    if (
      !Number.isFinite(parentMatrixWorld.determinant()) ||
      Math.abs(parentMatrixWorld.determinant()) <= Number.EPSILON ||
      !finiteMatrix(parentMatrixWorldInverse)
    ) {
      this.failContact(entry, 'invalid-parent-transform');
      return;
    }

    const desiredFloorY = entry.target.position.y;
    const posedBeforeCorrection = posedBoundsInParentSpace(root, parentMatrixWorldInverse);
    const correction = posedBeforeCorrection
      ? desiredFloorY - posedBeforeCorrection.minY
      : Number.NaN;
    if (
      !posedBeforeCorrection ||
      !Number.isFinite(correction) ||
      Math.abs(correction) > maximumContactCorrection
    ) {
      this.failContact(entry, 'invalid-or-extreme-correction');
      return;
    }

    root.position.y = entry.basePosition.y + correction;
    root.updateMatrixWorld(true);
    const posedAfterCorrection = posedBoundsInParentSpace(root, parentMatrixWorldInverse);
    const contactError = posedAfterCorrection
      ? Math.abs(posedAfterCorrection.minY - desiredFloorY)
      : Infinity;
    if (
      !posedAfterCorrection ||
      !Number.isFinite(contactError) ||
      contactError > maximumContactError
    ) {
      this.failContact(entry, 'invalid-post-correction-bounds');
      return;
    }

    root.visible = entry.opacity > 0;
    entry.contactCorrection = correction;
    entry.contactError = contactError;
    root.userData.ambientContactStatus = 'posed-bounds-post-correction';
    root.userData.ambientContactCorrection = correction;
    root.userData.ambientContactError = contactError;
  }

  private failContact(entry: AmbientInstance, reason: string): void {
    entry.rig.root.position.copy(entry.basePosition);
    entry.rig.root.visible = false;
    entry.contactCorrection = Number.POSITIVE_INFINITY;
    entry.contactError = Number.POSITIVE_INFINITY;
    entry.rig.root.userData.ambientContactStatus = reason;
    entry.rig.root.userData.ambientContactCorrection = 'Infinity';
    entry.rig.root.userData.ambientContactError = 'Infinity';
  }

  private fadeIn(entry: AmbientInstance): void {
    entry.rig.root.visible = true;
    if (entry.opacity >= 1) {
      entry.opacity = 1;
      entry.fadeDirection = 0;
      entry.rig.root.userData.ambientFadeState = 'visible';
      return;
    }
    entry.fadeDirection = 1;
    entry.rig.root.userData.ambientFadeState = 'fading-in';
  }

  private fadeOut(entry: AmbientInstance): void {
    if (entry.opacity <= 0) {
      entry.fadeDirection = -1;
      return;
    }
    entry.fadeDirection = -1;
    entry.rig.root.visible = true;
    entry.rig.root.userData.ambientFadeState = 'fading-out';
  }

  private disposeEntry(id: string, entry: AmbientInstance): void {
    this.group.remove(entry.rig.root);
    disposeAmbientNpcStyle(entry.rig.root);
    entry.rig.dispose();
    this.instances.delete(id);
  }

  private clear(): void {
    for (const [id, entry] of this.instances) this.disposeEntry(id, entry);
    this.instances.clear();
    this.group.clear();
    this.group.visible = false;
  }
}
