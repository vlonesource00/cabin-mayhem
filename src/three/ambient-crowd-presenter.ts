import * as THREE from 'three';
import type { AmbientActivity, AmbientCrowdState, AmbientResidentState } from '../sim/types';
import { cabinToWorld } from './coordinates';
import { instantiate, type LoadedRig, type RigInstance } from './animated-rig';

const clips: Record<AmbientActivity, string> = {
  strolling: 'walk',
  chatting: 'idle',
  dining: 'seat_idle',
  cooking: 'serve',
  housekeeping: 'push_cart',
  sightseeing: 'idle',
  photography: 'serve',
  swimming: 'sprint',
  sunbathing: 'seat_idle',
  evacuating: 'sprint',
};

export function ambientActivityClip(activity: AmbientActivity): string {
  return clips[activity];
}

function residentHeight(resident: AmbientResidentState): number {
  if (resident.activity === 'swimming') return -0.55;
  if (resident.activity === 'sunbathing') return -0.25;
  return 0;
}

/** Presentation-only pool of Blender-authored passenger rigs for the occupied deck. */
export class AmbientCrowdPresenter {
  public readonly group = new THREE.Group();
  private rig?: LoadedRig;
  private readonly instances = new Map<string, RigInstance>();
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
    for (const [id, instance] of this.instances) {
      if (visibleIds.has(id)) continue;
      this.group.remove(instance.root);
      instance.dispose();
      this.instances.delete(id);
    }
    if (!this.rig) {
      this.group.visible = false;
      return;
    }
    for (const resident of visible) {
      let instance = this.instances.get(resident.id);
      if (!instance) {
        instance = instantiate(this.rig, 'CM_PASSENGER');
        instance.root.name = `ambient:${resident.id}:${resident.activity}`;
        instance.root.userData.residentId = resident.id;
        instance.update(resident.phase * 1.8);
        this.instances.set(resident.id, instance);
        this.group.add(instance.root);
      }
      instance.root.position.copy(
        cabinToWorld(
          resident.position,
          residentHeight(resident),
          resident.compartmentId,
          originCompartmentId,
        ),
      );
      instance.root.rotation.y = Math.atan2(resident.facing.x, resident.facing.y);
      instance.root.rotation.z = resident.activity === 'swimming' ? Math.PI / 2 : 0;
      instance.root.scale.setScalar(resident.activity === 'sunbathing' ? 0.96 : 1);
      instance.play({ base: ambientActivityClip(resident.activity) });
    }
    this.group.visible = visible.length > 0;
  }

  public update(delta: number): void {
    for (const instance of this.instances.values()) instance.update(delta);
  }

  public visibleCount(): number {
    return this.instances.size;
  }

  public dispose(): void {
    this.clear();
    this.group.removeFromParent();
  }

  private clear(): void {
    for (const instance of this.instances.values()) instance.dispose();
    this.instances.clear();
    this.group.clear();
  }
}
