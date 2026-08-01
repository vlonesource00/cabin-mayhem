import * as THREE from 'three';
import { needLabel } from '../sim/service-mission';
import type { CabinObject, MissionState, ObjectKind, PassengerState } from '../sim/types';
import { cabinToWorld } from './coordinates';

const colors = {
  navy: 0x101a28,
  navySoft: 0x1b2a3c,
  cream: 0xd8d6cd,
  panel: 0xb9bec1,
  carpet: 0x263644,
  orange: 0xff8a3d,
  cyan: 0x63d9ff,
  red: 0xff4e43,
  cargo: 0x987143,
};

export class CabinWorld {
  public readonly canvas: HTMLCanvasElement;
  public readonly camera = new THREE.PerspectiveCamera(72, 1, 0.05, 160);

  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly cabin = new THREE.Group();
  private readonly startedAt = performance.now();
  private readonly raycaster = new THREE.Raycaster();
  private readonly dynamicObjects = new Map<string, THREE.Group>();
  private readonly passengerAvatars = new Map<string, THREE.Group>();
  private readonly interactionRoots: THREE.Object3D[] = [];
  private readonly cabinLights: THREE.PointLight[] = [];
  private readonly crewBravo: THREE.Group;
  private readonly galleyFire: THREE.Group;
  private interactionPrompt = 'CLICK TO CAPTURE MOUSE';
  private targetObjectId: string | null = null;

  public constructor(private readonly mount: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.canvas = this.renderer.domElement;
    this.canvas.dataset.testid = 'three-canvas';
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.scene.background = new THREE.Color(0x07111d);
    this.scene.fog = new THREE.FogExp2(0x0b1624, 0.018);
    this.mount.append(this.canvas);

    this.buildLighting();
    this.buildCabin();
    this.galleyFire = this.createGalleyFire();
    this.cabin.add(this.galleyFire);
    this.crewBravo = this.createCrewAvatar(0x38bdf8);
    this.cabin.add(this.crewBravo);
    this.scene.add(this.cabin);
    this.resize();
    window.addEventListener('resize', this.resize);
  }

  public render(state: MissionState): void {
    const elapsed = this.elapsed();
    this.syncState(state, elapsed);
    this.updateInteraction(state);
    this.renderer.render(this.scene, this.camera);
  }

  public prompt(): string {
    return this.interactionPrompt;
  }

  public interactionTarget(): string | null {
    return this.targetObjectId;
  }

  public elapsed(): number {
    return (performance.now() - this.startedAt) / 1000;
  }

  public dispose(): void {
    window.removeEventListener('resize', this.resize);
    this.scene.traverse((entry) => {
      if (entry instanceof THREE.Mesh) {
        entry.geometry.dispose();
        const materials = Array.isArray(entry.material) ? entry.material : [entry.material];
        for (const material of materials) {
          if (material instanceof THREE.MeshStandardMaterial && material.map)
            material.map.dispose();
          material.dispose();
        }
      }
    });
    this.renderer.dispose();
    this.canvas.remove();
  }

