import { CabinAudio } from '../audio/cabin-audio';
import { navigationIncidentDefinition } from '../data/emergencies';
import { CabinInputController } from '../input/cabin-input';
import { normalizeRoomCode, PeerRoom, type RoomRole, type RoomStatus } from '../network/peer-room';
import { HostSession } from '../sim/host-session';
import { activeRequests, needLabel } from '../sim/service-mission';
import {
  emptyCommand,
  type MissionState,
  type PlayerCommand,
  type PlayerState,
} from '../sim/types';
import { CabinWorld } from '../three/cabin-world';
import { FirstPersonController } from '../three/first-person-controller';
import { SpectatorCamera } from '../three/spectator-camera';
import { buildDebrief, type DebriefSystemResult } from './debrief';

type Screen = 'menu' | 'voyage';
type IconName = 'ship' | 'alert' | 'tool' | 'fire' | 'hand' | 'people' | 'dev' | 'mute';

interface Objective {
  kind: 'service' | 'fire' | 'repair' | 'navigation' | 'invasion' | 'complete';
  label: string;
  title: string;
  detail: string;
  progress?: number;
}

export function crewIdForRoomRole(role: RoomRole): 'crew-alpha' | 'crew-bravo' {
  return role === 'guest' ? 'crew-bravo' : 'crew-alpha';
}

export class CabinMayhemApp {
  private readonly input = new CabinInputController();
  private screen: Screen = 'menu';
  private session?: HostSession;
  private room?: PeerRoom;
  private roomRole: RoomRole = 'solo';
  private world?: CabinWorld;
  private controller?: FirstPersonController;
  private audio?: CabinAudio;
  private frame?: number;
  private lastFrame = 0;
  private accumulator = 0;
  private lastHudUpdate = 0;
  private devOpen = false;
  private debriefVisible = false;
  /** Local view state only. Deliberately not part of `PlayerCommand`. */
  private spectating = false;
  /** Where the local crew member was last seen, to catch doorway arrivals. */
  private lastCompartmentId = '';
  /** Test-only held repair intent; still travels through normal host validation. */
  private testNavigationRepairHeld = false;
  private readonly freeCamera = new SpectatorCamera();

  public constructor(private readonly root: HTMLElement) {}

  public mount(): void {
    window.addEventListener('keydown', this.onKeyDown);
    this.renderMenu();
    this.installTestBridge();
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (this.screen !== 'voyage') return;
    if (event.code === 'F1') {
      event.preventDefault();
      this.setDevOpen(!this.devOpen);
      return;
    }
    if (event.code === 'KeyM' && this.audio) {
      event.preventDefault();
      this.audio.setEnabled(this.audio.muted());
      this.setMuteIndicator(this.audio.muted());
    }
  };

  private readonly onStageGesture = (): void => {
    this.audio?.resume();
  };

  private setMuteIndicator(muted: boolean): void {
    const shell = this.root.querySelector<HTMLElement>('.game-shell');
    if (shell) shell.dataset.audio = muted ? 'muted' : 'on';
  }

  private renderMenu(): void {
    this.stopLoop();
    this.screen = 'menu';
    this.root.innerHTML = `
      <main class="landing-shell">
        <div class="landing-grid"></div>
        <section class="landing-card">
          <p class="landing-eyebrow">MS CABIN MAYHEM / CRUISE SITCOM EMERGENCY SHIFT</p>
          <h1>Cabin<br />Mayhem</h1>
          <p>Crew a live cruise ship, keep it off the rocks, and make sure the coffee machine never wins an election.</p>
          <div class="landing-actions">
            <button class="primary-button" data-action="start">Solo shift</button>
            <button class="secondary-button" data-action="host-room">Host 2-player room</button>
          </div>
          <form class="room-join" data-room-form>
            <label for="room-code">Friend's room code</label>
            <div><input id="room-code" name="room-code" maxlength="10" autocomplete="off" placeholder="ABCD2345" /><button type="submit">Join flight</button></div>
          </form>
          <p class="menu-status" data-menu-status aria-live="polite">WebRTC is free and peer-to-peer. Same-city players usually get a short direct route.</p>
        </section>
      </main>`;
    this.button('start', () => this.start('solo'));
    this.button('host-room', () => this.start('host'));
    const form = this.root.querySelector<HTMLFormElement>('[data-room-form]');
    form?.addEventListener('submit', (event) => {
      event.preventDefault();
      const input = form.querySelector<HTMLInputElement>('[name="room-code"]');
      const roomCode = normalizeRoomCode(input?.value ?? '');
      if (roomCode.length !== 8) {
        this.text('[data-menu-status]', 'Room code needs 8 letters or numbers.');
        input?.focus();
        return;
      }
      this.start('guest', roomCode);
    });
  }

