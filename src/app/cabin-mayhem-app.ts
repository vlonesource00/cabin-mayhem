import { CabinInputController } from '../input/cabin-input';
import { HostSession } from '../sim/host-session';
import type { MissionState, PlayerCommand, Vec2 } from '../sim/types';

type Screen = 'menu' | 'test';

export class CabinMayhemApp {
  private readonly input = new CabinInputController();
  private screen: Screen = 'menu';
  private session?: HostSession;
  private frame?: number;
  private lastFrame = 0;
  private canvas?: HTMLCanvasElement;
  private context?: CanvasRenderingContext2D;
  private lastHudUpdate = 0;

  public constructor(private readonly root: HTMLElement) {}

  public mount(): void {
    this.renderMenu();
    this.installTestBridge();
  }

  private renderMenu(): void {
    this.stopLoop();
    this.screen = 'menu';
    this.input.setActive(false);
    this.root.innerHTML = `
      <main class="menu-shell">
        <section class="brand-card">
          <p class="eyebrow">GULLWING AIRLINES // TECHNICAL PROTOTYPE</p>
          <h1>CABIN <span>MAYHEM</span></h1>
          <p class="lede">Original cooperative aviation chaos. Phase 1 proves moving-aircraft cabin physics before passengers, routes, economy, or production networking.</p>
          <div class="menu-actions">
            <button class="primary" data-action="start">Launch technical test scene</button>
            <button data-action="brief">Prototype brief</button>
          </div>
          <p class="menu-note">Host-authoritative simulation · local host + simulated client · no third-party art or game content</p>
        </section>
        <section class="proof-grid" aria-label="Phase 1 proof targets">
          <article><strong>01</strong><h2>Reference frame</h2><p>Cabin stays locally stable. Flight acceleration becomes controlled inertial force.</p></article>
          <article><strong>02</strong><h2>Physical cabin</h2><p>Cart, cases, cargo, straps, grabbing, throwing, bracing, impact limits.</p></article>
          <article><strong>03</strong><h2>Authority</h2><p>Host owns phase, damage, objects, reservations, physics and simulated network delivery.</p></article>
        </section>
      </main>`;
    this.button('start', () => this.start());
    this.button('brief', () => this.showBrief());
  }

  private showBrief(): void {
    const brief = document.createElement('dialog');
    brief.className = 'brief-dialog';
    brief.innerHTML = `<h2>Phase 1 controls</h2>
      <p><kbd>WASD</kbd> walk · <kbd>Shift</kbd> sprint · <kbd>Ctrl</kbd> crouch · <kbd>C</kbd> brace · <kbd>E</kbd> grab/place/strap · <kbd>Q</kbd> throw</p>
      <p><kbd>R/F</kbd> throttle · <kbd>Arrows</kbd> pitch/roll · <kbd>J/L</kbd> yaw · <kbd>B</kbd> brake.</p>
      <p>Use debug controls to cause turbulence, drop, sharp turn, collision, damage, latency, object spawn, teleport and phase changes.</p>
      <button autofocus>Close</button>`;
    this.root.append(brief);
    brief.querySelector('button')?.addEventListener('click', () => brief.close());
    brief.addEventListener('close', () => brief.remove());
    brief.showModal();
  }