  private readonly resize = (): void => {
    const width = Math.max(1, this.mount.clientWidth);
    const height = Math.max(1, this.mount.clientHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  };

  private buildLighting(): void {
    this.scene.add(new THREE.HemisphereLight(0xb9dfff, 0x17202a, 1.35));
    const sun = new THREE.DirectionalLight(0xfff4da, 2.2);
    sun.position.set(-7, 12, -8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -12;
    sun.shadow.camera.right = 12;
    sun.shadow.camera.top = 20;
    sun.shadow.camera.bottom = -8;
    this.scene.add(sun);

    for (let z = -2; z <= 16; z += 4.5) {
      const light = new THREE.PointLight(0xd8f2ff, 3.1, 7.5, 1.6);
      light.position.set(0, 2.75, z);
      this.cabinLights.push(light);
      this.cabin.add(light);
    }
  }

  private buildCabin(): void {
    const floorMaterial = this.material(colors.carpet, 0.86, 0.05);
    const shellMaterial = this.material(colors.cream, 0.68, 0.08);
    const trimMaterial = this.material(colors.panel, 0.48, 0.35);

    this.cabin.add(this.box('floor', [8.4, 0.18, 20.5], [0, -0.09, 7.25], floorMaterial));
    this.cabin.add(this.box('left wall', [0.18, 2.65, 20.5], [-4.1, 1.32, 7.25], shellMaterial));
    this.cabin.add(this.box('right wall', [0.18, 2.65, 20.5], [4.1, 1.32, 7.25], shellMaterial));
    this.cabin.add(this.box('ceiling', [6.8, 0.16, 20.5], [0, 3.08, 7.25], shellMaterial));

    const leftSlope = this.box('left roof', [1.8, 0.16, 20.5], [-3.35, 2.78, 7.25], shellMaterial);
    leftSlope.rotation.z = -0.34;
    const rightSlope = this.box('right roof', [1.8, 0.16, 20.5], [3.35, 2.78, 7.25], shellMaterial);
    rightSlope.rotation.z = 0.34;
    this.cabin.add(leftSlope, rightSlope);

    for (let z = -1.5; z <= 16.5; z += 2.25) {
      this.cabin.add(this.box('floor rib', [8.22, 0.025, 0.055], [0, 0.015, z], trimMaterial));
      this.addWindows(z + 0.45);
    }

    this.buildCockpit();
    this.buildPassengerCabin();
    this.buildCargoBay();
    this.buildDoorsAndSigns();
  }

  private buildCockpit(): void {
    const dark = this.material(colors.navy, 0.62, 0.35);
    const instrument = this.material(0x172939, 0.4, 0.45, 0x1f6f91);
    const bulkhead = this.box(
      'cockpit bulkhead',
      [8, 2.9, 0.18],
      [0, 1.45, 0.55],
      this.material(colors.navySoft),
    );
    this.cabin.add(bulkhead);

    const doorway = this.box(
      'cockpit doorway',
      [1.65, 2.45, 0.23],
      [0, 1.22, 0.49],
      this.material(0x07111d),
    );
    this.cabin.add(doorway);

    const panel = this.box('flight deck', [6.8, 1.05, 1.05], [0, 1.05, -2.25], instrument);
    panel.rotation.x = -0.18;
    panel.userData.interaction = 'Cockpit controls — R/F throttle, arrows pitch/roll, J/L yaw';
    this.interactionRoots.push(panel);
    this.cabin.add(panel);

    for (const x of [-2.25, -0.75, 0.75, 2.25]) {
      const screen = this.box(
        'instrument display',
        [1.1, 0.04, 0.48],
        [x, 1.42, -1.76],
        this.material(0x07141d, 0.28, 0.25, colors.cyan),
      );
      screen.rotation.x = -1.18;
      this.cabin.add(screen);
    }

    this.cabin.add(this.createSeat(-1.25, -0.85, 0x263648, true));
    this.cabin.add(this.createSeat(1.25, -0.85, 0x263648, true));
    this.cabin.add(this.label('FLIGHT DECK', [0, 2.35, 0.38], 1.5, 0.32, colors.cyan));

    const windscreenMaterial = this.material(0x244e68, 0.18, 0.72, 0x14394d);
    for (const x of [-2.3, -0.75, 0.75, 2.3]) {
      const glass = this.box('windscreen', [1.3, 0.05, 0.8], [x, 2.2, -2.9], windscreenMaterial);
      glass.rotation.x = -0.55;
      this.cabin.add(glass);
    }
    this.cabin.add(this.box('cockpit nose', [8.1, 3.05, 0.25], [0, 1.5, -3.2], dark));
  }

  private buildPassengerCabin(): void {
    const seatXs = [-2.85, -1.65, 1.65, 2.85];
    for (let row = 0; row < 8; row += 1) {
      const z = 2.1 + row * 1.38;
      for (const x of seatXs)
        this.cabin.add(this.createSeat(x, z, row % 2 === 0 ? 0x234c62 : 0x2a5b70));
      this.cabin.add(this.createOverheadBin(-3.25, z));
      this.cabin.add(this.createOverheadBin(3.25, z));
    }

    for (let z = 2.2; z < 12.5; z += 2.75) {
      const strip = this.box(
        'aisle light',
        [0.12, 0.02, 1.8],
        [0, 3, z],
        this.material(0xeaf8ff, 0.3, 0.15, 0xb8e8ff),
      );
      this.cabin.add(strip);
    }
  }

  private buildCargoBay(): void {
    const metal = this.material(0x66727b, 0.62, 0.62);
    const divider = this.box(
      'cargo divider',
      [8, 2.85, 0.16],
      [0, 1.42, 13.25],
      this.material(colors.navySoft),
    );
    this.cabin.add(divider);
    this.cabin.add(
      this.box('cargo opening', [1.8, 2.4, 0.22], [0, 1.2, 13.18], this.material(0x07111d)),
    );
    this.cabin.add(this.label('CARGO / SERVICE', [0, 2.55, 13.08], 1.7, 0.28, colors.orange));

    for (const x of [-3.2, 3.2]) {
      for (const y of [0.5, 1.45, 2.4])
        this.cabin.add(this.box('shelf', [1.35, 0.1, 4.15], [x, y, 15.5], metal));
      for (const z of [13.6, 17.45])
        this.cabin.add(this.box('shelf post', [0.12, 2.5, 0.12], [x, 1.25, z], metal));
    }
    const cargoDoor = this.box(
      'cargo door',
      [0.16, 2.3, 2.2],
      [4.01, 1.2, 16],
      this.material(0x9aa2a6, 0.55, 0.25),
    );
    cargoDoor.userData.interaction = 'Cargo door — locked during flight';
    this.interactionRoots.push(cargoDoor);
    this.cabin.add(cargoDoor);
  }

  private buildDoorsAndSigns(): void {
    const emergency = this.material(colors.red, 0.4, 0.2, 0x6e1711);
    for (const side of [-1, 1]) {
      const door = this.box(
        'emergency exit',
        [0.2, 2.15, 1.35],
        [side * 4.01, 1.1, 7.7],
        this.material(0xc2c8c9, 0.58, 0.22),
      );
      door.userData.interaction = 'Emergency exit — armed';
      this.interactionRoots.push(door);
      this.cabin.add(door);
      const sign = this.box('exit sign', [0.22, 0.25, 0.8], [side * 3.95, 2.45, 7.7], emergency);
      this.cabin.add(sign);
    }
  }

  private addWindows(z: number): void {
    const glass = this.material(0x4ba3c7, 0.24, 0.55, 0x174d69);
    for (const side of [-1, 1]) {
      const window = this.box('window', [0.08, 0.58, 0.82], [side * 4.02, 1.75, z], glass);
      this.cabin.add(window);
    }
  }

  private createSeat(x: number, z: number, color: number, cockpit = false): THREE.Group {
    const group = new THREE.Group();
    group.name = cockpit ? 'pilot seat' : 'passenger seat';
    const fabric = this.material(color, 0.82, 0.04);
    const frame = this.material(0x7b858c, 0.5, 0.72);
    const cushion = this.box('seat cushion', [0.92, 0.22, 0.72], [0, 0.56, 0], fabric);
    const back = this.box('seat back', [0.92, 1.22, 0.2], [0, 1.18, 0.31], fabric);
    back.rotation.x = -0.08;
    const head = this.box(
      'headrest',
      [0.76, 0.35, 0.24],
      [0, 1.78, 0.34],
      this.material(colors.orange, 0.7),
    );
    group.add(cushion, back, head);
    for (const legX of [-0.34, 0.34])
      group.add(this.box('seat leg', [0.08, 0.52, 0.08], [legX, 0.25, 0.1], frame));
    group.position.set(x, 0, z);
    group.userData.interaction = cockpit ? 'Pilot seat' : 'Passenger seat — secured';
    this.interactionRoots.push(group);
    return group;
  }

  private createOverheadBin(x: number, z: number): THREE.Group {
    const group = new THREE.Group();
    const bin = this.box(
      'overhead bin',
      [1.35, 0.62, 1.15],
      [0, 0, 0],
      this.material(0xbfc3bd, 0.72, 0.15),
    );
    const handle = this.box(
      'bin handle',
      [0.42, 0.04, 0.08],
      [x < 0 ? 0.6 : -0.6, -0.1, 0],
      this.material(0x62696d, 0.4, 0.65),
    );
    group.add(bin, handle);
    group.position.set(x, 2.35, z);
    group.userData.interaction = 'Overhead bin — sealed in Phase 1';
    this.interactionRoots.push(group);
    return group;
  }

  private createCrewAvatar(color: number): THREE.Group {
    const group = new THREE.Group();
    const uniform = this.material(color, 0.72, 0.08);
    const skin = this.material(0xc58c6c, 0.78, 0.02);
    group.add(this.box('crew torso', [0.58, 0.82, 0.34], [0, 1.08, 0], uniform));
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.23, 16, 12), skin);
    head.position.y = 1.66;
    head.castShadow = true;
    group.add(head);
    for (const x of [-0.18, 0.18])
      group.add(this.box('crew leg', [0.16, 0.72, 0.18], [x, 0.36, 0], this.material(colors.navy)));
    return group;
  }

