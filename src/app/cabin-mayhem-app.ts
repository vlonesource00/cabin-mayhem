import { CabinInputController } from '../input/cabin-input';
import { HostSession } from '../sim/host-session';
import { activeRequests, needLabel } from '../sim/service-mission';
import { emptyCommand, type MissionState, type PlayerCommand } from '../sim/types';
import { CabinWorld } from '../three/cabin-world';
import { FirstPersonController } from '../three/first-person-controller';

type Screen = 'menu' | 'flight';

export class CabinMayhemApp {
  private readonly input = new CabinInputController();
  private screen: Screen = 'menu';
  private session?: HostSession;
  private world?: CabinWorld;
  private controller?: FirstPersonController;
  private frame?: number;
  private lastFrame = 0;
  private accumulator = 0;
  private lastHudUpdate = 0;

  public constructor(private readonly root: HTMLElement) {}

  public mount(): void {
    this.renderMenu();
    this.installTestBridge();
  }

  private renderMenu(): void {
    this.stopLoop();
    this.screen = 'menu';
    this.root.innerHTML = `
      <main class="landing-shell">
        <div class="landing-grid"></div>
        <section class="landing-copy">
          <p class="eyebrow">FIRST-PERSON CO-OP AIRLINE DISASTER</p>
          <h1><span>CABIN</span><br />MAYHEM</h1>
          <p class="landing-lede">Serve a live cabin, treat injuries and keep loose objects under control while the aircraft fights you.</p>
          <div class="landing-actions">
            <button class="primary-button" data-action="start">Enter 3D aircraft</button>
            <span>Phase 1 · moving-aircraft technical slice</span>
          </div>
        </section>
        <section class="feature-strip" aria-label="Prototype features">
          <article><b>01</b><strong>FIRST PERSON</strong><span>Pointer-lock camera, WASD movement, crouch, sprint, brace.</span></article>
          <article><b>02</b><strong>LIVE PASSENGERS</strong><span>Eight seated NPCs request drinks, meals and medical help.</span></article>
          <article><b>03</b><strong>SERVICE PRESSURE</strong><span>Patience, panic, injuries, scoring and host-validated delivery.</span></article>
        </section>
        <aside class="build-mark">WEBGL / THREE.JS / TAURI</aside>
      </main>`;
    this.button('start', () => this.start());
  }

  private start(): void {
    this.stopLoop();
    this.screen = 'flight';
    this.session = new HostSession();
    this.root.innerHTML = `
      <main class="game-shell" data-testid="technical-test-scene">
        <section class="world-stage" data-world-stage></section>
        <header class="flight-header">
          <div><p>FLIGHT 07 / CABIN CHAOS</p><h1>CABIN SERVICE UNDER PRESSURE</h1></div>
          <div class="authority"><i></i> HOST HAS YOUR BACK</div>
        </header>
        <div class="crosshair" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
        <div class="interaction-prompt" data-hud="interaction">CLICK TO CAPTURE MOUSE</div>
        <div class="mouse-hint" data-hud="mouse">Click to lock · hold + drag fallback · Esc releases</div>
        <div class="hud-stack hud-stack-left">
          <aside class="telemetry-panel">
            <p class="panel-label">PILOT JUICE</p>
            <div class="phase-readout"><span>FLIGHT MODE</span><strong data-hud="phase">GROUND</strong></div>
            <dl>
              <div><dt>AIRSPEED</dt><dd><b data-hud="speed">0</b> kt</dd></div>
              <div><dt>ALTITUDE</dt><dd><b data-hud="altitude">0</b> ft</dd></div>
              <div><dt>THROTTLE</dt><dd><b data-hud="throttle">0</b>%</dd></div>
              <div><dt>LOOSE STUFF</dt><dd><b data-hud="objects">0</b></dd></div>
            </dl>
            <div class="system-bars">
              <label>ELEC <span><i data-system="electrical"></i></span></label>
              <label>HYDR <span><i data-system="hydraulics"></i></span></label>
              <label>HULL <span><i data-system="structure"></i></span></label>
            </div>
          </aside>
          <aside class="mission-panel" data-testid="service-mission">
            <div class="mission-heading"><div><p class="panel-label">PASSENGER PANIC</p><strong data-hud="mission-outcome">ACTIVE</strong></div><time data-hud="mission-time">12:00</time></div>
            <div class="mission-score"><span>SCORE <b data-hud="score">0</b></span><span>SAVED <b data-hud="served">0/8</b></span></div>
            <div class="cart-stock" data-testid="cart-stock"><span>SNACK CART</span><b data-hud="cart-stock">D 3 · M 3 · MED 2</b><em data-hud="cart-selection">1 DRINK</em></div>
            <div class="request-list" data-hud="requests"></div>
          </aside>
        </div>
        <aside class="debug-panel">
          <p class="panel-label">CHAOS BUTTONS</p>
          <div class="debug-grid">
            <button data-action="turbulence">Turbulence</button>
            <button data-action="drop">Air pocket</button>
            <button data-action="turn">Sharp turn</button>
            <button data-action="collision">Collision</button>
            <button data-action="fire">Fire alarm</button>
            <button data-action="damage">Damage system</button>
            <button data-action="spawn">Spawn cargo</button>
            <button data-action="network">Toggle network</button>
            <button data-action="phase">Complete phase</button>
            <button data-action="cockpit">Cockpit</button>
            <button data-action="cabin">Cabin</button>
            <button data-action="galley">Galley</button>
            <button data-action="cargo">Cargo</button>
            <button data-action="reset">Reset</button>
          </div>
        </aside>
        <section class="event-caption" data-hud="caption">
          <span>FLIGHT PLAN</span><strong>Hold R. Taxi, rotate and climb happen automatically. Keep cabin alive.</strong>
        </section>
        <div class="status-stack">
          <section class="held-card"><span>HANDS</span><strong data-hud="held">EMPTY</strong></section>
          <section class="fire-card" data-testid="fire-status"><span>GALLEY HEAT</span><strong data-hud="fire-status">CLEAR</strong></section>
          <section class="network-card"><span>SIM NET</span><strong data-hud="network">90ms / 2% loss</strong></section>
        </div>
        <footer class="control-ribbon">
          <span><b>WASD</b> MOVE</span><span><b>MOUSE</b> LOOK</span><span><b>SHIFT</b> SPRINT</span>
          <span><b>R/F</b> FLY</span><span><b>1/2/3</b> CART</span><span><b>E</b> USE</span><span><b>Q</b> THROW</span>
        </footer>
      </main>`;

    const mount = this.root.querySelector<HTMLElement>('[data-world-stage]');
    if (!mount) throw new Error('3D world mount missing');
    this.world = new CabinWorld(mount);
    this.controller = new FirstPersonController(this.world.canvas);
    this.input.setActive(true);
    this.bindDebugControls();
    this.lastFrame = performance.now();
    this.accumulator = 0;
    this.frame = requestAnimationFrame(this.loop);
  }