  private start(seed = 761): void {
    this.stopLoop();
    this.screen = 'test';
    this.session = new HostSession(seed);
    this.input.setActive(true);
    this.root.innerHTML = `
      <main class="test-shell" data-testid="technical-test-scene">
        <header class="flight-header">
          <div><p class="eyebrow">GULLWING AIRLINES // HOST AUTHORITY ONLINE</p><h1>Technical Test Scene</h1></div>
          <div class="header-actions"><button data-action="menu">Exit to menu</button><button data-action="phase" class="primary">Complete phase</button></div>
        </header>
        <section class="instrument-strip" aria-label="Flight instruments">
          <div><span>PHASE</span><strong data-hud="phase">GROUND</strong></div>
          <div><span>AIRSPEED</span><strong data-hud="speed">0 kt</strong></div>
          <div><span>ALTITUDE</span><strong data-hud="altitude">0 ft</strong></div>
          <div><span>ROLL</span><strong data-hud="roll">0°</strong></div>
          <div><span>STRUCTURE</span><strong data-hud="structure">100%</strong></div>
          <div><span>AUTHORITY</span><strong>HOST</strong></div>
        </section>
        <section class="sim-layout">
          <aside class="mission-panel" aria-label="Crew status">
            <h2>Cabin status</h2>
            <dl>
              <div><dt>Local player</dt><dd data-hud="alpha">Ready</dd></div>
              <div><dt>Client replica</dt><dd data-hud="bravo">Ready</dd></div>
              <div><dt>Loose collisions</dt><dd data-hud="collisions">0</dd></div>
              <div><dt>Last impulse</dt><dd data-hud="impulse">0.0</dd></div>
            </dl>
            <h2>Controls</h2>
            <p class="control-copy"><kbd>WASD</kbd> move<br><kbd>Shift</kbd> sprint · <kbd>Ctrl</kbd> crouch · <kbd>C</kbd> brace<br><kbd>E</kbd> grab/place/strap · <kbd>Q</kbd> throw</p>
            <p class="control-copy"><kbd>R/F</kbd> throttle<br><kbd>Arrows</kbd> pitch / roll<br><kbd>J/L</kbd> yaw · <kbd>B</kbd> brake</p>
            <p class="caption" aria-live="polite" data-hud="caption">Host ready. Local client connected.</p>
          </aside>
          <section class="canvas-wrap">
            <canvas width="1200" height="1100" aria-label="Top-down greybox aircraft cabin with cockpit, aisle, seats, shelves, cargo and crew"></canvas>
            <div class="canvas-tag">COCKPIT <span>↑</span></div>
            <div class="legend"><span><i class="host-dot"></i>Host</span><span><i class="client-dot"></i>Client</span><span><i class="secure-dot"></i>Secured</span></div>
          </section>
          <aside class="debug-panel" aria-label="Network and physics debug display">
            <h2>Host debug</h2>
            <div class="network-readout" data-hud="network">Network loading…</div>
            <label>Turbulence <input data-setting="turbulence" type="range" min="10" max="100" value="72" /> <output data-hud="severity">72%</output></label>
            <div class="debug-actions">
              <button data-debug="turbulence">Trigger turbulence</button>
              <button data-debug="air-pocket">Trigger air pocket</button>
              <button data-debug="sharp-turn">Trigger sharp turn</button>
              <button data-debug="collision">Emergency collision</button>
              <button data-debug="electrical">Damage electrical</button>
              <button data-debug="spawn">Spawn light object</button>
              <button data-debug="network">Toggle network simulation</button>
              <button data-debug="reset">Reset aircraft</button>
            </div>
            <h3>Stations</h3>
            <div class="station-actions">
              <button data-station="cockpit">Cockpit</button><button data-station="cabin">Cabin</button><button data-station="cargo">Cargo</button>
            </div>
            <h3>Event log</h3><ol class="event-log" data-hud="events"></ol>
          </aside>
        </section>
      </main>`;
    this.canvas = this.root.querySelector('canvas') ?? undefined;
    this.context = this.canvas?.getContext('2d') ?? undefined;
    this.button('menu', () => this.renderMenu());
    this.button('phase', () => this.session?.advancePhase());
    this.root
      .querySelector<HTMLInputElement>('[data-setting="turbulence"]')
      ?.addEventListener('input', (event) => {
        const value = Number((event.target as HTMLInputElement).value);
        const output = this.root.querySelector<HTMLOutputElement>('[data-hud="severity"]');
        if (output) output.value = `${value}%`;
      });
    this.root.querySelectorAll<HTMLButtonElement>('[data-debug]').forEach((button) => {
      button.addEventListener('click', () => this.handleDebug(button.dataset.debug ?? ''));
    });
    this.root.querySelectorAll<HTMLButtonElement>('[data-station]').forEach((button) => {
      button.addEventListener('click', () =>
        this.session?.teleport(
          'crew-alpha',
          button.dataset.station as 'cockpit' | 'cabin' | 'cargo',
        ),
      );
    });
    this.lastFrame = performance.now();
    this.frame = requestAnimationFrame(this.frameLoop);
  }

  private readonly frameLoop = (now: number): void => {
    if (!this.session || this.screen !== 'test') return;
    const delta = Math.min(0.05, Math.max(0.001, (now - this.lastFrame) / 1000));
    this.lastFrame = now;
    this.session.submitCommand('crew-alpha', this.input.read());
    this.session.submitCommand('crew-bravo', botCommand(now / 1000));
    this.session.step(delta);
    const snapshot = this.session.snapshot();
    this.draw(snapshot);
    if (now - this.lastHudUpdate > 80) {
      this.updateHud(snapshot);
      this.lastHudUpdate = now;
    }
    this.frame = requestAnimationFrame(this.frameLoop);
  };