  private start(role: RoomRole = 'solo', roomCode = ''): void {
    this.stopLoop();
    this.screen = 'voyage';
    this.roomRole = role;
    this.session = new HostSession();
    if (role !== 'solo') this.session.setNetwork({ enabled: false });
    this.room = new PeerRoom();
    this.devOpen = false;
    this.debriefVisible = false;
    this.root.innerHTML = `
      <main class="game-shell" data-testid="technical-test-scene" data-debug-open="false" data-audio="on" data-room-role="${role}" data-room-phase="idle">
        <section class="world-stage" data-world-stage></section>
        <header class="flight-chip">
          ${icon('ship')}
          <div><p class="flight-chip__eyebrow">MS CABIN MAYHEM / DECK LOG</p><strong data-hud="phase">MOORED</strong></div>
        </header>
        <button class="dev-toggle" data-action="debug-toggle" type="button" aria-expanded="false">
          ${icon('dev')}<span>F1</span>
        </button>
        <aside class="critical-icons" aria-label="Critical cabin status">
          <div class="critical-icon" data-critical="fire" data-testid="fire-status">${icon('fire')}<strong data-hud="fire-status">CLEAR</strong></div>
          <div class="critical-icon" data-critical="panic">${icon('people')}<strong data-hud="panic">0</strong></div>
          <div class="critical-icon" data-critical="held">${icon('hand')}<strong data-hud="held">EMPTY</strong></div>
          <div class="critical-icon" data-critical="muted" data-testid="audio-muted">${icon('mute')}<strong>MUTED</strong></div>
        </aside>
        <div class="crosshair" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
        <section class="interaction-pill">${icon('hand')}<strong data-hud="interaction">CLICK TO CAPTURE MOUSE</strong></section>
        <section class="objective-card" data-testid="service-mission" data-kind="service">
          <p class="objective-card__eyebrow" data-hud="objective-label">CABIN CALL</p>
          <div class="objective-card__headline"><span data-hud="objective-icon">${icon('alert')}</span><strong data-hud="objective-title">Ana needs a drink</strong></div>
          <p data-hud="objective-detail">Cart is in the aisle. Keep it moving.</p>
          <i class="objective-progress"><span data-hud="objective-progress"></span></i>
        </section>
        <section class="navigation-alert" data-testid="navigation-alert" hidden aria-live="assertive">
          <p data-hud="navigation-alert-label">NAVIGATION ALERT</p>
          <strong data-hud="navigation-alert-title">COLLISION COURSE</strong>
          <span data-hud="navigation-alert-detail">Reach the bridge helm.</span>
        </section>
        <section class="radio-caption" data-hud="caption" aria-live="polite">Host ready. Local client connected.</section>
        <aside class="room-chip" data-testid="room-status" aria-live="polite">
          <span data-room="role">SOLO</span>
          <strong data-room="message">LOCAL CABIN</strong>
          <button data-action="copy-room" type="button" hidden><span data-room="code"></span> / COPY</button>
        </aside>
        <section class="debrief" data-testid="landing-debrief" aria-labelledby="debrief-title" aria-hidden="true" hidden>
          <div class="debrief__card">
            <header class="debrief__header">
              <div>
                <p class="debrief__eyebrow">MS CABIN MAYHEM / PASSENGER JUDGEMENT COURT</p>
                <strong class="debrief__stamp" data-debrief="outcome-label">SHIFT CLEARED</strong>
              </div>
              <div class="debrief__score"><span>FINAL SCORE</span><strong data-debrief="score">0</strong></div>
            </header>
            <div class="debrief__headline">
              <p data-debrief="verdict">MOST DIGNITY REACHED THE SAME PORT.</p>
              <h2 id="debrief-title" data-debrief="title">You landed the punchline.</h2>
            </div>
            <div class="debrief__metrics" aria-label="Passenger service results">
              <div><span>SERVED</span><strong data-debrief="served">0</strong></div>
              <div><span>MISSED</span><strong data-debrief="missed">0</strong></div>
              <div><span>OUTCOME</span><strong data-debrief="outcome">SUCCESS</strong></div>
            </div>
            <div class="debrief__systems">
              <article data-debrief-system="fire"><span data-debrief="fire-label">GALLEY FIRE</span><strong data-debrief="fire-result">NO INCIDENT</strong><p data-debrief="fire-detail"></p></article>
              <article data-debrief-system="repair"><span data-debrief="repair-label">COFFEE MUTINY</span><strong data-debrief="repair-result">NO INCIDENT</strong><p data-debrief="repair-detail"></p></article>
              <article data-debrief-system="navigation"><span data-debrief="navigation-label">NAVIGATION / HELM</span><strong data-debrief="navigation-result">NO INCIDENT</strong><p data-debrief="navigation-detail"></p></article>
            </div>
            <section class="debrief__reviews" aria-labelledby="reviews-title">
              <div class="debrief__reviews-heading"><h3 id="reviews-title">CABIN REVIEWS</h3><span>Verified passengers. Regrettably.</span></div>
              <div class="debrief__review-grid" data-debrief="reviews"></div>
            </section>
            <footer class="debrief__footer">
              <button class="debrief__restart" data-action="sail-again" type="button">SAIL ANOTHER SHIFT</button>
              <p data-debrief="restart-note">Fresh voyage. Same questionable cruise line.</p>
            </footer>
          </div>
        </section>
        <aside class="dev-drawer" aria-label="Development controls" aria-hidden="true">
          <p class="dev-drawer__title">CHAOS LAB / F1</p>
          <div class="dev-readout"><span>Telemetry</span><span data-hud="speed">0 kt</span><span>Heading</span><span data-hud="heading">000</span><span>Stock</span><span data-hud="cart-stock">D 3 / M 3 / MED 2</span><span>Objects</span><span data-hud="objects">0</span></div>
          <div class="dev-drawer__buttons">
            <button data-action="turbulence">Turbulence</button>
            <button data-action="drop">Air pocket</button>
            <button data-action="turn">Sharp turn</button>
            <button data-action="collision">Collision</button>
            <button data-action="collision-course">Collision course</button>
            <button data-action="fire">Fire alarm</button>
            <button data-action="repair">Coffee mutiny</button>
            <button data-action="damage">Damage system</button>
            <button data-action="spawn">Spawn cargo</button>
            <button data-action="network">Toggle network</button>
            <button data-action="phase">Complete phase</button>
            <button data-action="cockpit">Bridge helm</button>
            <button data-action="cabin">Cabin</button>
            <button data-action="galley">Galley</button>
            <button data-action="cargo">Cargo</button>
            <button data-action="repair-bay">Repair bay</button>
            <button data-action="navigation-repair">Engine relay</button>
            <button data-action="reset">Reset</button>
          </div>
        </aside>
        <p class="sr-only" data-hud="screen-reader-status" aria-live="polite"></p>
      </main>`;

    const mount = this.root.querySelector<HTMLElement>('[data-world-stage]');
    if (!mount) throw new Error('3D world mount missing');
    this.world = new CabinWorld(mount, this.localPlayerId());
    this.controller = new FirstPersonController(this.world.canvas);
    this.audio = new CabinAudio();
    // start() runs from a click, but a fallback gesture keeps audio recoverable
    // if the browser blocked the context on the first attempt.
    this.audio.resume();
    mount.addEventListener('pointerdown', this.onStageGesture);
    this.input.setActive(true);
    this.bindDebugControls();
    this.room.onStatus((status) => this.updateRoomStatus(status));
    if (role === 'host') void this.room.host().catch(() => undefined);
    else if (role === 'guest') void this.room.join(roomCode).catch(() => undefined);
    this.lastFrame = performance.now();
    this.accumulator = 0;
    this.frame = requestAnimationFrame(this.loop);
  }

