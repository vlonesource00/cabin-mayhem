import * as THREE from 'three';

import { oceanWaveGlsl } from '../sim/ocean';
import type { HullMotion, SeaState } from '../sim/types';

/** Metres from the cabin floor down to mean sea level. */
export const seaLevel = -6;

/**
 * Z of the hull centre in cabin coordinates.
 *
 * Pitch and roll pivot here rather than at the world origin, which sits near
 * the bow: rotating about the origin would heave the stern by metres.
 */
const hullCentreZ = 7.25;

const extent = 1400;
const segments = 156;

/**
 * The sea the ship rides on.
 *
 * The surface is displaced by GLSL generated from the same wave table the
 * simulation samples, so the water the player sees and the water the hull is
 * fitted to cannot drift apart. The geometry itself never moves: headway is
 * applied as a texture-space drift offset, and hull attitude is applied by
 * counter-rotating this group under a hull that holds the world origin.
 */
export class OceanSurface {
  public readonly group = new THREE.Group();

  private readonly material: THREE.MeshStandardMaterial;
  private readonly geometry: THREE.PlaneGeometry;
  private readonly uniforms = {
    cmTime: { value: 0 },
    cmSwell: { value: 0 },
    cmDrift: { value: new THREE.Vector2() },
  };

  public constructor() {
    this.group.name = 'Ocean';
    this.group.position.z = hullCentreZ;
    this.geometry = new THREE.PlaneGeometry(extent, extent, segments, segments);
    // Rotate the geometry rather than the mesh so object space matches world
    // space: the shader then displaces straight along +Y.
    this.geometry.rotateX(-Math.PI / 2);

    this.material = new THREE.MeshStandardMaterial({
      color: 0x11618a,
      roughness: 0.28,
      metalness: 0.06,
    });
    this.material.onBeforeCompile = (shader) => {
      shader.uniforms.cmTime = this.uniforms.cmTime;
      shader.uniforms.cmSwell = this.uniforms.cmSwell;
      shader.uniforms.cmDrift = this.uniforms.cmDrift;
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          [
            '#include <common>',
            'uniform float cmTime;',
            'uniform float cmSwell;',
            'uniform vec2 cmDrift;',
            oceanWaveGlsl(),
          ].join('\n'),
        )
        .replace(
          '#include <beginnormal_vertex>',
          [
            '#include <beginnormal_vertex>',
            'vec2 cmPoint = position.xz + cmDrift;',
            'float cmHeight = cmSeaHeight(cmPoint, cmTime, cmSwell);',
            'float cmStep = 1.5;',
            'float cmHeightX = cmSeaHeight(cmPoint + vec2(cmStep, 0.0), cmTime, cmSwell);',
            'float cmHeightZ = cmSeaHeight(cmPoint + vec2(0.0, cmStep), cmTime, cmSwell);',
            'objectNormal = normalize(vec3(-(cmHeightX - cmHeight) / cmStep, 1.0, -(cmHeightZ - cmHeight) / cmStep));',
          ].join('\n'),
        )
        .replace(
          '#include <begin_vertex>',
          ['#include <begin_vertex>', 'transformed.y += cmHeight;'].join('\n'),
        );
    };

    const water = new THREE.Mesh(this.geometry, this.material);
    water.name = 'Sea surface';
    water.position.set(0, seaLevel, -hullCentreZ);
    // A plane this size would dominate every shadow map for no visual gain.
    water.castShadow = false;
    water.receiveShadow = false;
    // Always drawn: it is the ground, and frustum culling on a shader-displaced
    // plane uses the undisplaced bounds anyway.
    water.frustumCulled = false;
    this.group.add(water);
  }

  /**
   * Project authoritative sea and hull state onto the surface.
   *
   * `time` is the voyage clock, not the render clock, so every client fitted to
   * the same snapshot sees the same wave.
   */
  public sync(sea: SeaState, hull: HullMotion, time: number): void {
    this.uniforms.cmTime.value = time;
    this.uniforms.cmSwell.value = sea.swell;
    this.uniforms.cmDrift.value.set(sea.drift.x, sea.drift.y);
    // The hull is fixed at the origin, so its attitude shows up as the ocean
    // tilting and sinking the other way.
    this.group.rotation.set(-hull.pitch, 0, -hull.roll);
    this.group.position.set(0, -hull.heave, hullCentreZ);
  }

  public dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}
