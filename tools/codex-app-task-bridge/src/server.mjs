#!/usr/bin/env node
/* global process */
import { CodexAppTaskBridge } from './bridge.mjs';
import { McpBridgeServer } from './mcp-server.mjs';

const bridge = new CodexAppTaskBridge();
const server = new McpBridgeServer(bridge);

const shutdown = async () => {
  try {
    await bridge.close();
  } finally {
    process.exit(0);
  }
};

process.once('SIGINT', () => void shutdown());
process.once('SIGTERM', () => void shutdown());

await server.runStdio();
await bridge.close();