  private createPassengerAvatar(passenger: PassengerState): THREE.Group {
    const group = new THREE.Group();
    group.name = passenger.name;
    const clothes = this.material(Number.parseInt(passenger.color.slice(1), 16), 0.8, 0.03);
    const skin = this.material(0xc99072, 0.82, 0.01);
    group.add(this.box('passenger torso', [0.56, 0.72, 0.32], [0, 1.15, 0.05], clothes));
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 18, 14), skin);
    head.name = 'passenger head';
    head.position.set(0, 1.68, 0.08);
    head.castShadow = true;
    group.add(head);
    for (const x of [-0.19, 0.19]) {
      const leg = this.box('passenger leg', [0.15, 0.54, 0.16], [x, 0.57, -0.18], clothes);
      leg.rotation.x = -1.15;
      group.add(leg);
      const arm = this.box('passenger arm', [0.13, 0.55, 0.13], [x * 1.72, 1.12, -0.02], skin);
      arm.rotation.x = -0.35;
      group.add(arm);
    }
    const beacon = new THREE.Mesh(
      new THREE.TorusGeometry(0.22, 0.035, 8, 24),
      new THREE.MeshBasicMaterial({ color: colors.orange, transparent: true, opacity: 0.95 }),
    );
    beacon.name = 'request beacon';
    beacon.position.y = 2.18;
    beacon.rotation.x = Math.PI / 2;
    group.add(beacon);
    const hitbox = new THREE.Mesh(
      new THREE.BoxGeometry(0.85, 2.25, 0.85),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
    );
    hitbox.position.y = 1.1;
    group.add(hitbox);
    group.userData.passengerId = passenger.id;
    this.interactionRoots.push(group);
    this.cabin.add(group);
    return group;
  }

  private createObjectAsset(object: CabinObject): THREE.Group {
    const group = new THREE.Group();
    group.name = object.name;
    const asset = objectAsset(object.kind, this);
    const interactionHitbox = new THREE.Mesh(
      new THREE.BoxGeometry(Math.max(0.9, object.radius * 1.4), 1.75, Math.max(0.8, object.radius)),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
    );
    interactionHitbox.name = 'interaction hitbox';
    interactionHitbox.position.y = 0.85;
    group.add(asset, interactionHitbox);
    group.userData.interaction = `${object.name} — E grab/place, Q throw`;
    group.userData.objectId = object.id;
    this.interactionRoots.push(group);
    this.cabin.add(group);
    return group;
  }

  private createGalleyFire(): THREE.Group {
    const group = new THREE.Group();
    group.name = 'galley fire';
    const ember = new THREE.Mesh(
      new THREE.CylinderGeometry(0.62, 0.8, 0.16, 18),
      this.material(0x2a1514, 0.56, 0.18, 0x7f1200),
    );
    ember.position.y = 0.08;
    group.add(ember);
    const flameOffsets: Array<readonly [number, number]> = [
      [-0.36, 0.24],
      [0, 0.42],
      [0.32, 0.18],
      [0.08, -0.28],
    ];
    for (const [index, offset] of flameOffsets.entries()) {
      const flame = new THREE.Mesh(
        new THREE.ConeGeometry(index % 2 === 0 ? 0.24 : 0.18, 0.88 + index * 0.08, 10),
        this.material(index % 2 === 0 ? 0xff5a1f : 0xffca3a, 0.35, 0.15, 0xff3b13),
      );
      flame.name = 'fire flame';
      flame.position.set(offset[0], 0.48, offset[1]);
      flame.castShadow = true;
      group.add(flame);
    }
    const light = new THREE.PointLight(0xff4d1e, 4.8, 6.5, 1.45);
    light.name = 'fire light';
    light.position.y = 1.05;
    group.add(light);
    const hitbox = new THREE.Mesh(
      new THREE.CylinderGeometry(1.25, 1.25, 2.2, 16),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
    );
    hitbox.position.y = 1;
    group.add(hitbox);
    group.userData.fireId = 'fire-galley';
    group.userData.interaction = 'GALLEY FIRE - extinguisher required';
    group.visible = false;
    this.interactionRoots.push(group);
    return group;
  }

  private syncState(state: MissionState, elapsed: number): void {
    for (const asset of this.dynamicObjects.values()) asset.visible = false;
    for (const object of Object.values(state.cabin.objects)) {
      const asset = this.dynamicObjects.get(object.id) ?? this.createObjectAsset(object);
      this.dynamicObjects.set(object.id, asset);
      if (object.ownerId === 'crew-alpha') {
        const heldOffset =
          object.kind === 'cart'
            ? new THREE.Vector3(0.68, -1.18, -1.65)
            : new THREE.Vector3(0.34, -0.42, -0.9);
        const handPosition = heldOffset
          .applyQuaternion(this.camera.quaternion)
          .add(this.camera.position);
        asset.position.lerp(handPosition, 0.62);
        asset.quaternion.slerp(this.camera.quaternion, 0.38);
      } else {
        const position = cabinToWorld(object.position, object.radius * 0.34);
        asset.position.lerp(position, object.ownerId ? 0.55 : 0.28);
        asset.rotation.z = THREE.MathUtils.lerp(asset.rotation.z, object.velocity.x * -0.025, 0.12);
        asset.rotation.x = THREE.MathUtils.lerp(asset.rotation.x, object.velocity.y * 0.018, 0.12);
      }
      asset.visible = true;
      const securedRing = asset.getObjectByName('secured ring');
      if (securedRing instanceof THREE.Mesh) securedRing.visible = object.secured;
    }

    for (const passenger of Object.values(state.service.passengers)) {
      const avatar =
        this.passengerAvatars.get(passenger.id) ?? this.createPassengerAvatar(passenger);
      this.passengerAvatars.set(passenger.id, avatar);
      const seat = cabinToWorld(passenger.seatPosition);
      const shake = Math.sin(elapsed * 15 + passenger.requestAt) * passenger.panic * 0.035;
      avatar.position.set(seat.x + shake, seat.y, seat.z);
      avatar.rotation.y = passenger.seatPosition.x < 8 ? -0.08 : 0.08;
      avatar.rotation.z = passenger.injury * (passenger.seatPosition.x < 8 ? 0.22 : -0.22);
      avatar.userData.interaction = passengerInteraction(passenger);
      const beacon = avatar.getObjectByName('request beacon');
      if (beacon instanceof THREE.Mesh && beacon.material instanceof THREE.MeshBasicMaterial) {
        beacon.visible = passenger.requestStatus === 'active';
        beacon.material.color.setHex(
          passenger.need === 'medical'
            ? colors.red
            : passenger.patience < 0.35
              ? 0xffc14d
              : colors.cyan,
        );
        beacon.scale.setScalar(1 + Math.sin(elapsed * 5) * 0.12);
      }
    }

    this.galleyFire.position.copy(cabinToWorld(state.fire.position));
    this.galleyFire.visible = state.fire.status === 'active';
    if (this.galleyFire.visible) {
      const pulse = 0.9 + Math.sin(elapsed * 14) * 0.16;
      this.galleyFire.scale.setScalar(pulse * (0.55 + state.fire.intensity * 0.55));
      for (const [index, flame] of this.galleyFire.children
        .filter((entry) => entry.name === 'fire flame')
        .entries()) {
        flame.rotation.z = Math.sin(elapsed * 9 + index) * 0.18;
        flame.scale.y = 0.84 + Math.sin(elapsed * 17 + index * 2) * 0.22;
      }
      const fireLight = this.galleyFire.getObjectByName('fire light');
      if (fireLight instanceof THREE.PointLight)
        fireLight.intensity = 3.1 + state.fire.intensity * 3.2 + Math.sin(elapsed * 19) * 0.75;
    }

    const bravo = state.cabin.players['crew-bravo'];
    if (bravo) {
      this.crewBravo.position.copy(cabinToWorld(bravo.position));
      this.crewBravo.rotation.y = Math.atan2(bravo.facing.x, bravo.facing.y);
      this.crewBravo.rotation.z = bravo.knockdown > 0 ? 1.2 : 0;
    }

    const health = Math.min(state.flight.electrical, state.flight.structure);
    for (const [index, light] of this.cabinLights.entries()) {
      const flicker = health < 0.75 && Math.sin(elapsed * 17 + index * 4.2) > health;
      light.intensity = flicker ? 0.18 : 2.3 + health;
      light.color.setHex(health < 0.45 ? 0xff704d : 0xd8f2ff);
    }
  }

  private updateInteraction(state: MissionState): void {
    const player = state.cabin.players['crew-alpha'];
    const held = player?.heldObjectId ? state.cabin.objects[player.heldObjectId] : undefined;
    this.raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
    let target: THREE.Object3D | null = null;
    for (const entry of this.raycaster.intersectObjects(this.interactionRoots, true)) {
      if (entry.distance > 1.9) break;
      let candidate: THREE.Object3D | null = entry.object;
      while (candidate && typeof candidate.userData.interaction !== 'string')
        candidate = candidate.parent;
      if (!candidate || candidate.userData.objectId === held?.id) continue;
      target = candidate;
      break;
    }
    const passengerId =
      target && typeof target.userData.passengerId === 'string'
        ? target.userData.passengerId
        : null;
    const objectId =
      target && typeof target.userData.objectId === 'string' ? target.userData.objectId : null;
    const fireId =
      target && typeof target.userData.fireId === 'string' ? target.userData.fireId : null;
    if (held && passengerId) {
      this.targetObjectId = passengerId;
      this.interactionPrompt = `${String(target?.userData.interaction)} - E deliver ${held.name}`;
      return;
    }
    if (fireId) {
      this.targetObjectId = fireId;
      this.interactionPrompt =
        held?.kind === 'extinguisher'
          ? 'GALLEY FIRE - E spray extinguisher'
          : held
            ? `GALLEY FIRE - ${held.name} cannot suppress it`
            : 'GALLEY FIRE - grab extinguisher and spray with E';
      return;
    }
    if (held && objectId === 'cart-01') {
      this.targetObjectId = objectId;
      this.interactionPrompt = `Service cart - E return ${held.name}`;
      return;
    }
    if (held) {
      this.targetObjectId = held.id;
      this.interactionPrompt = `${held.name} - E place, Q throw`;
      return;
    }
    if (!target) {
      this.targetObjectId = null;
      this.interactionPrompt =
        document.pointerLockElement === this.canvas ? 'SCAN CABIN' : 'CLICK TO CAPTURE MOUSE';
      return;
    }
    this.targetObjectId = passengerId ?? objectId ?? fireId;
    if (objectId === 'cart-01' && player) {
      const need = player.selectedServiceNeed;
      this.interactionPrompt = `Service cart - 1 drink  2 meal  3 medical - E take ${need.toUpperCase()} (${state.service.cart.stock[need]}) - Shift+E move`;
      return;
    }
    this.interactionPrompt = String(target?.userData.interaction ?? 'INTERACT');
  }

  private label(
    text: string,
    position: [number, number, number],
    width: number,
    height: number,
    color: number,
  ): THREE.Mesh {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const context = canvas.getContext('2d');
    if (context) {
      context.fillStyle = '#07111d';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.strokeStyle = `#${color.toString(16).padStart(6, '0')}`;
      context.lineWidth = 8;
      context.strokeRect(5, 5, canvas.width - 10, canvas.height - 10);
      context.fillStyle = '#f5fbff';
      context.font = '700 48px Arial';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(text, 256, 66);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(width, height),
      new THREE.MeshBasicMaterial({ map: texture }),
    );
    mesh.position.set(...position);
    return mesh;
  }

  public box(
    name: string,
    size: [number, number, number],
    position: [number, number, number],
    material: THREE.Material,
  ): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
    mesh.name = name;
    mesh.position.set(...position);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  public material(
    color: number,
    roughness = 0.72,
    metalness = 0.08,
    emissive = 0x000000,
  ): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({
      color,
      roughness,
      metalness,
      emissive,
      emissiveIntensity: emissive ? 0.7 : 0,
    });
  }
}

