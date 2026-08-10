import {
  closestInteractable,
  createCabinState,
  makeSpawnObject,
  setObjectSecured,
  stepCabin,
} from './cabin-simulation';
import {
  advanceVoyagePhase,
  createVoyageState,
  damageSystem,
  triggerAirPocket,
  triggerCollision,
  triggerSharpTurn,
  triggerTurbulence,
  updateVoyage,
} from './ship-model';
import { activateFire, createFireState, stepFire, suppressFire } from './fire-response';
import {
  galleyRepairDefinition,
  navigationIncidentDefinition,
  steeringRepairDefinition,
} from '../data/emergencies';
import { compartmentById, defaultCompartmentId } from '../data/ship-layout';
import { clamp, distance, normalized, scale } from './math';
import {
  activateNavigationRepair,
  activateRepair,
  createRepairState,
  stepRepair,
} from './repair-response';
import {
  activateNavigationIncident,
  bridgeHelmCandidate,
  createNavigationIncidentState,
  stepNavigation,
} from './navigation-incident';
import {
  boardingEventCatalog,
  boardingInvasionDefinition,
  type BoardingEventId,
} from '../data/invasions';
import {
  createBoardingInvasionState,
  resolveBoardingDefenseAction,
  stepBoardingInvasion,
  triggerBoardingEvent,
  type BoardingEventTriggerContext,
  type BoardingEventTriggerRequest,
  type BoardingStepResult,
} from './boarding-invasion';
import { createAmbientCrowdState, stepAmbientCrowd } from './ambient-crowd';
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

/** Host owns phase, voyage, physics, object reservation, and damage. Client commands are intent only. */
export class HostSession {
  private state: MissionState;
  private readonly transport: SimulatedTransport;
  private commands: Record<string, PlayerCommand> = {};
  private readonly disconnectedPlayers = new Set<string>();
  private readonly completedBoardingEventIds = new Set<BoardingEventId>();
  private selectedBoardingEventId: BoardingEventId | undefined;
  private eventId = 0;
  private spawnIndex = 0;