  private handleDebug(action: string): void {
    if (!this.session) return;
    if (action === 'turbulence') {
      const intensity =
        Number(
          this.root.querySelector<HTMLInputElement>('[data-setting="turbulence"]')?.value ?? 72,
        ) / 100;
      this.session.trigger('turbulence', intensity);
    } else if (action === 'air-pocket' || action === 'sharp-turn' || action === 'collision') {
      this.session.trigger(action);
    } else if (action === 'electrical') this.session.damage('electrical');
    else if (action === 'spawn') this.session.spawnObject();
    else if (action === 'network') {
      const enabled = !this.session.snapshot().network.enabled;
      this.session.setNetwork({ enabled });
    } else if (action === 'reset') this.start(761);
  }

  private draw(state: MissionState): void {
    const canvas = this.canvas;
    const context = this.context;
    if (!canvas || !context) return;
    const { width, height } = canvas;
    context.clearRect(0, 0, width, height);
    const sky = context.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, '#0a1627');
    sky.addColorStop(1, '#03070e');
    context.fillStyle = sky;
    context.fillRect(0, 0, width, height);
    drawGrid(context, width, height);
    const scale = Math.min((width - 250) / state.cabin.width, (height - 90) / state.cabin.length);
    const origin = { x: (width - state.cabin.width * scale) / 2, y: 45 };
    const point = (position: Vec2): Vec2 => ({
      x: origin.x + position.x * scale,
      y: origin.y + position.y * scale,
    });
    this.drawFuselage(context, state, origin, scale);
    this.drawObjects(context, state, point, scale);
    this.drawPlayers(context, state, point, scale);
    context.fillStyle = '#c8d5df';
    context.font = '600 18px ui-monospace, monospace';
    context.fillText(
      `INERTIAL FORCE  X ${state.flight.cabinAcceleration.x.toFixed(2)}  Y ${state.flight.cabinAcceleration.y.toFixed(2)}`,
      34,
      height - 28,
    );
  }

  private drawFuselage(
    context: CanvasRenderingContext2D,
    state: MissionState,
    origin: Vec2,
    scale: number,
  ): void {
    const width = state.cabin.width * scale;
    const length = state.cabin.length * scale;
    context.save();
    context.translate(origin.x + width / 2, origin.y + length / 2);
    context.rotate((state.flight.roll / 35) * 0.025);
    context.translate(-width / 2, -length / 2);
    const shell = context.createLinearGradient(0, 0, width, 0);
    shell.addColorStop(0, '#273447');
    shell.addColorStop(0.5, '#607083');
    shell.addColorStop(1, '#273447');
    context.fillStyle = shell;
    context.beginPath();
    context.roundRect(0, 0, width, length, width * 0.28);
    context.fill();
    context.fillStyle = '#101a27';
    context.beginPath();
    context.roundRect(
      scale * 1.15,
      scale * 0.6,
      width - scale * 2.3,
      length - scale * 1.2,
      width * 0.19,
    );
    context.fill();
    context.fillStyle = state.flight.electrical > 0.3 ? '#c89d58' : '#455064';
    context.fillRect(width * 0.29, scale * 1.25, width * 0.42, scale * 3.7);
    context.fillStyle = '#172535';
    context.fillRect(width * 0.41, scale * 1.7, width * 0.18, scale * 2.3);
    context.strokeStyle = '#cfd8df';
    context.lineWidth = 2;
    context.strokeRect(width * 0.41, scale * 1.7, width * 0.18, scale * 2.3);
    context.fillStyle = '#182433';
    context.fillRect(width * 0.4, scale * 5.4, width * 0.2, length - scale * 11.3);
    for (let row = 0; row < 5; row += 1) {
      const y = scale * (8 + row * 3.5);
      drawSeatRow(context, scale, y, width);
    }
    context.fillStyle = '#27384a';
    context.fillRect(scale * 1.7, length - scale * 7.5, width - scale * 3.4, scale * 5.3);
    context.strokeStyle = '#8fa4b4';
    context.setLineDash([9, 7]);
    context.strokeRect(scale * 2.1, length - scale * 7.1, width - scale * 4.2, scale * 4.5);
    context.setLineDash([]);
    for (let index = 0; index < 6; index += 1) {
      const y = scale * (7 + index * 4.2);
      context.fillStyle = state.flight.electrical > 0.25 ? '#e9c46a' : '#4c5665';
      context.beginPath();
      context.arc(scale * 1.35, y, 5, 0, Math.PI * 2);
      context.arc(width - scale * 1.35, y, 5, 0, Math.PI * 2);
      context.fill();
    }
    context.restore();
  }

  private drawObjects(
    context: CanvasRenderingContext2D,
    state: MissionState,
    point: (position: Vec2) => Vec2,
    scale: number,
  ): void {
    for (const object of Object.values(state.cabin.objects)) {
      const p = point(object.position);
      const radius = object.radius * scale;
      context.save();
      context.translate(p.x, p.y);
      context.rotate(Math.atan2(object.velocity.y, object.velocity.x) * 0.12);
      if (object.kind === 'cart') {
        context.fillStyle = '#bd6b4f';
        context.fillRect(-radius, -radius * 0.62, radius * 2, radius * 1.24);
        context.fillStyle = '#f1c581';
        context.fillRect(-radius * 0.76, -radius * 0.42, radius * 1.52, radius * 0.16);
        context.fillStyle = '#0a1119';
        context.beginPath();
        context.arc(-radius * 0.65, radius * 0.74, radius * 0.18, 0, Math.PI * 2);
        context.arc(radius * 0.65, radius * 0.74, radius * 0.18, 0, Math.PI * 2);
        context.fill();
      } else if (object.kind === 'heavy-crate') {
        context.fillStyle = object.damage > 0.4 ? '#a64543' : '#74573d';
        context.fillRect(-radius, -radius, radius * 2, radius * 2);
        context.strokeStyle = '#e5c777';
        context.lineWidth = 5;
        context.strokeRect(-radius * 0.77, -radius * 0.77, radius * 1.54, radius * 1.54);
        if (object.secured) {
          context.strokeStyle = '#69dec0';
          context.lineWidth = 4;
          context.beginPath();
          context.moveTo(-radius, -radius);
          context.lineTo(radius, radius);
          context.moveTo(radius, -radius);
          context.lineTo(-radius, radius);
          context.stroke();
        }
      } else {
        context.fillStyle = object.kind === 'toolbox' ? '#5c9dd1' : '#d2b461';
        context.fillRect(-radius, -radius * 0.78, radius * 2, radius * 1.56);
        context.strokeStyle = '#111a26';
        context.lineWidth = 3;
        context.strokeRect(-radius, -radius * 0.78, radius * 2, radius * 1.56);
      }
      if (object.ownerId) {
        context.strokeStyle = '#f5f7fb';
        context.lineWidth = 3;
        context.beginPath();
        context.arc(0, 0, radius + 8, 0, Math.PI * 2);
        context.stroke();
      }
      context.restore();
    }
  }

  private drawPlayers(
    context: CanvasRenderingContext2D,
    state: MissionState,
    point: (position: Vec2) => Vec2,
    scale: number,
  ): void {
    for (const player of Object.values(state.cabin.players)) {
      const p = point(player.position);
      const radius = scale * 0.5;
      context.save();
      context.translate(p.x, p.y);
      if (player.knockdown > 0) context.rotate(Math.PI / 2);
      context.fillStyle = player.color;
      context.beginPath();
      context.arc(0, 0, radius, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = '#06101c';
      context.lineWidth = 5;
      context.stroke();
      context.fillStyle = '#08131f';
      context.beginPath();
      context.moveTo(player.facing.x * radius * 0.95, player.facing.y * radius * 0.95);
      context.lineTo(-player.facing.y * radius * 0.35, player.facing.x * radius * 0.35);
      context.lineTo(player.facing.y * radius * 0.35, -player.facing.x * radius * 0.35);
      context.closePath();
      context.fill();
      if (player.braced) {
        context.strokeStyle = '#ffffff';
        context.lineWidth = 3;
        context.beginPath();
        context.arc(0, 0, radius + 7, 0, Math.PI * 2);
        context.stroke();
      }
      context.restore();
      context.fillStyle = '#eef5fb';
      context.font = '600 15px ui-monospace, monospace';
      context.fillText(
        player.id === state.hostId ? 'HOST' : 'CLIENT',
        p.x - radius,
        p.y - radius - 12,
      );
    }
  }

  private updateHud(state: MissionState): void {
    this.hud('phase', state.flight.phase.toUpperCase());
    this.hud('speed', `${Math.round(state.flight.airspeed)} kt`);
    this.hud('altitude', `${Math.round(state.flight.altitude)} ft`);
    this.hud('roll', `${state.flight.roll.toFixed(1)}°`);
    this.hud('structure', `${Math.round(state.flight.structure * 100)}%`);
    this.hud('collisions', String(state.cabin.collisionCount));
    this.hud('impulse', state.cabin.lastImpulse.toFixed(1));
    this.hud('alpha', playerSummary(state, 'crew-alpha'));
    this.hud('bravo', playerSummary(state, 'crew-bravo'));
    this.hud('caption', state.flight.warning ?? state.events[0]?.message ?? 'Stable cabin');
    this.hud(
      'network',
      `${state.network.enabled ? 'SIMULATED LINK' : 'DIRECT LINK'}\n${state.network.latencyMs} ms ± ${state.network.jitterMs} · ${Math.round(state.network.packetLoss * 100)}% loss\n${state.networkMetrics.received}/${state.networkMetrics.sent} packets · ${state.networkMetrics.queued} queued · ${state.networkMetrics.bytes} B`,
    );
    const log = this.root.querySelector<HTMLOListElement>('[data-hud="events"]');
    if (log)
      log.innerHTML = state.events
        .slice(0, 6)
        .map((event) => `<li><time>${event.at.toFixed(1)}</time>${escapeHtml(event.message)}</li>`)
        .join('');
  }

  private hud(name: string, value: string): void {
    const target = this.root.querySelector<HTMLElement>(`[data-hud="${name}"]`);
    if (target) target.textContent = value;
  }

  private button(action: string, handler: () => void): void {
    this.root
      .querySelector<HTMLButtonElement>(`[data-action="${action}"]`)
      ?.addEventListener('click', handler);
  }

  private stopLoop(): void {
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = undefined;
  }

  private installTestBridge(): void {
    if (!import.meta.env.DEV) return;
    window.__CABIN_MAYHEM_TEST__ = {
      start: () => this.start(99),
      state: () => this.session?.snapshot(),
      step: (seconds) => {
        if (!this.session) this.start(99);
        const ticks = Math.ceil(seconds / (1 / 60));
        for (let index = 0; index < ticks; index += 1) this.session?.step(1 / 60);
      },
      advancePhase: () => this.session?.advancePhase(),
      trigger: (kind) => this.session?.trigger(kind),
      reset: () => this.start(99),
    };
  }
}