  private readonly loop = (now: number): void => {
    if (!this.session || !this.world || !this.controller || this.screen !== 'voyage') return;
    const frameDelta = Math.min(0.05, Math.max(0, (now - this.lastFrame) / 1000));
    this.lastFrame = now;
    this.accumulator += frameDelta;

    const spectator = this.input.readSpectator();
    if (spectator.toggle) this.setSpectating(!this.spectating);

    while (this.accumulator >= 1 / 60) {
      // A spectating player's body stands still. The voyage keeps running —
      // this is a camera, not a pause — but the crew member is not walked
      // around by the same keys that are flying the camera.
      const command = this.spectating
        ? emptyCommand()
        : this.controller.transform(
            this.input.read(),
            this.currentState().cabin.players[this.localPlayerId()],
          );
      if (this.testNavigationRepairHeld) {
        if (this.currentState().navigation.repair.status === 'fixed')
          this.testNavigationRepairHeld = false;
        else {
          command.repair = true;
          command.interactionTargetId = 'repair-steering-relay';
        }
      }
      command.interactionTargetId = this.world.interactionTarget();
      if (this.testNavigationRepairHeld) command.interactionTargetId = 'repair-steering-relay';
      if (this.roomRole === 'guest') this.room?.sendCommand(command, now);
      else {
        this.session.submitCommand(this.localPlayerId(), command);
        this.session.submitCommand(
          'crew-bravo',
          this.roomRole === 'host'
            ? (this.room?.remoteCommand() ?? emptyCommand())
            : this.botCommand(now),
        );
        this.session.step(1 / 60);
      }
      this.accumulator -= 1 / 60;
    }
    const state = this.currentState();
    if (this.roomRole === 'host') this.room?.sendSnapshot(state, now);
    const player = state.cabin.players[this.localPlayerId()];
    // Stepping through a doorway turns the view to look into the room. Keyed off
    // the compartment changing rather than off the snapshot field, because the
    // frame the field is set on can be swallowed by a multi-step catch-up.
    if (player && player.compartmentId !== this.lastCompartmentId) {
      this.lastCompartmentId = player.compartmentId;
      if (player.arrivalYaw !== undefined) this.controller.faceHeading(player.arrivalYaw);
    }
    if (this.spectating) {
      const look = this.controller.lookAngles();
      this.freeCamera.update(
        this.world.camera,
        spectator,
        look.yaw,
        look.pitch,
        frameDelta,
        this.world.originCompartment(),
      );
    } else if (player)
      this.controller.updateCamera(this.world.camera, player, state.voyage, this.world.elapsed());
    this.world.render(state);
    this.audio?.update(state, this.localPlayerId());
    if (now - this.lastHudUpdate >= 80) {
      this.updateHud(state);
      this.lastHudUpdate = now;
    }
    this.frame = requestAnimationFrame(this.loop);
  };

  /**
   * Detach or re-attach the camera from the crew member.
   *
   * The free camera takes over from wherever the first-person one was standing,
   * so the toggle is a continuous view rather than a teleport, and re-attaching
   * costs nothing: the body never moved, so the next frame's `updateCamera` puts
   * the view straight back where it belongs.
   */
  private setSpectating(on: boolean): void {
    if (this.spectating === on || !this.world) return;
    if (on) this.freeCamera.enterFrom(this.world.camera, this.world.originCompartment());
    this.spectating = on;
    this.world.setSpectating(on);
  }

  /**
   * The free camera's readout: where it is in ship space, and the way out.
   * Ship space rather than render space because that is the frame every
   * authored coordinate is stated in, so the number is directly comparable to
   * `ship-layout.ts` while looking for a wall in the wrong place.
   */
  private spectatorPrompt(): string | undefined {
    if (!this.spectating) return undefined;
    const at = this.freeCamera.shipPosition();
    const round = (value: number): string => value.toFixed(0);
    return `FREE CAM  x${round(at.x)} y${round(at.y)} z${round(at.z)}  ·  V TO RETURN`;
  }

  private botCommand(now: number): PlayerCommand {
    const command = emptyCommand();
    const phase = Math.floor(now / 2800) % 4;
    command.move =
      phase === 0 ? { x: 0, y: -0.35 } : phase === 2 ? { x: 0, y: 0.35 } : { x: 0, y: 0 };
    command.look = { x: 0, y: phase < 2 ? -1 : 1 };
    return command;
  }

