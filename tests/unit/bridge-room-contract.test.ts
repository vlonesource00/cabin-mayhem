import { describe, expect, it } from 'vitest';
import { inspectGlb } from '../../scripts/glb-inspect';

const bridgeAsset = 'public/assets/compartments/bridge.glb';
const requiredNodes = [
  'CM_BRIDGE_ROOT',
  'BRIDGE_HELM_SOCKET',
  'BRIDGE_HELM_INTERACTION_SOCKET',
  'BRIDGE_TELEGRAPH_SOCKET',
  'BRIDGE_CHART_SOCKET',
  'BRIDGE_RADAR_SOCKET',
  'BRIDGE_CONTROL_SOCKET',
  'BRIDGE_EMERGENCY_PANEL_SOCKET',
  'BRIDGE_CAPTAIN_WORK_POSITION',
  'BRIDGE_CREW_PORT_WORK_POSITION',
  'BRIDGE_CREW_STBD_WORK_POSITION',
];

describe('authored bridge commander room', () => {
  it('exports named command stations and interaction sockets', async () => {
    const glb = await inspectGlb(bridgeAsset);
    for (const name of requiredNodes) expect(glb.nodeNames).toContain(name);
    expect(glb.meshNames).toEqual(
      expect.arrayContaining(['CM_BRASS', 'CM_NEON_CYAN', 'CM_NEON_PINK', 'CM_SCREEN', 'CM_WOOD']),
    );
    expect(glb.meshNames.length).toBeLessThanOrEqual(320);
    expect(glb.bytes).toBeLessThanOrEqual(25_165_824);
  });
});
