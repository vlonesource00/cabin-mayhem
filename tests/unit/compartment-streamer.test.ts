import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { compartmentById, residency } from '../../src/data/ship-layout';
import { compartmentRootName, portalMarkerName } from '../../src/three/compartment-loader';
import { CompartmentStreamer, type CompartmentSource } from '../../src/three/compartment-streamer';

/** Serves a valid compartment for every id, or fails for the ids in `broken`. */
const stubLoader = (broken: string[] = []) => ({
  loadAsync: async (url: string) => {
    const id = url.split('/').pop()!.replace('.glb', '');
    if (broken.includes(id)) throw new Error(`refused ${id}`);
    const definition = compartmentById(id)!;
    const scene = new THREE.Group();
    const root = new THREE.Group();
    root.name = compartmentRootName(id);
    scene.add(root);
    for (const portal of definition.portals) {
      const marker = new THREE.Object3D();
      marker.name = portalMarkerName(portal.target);
      root.add(marker);
    }
    for (const name of ['CM_BULKHEAD', 'CM_DECK', 'CM_CARPET', 'CM_NEON_CYAN', 'CM_TRIM']) {
      root.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()));
      root.children.at(-1)!.name = name;
    }
    return { scene };
  },
});

/** Neighbours load in the background, so tests wait for the queue to drain. */
const settle = async () => {
  for (let tick = 0; tick < 8; tick += 1) await Promise.resolve();
};

describe('CompartmentStreamer', () => {
  it('rejects an unknown compartment rather than emptying the scene', async () => {
    const streamer = new CompartmentStreamer({ loader: stubLoader(), baseUrl: '/' });
    await expect(streamer.setCurrent('boiler-room')).rejects.toThrow('Unknown compartment');
  });

  it('makes the occupied compartment and its neighbours resident, and nothing else', async () => {
    const streamer = new CompartmentStreamer({ loader: stubLoader(), baseUrl: '/' });
    await streamer.setCurrent('atrium');
    await settle();

    const names = streamer.group.children.map((child) => child.name);
    expect(streamer.current).toBe('atrium');
    expect(streamer.currentSource).toBe('glb');
    expect(names).toHaveLength(residency('atrium').size);
  });

  it('evicts compartments that leave residency when the crew moves', async () => {
    const streamer = new CompartmentStreamer({ loader: stubLoader(), baseUrl: '/' });
    await streamer.setCurrent('atrium');
    await settle();
    await streamer.setCurrent('bridge');
    await settle();

    const resident = new Set(residency('bridge').keys());
    expect(resident.has('engine-room')).toBe(false);
    expect(streamer.group.children).toHaveLength(resident.size);
  });

  it('hides dressing but keeps the shell at reduced detail', async () => {
    const streamer = new CompartmentStreamer({ loader: stubLoader(), baseUrl: '/' });
    await streamer.setCurrent('atrium');
    await settle();

    const engineRoom = streamer.group.children.find((child) => child.name.includes('engine-room'))!;
    const neon = engineRoom.getObjectByName('CM_NEON_CYAN')!;
    const bulkhead = engineRoom.getObjectByName('CM_BULKHEAD')!;
    expect(neon.visible).toBe(false);
    expect(bulkhead.visible).toBe(true);
  });

  it('falls back to greybox rather than leaving a hole', async () => {
    const sources: (CompartmentSource | 'loading')[] = [];
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const streamer = new CompartmentStreamer({
      loader: stubLoader(['atrium']),
      baseUrl: '/',
      onSourceChange: (source) => sources.push(source),
    });
    await streamer.setCurrent('atrium');
    await settle();

    expect(streamer.currentSource).toBe('fallback');
    expect(sources).toEqual(['loading', 'fallback']);
    const greybox = streamer.group.children.find((child) => child.name === 'Greybox atrium');
    expect(greybox).toBeDefined();
    warn.mockRestore();
  });

  it('places neighbours by their offset from the occupied compartment', async () => {
    const streamer = new CompartmentStreamer({ loader: stubLoader(), baseUrl: '/' });
    await streamer.setCurrent('atrium');
    await settle();

    const atrium = compartmentById('atrium')!;
    const bridge = compartmentById('bridge')!;
    const placed = streamer.group.children.find((child) => child.name.includes('bridge'))!;
    expect(placed.position.z).toBeCloseTo(bridge.anchor.z - atrium.anchor.z, 6);
    expect(placed.position.y).toBeCloseTo(bridge.anchor.y - atrium.anchor.y, 6);
  });
});