  private updateHud(state: MissionState): void {
    const player = state.cabin.players[this.localPlayerId()];
    const held = player?.heldObjectId ? state.cabin.objects[player.heldObjectId]?.name : undefined;
    const panic = Object.values(state.service.passengers).filter(
      (passenger) => passenger.panic >= 0.35,
    ).length;
    const objective = objectiveFor(state);
    const caption = captionFor(state);
    this.text('[data-hud="phase"]', state.voyage.phase.toUpperCase());
    this.text('[data-hud="speed"]', `${Math.round(state.voyage.speed)} kt`);
    this.text('[data-hud="heading"]', headingLabel(state.voyage.heading));
    this.text('[data-hud="objects"]', String(Object.keys(state.cabin.objects).length));
    this.text(
      '[data-hud="interaction"]',
      this.spectatorPrompt() ?? doorPrompt(player) ?? this.world?.prompt() ?? 'SCAN CABIN',
    );
    this.text('[data-hud="held"]', held?.toUpperCase() ?? 'EMPTY');
    this.text('[data-hud="panic"]', String(panic));
    this.text(
      '[data-hud="fire-status"]',
      state.fire.status === 'active'
        ? `FIRE ${Math.round(state.fire.intensity * 100)}%`
        : state.fire.status === 'suppressed'
          ? 'SAFE'
          : 'CLEAR',
    );
    this.text(
      '[data-hud="cart-stock"]',
      `D ${state.service.cart.stock.drink} / M ${state.service.cart.stock.meal} / MED ${state.service.cart.stock.medical}`,
    );
    this.text('[data-hud="objective-label"]', objective.label);
    this.text('[data-hud="objective-title"]', objective.title);
    this.text('[data-hud="objective-detail"]', objective.detail);
    this.text('[data-hud="caption"]', caption);
    this.root.dataset.fireStatus = state.fire.status;
    this.root.dataset.repairStatus = state.repair.status;
    this.root.dataset.navigationPhase = state.navigation.phase;
    this.root.dataset.invasionPhase = state.invasion.phase;
    const navigationAlert = this.root.querySelector<HTMLElement>(
      '[data-testid="navigation-alert"]',
    );
    const navigationActive = state.navigation.phase !== 'idle';
    const invasionActive = state.invasion.phase !== 'idle';
    if (navigationAlert) {
      navigationAlert.hidden = !navigationActive && !invasionActive;
      navigationAlert.dataset.phase = invasionActive
        ? `invasion-${state.invasion.phase}`
        : state.navigation.phase;
    }
    this.text('[data-hud="navigation-alert-label"]', navigationAlertLabel(state));
    this.text('[data-hud="navigation-alert-title"]', navigationAlertTitle(state));
    this.text('[data-hud="navigation-alert-detail"]', navigationAlertDetail(state));
    this.setCritical('fire', state.fire.status === 'active');
    this.setCritical('panic', panic > 0);
    this.setCritical('held', Boolean(held));
    const card = this.root.querySelector<HTMLElement>('.objective-card');
    if (card) card.dataset.kind = objective.kind;
    const objectiveIcon = this.root.querySelector<HTMLElement>('[data-hud="objective-icon"]');
    if (objectiveIcon)
      objectiveIcon.innerHTML = icon(
        objective.kind === 'repair'
          ? 'tool'
          : objective.kind === 'fire'
            ? 'fire'
            : objective.kind === 'invasion'
              ? 'people'
              : objective.kind === 'navigation'
                ? 'ship'
                : objective.kind === 'service'
                  ? 'alert'
                  : 'ship',
      );
    const progress = this.root.querySelector<HTMLElement>('[data-hud="objective-progress"]');
    if (progress) progress.style.width = `${Math.round((objective.progress ?? 0) * 100)}%`;
    this.text(
      '[data-hud="screen-reader-status"]',
      `${state.voyage.phase}, ${Math.round(state.voyage.speed)} knots, heading ${headingLabel(state.voyage.heading)}. ${objective.title}. ${caption}`,
    );
    this.updateDebrief(state);
  }

  private setCritical(name: string, active: boolean): void {
    const element = this.root.querySelector<HTMLElement>(`[data-critical="${name}"]`);
    if (element) element.dataset.active = String(active);
  }

  private setDevOpen(open: boolean): void {
    this.devOpen = open;
    const shell = this.root.querySelector<HTMLElement>('.game-shell');
    if (shell) shell.dataset.debugOpen = String(open);
    const toggle = this.root.querySelector<HTMLButtonElement>('[data-action="debug-toggle"]');
    if (toggle) toggle.setAttribute('aria-expanded', String(open));
    const drawer = this.root.querySelector<HTMLElement>('.dev-drawer');
    if (drawer) drawer.setAttribute('aria-hidden', String(!open));
  }

  private bindDebugControls(): void {
    this.button('debug-toggle', () => this.setDevOpen(!this.devOpen));
    this.button('copy-room', () => this.copyRoomCode());
    this.button('turbulence', () => this.hostOnly(() => this.session?.trigger('turbulence', 0.88)));
    this.button('drop', () => this.hostOnly(() => this.session?.trigger('air-pocket')));
    this.button('turn', () => this.hostOnly(() => this.session?.trigger('sharp-turn')));
    this.button('collision', () => this.hostOnly(() => this.session?.trigger('collision')));
    this.button('collision-course', () =>
      this.hostOnly(() => this.session?.trigger('collision-course-debug')),
    );
    this.button('fire', () => this.hostOnly(() => this.session?.trigger('fire', 0.82)));
    this.button('repair', () => this.hostOnly(() => this.session?.trigger('repair')));
    this.button('damage', () => this.hostOnly(() => this.session?.damage('electrical')));
    this.button('spawn', () => this.hostOnly(() => this.session?.spawnObject()));
    this.button('network', () => {
      if (this.roomRole === 'guest') return;
      const enabled = this.session?.snapshot().network.enabled ?? true;
      this.session?.setNetwork({ enabled: !enabled });
    });
    this.button('phase', () => this.hostOnly(() => this.session?.advancePhase()));
    this.button('cockpit', () =>
      this.hostOnly(() => this.session?.teleport('crew-alpha', 'cockpit')),
    );
    this.button('cabin', () => this.hostOnly(() => this.session?.teleport('crew-alpha', 'cabin')));
    this.button('galley', () =>
      this.hostOnly(() => this.session?.teleport('crew-alpha', 'galley')),
    );
    this.button('cargo', () => this.hostOnly(() => this.session?.teleport('crew-alpha', 'cargo')));
    this.button('repair-bay', () =>
      this.hostOnly(() => this.session?.teleport('crew-alpha', 'repair')),
    );
    this.button('navigation-repair', () =>
      this.hostOnly(() => this.session?.teleport('crew-alpha', 'navigation-repair')),
    );
    this.button('reset', () => this.sailAnotherShift());
    this.button('sail-again', () => this.sailAnotherShift());
  }

  private installTestBridge(): void {
    window.__CABIN_MAYHEM_TEST__ = {
      start: () => this.start(),
      startMultiplayer: (role, roomCode) => this.start(role, roomCode),
      state: () => (this.session ? this.currentState() : undefined),
      roomStatus: () => this.room?.status(),
      step: (seconds) => this.session?.step(seconds),
      advancePhase: () => this.session?.advancePhase(),
      trigger: (kind) => this.session?.trigger(kind),
      boardInvasion: () => this.boardInvasionForTest(),
      showCrowd: () => this.showCrowdForTest(),
      helmNavigation: () => this.helmNavigationForTest(),
      avoidNavigation: () => this.avoidNavigationForTest(),
      beginNavigationRepair: () => this.beginNavigationRepairForTest(),
      completeNavigationRepair: () => this.completeNavigationRepairForTest(),
      completeRepair: () => this.completeRepairForTest(),
      completeShift: (outcome) => this.completeShiftForTest(outcome),
      reset: () => this.start(),
    };
  }

