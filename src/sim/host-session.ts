import {
  closestInteractable,
  createCabinState,
  makeSpawnObject,
  setObjectSecured,
  stepCabin,
} from './cabin-simulation';
import {
  advanceFlightPhase,
  createFlightState,
  damageSystem,
  triggerAirPocket,
  triggerCollision,
  triggerSharpTurn,
  triggerTurbulence,
  updateFlight,
} from './flight-model';
import { clamp, distance, normalized, scale } from './math';
import { SimulatedTransport } from './simulated-transport';
import {
  emptyCommand,
  type DamageSystem,
  type MissionEvent,
  type MissionState,
  type NetworkSettings,
  type PlayerCommand,
} from './types';

const defaultNetwork: NetworkSettings = {
  enabled: true,
  latencyMs: 90,
  jitterMs: 24,
  packetLoss: 0.02,
};

/** Host owns phase, flight, physics, object reservation, and damage. Client commands are intent only. */
export class HostSession {
  private state: MissionState;
  private readonly transport: SimulatedTransport;
  private commands: Record<string, PlayerCommand> = {};
  private eventId = 0;
  private spawnIndex = 0;

  public constructor(seed = 31415) {
    this.state = {
      seed,
      tick: 0,
      hostId: 'crew-alpha',
      flight: createFlightState(),
      cabin: createCabinState(),
      network: { ...defaultNetwork },
      networkMetrics: { sent: 0, received: 0, dropped: 0, queued: 0, bytes: 0 },
      events: [],
    };
    this.transport = new SimulatedTransport(this.state.network, seed);
    for (const playerId of Object.keys(this.state.cabin.players))
      this.commands[playerId] = emptyCommand();
    this.log('system', 'Host ready. Local client connected.');
  }

  public submitCommand(clientId: string, command: PlayerCommand): void {
    if (!this.state.cabin.players[clientId]) return;
    if (clientId === this.state.hostId) this.commands[clientId] = structuredClone(command);
    else this.transport.send(this.state.flight.clock * 1000, clientId, command);
  }

  public step(deltaSeconds: number): void {
    const dt = clamp(deltaSeconds, 0, 0.05);
    if (dt <= 0) return;
    const now = this.state.flight.clock * 1000;
    for (const packet of this.transport.receive(now))
      this.commands[packet.clientId] = packet.command;

    const hostCommand = this.commands[this.state.hostId] ?? emptyCommand();
    this.state.flight = updateFlight(this.state.flight, hostCommand.pilot, dt);
    this.resolveInteractions();
    this.state.cabin = stepCabin(this.state.cabin, this.state.flight, this.commands, dt);
    this.state.tick += 1;
    this.state.networkMetrics = this.transport.snapshot();
    this.clearTransientActions();
  }

  public advancePhase(): void {
    const previous = this.state.flight.phase;
    this.state.flight = advanceFlightPhase(this.state.flight);
    if (previous !== this.state.flight.phase)
      this.log('flight', `Phase: ${previous} / ${this.state.flight.phase}`);
  }

  public trigger(
    kind: 'turbulence' | 'air-pocket' | 'sharp-turn' | 'collision',
    severity = 0.72,
  ): void {
    if (kind === 'turbulence') this.state.flight = triggerTurbulence(this.state.flight, severity);
    else if (kind === 'air-pocket') this.state.flight = triggerAirPocket(this.state.flight);
    else if (kind === 'sharp-turn') this.state.flight = triggerSharpTurn(this.state.flight);
    else this.state.flight = triggerCollision(this.state.flight);
    this.log('physics', this.state.flight.warning ?? kind);
  }

  public damage(system: DamageSystem): void {
    this.state.flight = damageSystem(this.state.flight, system);
    this.log('system', this.state.flight.warning ?? `${system} damaged`);
  }

  public spawnObject(): void {
    this.spawnIndex += 1;
    const item = makeSpawnObject(this.spawnIndex);
    this.state.cabin.objects[item.id] = item;
    this.log('physics', `${item.name} spawned`);
  }

