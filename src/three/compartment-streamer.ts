import * as THREE from 'three';
import {
  compartmentById,
  exteriorTier,
  residency,
  shipLayout,
  type CompartmentDefinition,
  type ExteriorTier,
  type ResidencyDetail,
} from '../data/ship-layout';
import {
  buildGreyboxCompartment,
  buildGreyboxExterior,
  disposeCompartment,
  exteriorDressingPrefix,
  loadCompartment,
  loadExterior,
  type GltfLike,
} from './compartment-loader';

/**
 * Keeps the right compartments in the scene and the rest out of it.
 *
 * Residency is the rule from docs/SHIP_LAYOUT.md: the occupied compartment and
 * its direct neighbours at full detail, two portal hops away at reduced detail,
 * nothing beyond. Loading is asynchronous and failure is survivable — a
 * compartment that will not load is shown as greybox rather than as a hole.
 *
 * The ship's exterior is the one exception to residency. It is loaded once and
 * never evicted, because it is what the crew sees through every window and from
 * every open deck, and because a hull that streamed in would be a hull that
 * visibly popped into existence. What varies is how much of it is drawn: the
 * X0/X1/X2 tiers of docs/PERFORMANCE.md section 5.
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
  private exterior: { group: THREE.Group; source: CompartmentSource } | undefined;
  private exteriorPending = false;
  private spectating = false;

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

  /** The source the hull is rendering from, or `loading` before it arrives. */
  get exteriorSource(): CompartmentSource | 'loading' {
    return this.exterior?.source ?? 'loading';
  }

  /** The exterior LOD tier the occupied compartment currently asks for. */
  get currentExteriorTier(): ExteriorTier {
    // The free camera can be anywhere, including a mile off the beam, so the
    // tiers — which are all reasoning about what the *crew* can see from the
    // room they are standing in — stop applying and the whole ship is drawn.
    if (this.spectating) return 'X0';
    return exteriorTier(this.currentId ?? '');
  }

  /**
   * Detach the exterior LOD from the occupied compartment. Purely a view state:
   * residency is untouched, so leaving spectator mode costs no streaming.
   */
  setSpectating(spectating: boolean): void {
    if (this.spectating === spectating) return;
    this.spectating = spectating;
    this.applyExteriorTier();
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

    this.placeExterior();
    this.applyExteriorTier();

    await this.ensure(id, wanted.get(id) ?? 'full');

    const neighbours = [...wanted].filter(([residentId]) => residentId !== id);
    void Promise.all(neighbours.map(([residentId, detail]) => this.ensure(residentId, detail)));
    void this.ensureExterior();
  }

  dispose(): void {
    this.disposed = true;
    for (const resident of this.residents.values()) {
      this.group.remove(resident.group);
      disposeCompartment(resident.group);
    }
    this.residents.clear();
    if (this.exterior) {
      this.group.remove(this.exterior.group);
      disposeCompartment(this.exterior.group);
      this.exterior = undefined;
    }
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
   * Load the hull, once, in the background.
   *
   * It is deliberately not awaited by `setCurrent`: the first compartment must
   * be walkable immediately, and a missing hull costs the view, not the voyage.
   */
  private async ensureExterior(): Promise<void> {
    if (this.exterior || this.exteriorPending || this.disposed) return;
    this.exteriorPending = true;

    const definition = shipLayout.exterior;
    let group: THREE.Group;
    let source: CompartmentSource;
    try {
      group = await loadExterior(definition, this.options.loader, this.options.baseUrl);
      source = 'glb';
    } catch (error) {
      console.warn('The ship exterior fell back to greybox.', error);
      group = buildGreyboxExterior(definition);
      source = 'fallback';
    }
    this.exteriorPending = false;

    if (this.disposed) {
      disposeCompartment(group);
      return;
    }

    this.exterior = { group, source };
    this.placeExterior();
    this.applyExteriorTier();
    this.group.add(group);
  }

  /**
   * The exterior is authored in ship space, so it sits at the negated anchor of
   * whichever compartment the crew occupies — the same rebasing every resident
   * gets, expressed against the ship's own origin rather than a neighbour's.
   */
  private placeExterior(): void {
    const origin = compartmentById(this.currentId ?? '');
    if (!this.exterior || !origin) return;
    this.exterior.group.position.set(-origin.anchor.x, -origin.anchor.y, -origin.anchor.z);
  }

  /**
   * X0 draws the whole ship, X1 keeps the silhouette and drops the dressing and
   * its shadows, X2 draws nothing at all. Nothing here loads or frees anything:
   * the tier is a visibility flag per mesh, so a crew member can walk out of a
   * sealed room into daylight without paying for a stream.
   */
  private applyExteriorTier(): void {
    if (!this.exterior) return;
    const tier = this.currentExteriorTier;
    this.exterior.group.visible = tier !== 'X2';
    if (tier === 'X2') return;

    const full = tier === 'X0';
    this.exterior.group.traverse((entry) => {
      if (!(entry instanceof THREE.Mesh)) return;
      const dressing = entry.name.startsWith(exteriorDressingPrefix);
      entry.visible = full || !dressing;
      entry.castShadow = full;
    });
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