  public constructor(seed = 31415) {
    this.state = {
      seed,
      tick: 0,
      hostId: 'crew-alpha',
      voyage: createVoyageState(),
      cabin: createCabinState(),
      service: createServiceMission(),
      fire: createFireState(),
      repair: createRepairState(),
      navigation: createNavigationIncidentState(),
      invasion: createBoardingInvasionState(),
      crowd: createAmbientCrowdState(seed),
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
    if (!this.state.cabin.players[clientId] || this.disconnectedPlayers.has(clientId)) return;
    if (clientId === this.state.hostId) this.commands[clientId] = structuredClone(command);
    else this.transport.send(this.state.voyage.clock * 1000, clientId, command);
  }

  public step(deltaSeconds: number): void {
    const dt = clamp(deltaSeconds, 0, 0.05);
    if (dt <= 0) return;
    this.prepareNextBoardingEvent();
    const now = this.state.voyage.clock * 1000;
    for (const packet of this.transport.receive(now)) {
      if (!this.disconnectedPlayers.has(packet.clientId))
        this.commands[packet.clientId] = packet.command;
    }

    this.triggerAutomaticNavigationIncident();
    this.triggerAutomaticBoardingInvasion();
    const bridgeHelm = bridgeHelmCandidate(this.state.cabin.players, this.commands);
    const previousPhase = this.state.voyage.phase;
    this.state.voyage = updateVoyage(
      this.state.voyage,
      bridgeHelm?.command.helm ?? emptyCommand().helm,
      dt,
    );
    if (this.state.voyage.phase !== previousPhase)
      this.log('voyage', `Voyage: ${previousPhase} / ${this.state.voyage.phase}`);
    const navigationStep = stepNavigation(
      this.state.navigation,
      this.state.cabin.players,
      this.commands,
      dt,
    );
    this.state.navigation = navigationStep.navigation;
    if (navigationStep.outcome === 'avoided') {
      this.state.service = {
        ...this.state.service,
        score: this.state.service.score + navigationIncidentDefinition.avoidScore,
      };
      this.log('voyage', navigationStep.navigation.lastOutcome);
    } else if (navigationStep.outcome === 'impact') {
      this.applyNavigationImpact();
    }
    const boardingStep = stepBoardingInvasion(this.state.invasion, dt);
    this.state.invasion = boardingStep.invasion;
    this.state.crowd = stepAmbientCrowd(this.state.crowd, this.state.invasion.phase, dt);
    this.applyBoardingStepConsequences(boardingStep);
    this.resolveBoardingActions();
    this.resolveInteractions();
    this.state.cabin = stepCabin(this.state.cabin, this.state.voyage, this.commands, dt);
    this.state.fire = stepFire(this.state.fire, dt);
    this.triggerAutomaticRepair();
    this.resolveRepair(dt);
    this.resolveNavigationRepair(dt);
    const previousOutcome = this.state.service.outcome;
    this.state.service = stepServiceMission(this.state.service, this.state.voyage, dt);
    if (this.state.fire.status === 'active' && this.state.voyage.phase === 'docked')
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
    const previous = this.state.voyage.phase;
    this.state.voyage = advanceVoyagePhase(this.state.voyage);
    if (previous !== this.state.voyage.phase)
      this.log('voyage', `Phase: ${previous} / ${this.state.voyage.phase}`);
  }

  public trigger(
    kind:
      | 'turbulence'
      | 'air-pocket'
      | 'sharp-turn'
      | 'collision'
      | 'collision-course'
      | 'collision-course-debug'
      | 'navigation'
      | 'boarding-invasion'
      | 'boarding-invasion-debug'
      | 'invasion'
      | 'fire'
      | 'repair',
    severity = 0.72,
  ): void {
    if (kind === 'boarding-invasion' || kind === 'boarding-invasion-debug' || kind === 'invasion') {
      this.prepareNextBoardingEvent();
      const debugTiming = kind === 'boarding-invasion-debug';
      this.applyBoardingEventTrigger(
        {
          eventId: boardingEventCatalog[0]!.id,
          mode: 'debug',
          ...(debugTiming ? { warningSeconds: 0.1, approachSeconds: 0.1, maxRaidSeconds: 2 } : {}),
        },
        this.boardingTriggerContext(true),
      );
      return;
    }
    if (kind === 'collision-course' || kind === 'navigation' || kind === 'collision-course-debug') {
      const activation = activateNavigationIncident(
        this.state.navigation,
        kind === 'collision-course-debug' ? 3 : navigationIncidentDefinition.warningSeconds,
      );
      this.state.navigation = activation.navigation;
      this.log('emergency', activation.message);
      return;
    }
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
        this.state.voyage.phase,
        this.state.fire.status,
      );
      this.state.repair = activation.repair;
      this.log('emergency', activation.message);
      return;
    }
    if (kind === 'turbulence') this.state.voyage = triggerTurbulence(this.state.voyage, severity);
    else if (kind === 'air-pocket') this.state.voyage = triggerAirPocket(this.state.voyage);
    else if (kind === 'sharp-turn') this.state.voyage = triggerSharpTurn(this.state.voyage);
    else this.state.voyage = triggerCollision(this.state.voyage);
    this.state.service = applyCabinIncident(this.state.service, kind, severity);
    this.log('physics', this.state.voyage.warning ?? kind);
  }

  public damage(system: DamageSystem): void {
    this.state.voyage = damageSystem(this.state.voyage, system);
    this.log('system', this.state.voyage.warning ?? `${system} damaged`);
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
    station:
      | 'cockpit'
      | 'cabin'
      | 'galley'
      | 'cargo'
      | 'repair'
      | 'bridge'
      | 'navigation-repair'
      | 'boarding-port'
      | 'boarding-starboard'
      | 'pool-deck',
  ): void {
    const player = this.state.cabin.players[playerId];
    if (!player) return;
    // Working positions on the 24 x 46 m atrium floor, in metres. Each one puts
    // the crew inside interaction reach of the props that station is about and
    // clear of every box in `cabinFixtures`, so a teleport lands somewhere you
    // can actually work rather than inside the furniture.
    const targets: Record<string, { position: { x: number; y: number }; compartmentId?: string }> =
      {
        // Forward, just aft of the reception counter.
        cockpit: {
          position: { ...navigationIncidentDefinition.bridge.position },
          compartmentId: navigationIncidentDefinition.bridge.compartmentId,
        },
        bridge: {
          position: { ...navigationIncidentDefinition.bridge.position },
          compartmentId: navigationIncidentDefinition.bridge.compartmentId,
        },
        // The service station: cart ahead, staged trays and kits underfoot.
        cabin: { position: { x: 10.6, y: 13.9 }, compartmentId: defaultCompartmentId },
        // Port side of the bar, within extinguisher range of the galley fire.
        galley: { position: { x: 8, y: 36.5 }, compartmentId: defaultCompartmentId },
        // Aft, between the two lashed crates.
        cargo: { position: { x: 12, y: 44.2 }, compartmentId: defaultCompartmentId },
        // Beside the breaker panel and its toolbox, port aft.
        repair: { position: { x: 4.2, y: 33.2 }, compartmentId: defaultCompartmentId },
        'navigation-repair': {
          position: { ...steeringRepairDefinition.position },
          compartmentId: steeringRepairDefinition.compartmentId,
        },
        'boarding-port': {
          position: { ...boardingInvasionDefinition.links[0]!.position },
          compartmentId: boardingInvasionDefinition.links[0]!.compartmentId,
        },
        'boarding-starboard': {
          position: { ...boardingInvasionDefinition.links[1]!.position },
          compartmentId: boardingInvasionDefinition.links[1]!.compartmentId,
        },
        'pool-deck': {
          // Clear centre aisle just aft of the authored main pool. From here a
          // forward-facing camera sees bathers, loungers and the lido bar.
          position: { x: 17, y: 70 },
          compartmentId: 'pool-deck',
        },
      };
    const target = targets[station];
    if (!target) return;
    if (target.compartmentId) {
      player.compartmentId = target.compartmentId;
      player.waypointDeck = compartmentById(target.compartmentId)?.deck;
    }
    player.position = { ...target.position };
    player.velocity = { x: 0, y: 0 };
    const held = player.heldObjectId ? this.state.cabin.objects[player.heldObjectId] : undefined;
    if (held) held.compartmentId = player.compartmentId;
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
    this.disconnectedPlayers.add(playerId);
    this.transport.clearClient(playerId);
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

  /** Reactivate a guest connection after PeerJS reports a fresh open channel. */
  public reconnectPlayer(playerId: string): void {
    if (playerId === this.state.hostId) return;
    const player = this.state.cabin.players[playerId];
    if (!player) return;
    this.transport.clearClient(playerId);
    const wasDisconnected = this.disconnectedPlayers.delete(playerId);
    this.commands[playerId] = emptyCommand();
    if (wasDisconnected) {
      player.velocity = { x: 0, y: 0 };
      player.lastAction = 'Reconnected';
      this.log('network', `${player.name} reconnected. Fresh commands required.`);
    }
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
      if (
        command.interact &&
        command.interactionTargetId === this.state.navigation.repair.id &&
        (this.state.navigation.repair.status === 'active' ||
          this.state.navigation.repair.status === 'repairing') &&
        held?.kind === 'toolbox'
      ) {
        player.lastAction = 'Hold E on the engine room steering relay';
        continue;
      }
      if (command.interact) this.interact(playerId, command.interactionTargetId, command.sprint);
    }
  }

  private triggerAutomaticRepair(): void {
    if (
      this.state.repair.status === 'dormant' &&
      this.state.service.outcome === 'active' &&
      this.state.voyage.phase === 'open-sea' &&
      this.state.voyage.phaseElapsed >= galleyRepairDefinition.triggerAfterCruiseSeconds &&
      this.state.fire.status !== 'active'
    )
      this.trigger('repair');
  }

  private triggerAutomaticNavigationIncident(): void {
    if (
      this.state.navigation.phase === 'idle' &&
      this.state.voyage.phase === 'open-sea' &&
      this.state.voyage.phaseElapsed >= navigationIncidentDefinition.triggerAfterCruiseSeconds
    )
      this.trigger('collision-course');
  }

  private triggerAutomaticBoardingInvasion(): void {
    if (this.state.invasion.phase !== 'idle') return;
    const event = boardingEventCatalog.find(
      (candidate) =>
        !this.completedBoardingEventIds.has(candidate.id) &&
        this.state.voyage.phase === candidate.schedule.voyagePhase &&
        this.state.voyage.phaseElapsed >= candidate.schedule.triggerAfterCruiseSeconds,
    );
    if (!event) return;
    this.applyBoardingEventTrigger(
      { eventId: event.id, mode: 'scheduled' },
      this.boardingTriggerContext(false),
      false,
    );
  }

  private applyBoardingEventTrigger(
    request: BoardingEventTriggerRequest,
    context: BoardingEventTriggerContext,
    reportRejection = true,
  ): void {
    const activation = triggerBoardingEvent(this.state.invasion, request, context);
    this.state.invasion = activation.invasion;
    if (activation.accepted && activation.eventId)
      this.selectedBoardingEventId = activation.eventId;
    if (activation.accepted || reportRejection) this.log('emergency', activation.message);
  }

  private boardingTriggerContext(explicit: boolean): BoardingEventTriggerContext {
    return {
      voyagePhase: this.state.voyage.phase,
      cruiseSeconds: this.state.voyage.phaseElapsed,
      serviceActive: this.state.service.outcome === 'active',
      navigationClear:
        this.state.navigation.phase === 'idle' ||
        this.state.navigation.phase === 'avoided' ||
        this.state.navigation.phase === 'repaired',
      explicit,
    };
  }

  private prepareNextBoardingEvent(): void {
    if (
      !this.selectedBoardingEventId ||
      (this.state.invasion.phase !== 'repelled' && this.state.invasion.phase !== 'failed')
    )
      return;
    this.completedBoardingEventIds.add(this.selectedBoardingEventId);
    this.selectedBoardingEventId = undefined;
    this.state.invasion = createBoardingInvasionState();
  }

  private applyBoardingStepConsequences(result: BoardingStepResult): void {
    if (result.scoreDelta !== 0)
      this.state.service = {
        ...this.state.service,
        score: this.state.service.score + result.scoreDelta,
      };
    if (result.structureDamage > 0)
      this.state.voyage = {
        ...this.state.voyage,
        structure: clamp(this.state.voyage.structure - result.structureDamage, 0, 1),
        warning: 'BOARDERS DAMAGING SHIP INFRASTRUCTURE',
      };
    for (let index = 0; index < result.passengerInjuries; index += 1) {
      const passenger = Object.values(this.state.service.passengers).sort(
        (left, right) => left.injury - right.injury || left.id.localeCompare(right.id),
      )[0];
      if (!passenger) break;
      passenger.injury = clamp(passenger.injury + 0.25, 0, 1);
      passenger.panic = clamp(passenger.panic + 0.2, 0, 1);
    }
    if (result.message) this.log('emergency', result.message);
  }

  private resolveBoardingActions(): void {
    for (const [playerId, command] of Object.entries(this.commands)) {
      if (!command.boardingAction) continue;
      const player = this.state.cabin.players[playerId];
      const result = resolveBoardingDefenseAction(
        this.state.invasion,
        command.boardingAction,
        player,
      );
      this.state.invasion = result.invasion;
      if (result.scoreDelta !== 0)
        this.state.service = {
          ...this.state.service,
          score: this.state.service.score + result.scoreDelta,
        };
      if (player) player.lastAction = result.message;
      this.log(result.accepted ? 'interaction' : 'network', result.message);
    }
  }

  private applyNavigationImpact(): void {
    const damageBeforeImpact = this.state.voyage.hydraulics;
    this.state.voyage = triggerCollision(this.state.voyage);
    this.state.voyage = damageSystem(this.state.voyage, this.state.navigation.damageSystem);
    this.state.voyage = {
      ...this.state.voyage,
      warning: 'NAVIGATION IMPACT: STEERING HYDRAULICS DAMAGED',
    };
    const activation = activateNavigationRepair(this.state.navigation.repair);
    this.state.navigation = {
      ...this.state.navigation,
      damageBeforeImpact,
      repair: activation.repair,
    };
    this.state.service = {
      ...this.state.service,
      score: this.state.service.score + navigationIncidentDefinition.impactScore,
    };
    this.log('emergency', this.state.navigation.lastOutcome);
    this.log('emergency', activation.message);
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
        playerCompartmentId: player?.compartmentId,
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

  private resolveNavigationRepair(deltaSeconds: number): void {
    const repair = this.state.navigation.repair;
    const repairer = Object.entries(this.commands).find(([playerId, command]) => {
      if (!command.repair || command.interactionTargetId !== repair.id) return false;
      const player = this.state.cabin.players[playerId];
      const held = player?.heldObjectId ? this.state.cabin.objects[player.heldObjectId] : undefined;
      return (
        Boolean(player) &&
        player?.compartmentId === repair.compartmentId &&
        held?.kind === 'toolbox' &&
        held.ownerId === playerId &&
        Boolean(player.position) &&
        distance(player.position, repair.position) <= repair.radius + 1.8
      );
    });
    const [playerId, command] = repairer ?? [];
    const player = playerId ? this.state.cabin.players[playerId] : undefined;
    const held = player?.heldObjectId ? this.state.cabin.objects[player.heldObjectId] : undefined;
    const result = stepRepair(
      repair,
      {
        holding: Boolean(command?.repair),
        targetId: command?.interactionTargetId,
        playerPosition: player?.position,
        playerId,
        playerCompartmentId: player?.compartmentId,
        heldObject: held,
        fireStatus: this.state.fire.status,
      },
      deltaSeconds,
    );
    this.state.navigation = { ...this.state.navigation, repair: result.repair };
    if (result.accepted && this.state.navigation.phase === 'impact')
      this.state.navigation = { ...this.state.navigation, phase: 'repair' };
    if (result.completed) {
      this.state.navigation = { ...this.state.navigation, phase: 'repaired' };
      this.state.voyage = {
        ...this.state.voyage,
        hydraulics: this.state.navigation.damageBeforeImpact ?? 1,
        warning: 'STEERING HYDRAULICS RESTORED: NAVIGATION INCIDENT RESOLVED',
      };
      this.state.service = {
        ...this.state.service,
        score: this.state.service.score + navigationIncidentDefinition.repairScore,
      };
    }
    if (result.pressurePulse)
      this.log('emergency', 'Steering relay pressure rising. Engine room response required.');
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
      object.compartmentId = player.compartmentId;
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
    target.compartmentId = player.compartmentId;
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
    object.compartmentId = player.compartmentId;
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
        boardingAction: undefined,
      };
    }
  }

  private log(type: MissionEvent['type'], message: string): void {
    this.eventId += 1;
    this.state.events = [
      { id: this.eventId, at: this.state.voyage.clock, type, message },
      ...this.state.events,
    ].slice(0, 12);
  }
}
