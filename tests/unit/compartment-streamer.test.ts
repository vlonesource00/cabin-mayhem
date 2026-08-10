import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { compartmentById, residency } from '../../src/data/ship-layout';
import {
  compartmentRootName,
  exteriorDressingPrefix,
  exteriorRootName,
  exteriorStructurePrefix,
  portalMarkerName,
} from '../../src/three/compartment-loader';
import { CompartmentStreamer, type CompartmentSource } from '../../src/three/compartment-streamer';

/** The hull is always resident, so every scene carries one extra child. */
const EXTERIOR_CHILDREN = 1;

/** Serves a valid compartment for every id, or fails for the ids in `broken`. */
const stubLoader = (broken: string[] = []) => ({
  loadAsync: async (url: string) => {
    const id = url.split('/').pop()!.replace('.glb', '');
    if (broken.includes(id)) throw new Error(`refused ${id}`);
    if (id === 'ship-exterior') {
      const scene = new THREE.Group();
      const root = new THREE.Group();
      root.name = exteriorRootName;
      scene.add(root);
      for (const name of [
        `${exteriorStructurePrefix}HULL`,
        `${exteriorStructurePrefix}SUPERSTRUCTURE`,
        `${exteriorDressingPrefix}FUNNEL`,
        `${exteriorDressingPrefix}LIFEBOATS`,
      ]) {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
        mesh.name = name;
        root.add(mesh);
      }
      return { scene };
    }
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
    expect(names).toHaveLength(residency('atrium').size + EXTERIOR_CHILDREN);
  });

  it('evicts compartments that leave residency when the crew moves', async () => {
    const streamer = new CompartmentStreamer({ loader: stubLoader(), baseUrl: '/' });
    await streamer.setCurrent('atrium');
    await settle();
    await streamer.setCurrent('bridge');
    await settle();

    const resident = new Set(residency('bridge').keys());
    expect(resident.has('engine-room')).toBe(false);
    expect(streamer.group.children).toHaveLength(resident.size + EXTERIOR_CHILDREN);
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

    // The engine room is two decks and a good part of the ship's length away
    // from the atrium, so a wrong offset shows up in both axes at once.
    const atrium = compartmentById('atrium')!;
    const engineRoom = compartmentById('engine-room')!;
    const placed = streamer.group.children.find((child) => child.name.includes('engine-room'))!;
    expect(placed.position.z).toBeCloseTo(engineRoom.anchor.z - atrium.anchor.z, 6);
    expect(placed.position.y).toBeCloseTo(engineRoom.anchor.y - atrium.anchor.y, 6);
  });

  it('keeps the hull resident across a move and rebases it on the ship origin', async () => {
    const streamer = new CompartmentStreamer({ loader: stubLoader(), baseUrl: '/' });
    await streamer.setCurrent('atrium');
    await settle();

    const hull = streamer.group.children.find((child) => child.getObjectByName(exteriorRootName))!;
    expect(streamer.exteriorSource).toBe('glb');

    await streamer.setCurrent('bridge');
    await settle();

    // Same object, never streamed out — only moved onto the new origin.
    const bridge = compartmentById('bridge')!;
    expect(streamer.group.children).toContain(hull);
    expect(hull.position.z).toBeCloseTo(-bridge.anchor.z, 6);
    expect(hull.position.y).toBeCloseTo(-bridge.anchor.y, 6);
  });

  it('draws the whole ship from an open deck and nothing from a sealed room', async () => {
    const streamer = new CompartmentStreamer({ loader: stubLoader(), baseUrl: '/' });
    await streamer.setCurrent('pool-deck');
    await settle();

    const hull = streamer.group.children.find((child) => child.getObjectByName(exteriorRootName))!;
    const funnel = hull.getObjectByName(`${exteriorDressingPrefix}FUNNEL`)!;
    expect(streamer.currentExteriorTier).toBe('X0');
    expect(hull.visible).toBe(true);
    expect(funnel.visible).toBe(true);
    expect(funnel.castShadow).toBe(true);

    // A stair shaft is a blind trunk: nothing in it can see the hull at all.
    await streamer.setCurrent('stairwell-aft');
    await settle();
    expect(streamer.currentExteriorTier).toBe('X2');
    expect(hull.visible).toBe(false);
  });

  it('keeps the silhouette but drops the dressing through a window', async () => {
    const streamer = new CompartmentStreamer({ loader: stubLoader(), baseUrl: '/' });
    // A cabin window, not the wheelhouse: the bridge is panoramic and pays for
    // the whole ship, which is the case the tier test covers.
    await streamer.setCurrent('cabin-deck-four');
    await settle();

    const hull = streamer.group.children.find((child) => child.getObjectByName(exteriorRootName))!;
    const structure = hull.getObjectByName(`${exteriorStructurePrefix}HULL`)!;
    const funnel = hull.getObjectByName(`${exteriorDressingPrefix}FUNNEL`)!;
    expect(streamer.currentExteriorTier).toBe('X1');
    expect(hull.visible).toBe(true);
    expect(structure.visible).toBe(true);
    expect(structure.castShadow).toBe(false);
    expect(funnel.visible).toBe(false);
  });

  it('falls back to a ship-sized greybox rather than an empty horizon', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const streamer = new CompartmentStreamer({
      loader: stubLoader(['ship-exterior']),
      baseUrl: '/',
    });
    await streamer.setCurrent('pool-deck');
    await settle();

    expect(streamer.exteriorSource).toBe('fallback');
    const hull = streamer.group.children.find((child) => child.getObjectByName(exteriorRootName));
    expect(hull).toBeDefined();
    warn.mockRestore();
  });
});
