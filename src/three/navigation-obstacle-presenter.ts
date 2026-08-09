import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type {
  NavigationIncidentPhase,
  NavigationObstacleKind,
  NavigationObstacleState,
} from '../sim/types';

export const navigationObstacleAssetPath = 'assets/obstacles/navigation-vessel.glb';
export const navigationObstacleRootName = 'CM_NAVIGATION_OBSTACLE_VESSEL_ROOT';

export type NavigationObstacleAssetSource = 'loading' | 'glb' | 'procedural-fallback';

export interface NavigationObstacleGltfLike {
  loadAsync(url: string): Promise<{ scene: THREE.Group }>;
}

export interface NavigationObstaclePresenterOptions {
  baseUrl?: string;
  loader?: NavigationObstacleGltfLike;
}

export function navigationObstacleAssetUrl(baseUrl = import.meta.env.BASE_URL): string {
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return `${base}${navigationObstacleAssetPath}`;
}

/**
 * Presentation-only sea contact. The host owns the obstacle coordinates; this
 * presenter loads the authored Blender GLB for the vessel kind and keeps the
 * marker/feedback shell shared by future obstacle kinds. A small procedural
 * silhouette is deliberately retained only for an explicit asset-load failure
 * or for a kind that has not received an authored GLB yet.
 */
export class NavigationObstaclePresenter {
  public readonly group = new THREE.Group();
  private readonly accent = new THREE.MeshStandardMaterial({
    color: 0xffb24a,
    emissive: 0x5b2500,
    emissiveIntensity: 0.8,
    roughness: 0.48,
    metalness: 0.42,
  });
  private readonly marker = new THREE.MeshBasicMaterial({
    color: 0xffb24a,
    transparent: true,
    opacity: 0.9,
  });
  private readonly light = new THREE.PointLight(0xffb24a, 3.2, 18, 1.4);
  private readonly models = new Map<NavigationObstacleKind, THREE.Object3D>();
  private readonly loader: NavigationObstacleGltfLike;
  private readonly baseUrl: string;
  private readonly readyPromise: Promise<NavigationObstacleAssetSource>;
  private renderedKind?: NavigationObstacleKind;
  private currentState?: {
    obstacle: NavigationObstacleState;
    phase: NavigationIncidentPhase;
    elapsedSeconds: number;
  };
  private authoredVessel?: THREE.Object3D;
  private _assetSource: NavigationObstacleAssetSource = 'loading';

  public constructor(options: NavigationObstaclePresenterOptions = {}) {
    this.loader = options.loader ?? new GLTFLoader();
    this.baseUrl = options.baseUrl ?? import.meta.env.BASE_URL;
    this.group.name = 'host-authoritative navigation obstacle';
    this.group.userData.feedback = 'navigation-obstacle';
    this.group.userData.assetPath = navigationObstacleAssetPath;
    this.group.userData.assetSource = this._assetSource;
    this.group.add(this.markerRing(), this.markerMast());
    this.group.add(this.light);
    // Never show the procedural model while the production GLB is still
    // loading. This makes the GLB the normal visual path rather than a frame-
    // zero placeholder that could be mistaken for delivered art.
    this.group.visible = false;
    this.readyPromise = this.loadAuthoredVessel();
  }

  public get assetSource(): NavigationObstacleAssetSource {
    return this._assetSource;
  }

  public get assetPath(): string {
    return navigationObstacleAssetPath;
  }

  public ready(): Promise<NavigationObstacleAssetSource> {
    return this.readyPromise;
  }

  public sync(
    obstacle: NavigationObstacleState,
    phase: NavigationIncidentPhase,
    elapsedSeconds: number,
  ): void {
    this.currentState = { obstacle, phase, elapsedSeconds };
    this.selectModel(obstacle.kind);
    this.applyState(obstacle, phase, elapsedSeconds);
  }

  private async loadAuthoredVessel(): Promise<NavigationObstacleAssetSource> {
    try {
      const gltf = await this.loader.loadAsync(navigationObstacleAssetUrl(this.baseUrl));
      const scene = gltf.scene;
      if (!scene.getObjectByName(navigationObstacleRootName))
        throw new Error(`Navigation obstacle GLB is missing ${navigationObstacleRootName}.`);
      let meshCount = 0;
      scene.traverse((entry) => {
        if (!(entry instanceof THREE.Mesh)) return;
        meshCount += 1;
        entry.castShadow = true;
        entry.receiveShadow = true;
      });
      if (meshCount < 4) throw new Error('Navigation obstacle GLB contains too few render meshes.');
      scene.name = 'Authored navigation vessel GLB';
      scene.userData.obstacleModel = true;
      scene.userData.assetSource = 'glb';
      this.authoredVessel = scene;
      this.models.set('vessel', scene);
      this.setAssetSource('glb');
      if (this.currentState?.obstacle.kind === 'vessel') this.selectModel('vessel');
      return this._assetSource;
    } catch (error) {
      this.setAssetSource('procedural-fallback');
      this.group.userData.fallbackReason = error instanceof Error ? error.message : String(error);
      if (this.currentState?.obstacle.kind === 'vessel') this.selectModel('vessel');
      return this._assetSource;
    }
  }