  private readonly loop = (now: number): void => {
    if (!this.session || !this.world || !this.controller || this.screen !== 'flight') return;
    const frameDelta = Math.min(0.05, Math.max(0, (now - this.lastFrame) / 1000));
    this.lastFrame = now;
    this.accumulator += frameDelta;

    while (this.accumulator >= 1 / 60) {
      const command = this.controller.transform(this.input.read());
      command.interactionTargetId = this.world.interactionTarget();
      this.session.submitCommand('crew-alpha', command);
      this.session.submitCommand('crew-bravo', this.botCommand(now));
      this.session.step(1 / 60);
      this.accumulator -= 1 / 60;
    }

    const state = this.session.snapshot();
    const player = state.cabin.players['crew-alpha'];
    if (player)
      this.controller.updateCamera(this.world.camera, player, state.flight, this.world.elapsed());
    this.world.render(state);
    if (now - this.lastHudUpdate >= 80) {
      this.updateHud(state);
      this.lastHudUpdate = now;
    }
    this.frame = requestAnimationFrame(this.loop);
  };

  private botCommand(now: number): PlayerCommand {
    const command = emptyCommand();
    const phase = Math.floor(now / 2800) % 4;
    command.move =
      phase === 0 ? { x: 0, y: -0.35 } : phase === 2 ? { x: 0, y: 0.35 } : { x: 0, y: 0 };
    command.look = { x: 0, y: phase < 2 ? -1 : 1 };
    return command;
  }