function drawGrid(context: CanvasRenderingContext2D, width: number, height: number): void {
  context.strokeStyle = 'rgba(118, 150, 180, 0.08)';
  context.lineWidth = 1;
  for (let x = 0; x < width; x += 40) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, height);
    context.stroke();
  }
  for (let y = 0; y < height; y += 40) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(width, y);
    context.stroke();
  }
}

function drawSeatRow(
  context: CanvasRenderingContext2D,
  scale: number,
  y: number,
  width: number,
): void {
  context.fillStyle = '#3d5871';
  context.fillRect(scale * 1.8, y, scale * 4.6, scale * 2.1);
  context.fillRect(width - scale * 6.4, y, scale * 4.6, scale * 2.1);
  context.strokeStyle = '#203347';
  context.lineWidth = 3;
  for (let side = 0; side < 2; side += 1) {
    const x = side === 0 ? scale * 1.8 : width - scale * 6.4;
    context.strokeRect(x, y, scale * 4.6, scale * 2.1);
    context.beginPath();
    context.moveTo(x + scale * 2.3, y);
    context.lineTo(x + scale * 2.3, y + scale * 2.1);
    context.stroke();
  }
}

function botCommand(clock: number): PlayerCommand {
  const phase = Math.floor(clock / 4) % 4;
  const moves = [
    { x: 0, y: -0.5 },
    { x: 0.35, y: 0 },
    { x: 0, y: 0.5 },
    { x: -0.35, y: 0 },
  ];
  return {
    move: moves[phase] ?? { x: 0, y: 0 },
    sprint: false,
    crouch: false,
    brace: false,
    interact: false,
    throwItem: false,
    pilot: { pitch: 0, roll: 0, yaw: 0, throttle: 0, brake: false },
  };
}

function playerSummary(state: MissionState, playerId: string): string {
  const player = state.cabin.players[playerId];
  if (!player) return 'Disconnected';
  return `${player.braced ? 'BRACED' : player.heldObjectId ? 'HOLDING' : player.lastAction} · ${player.position.x.toFixed(1)}, ${player.position.y.toFixed(1)}`;
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>'"]/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character] ??
      character,
  );
}
