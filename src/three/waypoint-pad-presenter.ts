import * as THREE from 'three';
import type { MissionState } from '../sim/types';
import {
  portalPadDefinitionsFor,
  waypointDeckFor,
  waypointDeckRenderOffset,
  type PortalPadDefinition,
} from '../sim/waypoint-travel';
import { cabinToWorld } from './coordinates';

export interface PortalPadDebugState {
  visible: boolean;
  padId: string;
  padIds: string;
  options: string;
  selected: string;
}

/** Floor-level presentation of the host-derived physical travel pads. */
export class WaypointPadPresenter {
  public readonly group = new THREE.Group();
  private readonly pads = new Map<string, THREE.Group>();

  public constructor(private readonly localPlayerId: string) {
    this.group.name = 'physical portal travel pads';
  }

  public sync(
    state: MissionState,
    originCompartmentId: string,
    selectedOptionId?: string,
    elapsed = 0,
  ): PortalPadDebugState {
    const local = state.cabin.players[this.localPlayerId];
    const currentDeck = local ? waypointDeckFor(local) : Number.NaN;
    const definitions = local
      ? portalPadDefinitionsFor(local.compartmentId).filter(
          (definition) => definition.kind === 'elevator' || definition.deck === currentDeck,
        )
      : [];
    const activePadId = local?.pendingDoor?.padId ?? '';
    const selected = selectedOptionId ?? local?.pendingDoor?.selectedOptionId ?? '';
    const visibleIds = new Set(definitions.map((definition) => definition.id));
    for (const [id, pad] of this.pads) {
      if (visibleIds.has(id)) continue;
      this.disposePad(pad);
      this.pads.delete(id);
    }
    for (const definition of definitions) {
      const pad = this.pads.get(definition.id) ?? this.createPad(definition);
      this.pads.set(definition.id, pad);
      pad.position.copy(
        cabinToWorld(
          definition.position,
          0.1 + (definition.kind === 'elevator' && local ? waypointDeckRenderOffset(local) : 0),
          definition.compartmentId,
          originCompartmentId,
        ),
      );
      pad.visible = true;
      const ring = pad.getObjectByName('portal pad ring');
      if (ring instanceof THREE.Mesh && ring.material instanceof THREE.MeshBasicMaterial) {
        const isActive = definition.id === activePadId;
        const isSelected = isActive && definition.options.some((option) => option.id === selected);
        ring.material.color.setHex(isSelected ? 0xffd166 : isActive ? 0x63d9ff : 0x2e8ba5);
        ring.material.opacity = isSelected ? 0.95 : isActive ? 0.78 : 0.32;
        ring.scale.setScalar(1 + (isSelected ? Math.sin(elapsed * 8) * 0.06 : 0));
      }
    }
    this.group.visible = definitions.length > 0;
    const active = definitions.find((definition) => definition.id === activePadId);
    return {
      visible: Boolean(active),
      padId: active?.id ?? '',
      padIds: definitions.map((definition) => definition.id).join('|'),
      options:
        active?.options.map((option) => `${option.id}:${option.label}:D${option.deck}`).join('|') ??
        '',
      selected,
    };
  }

  public dispose(): void {
    for (const pad of this.pads.values()) this.disposePad(pad);
    this.pads.clear();
    this.group.clear();
  }

  private createPad(definition: PortalPadDefinition): THREE.Group {
    const pad = new THREE.Group();
    pad.name = `portal pad:${definition.id}`;
    pad.userData.padId = definition.id;
    pad.userData.options = definition.options.map((option) => option.id);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.62, 0.055, 8, 32),
      new THREE.MeshBasicMaterial({
        color: 0x2e8ba5,
        transparent: true,
        opacity: 0.32,
        depthWrite: false,
        depthTest: true,
      }),
    );
    ring.name = 'portal pad ring';
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0;
    pad.add(ring);
    this.group.add(pad);
    return pad;
  }

  private disposePad(pad: THREE.Group): void {
    pad.traverse((entry) => {
      if (!(entry instanceof THREE.Mesh)) return;
      entry.geometry.dispose();
      const materials = Array.isArray(entry.material) ? entry.material : [entry.material];
      for (const material of materials) material.dispose();
    });
    pad.removeFromParent();
  }
}