  private stopLoop(): void {
    if (this.frame !== undefined) cancelAnimationFrame(this.frame);
    this.frame = undefined;
    this.root
      .querySelector<HTMLElement>('[data-world-stage]')
      ?.removeEventListener('pointerdown', this.onStageGesture);
    this.controller?.destroy();
    this.world?.dispose();
    this.audio?.dispose();
    this.room?.close();
    this.controller = undefined;
    this.world = undefined;
    this.audio = undefined;
    this.room = undefined;
    this.spectating = false;
    this.testNavigationRepairHeld = false;
    this.input.setActive(false);
  }

  private button(action: string, handler: () => void): void {
    this.root
      .querySelector<HTMLButtonElement>(`[data-action="${action}"]`)
      ?.addEventListener('click', handler);
  }

  private currentState(): MissionState {
    if (!this.session) throw new Error('Session missing');
    return this.roomRole === 'guest'
      ? (this.room?.snapshot() ?? this.session.snapshot())
      : this.session.snapshot();
  }

  private localPlayerId(): 'crew-alpha' | 'crew-bravo' {
    return crewIdForRoomRole(this.roomRole);
  }

  private hostOnly(action: () => void): void {
    if (this.roomRole !== 'guest') action();
  }

  private updateRoomStatus(status: RoomStatus): void {
    const shell = this.root.querySelector<HTMLElement>('.game-shell');
    if (shell) {
      const wasConnected = shell.dataset.roomPhase === 'connected';
      if (this.roomRole === 'host' && wasConnected && status.phase === 'waiting')
        this.session?.disconnectPlayer('crew-bravo');
      if (this.roomRole === 'host' && status.phase === 'connected' && !wasConnected)
        this.session?.reconnectPlayer('crew-bravo');
      shell.dataset.roomRole = status.role;
      shell.dataset.roomPhase = status.phase;
      shell.dataset.roomCode = status.roomCode;
      shell.dataset.roomTick = String(status.remoteTick);
      shell.dataset.stateHash = status.stateHash;
    }
    this.text('[data-room="role"]', status.role.toUpperCase());
    this.text('[data-room="message"]', status.message.toUpperCase());
    this.text('[data-room="code"]', status.roomCode);
    const copy = this.root.querySelector<HTMLButtonElement>('[data-action="copy-room"]');
    if (copy) copy.hidden = status.role !== 'host' || !status.roomCode;
  }

  private copyRoomCode(): void {
    const roomCode = this.room?.status().roomCode;
    if (!roomCode || !navigator.clipboard) return;
    void navigator.clipboard.writeText(roomCode).then(() => {
      this.text('[data-room="message"]', 'CODE COPIED');
    });
  }

  private avoidNavigationForTest(): void {
    if (!this.session) return;
    const playerId = this.localPlayerId();
    this.session.setNetwork({ enabled: false });
    this.session.teleport(playerId, 'bridge');
    for (let tick = 0; tick < 90; tick += 1) {
      const command = emptyCommand();
      command.helm.rudder = 1;
      this.session.submitCommand(playerId, command);
      this.session.step(1 / 60);
      if (this.session.snapshot().navigation.phase === 'avoided') break;
    }
  }

  private boardInvasionForTest(): void {
    if (!this.session) return;
    const playerId = this.localPlayerId();
    this.session.setNetwork({ enabled: false });
    this.session.trigger('boarding-invasion');
    for (let tick = 0; tick < 405; tick += 1) this.session.step(0.05);
    this.session.teleport(playerId, 'boarding-port');
    this.controller?.faceHeading(0);
  }

  private showCrowdForTest(): void {
    if (!this.session) return;
    const playerId = this.localPlayerId();
    this.session.setNetwork({ enabled: false });
    this.session.teleport(playerId, 'pool-deck');
    this.controller?.faceHeading(Math.PI);
  }

  private helmNavigationForTest(): void {
    if (!this.session) return;
    const playerId = this.localPlayerId();
    this.session.setNetwork({ enabled: false });
    this.session.teleport(playerId, 'bridge');
    const command = emptyCommand();
    command.helm.rudder = 1;
    for (let tick = 0; tick < 3; tick += 1) {
      this.session.submitCommand(playerId, command);
      this.session.step(1 / 60);
    }
  }

  private completeNavigationRepairForTest(): void {
    if (!this.session) return;
    const playerId = this.localPlayerId();
    this.session.setNetwork({ enabled: false });
    for (let tick = 0; tick < 90; tick += 1) {
      if (this.session.snapshot().navigation.phase === 'impact') break;
      this.session.step(0.05);
    }
    this.session.teleport(playerId, 'repair');
    this.session.teleportToObject(playerId, 'toolbox-01');
    const pickup = emptyCommand();
    pickup.interact = true;
    pickup.interactionTargetId = 'toolbox-01';
    this.session.submitCommand(playerId, pickup);
    this.session.step(0.05);
    this.session.teleport(playerId, 'navigation-repair');
    for (let tick = 0; tick < 70; tick += 1) {
      const repair = emptyCommand();
      repair.repair = true;
      repair.interactionTargetId = 'repair-steering-relay';
      this.session.submitCommand(playerId, repair);
      this.session.step(0.05);
      if (this.session.snapshot().navigation.repair.status === 'fixed') break;
    }
    this.testNavigationRepairHeld = false;
  }

  private beginNavigationRepairForTest(): void {
    if (!this.session) return;
    const playerId = this.localPlayerId();
    this.session.setNetwork({ enabled: false });
    for (let tick = 0; tick < 90; tick += 1) {
      if (this.session.snapshot().navigation.phase === 'impact') break;
      this.session.step(0.05);
    }
    this.session.teleport(playerId, 'repair');
    this.session.teleportToObject(playerId, 'toolbox-01');
    const pickup = emptyCommand();
    pickup.interact = true;
    pickup.interactionTargetId = 'toolbox-01';
    this.session.submitCommand(playerId, pickup);
    this.session.step(0.05);
    this.session.teleport(playerId, 'navigation-repair');
    const repair = emptyCommand();
    repair.repair = true;
    repair.interactionTargetId = 'repair-steering-relay';
    this.session.submitCommand(playerId, repair);
    this.session.step(0.05);
    this.testNavigationRepairHeld = true;
  }

