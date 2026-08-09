/* global process */

import { JsonLineReader, sendJsonLine } from './protocol.mjs';

const toolDefinitions = [
  {
    name: 'list_projects',
    description: 'List bridge-approved Git repositories available for isolated Codex worker tasks.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'list_threads',
    description: 'List durable App Server threads associated with one bridge project.',
    inputSchema: {
      type: 'object',
      required: ['project_id'],
      properties: {
        project_id: { type: 'string' },
        cursor: { type: ['string', 'null'] },
        limit: { type: 'integer', minimum: 1, maximum: 1000 },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'create_thread',
    description:
      'Create a durable Luna-capable App Server thread in a new isolated Git worktree and start its bounded work order.',
    inputSchema: {
      type: 'object',
      required: ['project_id', 'work_order'],
      properties: {
        project_id: { type: 'string' },
        model: { type: 'string', default: 'gpt-5.6-luna' },
        effort: { type: 'string', default: 'max' },
        work_order: { type: 'string' },
        worktree_mode: { type: 'string', enum: ['isolated'], default: 'isolated' },
        approval_policy: {
          type: 'string',
          enum: ['untrusted', 'on-request', 'never'],
          default: 'on-request',
        },
        approval_mode: { type: 'string', enum: ['surface', 'reject'], default: 'surface' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'wait_threads',
    description:
      'Wait for one or more bridge-created turns to complete. Pass the host_id returned by create_thread or list_threads.',
    inputSchema: {
      type: 'object',
      required: ['thread_ids', 'host_id'],
      properties: {
        thread_ids: { type: 'array', items: { type: 'string' }, minItems: 1 },
        host_id: { type: 'string' },
        timeout_ms: { type: 'integer', minimum: 100, maximum: 600000, default: 120000 },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'read_thread',
    description:
      'Read a durable App Server thread plus bridge-captured events and Git worktree state. Pass the host_id returned by create_thread or list_threads.',
    inputSchema: {
      type: 'object',
      required: ['thread_id', 'host_id'],
      properties: {
        thread_id: { type: 'string' },
        host_id: { type: 'string' },
        include_turns: { type: 'boolean', default: true },
        include_diff: { type: 'boolean', default: true },
        include_usage: { type: 'boolean', default: true },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'send_message_to_thread',
    description:
      'Steer an active turn or start a correction turn on an idle durable App Server thread. Pass the host_id returned by create_thread or list_threads.',
    inputSchema: {
      type: 'object',
      required: ['thread_id', 'host_id', 'message'],
      properties: {
        thread_id: { type: 'string' },
        host_id: { type: 'string' },
        message: { type: 'string' },
        model: { type: 'string' },
        effort: { type: 'string' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'list_pending_approvals',
    description:
      'List App Server approval or other server-initiated requests waiting for an explicit bridge decision.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'resolve_approval',
    description:
      'Explicitly answer one surfaced App Server approval request; the bridge never auto-approves requests.',
    inputSchema: {
      type: 'object',
      required: ['approval_id'],
      properties: {
        approval_id: { type: 'string' },
        decision: { type: ['string', 'object'] },
        response: { type: 'object' },
      },
      additionalProperties: false,
    },
  },
];

function textResult(payload, isError = false) {
  return {
    content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload,
    isError,
  };
}

export class McpBridgeServer {
  constructor(bridge) {
    this.bridge = bridge;
    this.initialized = false;
  }

  async handle(message) {
    if (!message || typeof message.method !== 'string') return;
    if (
      message.method === 'notifications/initialized' ||
      message.method === 'notifications/cancelled'
    )
      return;
    if (message.method === 'initialize') {
      this.initialized = true;
      return {
        jsonrpc: '2.0',
        id: message.id,
        result: {
          protocolVersion:
            typeof message.params?.protocolVersion === 'string'
              ? message.params.protocolVersion
              : '2025-06-18',
          capabilities: { tools: {} },
          serverInfo: { name: 'codex-app-task-bridge', version: '0.1.0' },
        },
      };
    }
    if (message.method === 'ping') {
      return { jsonrpc: '2.0', id: message.id, result: {} };
    }
    if (message.method === 'tools/list') {
      return { jsonrpc: '2.0', id: message.id, result: { tools: toolDefinitions } };
    }
    if (message.method === 'tools/call') {
      const name = message.params?.name;
      const args = message.params?.arguments ?? {};
      try {
        const payload = await this.callTool(name, args);
        return { jsonrpc: '2.0', id: message.id, result: textResult(payload) };
      } catch (error) {
        return {
          jsonrpc: '2.0',
          id: message.id,
          result: textResult({ error: error.message }, true),
        };
      }
    }
    return {
      jsonrpc: '2.0',
      id: message.id,
      error: { code: -32601, message: `Method not found: ${message.method}` },
    };
  }

  async callTool(name, args) {
    switch (name) {
      case 'list_projects':
        return this.bridge.listProjects(args);
      case 'list_threads':
        return this.bridge.listThreads(args);
      case 'create_thread':
        return this.bridge.createThread(args);
      case 'wait_threads':
        return this.bridge.waitThreads(args);
      case 'read_thread':
        return this.bridge.readThread(args);
      case 'send_message_to_thread':
        return this.bridge.sendMessageToThread(args);
      case 'list_pending_approvals':
        return this.bridge.listPendingApprovals(args);
      case 'resolve_approval':
        return this.bridge.resolveApproval(args);
      default:
        throw new Error(`Unknown tool '${name}'`);
    }
  }

  async runStdio(input = process.stdin, output = process.stdout) {
    const reader = new JsonLineReader(input);
    reader.on('error', (error) =>
      process.stderr.write(`[codex-app-task-bridge] ${error.message}\n`),
    );
    reader.on('message', (message) => {
      void this.handle(message).then((response) => {
        if (response) sendJsonLine(output, response);
      });
    });
    await new Promise((resolve) => reader.once('end', resolve));
  }
}
