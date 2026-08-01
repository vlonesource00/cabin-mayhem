import { CabinInputController } from '../input/cabin-input';
import { HostSession } from '../sim/host-session';
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
          <p class="landing-lede">Walk the aircraft. Fly it badly. Catch the cart before it catches a passenger.</p>
          <div class="landing-actions">
            <button class="primary-button" data-action="start">Enter 3D aircraft</button>
            <span>Phase 1 · moving-aircraft technical slice</span>
          </div>
        </section>
        <section class="feature-strip" aria-label="Prototype features">
          <article><b>01</b><strong>FIRST PERSON</strong><span>Pointer-lock camera, WASD movement, crouch, sprint, brace.</span></article>
          <article><b>02</b><strong>PHYSICAL CABIN</strong><span>3D seats, bins, cart, cases, crates, straps, impacts.</span></article>
          <article><b>03</b><strong>HOST AUTHORITY</strong><span>Deterministic flight forces and simulated network delivery.</span></article>
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
          <div><p>CM-01 / LIVE SIMULATION</p><h1>3D AIRCRAFT TEST DECK</h1></div>
          <div class="authority"><i></i> HOST AUTHORITY ONLINE</div>
        </header>
        <div class="crosshair" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
        <div class="interaction-prompt" data-hud="interaction">CLICK TO CAPTURE MOUSE</div>
        <div class="mouse-hint" data-hud="mouse">Click to lock · hold + drag fallback · Esc releases</div>
        <aside class="telemetry-panel">
          <p class="panel-label">FLIGHT TELEMETRY</p>
          <div class="phase-readout"><span>PHASE</span><strong data-hud="phase">GROUND</strong></div>
          <dl>
            <div><dt>AIRSPEED</dt><dd><b data-hud="speed">0</b> kt</dd></div>
            <div><dt>ALTITUDE</dt><dd><b data-hud="altitude">0</b> ft</dd></div>
            <div><dt>THROTTLE</dt><dd><b data-hud="throttle">0</b>%</dd></div>
            <div><dt>OBJECTS</dt><dd><b data-hud="objects">0</b></dd></div>
          </dl>
          <div class="system-bars">
            <label>ELEC <span><i data-system="electrical"></i></span></label>
            <label>HYDR <span><i data-system="hydraulics"></i></span></label>
            <label>STRUCT <span><i data-system="structure"></i></span></label>
          </div>
        </aside>
        <aside class="debug-panel">
          <p class="panel-label">HOST DEBUG</p>
          <div class="debug-grid">
            <button data-action="turbulence">Turbulence</button>
            <button data-action="drop">Air pocket</button>
            <button data-action="turn">Sharp turn</button>
            <button data-action="collision">Collision</button>
            <button data-action="damage">Damage system</button>
            <button data-action="spawn">Spawn cargo</button>
            <button data-action="network">Toggle network</button>
            <button data-action="phase">Complete phase</button>
            <button data-action="cockpit">Cockpit</button>
            <button data-action="cabin">Cabin</button>
            <button data-action="cargo">Cargo</button>
            <button data-action="reset">Reset</button>
          </div>
        </aside>
        <section class="event-caption" data-hud="caption">
          <span>MISSION</span><strong>Board CM-01. Inspect cabin before departure.</strong>
        </section>
        <section class="held-card"><span>HANDS</span><strong data-hud="held">EMPTY</strong></section>
        <section class="network-card"><span>SIM NET</span><strong data-hud="network">90ms / 2% loss</strong></section>
        <section class="tutorial-card" data-testid="play-guide">
          <p>FIRST PICKUP</p>
          <ol>
            <li>Click <b>CABIN</b> in Host Debug.</li>
            <li>Center crosshair on service cart.</li>
            <li>Press <b>E</b> to hold/place. <b>Q</b> throws.</li>
          </ol>
        </section>
        <footer class="control-ribbon">
          <span><b>WASD</b> MOVE</span><span><b>MOUSE</b> LOOK</span><span><b>SHIFT</b> SPRINT</span>
          <span><b>CTRL</b> CROUCH</span><span><b>C</b> BRACE</span><span><b>E</b> USE</span><span><b>Q</b> THROW</span>
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
      '[data-hud="network"]',
      state.network.enabled
        ? `${Math.round(state.network.latencyMs)}ms / ${Math.round(state.network.packetLoss * 100)}% loss`
        : 'BYPASSED',
    );
    const latest = state.events.at(-1);
    const caption = this.root.querySelector<HTMLElement>('[data-hud="caption"] strong');
    if (caption)
      caption.textContent = state.flight.warning ?? latest?.message ?? 'Aircraft nominal.';
    this.bar('electrical', state.flight.electrical);
    this.bar('hydraulics', state.flight.hydraulics);
    this.bar('structure', state.flight.structure);
  }

  private bindDebugControls(): void {
    this.button('turbulence', () => this.session?.trigger('turbulence', 0.88));
    this.button('drop', () => this.session?.trigger('air-pocket'));
    this.button('turn', () => this.session?.trigger('sharp-turn'));
    this.button('collision', () => this.session?.trigger('collision'));
    this.button('damage', () => this.session?.damage('electrical'));
    this.button('spawn', () => this.session?.spawnObject());
    this.button('network', () => {
      const enabled = this.session?.snapshot().network.enabled ?? true;
      this.session?.setNetwork({ enabled: !enabled });
    });
    this.button('phase', () => this.session?.advancePhase());
    this.button('cockpit', () => this.session?.teleport('crew-alpha', 'cockpit'));
    this.button('cabin', () => this.session?.teleport('crew-alpha', 'cabin'));
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