  private completeRepairForTest(): void {
    if (!this.session) return;
    const playerId = this.localPlayerId();
    this.session.setNetwork({ enabled: false });
    this.session.teleport(playerId, 'repair');
    // The repair station stands aft of the toolbox. Teleporting to the authored
    // object point keeps this deterministic while pickup still uses host range,
    // compartment, facing and ownership validation.
    this.session.teleportToObject(playerId, 'toolbox-01');
    const pickup = emptyCommand();
    pickup.interact = true;
    pickup.interactionTargetId = 'toolbox-01';
    this.session.submitCommand(playerId, pickup);
    this.session.step(0.05);
    for (let tick = 0; tick < 185; tick += 1) {
      const repair = emptyCommand();
      repair.repair = true;
      repair.interactionTargetId = 'repair-galley-breaker';
      this.session.submitCommand(playerId, repair);
      this.session.step(1 / 60);
    }
  }

  private completeShiftForTest(outcome: 'success' | 'failed'): void {
    if (!this.session) return;
    this.session.setNetwork({ enabled: false });
    if (outcome === 'success') {
      for (const passengerId of ['passenger-ana', 'passenger-malik', 'passenger-sofia']) {
        const passenger = this.session.snapshot().service.passengers[passengerId];
        if (!passenger) continue;
        const select = emptyCommand();
        select.selectServiceNeed = passenger.need;
        this.session.submitCommand('crew-alpha', select);
        this.session.step(1 / 60);
        this.session.teleportToObject('crew-alpha', 'cart-01');
        const take = emptyCommand();
        take.interact = true;
        take.interactionTargetId = 'cart-01';
        this.session.submitCommand('crew-alpha', take);
        this.session.step(1 / 60);
        this.session.teleportToPassenger('crew-alpha', passengerId);
        const deliver = emptyCommand();
        deliver.interact = true;
        deliver.interactionTargetId = passengerId;
        this.session.submitCommand('crew-alpha', deliver);
        this.session.step(1 / 60);
      }
    }
    for (let phase = 0; phase < 5; phase += 1) this.session.advancePhase();
    this.session.step(1 / 60);
  }

  private updateDebrief(state: MissionState): void {
    const debrief = this.root.querySelector<HTMLElement>('.debrief');
    const shell = this.root.querySelector<HTMLElement>('.game-shell');
    const model = buildDebrief(state);
    if (!debrief || !shell) return;
    if (!model) {
      debrief.hidden = true;
      debrief.setAttribute('aria-hidden', 'true');
      shell.dataset.debrief = 'false';
      this.debriefVisible = false;
      return;
    }
    if (this.debriefVisible) return;
    this.debriefVisible = true;
    debrief.hidden = false;
    debrief.setAttribute('aria-hidden', 'false');
    debrief.dataset.outcome = model.outcome;
    shell.dataset.debrief = 'true';
    this.text('[data-debrief="outcome-label"]', model.outcomeLabel);
    this.text('[data-debrief="title"]', model.title);
    this.text('[data-debrief="verdict"]', model.verdict);
    this.text('[data-debrief="score"]', String(model.score));
    this.text('[data-debrief="served"]', String(model.served));
    this.text('[data-debrief="missed"]', String(model.missed));
    this.text('[data-debrief="outcome"]', model.outcome.toUpperCase());
    this.updateDebriefSystem('fire', model.fire);
    this.updateDebriefSystem('repair', model.repair);
    this.updateDebriefSystem('navigation', model.navigation);
    const reviews = this.root.querySelector<HTMLElement>('[data-debrief="reviews"]');
    if (reviews) {
      reviews.replaceChildren(
        ...model.reviews.map((review) => {
          const article = document.createElement('article');
          article.className = 'passenger-review';
          article.dataset.status = review.status;
          const heading = document.createElement('div');
          const name = document.createElement('strong');
          name.textContent = review.name;
          const stars = document.createElement('span');
          stars.className = 'passenger-review__stars';
          stars.setAttribute('aria-label', `${review.stars} out of 5 stars`);
          stars.textContent = `${'★'.repeat(review.stars)}${'☆'.repeat(5 - review.stars)}`;
          heading.append(name, stars);
          const quote = document.createElement('p');
          quote.textContent = `“${review.quote}”`;
          const status = document.createElement('small');
          status.textContent = review.status.toUpperCase();
          article.append(heading, quote, status);
          return article;
        }),
      );
    }
    const restart = this.root.querySelector<HTMLButtonElement>('[data-action="sail-again"]');
    if (restart) restart.disabled = this.roomRole === 'guest';
    this.text(
      '[data-debrief="restart-note"]',
      this.roomRole === 'guest'
        ? 'Waiting for the host to book the next questionable voyage.'
        : 'Fresh voyage. Same questionable cruise line.',
    );
  }

  private updateDebriefSystem(
    kind: 'fire' | 'repair' | 'navigation',
    result: DebriefSystemResult,
  ): void {
    const card = this.root.querySelector<HTMLElement>(`[data-debrief-system="${kind}"]`);
    if (card) card.dataset.tone = result.tone;
    this.text(`[data-debrief="${kind}-label"]`, result.label);
    this.text(`[data-debrief="${kind}-result"]`, result.result);
    this.text(`[data-debrief="${kind}-detail"]`, result.detail);
  }

  private sailAnotherShift(): void {
    if (this.roomRole === 'guest') return;
    this.session = new HostSession();
    if (this.roomRole !== 'solo') this.session.setNetwork({ enabled: false });
    this.debriefVisible = false;
    this.lastHudUpdate = 0;
    this.setDevOpen(false);
  }

  private text(selector: string, value: string): void {
    const element = this.root.querySelector<HTMLElement>(selector);
    if (element) element.textContent = value;
  }
}