  public setNetwork(settings: Partial<NetworkSettings>): void {
    this.state.network = {
      ...this.state.network,
      ...settings,
      latencyMs: clamp(settings.latencyMs ?? this.state.network.latencyMs, 0, 500),
      jitterMs: clamp(settings.jitterMs ?? this.state.network.jitterMs, 0, 250),
      packetLoss: clamp(settings.packetLoss ?? this.state.network.packetLoss, 0, 0.5),
    };
    this.transport.configure(this.state.network);
    this.log(
      'network',
      this.state.network.enabled ? 'Network simulation enabled' : 'Network simulation bypassed',
    );
  }

  public teleport(playerId: string, station: 'cockpit' | 'cabin' | 'cargo'): void {
    const player = this.state.cabin.players[playerId];
    if (!player) return;
    const targets = {
      cockpit: { x: 8, y: 3.1 },
      cabin: { x: 8, y: 15.4 },
      cargo: { x: 8, y: 31.5 },
    };
    player.position = { ...targets[station] };
    player.velocity = { x: 0, y: 0 };
    player.lastAction = `Teleported: ${station}`;
    this.log('system', `${player.name}: ${station}`);
  }

  public snapshot(): MissionState {
    return structuredClone(this.state);
  }

  private resolveInteractions(): void {
    for (const [playerId, command] of Object.entries(this.commands)) {
      const player = this.state.cabin.players[playerId];
      if (!player) continue;
      if (command.throwItem && player.heldObjectId) this.throwHeldObject(playerId);
      if (command.interact) this.interact(playerId, command.interactionTargetId);
    }
  }

  private interact(playerId: string, targetId?: string | null): void {
    const player = this.state.cabin.players[playerId];
    if (!player) return;
    if (player.heldObjectId) {
      const object = this.state.cabin.objects[player.heldObjectId];
      if (!object) return;
      object.ownerId = undefined;
      object.velocity = scale(player.facing, 0.45);
      player.heldObjectId = undefined;
      player.lastAction = `Placed ${object.name}`;
      this.log('interaction', `${player.name} placed ${object.name}`);
      return;
    }
    const target = closestInteractable(this.state.cabin, player, targetId);
    if (!target) {
      player.lastAction = 'No object in range';
      return;
    }
    if (target.secured) {
      this.state.cabin.objects[target.id] = setObjectSecured(target, false);
      player.lastAction = `Unsecured ${target.name}`;
      this.log('interaction', `${player.name} unsecured ${target.name}`);
      return;
    }
    if (target.kind === 'heavy-crate' && distance(player.position, target.position) < 1.4) {
      this.state.cabin.objects[target.id] = setObjectSecured(target, true);
      player.lastAction = `Secured ${target.name}`;
      this.log('interaction', `${player.name} secured ${target.name}`);
      return;
    }
    if (target.ownerId && target.ownerId !== playerId) {
      player.lastAction = `${target.name} reserved`;
      this.log('network', `Rejected duplicate grab: ${target.name}`);
      return;
    }
    target.ownerId = playerId;
    target.velocity = { x: 0, y: 0 };
    player.heldObjectId = target.id;
    player.lastAction = `Holding ${target.name}`;
    this.log('interaction', `${player.name} reserved ${target.name}`);
  }

  private throwHeldObject(playerId: string): void {
    const player = this.state.cabin.players[playerId];
    const object = player?.heldObjectId ? this.state.cabin.objects[player.heldObjectId] : undefined;
    if (!player || !object) return;
    object.ownerId = undefined;
    object.velocity = scale(normalized(player.facing), 7.5);
    player.heldObjectId = undefined;
    player.lastAction = `Threw ${object.name}`;
    this.log('interaction', `${player.name} threw ${object.name}`);
  }

  private clearTransientActions(): void {
    for (const [id, command] of Object.entries(this.commands)) {
      this.commands[id] = { ...command, interact: false, throwItem: false };
    }
  }

  private log(type: MissionEvent['type'], message: string): void {
    this.eventId += 1;
    this.state.events = [
      { id: this.eventId, at: this.state.flight.clock, type, message },
      ...this.state.events,
    ].slice(0, 12);
  }
}
