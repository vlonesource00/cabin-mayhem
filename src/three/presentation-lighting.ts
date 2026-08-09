import * as THREE from 'three';

export const presentationLightingBudget = {
  maxZoneLights: 8,
  shadowMapSize: 1024,
  maxPixelRatio: 1.5,
} as const;

export interface PresentationLighting {
  readonly zoneLights: readonly THREE.PointLight[];
  readonly key: THREE.DirectionalLight;
  readonly rim: THREE.DirectionalLight;
  updateElectrical(health: number, breakerFault: boolean, elapsed: number): void;
}

/** Applies color management plus bounded, device-scaled render cost. */
export function configurePresentationRenderer(renderer: THREE.WebGLRenderer): void {
  const devicePixelRatio = typeof window === 'undefined' ? 1 : window.devicePixelRatio;
  renderer.setPixelRatio(
    Math.min(Math.max(devicePixelRatio, 1), presentationLightingBudget.maxPixelRatio),
  );
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = true;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
}

/**
 * One shadow-casting key handles contact definition. Hemisphere, rim and eight
 * non-shadowing zones supply readable color without multiplying shadow passes.
 */
export function buildPresentationLighting(
  scene: THREE.Scene,
  cabin: THREE.Group,
): PresentationLighting {
  const hemisphere = new THREE.HemisphereLight(0xb9dfff, 0x17202a, 1.2);
  scene.add(hemisphere);

  const key = new THREE.DirectionalLight(0xfff1d5, 2.35);
  key.position.set(-8, 13, -10);
  key.target.position.set(0, 1.1, 0);
  key.castShadow = true;
  key.shadow.mapSize.set(
    presentationLightingBudget.shadowMapSize,
    presentationLightingBudget.shadowMapSize,
  );
  key.shadow.camera.near = 0.5;
  key.shadow.camera.far = 90;
  key.shadow.camera.left = -18;
  key.shadow.camera.right = 18;
  key.shadow.camera.top = 30;
  key.shadow.camera.bottom = -24;
  key.shadow.bias = -0.00025;
  key.shadow.normalBias = 0.035;
  key.shadow.radius = 2;
  scene.add(key, key.target);

  const rim = new THREE.DirectionalLight(0x76c8ff, 0.85);
  rim.position.set(8, 7, 14);
  rim.target.position.set(0, 1.4, -4);
  scene.add(rim, rim.target);

  const zoneLights: THREE.PointLight[] = [];
  const positions: ReadonlyArray<readonly [number, number, number]> = [
    [-2.8, 5.4, -20.125],
    [2.8, 5.4, -14.375],
    [-2.8, 5.4, -8.625],
    [2.8, 5.4, -2.875],
    [-2.8, 5.4, 2.875],
    [2.8, 5.4, 8.625],
    [-2.8, 5.4, 14.375],
    [2.8, 5.4, 20.125],
  ];
  for (const [index, position] of positions.entries()) {
    const light = new THREE.PointLight(index % 2 === 0 ? 0xd8f2ff : 0xa8d6ff, 2.8, 18, 1.8);
    light.position.set(...position);
    light.castShadow = false;
    zoneLights.push(light);
    cabin.add(light);
  }

  return {
    zoneLights,
    key,
    rim,
    updateElectrical(health: number, breakerFault: boolean, elapsed: number): void {
      const clampedHealth = THREE.MathUtils.clamp(health, 0, 1);
      for (const [index, light] of zoneLights.entries()) {
        const flicker =
          breakerFault && Math.sin(elapsed * 21 + index * 3.1) > 0.12
            ? true
            : clampedHealth < 0.75 && Math.sin(elapsed * 17 + index * 4.2) > clampedHealth;
        light.intensity = flicker ? 0.12 : 2.2 + clampedHealth * 1.3;
        light.color.setHex(
          breakerFault || clampedHealth < 0.45
            ? index % 2 === 0
              ? 0xff704d
              : 0xffa45f
            : index % 2 === 0
              ? 0xd8f2ff
              : 0xa8d6ff,
        );
      }
      key.intensity = 1.85 + clampedHealth * 0.5;
      rim.intensity = 0.62 + clampedHealth * 0.25;
    },
  };
}
