import type { NetworkMetrics, NetworkSettings, PlayerCommand } from './types';

interface Packet {
  dueAt: number;
  clientId: string;
  command: PlayerCommand;
  size: number;
}

export class SimulatedTransport {
  private packets: Packet[] = [];
  private sequence = 0;
  private metrics: NetworkMetrics = { sent: 0, received: 0, dropped: 0, queued: 0, bytes: 0 };

  public constructor(
    private settings: NetworkSettings,
    private readonly seed: number,
  ) {}

  public configure(settings: NetworkSettings): void {
    this.settings = { ...settings };
  }

  public send(nowMs: number, clientId: string, command: PlayerCommand): void {
    const size = JSON.stringify(command).length;
    this.metrics.sent += 1;
    this.metrics.bytes += size;
    const random = this.random();
    if (this.settings.enabled && random < this.settings.packetLoss) {
      this.metrics.dropped += 1;
      return;
    }
    const jitter = this.settings.enabled ? (this.random() * 2 - 1) * this.settings.jitterMs : 0;
    const latency = this.settings.enabled ? this.settings.latencyMs + jitter : 0;
    this.packets.push({
      dueAt: nowMs + Math.max(0, latency),
      clientId,
      command: structuredClone(command),
      size,
    });
    this.metrics.queued = this.packets.length;
  }

  public receive(nowMs: number): Array<{ clientId: string; command: PlayerCommand }> {
    const ready = this.packets.filter((packet) => packet.dueAt <= nowMs);
    this.packets = this.packets.filter((packet) => packet.dueAt > nowMs);
    this.metrics.received += ready.length;
    this.metrics.queued = this.packets.length;
    return ready.map(({ clientId, command }) => ({ clientId, command }));
  }

  public snapshot(): NetworkMetrics {
    return { ...this.metrics, queued: this.packets.length };
  }

  private random(): number {
    this.sequence += 1;
    const value = Math.sin((this.seed + this.sequence * 17.17) * 12.9898) * 43758.5453;
    return value - Math.floor(value);
  }
}