function objectiveFor(state: MissionState): Objective {
  if (state.service.outcome === 'success')
    return {
      kind: 'complete',
      label: 'SHIFT COMPLETE',
      title: 'Cabin survived',
      detail: 'Land it neat. Pretend this was normal.',
      progress: 1,
    };
  if (state.service.outcome === 'failed')
    return {
      kind: 'fire',
      label: 'SHIFT LOST',
      title: 'Too much cabin chaos',
      detail: 'Reset and give the passengers a better story.',
    };
  if (state.invasion.phase === 'warning')
    return {
      kind: 'invasion',
      label: 'BOARDING WARNING',
      title: 'Unknown fast craft closing',
      detail: `T-${state.invasion.countdown.toFixed(1)}s · reach the promenade and protect the passengers.`,
      progress: 1 - state.invasion.countdown / state.invasion.warningSeconds,
    };
  if (state.invasion.phase === 'approach')
    return {
      kind: 'invasion',
      label: 'PIRATES ALONGSIDE',
      title: 'Boarding gear incoming',
      detail: `T-${state.invasion.countdown.toFixed(1)}s · port board and starboard gangway are moving into place.`,
      progress: 1 - state.invasion.countdown / state.invasion.approachSeconds,
    };
  if (state.invasion.phase === 'boarders-aboard')
    return {
      kind: 'invasion',
      label: 'BOARDERS ABOARD',
      title: `${state.invasion.hostileCount} hostiles on the promenade`,
      detail: `Detach both boarding links · passengers injured ${state.invasion.passengerProtection.injured}/${state.invasion.passengerProtection.total} · infrastructure ${Math.round(state.invasion.infrastructure.integrity)}%.`,
      progress: 1 - state.invasion.countdown / state.invasion.maxRaidSeconds,
    };
  if (state.invasion.phase === 'repelled')
    return {
      kind: 'complete',
      label: 'INVASION REPELLED',
      title: 'Pirates forced off the ship',
      detail: state.invasion.lastOutcome,
      progress: 1,
    };
  if (state.invasion.phase === 'failed')
    return {
      kind: 'fire',
      label: 'BOARDING FAILED',
      title: 'Pirates overran the promenade',
      detail: state.invasion.lastOutcome,
      progress: 1,
    };
  if (state.fire.status === 'active')
    return {
      kind: 'fire',
      label: 'RED ALERT',
      title: 'Galley fire burning',
      detail: 'Grab the extinguisher. The coffee can wait.',
    };
  if (state.navigation.phase === 'warning')
    return {
      kind: 'navigation',
      label: 'NAVIGATION ALERT',
      title: 'Collision course: reach the bridge',
      detail: `T-${state.navigation.countdown.toFixed(1)}s · ${state.navigation.obstacle.name} closing · helm input only counts at the bridge station.`,
      progress: 1 - state.navigation.countdown / state.navigation.warningSeconds,
    };
  if (state.navigation.phase === 'impact' || state.navigation.phase === 'repair')
    return {
      kind: 'repair',
      label: 'IMPACT DAMAGE',
      title: 'Steering hydraulics damaged',
      detail:
        state.navigation.repair.status === 'repairing'
          ? `Hold E at the engine-room relay · ${Math.round(state.navigation.repair.progress * 100)}%`
          : 'Carry the red toolbox to the engine room relay station.',
      progress: state.navigation.repair.progress,
    };
  if (state.navigation.phase === 'avoided')
    return {
      kind: 'navigation',
      label: 'NAVIGATION CLEAR',
      title: 'Contact avoided from the bridge',
      detail: `Track clear. Avoidance bonus +${navigationIncidentDefinition.avoidScore}; ship stays intact.`,
      progress: 1,
    };
  if (state.navigation.phase === 'repaired')
    return {
      kind: 'navigation',
      label: 'DAMAGE RESOLVED',
      title: 'Steering relay restored',
      detail: 'Hydraulics back online. The crew can dodge the next contact.',
      progress: 1,
    };
  if (state.repair.status === 'active' || state.repair.status === 'repairing')
    return {
      kind: 'repair',
      label: 'UNSCHEDULED MAINTENANCE',
      title: 'Coffee machine mutiny',
      detail:
        state.repair.status === 'repairing'
          ? 'Hold E on the breaker. It respects confidence.'
          : 'Grab the red toolbox in the rear galley.',
      progress: state.repair.progress,
    };
  const passenger = activeRequests(state.service)[0];
  if (passenger)
    return {
      kind: 'service',
      label: 'CABIN CALL',
      title: `${passenger.name} needs ${needLabel(passenger.need)}`,
      detail: `Patience ${Math.round(passenger.patience * 100)}%. Make it look effortless.`,
      progress: passenger.patience,
    };
  return {
    kind: 'complete',
    label: 'CABIN QUIET',
    title: 'No active calls',
    detail: 'Check belts, flight controls, and suspicious appliances.',
  };
}

function captionFor(state: MissionState): string {
  if (state.invasion.phase === 'warning')
    return `BOARDING WARNING. T-${state.invasion.countdown.toFixed(1)} SECONDS. REACH THE PROMENADE.`;
  if (state.invasion.phase === 'approach')
    return `PIRATES ALONGSIDE. BOARDING GEAR INCOMING IN ${state.invasion.countdown.toFixed(1)} SECONDS.`;
  if (state.invasion.phase === 'boarders-aboard')
    return `${state.invasion.hostileCount} BOARDERS ABOARD. PROTECT PASSENGERS AND DETACH BOTH LINKS.`;
  if (state.invasion.phase === 'repelled') return 'BOARDING REPELLED. BOTH LINKS DETACHED.';
  if (state.invasion.phase === 'failed') return 'BOARDING FAILED. PIRATES CONTROL THE PROMENADE.';
  if (state.navigation.phase === 'warning')
    return `COLLISION COURSE. T-${state.navigation.countdown.toFixed(1)} SECONDS. REACH THE BRIDGE HELM.`;
  if (state.navigation.phase === 'impact' || state.navigation.phase === 'repair')
    return state.navigation.repair.activeCaption || 'NAVIGATION IMPACT. REPAIR THE STEERING RELAY.';
  if (state.navigation.phase === 'avoided') return 'CONTACT AVOIDED. BRIDGE CREW SAVED THE SHIP.';
  if (state.navigation.phase === 'repaired')
    return 'STEERING HYDRAULICS RESTORED. NAVIGATION INCIDENT RESOLVED.';
  if (state.fire.status === 'active')
    return 'GALLEY FIRE. EXTINGUISHER FIRST. COFFEE MACHINE CAN WAIT.';
  if (state.repair.activeCaption) return state.repair.activeCaption;
  if (state.service.outcome !== 'active')
    return state.service.outcome === 'success'
      ? 'SHIFT COMPLETE. TAKE A BOW.'
      : 'SHIFT LOST. PASSENGERS ARE WRITING REVIEWS.';
  return state.voyage.warning ?? state.events[0]?.message ?? 'HOST READY. LOCAL CLIENT CONNECTED.';
}

