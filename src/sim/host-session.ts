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
import { activateFire, createFireState, stepFire, suppressFire } from './fire-response';
import { galleyRepairDefinition } from '../data/emergencies';
import { clamp, distance, normalized, scale } from './math';
import { activateRepair, createRepairState, stepRepair } from './repair-response';
import {
  applyCabinIncident,
  createServiceMission,
  deliverServiceItem,
  needLabel,
  restockServiceCartItem,
  stepServiceMission,
  takeServiceCartItem,
} from './service-mission';
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
      service: createServiceMission(),
      fire: createFireState(),
      repair: createRepairState(),
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
    const previousPhase = this.state.flight.phase;
    this.state.flight = updateFlight(this.state.flight, hostCommand.pilot, dt);
    if (this.state.flight.phase !== previousPhase)
      this.log('flight', `Flight: ${previousPhase} / ${this.state.flight.phase}`);
    this.resolveInteractions();
    this.state.cabin = stepCabin(this.state.cabin, this.state.flight, this.commands, dt);
    this.state.fire = stepFire(this.state.fire, dt);
    this.triggerAutomaticRepair();
    this.resolveRepair(dt);
    const previousOutcome = this.state.service.outcome;
    this.state.service = stepServiceMission(this.state.service, this.state.flight, dt);
    if (this.state.fire.status === 'active' && this.state.flight.phase === 'landed')
      this.state.service = {
        ...this.state.service,
        outcome: 'failed',
        score:
          this.state.service.outcome === 'active'
            ? this.state.service.score - 80
            : this.state.service.score,
      };
    if (previousOutcome !== this.state.service.outcome)
      this.log(
        'service',
        this.state.service.outcome === 'success'
          ? 'Cabin service complete. Passengers secured.'
          : 'Cabin service failed.',
      );
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
    kind: 'turbulence' | 'air-pocket' | 'sharp-turn' | 'collision' | 'fire' | 'repair',
    severity = 0.72,
  ): void {
    if (kind === 'fire') {
      const activation = activateFire(this.state.fire);
      this.state.fire = activation.fire;
      if (activation.accepted)
        this.state.service = applyCabinIncident(this.state.service, 'fire', severity);
      this.log('emergency', activation.message);
      return;
    }
    if (kind === 'repair') {
      const activation = activateRepair(
        this.state.repair,
        this.state.flight.phase,
        this.state.fire.status,
      );
      this.state.repair = activation.repair;
      this.log('emergency', activation.message);
      return;
    }
    if (kind === 'turbulence') this.state.flight = triggerTurbulence(this.state.flight, severity);
    else if (kind === 'air-pocket') this.state.flight = triggerAirPocket(this.state.flight);
    else if (kind === 'sharp-turn') this.state.flight = triggerSharpTurn(this.state.flight);
    else this.state.flight = triggerCollision(this.state.flight);
    this.state.service = applyCabinIncident(this.state.service, kind, severity);
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

  public teleport(
    playerId: string,
    station: 'cockpit' | 'cabin' | 'galley' | 'cargo' | 'repair',
  ): void {
    const player = this.state.cabin.players[playerId];
    if (!player) return;
    const targets = {
      cockpit: { x: 8, y: 3.1 },
      cabin: { x: 8, y: 15.4 },
      galley: { x: 10.8, y: 22.4 },
      cargo: { x: 8, y: 31.5 },
      repair: { x: 5.2, y: 24.8 },
    };
    player.position = { ...targets[station] };
    player.velocity = { x: 0, y: 0 };
    player.lastAction = `Teleported: ${station}`;
    this.log('system', `${player.name}: ${station}`);
  }

  public teleportToPassenger(playerId: string, passengerId: string): void {
    const player = this.state.cabin.players[playerId];
    const passenger = this.state.service.passengers[passengerId];
    if (!player || !passenger) return;
    player.position = { ...passenger.servicePosition };
    player.velocity = { x: 0, y: 0 };
    player.lastAction = `Teleported: ${passenger.name}`;
    this.log('system', `${player.name}: passenger station ${passenger.name}`);
  }

  public teleportToObject(playerId: string, objectId: string): void {
    const player = this.state.cabin.players[playerId];
    const object = this.state.cabin.objects[objectId];
    if (!player || !object) return;
    const facing = normalized(player.facing);
    player.position = {
      x: object.position.x - facing.x * 0.75,
      y: object.position.y - facing.y * 0.75,
    };
    player.velocity = { x: 0, y: 0 };
    player.lastAction = `Teleported: ${object.name}`;
    this.log('system', `${player.name}: object station ${object.name}`);
  }

  public disconnectPlayer(playerId: string): void {
    if (playerId === this.state.hostId) return;
    const player = this.state.cabin.players[playerId];
    if (!player) return;
    const held = player.heldObjectId ? this.state.cabin.objects[player.heldObjectId] : undefined;
    if (held) {
      held.ownerId = undefined;
      held.position = { ...player.position };
      held.velocity = { x: 0, y: 0 };
      player.heldObjectId = undefined;
    }
    player.velocity = { x: 0, y: 0 };
    player.lastAction = 'Disconnected';
    this.commands[playerId] = emptyCommand();
    this.log('network', `${player.name} disconnected. Held item released.`);
  }

  public snapshot(): MissionState {
    return structuredClone(this.state);
  }

  private resolveInteractions(): void {
    for (const [playerId, command] of Object.entries(this.commands)) {
      const player = this.state.cabin.players[playerId];
      if (!player) continue;
      if (command.selectServiceNeed) {
        player.selectedServiceNeed = command.selectServiceNeed;
        player.lastAction = `Cart selection: ${needLabel(command.selectServiceNeed)}`;
      }
      if (command.throwItem && player.heldObjectId) this.throwHeldObject(playerId);
      const held = player.heldObjectId ? this.state.cabin.objects[player.heldObjectId] : undefined;
      if (
        command.interact &&
        command.interactionTargetId === this.state.repair.id &&
        (this.state.repair.status === 'active' || this.state.repair.status === 'repairing') &&
        held?.kind === 'toolbox'
      ) {
        player.lastAction = 'Hold E on the coffee machine breaker';
        continue;
      }
      if (command.interact) this.interact(playerId, command.interactionTargetId, command.sprint);
    }
  }

  private triggerAutomaticRepair(): void {
    if (
      this.state.repair.status === 'dormant' &&
      this.state.service.outcome === 'active' &&
      this.state.flight.phase === 'cruise' &&
      this.state.flight.phaseElapsed >= galleyRepairDefinition.triggerAfterCruiseSeconds &&
      this.state.fire.status !== 'active'
    )
      this.trigger('repair');
  }

  private resolveRepair(deltaSeconds: number): void {
    const repairer = Object.entries(this.commands).find(
      ([, command]) => command.repair && command.interactionTargetId === this.state.repair.id,
    );
    const [playerId, command] = repairer ?? [];
    const player = playerId ? this.state.cabin.players[playerId] : undefined;
    const held = player?.heldObjectId ? this.state.cabin.objects[player.heldObjectId] : undefined;
    const result = stepRepair(
      this.state.repair,
      {
        holding: Boolean(command?.repair),
        targetId: command?.interactionTargetId,
        playerPosition: player?.position,
        playerId,
        heldObject: held,
        fireStatus: this.state.fire.status,
      },
      deltaSeconds,
    );
    this.state.repair = result.repair;
    if (result.pressurePulse)
      this.state.service = applyCabinIncident(this.state.service, 'repair', 0.26);
    if (result.completed)
      this.state.service = { ...this.state.service, score: this.state.service.score + 70 };
    if (result.message) {
      if (player) player.lastAction = result.message;
      this.log('emergency', result.message);
    }
  }

  private interact(playerId: string, targetId?: string | null, moveCart = false): void {
    const player = this.state.cabin.players[playerId];
    if (!player) return;
    if (targetId === this.state.fire.id) {
      const held = player.heldObjectId ? this.state.cabin.objects[player.heldObjectId] : undefined;
      const result = suppressFire(this.state.fire, held, player.position);
      this.state.fire = result.fire;
      player.lastAction = result.message;
      this.log('emergency', result.message);
      return;
    }
    if (targetId?.startsWith('passenger-')) {
      const passenger = this.state.service.passengers[targetId];
      if (!passenger) return;
      if (!player.heldObjectId) {
        player.lastAction =
          passenger.requestStatus === 'active'
            ? `${passenger.name} needs ${needLabel(passenger.need)}`
            : `${passenger.name}: ${passenger.requestStatus}`;
        return;
      }
      const object = this.state.cabin.objects[player.heldObjectId];
      if (!object) return;
      const result = deliverServiceItem(this.state.service, targetId, object, player.position);
      this.state.service = result.service;
      player.lastAction = result.message;
      this.log('service', result.message);
      if (result.consumed) {
        delete this.state.cabin.objects[object.id];
        player.heldObjectId = undefined;
      }
      return;
    }
    const target = closestInteractable(this.state.cabin, player, targetId);
    if (target?.kind === 'cart') {
      if (player.heldObjectId) {
        const object = this.state.cabin.objects[player.heldObjectId];
        if (!object) return;
        const result = restockServiceCartItem(this.state.service, object);
        if (result.accepted) {
          this.state.service = result.service;
          delete this.state.cabin.objects[object.id];
          player.heldObjectId = undefined;
          player.lastAction = result.message;
          this.log('service', result.message);
          return;
        }
      } else if (!moveCart) {
        const result = takeServiceCartItem(
          this.state.service,
          player.selectedServiceNeed,
          target.position,
          playerId,
        );
        this.state.service = result.service;
        player.lastAction = result.message;
        this.log('service', result.message);
        if (result.object) {
          this.state.cabin.objects[result.object.id] = result.object;
          player.heldObjectId = result.object.id;
        }
        return;
      }
    }
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
      this.commands[id] = {
        ...command,
        interact: false,
        selectServiceNeed: undefined,
        throwItem: false,
      };
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