  private updateHud(state: MissionState): void {
    this.text('[data-hud="phase"]', state.flight.phase.toUpperCase());
    this.text('[data-hud="speed"]', String(Math.round(state.flight.airspeed)));
    this.text('[data-hud="altitude"]', String(Math.round(state.flight.altitude)));
    this.text('[data-hud="throttle"]', String(Math.round(state.flight.throttle * 100)));
    this.text('[data-hud="objects"]', String(Object.keys(state.cabin.objects).length));
    this.text('[data-hud="interaction"]', this.world?.prompt() ?? 'SCAN CABIN');
    const player = state.cabin.players['crew-alpha'];
    const held = player?.heldObjectId ? state.cabin.objects[player.heldObjectId]?.name : undefined;
    this.text('[data-hud="held"]', held?.toUpperCase() ?? 'EMPTY');
    this.text(
      '[data-hud="fire-status"]',
      state.fire.status === 'active'
        ? `BURNING ${Math.round(state.fire.intensity * 100)}%`
        : state.fire.status === 'suppressed'
          ? 'SUPPRESSED'
          : 'CLEAR',
    );
    this.root.dataset.fireStatus = state.fire.status;
    this.text('[data-hud="score"]', String(state.service.score));
    this.text(
      '[data-hud="cart-stock"]',
      `D ${state.service.cart.stock.drink} · M ${state.service.cart.stock.meal} · MED ${state.service.cart.stock.medical}`,
    );
    this.text(
      '[data-hud="cart-selection"]',
      `${player?.selectedServiceNeed === 'drink' ? '1' : player?.selectedServiceNeed === 'meal' ? '2' : '3'} ${player?.selectedServiceNeed?.toUpperCase() ?? 'DRINK'}`,
    );
    this.text(
      '[data-hud="served"]',
      `${state.service.served}/${Object.keys(state.service.passengers).length}`,
    );
    this.text('[data-hud="mission-outcome"]', state.service.outcome.toUpperCase());
    this.text(
      '[data-hud="mission-time"]',
      formatTime(Math.max(0, state.service.duration - state.service.elapsed)),
    );
    const requestList = this.root.querySelector<HTMLElement>('[data-hud="requests"]');
    if (requestList) {
      const requests = activeRequests(state.service).slice(0, 4);
      requestList.innerHTML = requests.length
        ? requests
            .map(
              (passenger) =>
                `<article data-need="${passenger.need}" data-urgent="${passenger.patience < 0.35}"><div><strong>${passenger.name}</strong><span>${needLabel(passenger.need)}</span></div><i style="--patience:${Math.round(passenger.patience * 100)}%"></i></article>`,
            )
            .join('')
        : '<p class="request-empty">No active requests. Secure the cabin.</p>';
    }
    this.text(
      '[data-hud="network"]',
      state.network.enabled
        ? `${Math.round(state.network.latencyMs)}ms / ${Math.round(state.network.packetLoss * 100)}% loss`
        : 'BYPASSED',
    );
    const latest = state.events[0];
    const caption = this.root.querySelector<HTMLElement>('[data-hud="caption"] strong');
    if (caption)
      caption.textContent =
        state.service.outcome === 'success'
          ? 'FLIGHT COMPLETE - cabin service passed.'
          : state.service.outcome === 'failed'
            ? 'MISSION FAILED - too many unresolved passenger needs.'
            : state.fire.status === 'active'
              ? 'GALLEY FIRE - grab the red extinguisher, aim at flames and press E.'
              : (state.flight.warning ?? latest?.message ?? 'Aircraft nominal.');
    this.bar('electrical', state.flight.electrical);
    this.bar('hydraulics', state.flight.hydraulics);
    this.bar('structure', state.flight.structure);
  }

  private bindDebugControls(): void {
    this.button('turbulence', () => this.session?.trigger('turbulence', 0.88));
    this.button('drop', () => this.session?.trigger('air-pocket'));
    this.button('turn', () => this.session?.trigger('sharp-turn'));
    this.button('collision', () => this.session?.trigger('collision'));
    this.button('fire', () => this.session?.trigger('fire', 0.82));
    this.button('damage', () => this.session?.damage('electrical'));
    this.button('spawn', () => this.session?.spawnObject());
    this.button('network', () => {
      const enabled = this.session?.snapshot().network.enabled ?? true;
      this.session?.setNetwork({ enabled: !enabled });
    });
    this.button('phase', () => this.session?.advancePhase());
    this.button('cockpit', () => this.session?.teleport('crew-alpha', 'cockpit'));
    this.button('cabin', () => this.session?.teleport('crew-alpha', 'cabin'));
    this.button('galley', () => this.session?.teleport('crew-alpha', 'galley'));
    this.button('cargo', () => this.session?.teleport('crew-alpha', 'cargo'));
    this.button('reset', () => this.start());
  }

  private installTestBridge(): void {
    window.__CABIN_MAYHEM_TEST__ = {
      start: () => this.start(),
      state: () => this.session?.snapshot(),
      step: (seconds) => this.session?.step(seconds),
      advancePhase: () => this.session?.advancePhase(),
      trigger: (kind) => this.session?.trigger(kind),
      reset: () => this.start(),
    };
  }

  private stopLoop(): void {
    if (this.frame !== undefined) cancelAnimationFrame(this.frame);
    this.frame = undefined;
    this.controller?.destroy();
    this.world?.dispose();
    this.controller = undefined;
    this.world = undefined;
    this.input.setActive(false);
  }

  private button(action: string, handler: () => void): void {
    this.root
      .querySelector<HTMLButtonElement>(`[data-action="${action}"]`)
      ?.addEventListener('click', handler);
  }

  private text(selector: string, value: string): void {
    const element = this.root.querySelector<HTMLElement>(selector);
    if (element) element.textContent = value;
  }

  private bar(system: string, value: number): void {
    const element = this.root.querySelector<HTMLElement>(`[data-system="${system}"]`);
    if (element) {
      element.style.width = `${Math.round(value * 100)}%`;
      element.dataset.danger = value < 0.45 ? 'true' : 'false';
    }
  }
}

function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.floor(seconds % 60);
  return `${minutes}:${String(remaining).padStart(2, '0')}`;
}