function objectAsset(kind: ObjectKind, world: CabinWorld): THREE.Group {
  const group = new THREE.Group();
  if (kind === 'cart') {
    group.add(
      world.box(
        'cart body',
        [0.72, 1.08, 0.62],
        [0, 0.62, 0],
        world.material(0x98a2a8, 0.35, 0.72),
      ),
    );
    group.add(
      world.box('cart top', [0.78, 0.08, 0.68], [0, 1.18, 0], world.material(0xd8dde0, 0.28, 0.8)),
    );
    for (const x of [-0.25, 0.25])
      for (const z of [-0.2, 0.2]) {
        const wheel = new THREE.Mesh(
          new THREE.CylinderGeometry(0.09, 0.09, 0.08, 12),
          world.material(0x171b20, 0.9),
        );
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(x, 0.08, z);
        group.add(wheel);
      }
  } else if (kind === 'heavy-crate') {
    group.add(
      world.box(
        'heavy crate',
        [1.05, 0.78, 0.86],
        [0, 0.42, 0],
        world.material(colors.cargo, 0.92, 0.02),
      ),
    );
    for (const y of [0.15, 0.7])
      group.add(
        world.box('crate brace', [1.1, 0.08, 0.91], [0, y, 0], world.material(0x4d3624, 0.82)),
      );
  } else if (kind === 'toolbox') {
    group.add(
      world.box('toolbox', [0.72, 0.38, 0.42], [0, 0.22, 0], world.material(0xd7372f, 0.55, 0.35)),
    );
    group.add(
      world.box(
        'toolbox handle',
        [0.38, 0.2, 0.06],
        [0, 0.5, 0],
        world.material(0x252a2e, 0.5, 0.65),
      ),
    );
  } else if (kind === 'drink') {
    const bottle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.13, 0.16, 0.52, 18),
      world.material(0x57bde0, 0.28, 0.08, 0x0b3548),
    );
    bottle.position.y = 0.3;
    group.add(bottle);
    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.09, 0.08, 16),
      world.material(0xf1f7f8, 0.45, 0.12),
    );
    cap.position.y = 0.6;
    group.add(cap);
  } else if (kind === 'meal-tray') {
    group.add(
      world.box(
        'meal tray',
        [0.68, 0.09, 0.48],
        [0, 0.08, 0],
        world.material(0x303943, 0.55, 0.18),
      ),
    );
    const meal = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.2, 0.09, 20),
      world.material(0xe7a63d, 0.8, 0.01),
    );
    meal.position.set(-0.11, 0.17, 0);
    group.add(meal);
    group.add(world.box('meal side', [0.2, 0.1, 0.2], [0.2, 0.16, 0], world.material(0x5f9e52)));
  } else if (kind === 'medkit') {
    group.add(
      world.box('medkit', [0.64, 0.46, 0.24], [0, 0.27, 0], world.material(0xe7ecee, 0.58, 0.08)),
    );
    group.add(
      world.box(
        'medical cross horizontal',
        [0.3, 0.08, 0.03],
        [0, 0.29, -0.135],
        world.material(colors.red, 0.5, 0.05, 0x6e1711),
      ),
    );
    group.add(
      world.box(
        'medical cross vertical',
        [0.08, 0.3, 0.03],
        [0, 0.29, -0.135],
        world.material(colors.red, 0.5, 0.05, 0x6e1711),
      ),
    );
  } else if (kind === 'extinguisher') {
    const tank = new THREE.Mesh(
      new THREE.CylinderGeometry(0.17, 0.2, 0.72, 18),
      world.material(0xd52d28, 0.38, 0.42),
    );
    tank.position.y = 0.4;
    group.add(tank);
    group.add(
      world.box(
        'extinguisher handle',
        [0.25, 0.08, 0.12],
        [0.08, 0.82, 0],
        world.material(0x20262b, 0.48, 0.65),
      ),
    );
  } else {
    const color = kind === 'light-case' ? 0xf2a84b : 0x4aa7ad;
    group.add(world.box(kind, [0.66, 0.48, 0.34], [0, 0.27, 0], world.material(color, 0.68, 0.1)));
    group.add(
      world.box('case handle', [0.28, 0.15, 0.05], [0, 0.58, 0], world.material(0x22282e, 0.75)),
    );
  }

  const secured = new THREE.Mesh(
    new THREE.TorusGeometry(0.5, 0.035, 8, 24),
    new THREE.MeshBasicMaterial({ color: 0x53ff9d }),
  );
  secured.name = 'secured ring';
  secured.rotation.x = Math.PI / 2;
  secured.position.y = 0.04;
  secured.visible = false;
  group.add(secured);
  return group;
}

function passengerInteraction(passenger: PassengerState): string {
  if (passenger.requestStatus === 'active')
    return `${passenger.name} needs ${needLabel(passenger.need)} (${Math.round(passenger.patience * 100)}%)`;
  if (passenger.requestStatus === 'served') return `${passenger.name} - served`;
  if (passenger.requestStatus === 'missed') return `${passenger.name} - request missed`;
  return `${passenger.name} - waiting`;
}