function navigationAlertLabel(state: MissionState): string {
  if (state.invasion.phase === 'warning') return 'BOARDING WARNING / COUNTDOWN';
  if (state.invasion.phase === 'approach') return 'PIRATE APPROACH / COUNTDOWN';
  if (state.invasion.phase === 'boarders-aboard') return 'SECURITY EMERGENCY';
  if (state.invasion.phase === 'repelled') return 'INVASION REPELLED';
  if (state.invasion.phase === 'failed') return 'INVASION FAILED';
  if (state.navigation.phase === 'warning') return 'COLLISION COURSE / COUNTDOWN';
  if (state.navigation.phase === 'avoided') return 'NAVIGATION SUCCESS';
  if (state.navigation.phase === 'repaired') return 'NAVIGATION RESOLVED';
  return 'SHIP DAMAGE / REPAIR OBJECTIVE';
}

function navigationAlertTitle(state: MissionState): string {
  if (state.invasion.phase === 'warning')
    return `T-${state.invasion.countdown.toFixed(1)}s · REACH PROMENADE`;
  if (state.invasion.phase === 'approach')
    return `T-${state.invasion.countdown.toFixed(1)}s · BOARDING GEAR INCOMING`;
  if (state.invasion.phase === 'boarders-aboard')
    return `${state.invasion.hostileCount} HOSTILES ABOARD`;
  if (state.invasion.phase === 'repelled') return 'PIRATES FORCED BACK';
  if (state.invasion.phase === 'failed') return 'PROMENADE OVERRUN';
  if (state.navigation.phase === 'warning')
    return `T-${state.navigation.countdown.toFixed(1)}s · REACH BRIDGE HELM`;
  if (state.navigation.phase === 'avoided') return 'CONTACT AVOIDED';
  if (state.navigation.phase === 'repaired') return 'STEERING RELAY ONLINE';
  return 'IMPACT: HYDRAULICS DAMAGED';
}

function navigationAlertDetail(state: MissionState): string {
  if (state.invasion.phase === 'warning')
    return 'Unknown fast craft closing · protect passengers and ship infrastructure.';
  if (state.invasion.phase === 'approach')
    return 'Port boarding board and starboard gangway are approaching the promenade.';
  if (state.invasion.phase === 'boarders-aboard')
    return `Detach both links · infrastructure ${Math.round(state.invasion.infrastructure.integrity)}% · injured ${state.invasion.passengerProtection.injured}.`;
  if (state.invasion.phase === 'repelled' || state.invasion.phase === 'failed')
    return state.invasion.lastOutcome;
  if (state.navigation.phase === 'warning')
    return `${state.navigation.obstacle.name} moving relative to the ship · rudder input requires bridge station.`;
  if (state.navigation.phase === 'avoided')
    return `Avoidance bonus +${navigationIncidentDefinition.avoidScore}. Ship track clear.`;
  if (state.navigation.phase === 'repaired')
    return 'Engine-room repair accepted by host. Damage cleared.';
  return `Repair at ${state.navigation.repair.compartmentId} relay · ${Math.round(state.navigation.repair.progress * 100)}% complete.`;
}

/**
 * The doorway in reach, named. It takes priority over the fixture prompt: a
 * doorway is the one thing in a compartment you can be standing in rather than
 * merely near, and knowing where a door goes before opening it is the whole
 * point of a ship this size.
 */
function doorPrompt(player: PlayerState | undefined): string | undefined {
  const door = player?.pendingDoor;
  if (!door) return undefined;
  const arrow = door.direction === 'up' ? '▲' : door.direction === 'down' ? '▼' : '▶';
  return `E · ${door.label.toUpperCase()}  ${arrow} DECK ${door.deck}`;
}

/** Compass heading as the three-digit form a bridge readout uses: 007, 082, 359. */
function headingLabel(heading: number): string {
  const degrees = Math.round(((heading % 360) + 360) % 360) % 360;
  return String(degrees).padStart(3, '0');
}

function icon(name: IconName): string {
  const paths: Record<IconName, string> = {
    ship: '<path d="M4 18h16l1-5H3l1 5Zm2-5V7h12v6M9 7V4h6v3M12 13v5"/>',
    alert: '<path d="M12 3 3 20h18L12 3Zm0 6v4m0 3h.01"/>',
    tool: '<path d="m14 5 5 5m-9 8 9-9M5 4l3 3-3 3-3-3 3-3Zm1 11 4 4"/>',
    fire: '<path d="M12 3c2 4-1 5 1 8 1-1 3-2 3-5 3 3 5 7 2 12-3 4-9 4-12 0-2-4 0-8 3-11 0 3 1 4 3 5 1-3-1-5 0-9Z"/>',
    hand: '<path d="M8 21V11a1 1 0 0 1 2 0v4m0-7a1 1 0 0 1 2 0v6m0-7a1 1 0 0 1 2 0v6m0-5a1 1 0 0 1 2 0v7c0 3-2 5-5 5H10c-2 0-4-2-4-4v-3a2 2 0 0 1 2-2Z"/>',
    people:
      '<path d="M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm8 1a2.5 2.5 0 1 0 0-5M3 20c0-4 2-6 5-6s5 2 5 6m1-6c3 0 5 2 5 5"/>',
    dev: '<path d="M4 8h16v11H4zM8 8V5h8v3m-8 5h8m-8 3h5"/>',
    mute: '<path d="M4 9h4l5-4v14l-5-4H4V9Zm13 1 4 4m0-4-4 4"/>',
  };
  return `<svg class="hud-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths[name]}</svg>`;
}