  private setAssetSource(source: NavigationObstacleAssetSource): void {
    this._assetSource = source;
    this.group.userData.assetSource = source;
  }

  private selectModel(kind: NavigationObstacleKind): void {
    const currentModel = this.group.children.find((child) => child.userData.obstacleModel === true);
    const desiredSource = kind === 'vessel' && this.authoredVessel ? 'glb' : 'procedural-fallback';
    if (this.renderedKind === kind && currentModel?.userData.assetSource === desiredSource) return;

    for (const child of [...this.group.children])
      if (child.userData.obstacleModel) this.group.remove(child);

    const authored = kind === 'vessel' ? this.authoredVessel : undefined;
    const model = authored ?? this.models.get(kind) ?? this.fallbackModel(kind);
    model.userData.obstacleModel = true;
    model.userData.assetSource = authored ? 'glb' : 'procedural-fallback';
    this.group.add(model);
    this.renderedKind = kind;
    if (!authored && this._assetSource === 'glb') {
      this.group.userData.fallbackReason = `No authored GLB is registered for obstacle kind ${kind}.`;
    }
  }

  private applyState(
    obstacle: NavigationObstacleState,
    phase: NavigationIncidentPhase,
    elapsedSeconds: number,
  ): void {
    const visible = phase !== 'idle' && phase !== 'repaired';
    this.group.visible = visible;
    this.group.userData.phase = phase;
    this.group.userData.relativePosition = { ...obstacle.relativePosition };
    if (!visible) return;

    const target = new THREE.Vector3(
      obstacle.relativePosition.x,
      0.35,
      obstacle.relativePosition.y,
    );
    this.group.position.lerp(target, 0.72);
    const pulse = 1 + Math.sin(elapsedSeconds * 7) * (phase === 'warning' ? 0.08 : 0.035);
    this.group.scale.setScalar(pulse);
    this.group.rotation.y = Math.sin(elapsedSeconds * 0.8) * 0.06;
    if (phase === 'impact' || phase === 'repair') {
      this.group.rotation.z = Math.sin(elapsedSeconds * 32) * 0.08;
      this.setColor(0xff4e43, 0xa81820);
    } else if (phase === 'avoided') {
      this.group.rotation.z = 0;
      this.setColor(0x57edcf, 0x0e5d55);
    } else {
      this.group.rotation.z = 0;
      this.setColor(0xffb24a, 0x5b2500);
    }
  }

  private fallbackModel(kind: NavigationObstacleKind): THREE.Group {
    const model =
      kind === 'drifting-container'
        ? this.containerModel()
        : kind === 'reef'
          ? this.reefModel()
          : kind === 'derelict'
            ? this.derelictModel()
            : this.vesselModel();
    model.userData.fallbackKind = kind;
    return model;
  }

  /** Explicit load-failure/future-kind fallback; not the delivered vessel art. */
  private vesselModel(): THREE.Group {
    const model = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.75, 7.2), this.accent);
    hull.position.y = 0.3;
    hull.rotation.y = Math.PI * 0.08;
    hull.castShadow = true;
    model.add(hull);
    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(2.1, 1.2, 2.1),
      new THREE.MeshStandardMaterial({ color: 0xd8d6cd, emissive: 0x352f25, roughness: 0.58 }),
    );
    cabin.position.set(0, 1.1, -0.4);
    cabin.castShadow = true;
    model.add(cabin);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 3.2, 8), this.accent);
    mast.position.set(0, 2.45, 1.35);
    model.add(mast);
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), this.marker);
    beacon.position.set(0, 4.05, 1.35);
    model.add(beacon);
    return model;
  }

  private containerModel(): THREE.Group {
    const model = new THREE.Group();
    const box = new THREE.Mesh(new THREE.BoxGeometry(3.4, 2.1, 2.7), this.accent);
    box.position.y = 1.2;
    box.castShadow = true;
    model.add(box);
    return model;
  }

  private reefModel(): THREE.Group {
    const model = new THREE.Group();
    for (const [x, z, scale] of [
      [-1.4, 0, 1.1],
      [0.2, 0.3, 1.5],
      [1.25, -0.2, 0.9],
    ] as const) {
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(scale, 0), this.accent);
      rock.position.set(x, scale * 0.5, z);
      rock.castShadow = true;
      model.add(rock);
    }
    return model;
  }

  private derelictModel(): THREE.Group {
    const model = this.vesselModel();
    model.rotation.z = -0.18;
    return model;
  }

  private markerRing(): THREE.Mesh {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(4.8, 0.07, 8, 40), this.marker);
    ring.name = 'navigation contact distance marker';
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.04;
    return ring;
  }

  private markerMast(): THREE.Mesh {
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 6.8, 8), this.marker);
    mast.name = 'navigation contact range mast';
    mast.position.y = 3.1;
    return mast;
  }

  private setColor(color: number, emissive: number): void {
    this.accent.color.setHex(color);
    this.accent.emissive.setHex(emissive);
    this.marker.color.setHex(color);
    this.light.color.setHex(color);
    this.light.intensity = color === 0xff4e43 ? 5.5 : 3.2;
  }
}
