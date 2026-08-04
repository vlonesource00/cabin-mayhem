import * as THREE from 'three';
import {
  compartmentById,
  residency,
  type CompartmentDefinition,
  type ResidencyDetail,
} from '../data/ship-layout';
import {
  buildGreyboxCompartment,
  disposeCompartment,
  loadCompartment,
  type GltfLike,
} from './compartment-loader';

/**
 * Keeps the right compartments in the scene and the rest out of it.
 *
 * Residency is the rule from docs/SHIP_LAYOUT.md: the occupied compartment and
 * its direct neighbours at full detail, two portal hops away at reduced detail,
 * nothing beyond. Loading is asynchronous and failure is survivable — a
 * compartment that will not load is shown as greybox rather than as a hole.
 */

export type CompartmentSource = 'glb' | 'fallback';

interface Resident {
  definition: CompartmentDefinition;
  group: THREE.Group;
  detail: ResidencyDetail;
  source: CompartmentSource;
}

export interface CompartmentStreamerOptions {
  loader?: GltfLike;
  baseUrl?: string;
  /** Called whenever the occupied compartment's asset source changes. */
  onSourceChange?: (source: CompartmentSource | 'loading') => void;
}

export class CompartmentStreamer {
  readonly group = new THREE.Group();

  private readonly residents = new Map<string, Resident>();
  private readonly pending = new Set<string>();
  private readonly options: CompartmentStreamerOptions;
  private currentId: string | undefined;
  private disposed = false;

  constructor(options: CompartmentStreamerOptions = {}) {
    this.options = options;
    this.group.name = 'Compartments';
  }

  get current(): string | undefined {
    return this.currentId;
  }

  /** The source the occupied compartment is currently rendering from. */
  get currentSource(): CompartmentSource | 'loading' {
    if (!this.currentId) return 'loading';
    return this.residents.get(this.currentId)?.source ?? 'loading';
  }

  /**
   * Move the crew into `id`. Returns once the occupied compartment is on
   * screen; neighbours keep loading in the background so a transition never
   * blocks on geometry the player cannot see yet.
   */
  async setCurrent(id: string): Promise<void> {
    const definition = compartmentById(id);
    if (!definition) throw new Error(`Unknown compartment: ${id}.`);
    this.currentId = id;
    this.options.onSourceChange?.(this.residents.get(id)?.source ?? 'loading');

    const wanted = residency(id);
    for (const [residentId, resident] of [...this.residents]) {
      const detail = wanted.get(residentId);
      if (!detail) {
        this.group.remove(resident.group);
        disposeCompartment(resident.group);
        this.residents.delete(residentId);
        continue;
      }
      resident.detail = detail;
      this.applyDetail(resident);
      this.place(resident);
    }

    await this.ensure(id, wanted.get(id) ?? 'full');

    const neighbours = [...wanted].filter(([residentId]) => residentId !== id);
    void Promise.all(neighbours.map(([residentId, detail]) => this.ensure(residentId, detail)));
  }

  dispose(): void {
    this.disposed = true;
    for (const resident of this.residents.values()) {
      this.group.remove(resident.group);
      disposeCompartment(resident.group);
    }
    this.residents.clear();
  }

  private async ensure(id: string, detail: ResidencyDetail): Promise<void> {
    if (this.residents.has(id) || this.pending.has(id)) return;
    const definition = compartmentById(id);
    if (!definition) return;
    this.pending.add(id);

    let group: THREE.Group;
    let source: CompartmentSource;
    try {
      group = await loadCompartment(definition, this.options.loader, this.options.baseUrl);
      source = 'glb';
    } catch (error) {
      console.warn(`Compartment ${id} fell back to greybox.`, error);
      group = buildGreyboxCompartment(definition);
      source = 'fallback';
    }
    this.pending.delete(id);

    if (this.disposed || !residency(this.currentId ?? id).has(id)) {
      disposeCompartment(group);
      return;
    }

    const resident: Resident = { definition, group, detail, source };
    this.applyDetail(resident);
    this.place(resident);
    this.residents.set(id, resident);
    this.group.add(group);
    if (id === this.currentId) this.options.onSourceChange?.(source);
  }

  /**
   * Compartments are placed by their offset from the occupied one. The hull
   * never translates, so this keeps the whole resident set in the correct
   * relative position without ever moving the ship.
   */
  private place(resident: Resident): void {
    const origin = compartmentById(this.currentId ?? resident.definition.id);
    if (!origin) return;
    resident.group.position.set(
      resident.definition.anchor.x - origin.anchor.x,
      resident.definition.anchor.y - origin.anchor.y,
      resident.definition.anchor.z - origin.anchor.z,
    );
  }

  /**
   * Reduced detail is a visibility decision, not a second asset: two portals
   * away, emissive dressing and small props stop drawing while the shell stays
   * so the space still reads through an open door.
   */
  private applyDetail(resident: Resident): void {
    const reduced = resident.detail === 'reduced';
    resident.group.traverse((entry) => {
      if (!(entry instanceof THREE.Mesh)) return;
      const isShell =
        entry.name.includes('BULKHEAD') ||
        entry.name.includes('DECK') ||
        entry.name.includes('CARPET') ||
        entry.name.startsWith('greybox');
      entry.visible = reduced ? isShell : true;
      entry.castShadow = !reduced;
    });
  }
}
