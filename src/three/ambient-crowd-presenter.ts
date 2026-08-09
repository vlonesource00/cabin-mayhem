import * as THREE from 'three';
import type { AmbientArchetype } from '../data/ambient-crowd';
import type { AmbientCrowdState, AmbientResidentState } from '../sim/types';
import { cabinToWorld } from './coordinates';
import { instantiate, type LoadedRig, type RigInstance } from './animated-rig';
import { ambientPresentationFor, type AmbientPresentationState } from './ambient-npc-animation';
import {
  ambientArchetypeFor,
  applyAmbientNpcStyle,
  disposeAmbientNpcStyle,
} from './ambient-npc-style';

export { ambientActivityClip } from './ambient-npc-animation';

interface AmbientTarget {
  position: THREE.Vector3;
  rotationY: number;
  rotationZ: number;
  presentation: AmbientPresentationState;
}

interface AmbientInstance {
  rig: RigInstance;
  style: AmbientArchetype;
  target: AmbientTarget;
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

/** Presentation-only pool of Blender-authored passenger rigs for the occupied deck. */
export class AmbientCrowdPresenter {
  public readonly group = new THREE.Group();
  private rig?: LoadedRig;
  private readonly instances = new Map<string, AmbientInstance>();
  private compartmentId = '';

  public constructor() {
    this.group.name = 'ambient cruise crowd';
  }

  public setRig(rig: LoadedRig): void {
    if (this.rig === rig) return;
    this.clear();
    this.rig = rig;
  }

  public sync(state: AmbientCrowdState, originCompartmentId: string): void {
    if (originCompartmentId !== this.compartmentId) {
      this.clear();
      this.compartmentId = originCompartmentId;
    }
    const visible = Object.values(state.residents)
      .filter((resident) => resident.compartmentId === originCompartmentId)
      .sort((left, right) => left.id.localeCompare(right.id));
    const visibleIds = new Set(visible.map((resident) => resident.id));
    for (const [id, entry] of this.instances) {
      if (visibleIds.has(id)) continue;
      this.group.remove(entry.rig.root);
      disposeAmbientNpcStyle(entry.rig.root);
      entry.rig.dispose();
      this.instances.delete(id);
    }
    if (!this.rig) {
      this.group.visible = false;
      return;
    }
    for (const resident of visible) {
      let entry = this.instances.get(resident.id);
      const style = entry?.style ?? ambientArchetypeFor(resident.id);
      const target = ambientTarget(resident, style, originCompartmentId);
      if (!entry) {
        const rig = instantiate(this.rig, 'CM_PASSENGER');
        applyAmbientNpcStyle(rig.root, style);
        rig.root.name = `ambient:${resident.id}:${resident.activity}`;
        rig.root.userData.residentId = resident.id;
        rig.root.userData.ambientArchetype = style.id;
        rig.root.userData.ambientPresentationMode = target.presentation.mode;
        rig.root.userData.ambientSeatAnchor = target.presentation.seat;
        rig.root.position.copy(target.position);
        rig.root.rotation.y = target.rotationY;
        rig.root.rotation.z = target.rotationZ;
        rig.update(resident.phase * 1.8);
        entry = { rig, style, target };
        this.instances.set(resident.id, entry);
        this.group.add(rig.root);
      } else {
        entry.target.position.copy(target.position);
        entry.target.rotationY = target.rotationY;
        entry.target.rotationZ = target.rotationZ;
        entry.target.presentation = target.presentation;
      }
      entry.rig.root.name = `ambient:${resident.id}:${resident.activity}`;
      entry.rig.root.userData.ambientPresentationMode = target.presentation.mode;
      entry.rig.root.userData.ambientSeatAnchor = target.presentation.seat;
      entry.rig.play({ base: target.presentation.clip });
    }
    this.group.visible = visible.length > 0;
  }

  public update(delta: number): void {
    const clamped = Math.max(0, Math.min(0.05, delta));
    const alpha = 1 - Math.exp(-clamped * 14);
    for (const entry of this.instances.values()) {
      entry.rig.update(clamped);
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
    }
  }

  public visibleCount(): number {
    return this.instances.size;
  }

  public dispose(): void {
    this.clear();
    this.group.removeFromParent();
  }

  private clear(): void {
    for (const entry of this.instances.values()) {
      disposeAmbientNpcStyle(entry.rig.root);
      entry.rig.dispose();
    }
    this.instances.clear();
    this.group.clear();
  }
}
