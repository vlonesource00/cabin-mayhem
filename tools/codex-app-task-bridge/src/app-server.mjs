/* global clearTimeout, process, setTimeout */

import { EventEmitter } from 'node:events';
import { spawn } from 'node:child_process';
import {
  JsonLineReader,
  JsonRpcError,
  isRequest,
  isResponse,
  requestKey,
  sendJsonLine,
} from './protocol.mjs';

function defaultCommand() {
  if (process.env.CODEX_APP_TASK_BRIDGE_BIN) return process.env.CODEX_APP_TASK_BRIDGE_BIN;
  return process.platform === 'win32' ? 'codex.exe' : 'codex';
}

function nextId(counter) {
  return counter + 1;
}

export class AppServerClient extends EventEmitter {
  #process;
  #reader;
  #requestCounter = 0;
  #pending = new Map();
  #started = false;
  #initialized = false;
  #hostIdentity;

  constructor({
    command = defaultCommand(),
    args = ['app-server', '--stdio'],
    env = undefined,
    requestTimeoutMs = 30_000,
  } = {}) {
    super();
    this.command = command;
    this.args = args;
    this.env = env;
    this.requestTimeoutMs = requestTimeoutMs;
  }

  async start() {
    if (this.#started) return;
    this.#process = spawn(this.command, this.args, {
      env: { ...process.env, ...this.env },
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    this.#started = true;
    this.#process.stderr.setEncoding('utf8');
    this.#process.stderr.on('data', (chunk) => this.emit('stderr', String(chunk)));
    this.#process.on('error', (error) => this.#failAll(error));
    this.#process.on('close', (code, signal) => {
      const error = new Error(
        `Codex App Server exited (code=${code ?? 'null'}, signal=${signal ?? 'null'})`,
      );
      this.#failAll(error);
      this.emit('close', { code, signal });
      this.#started = false;
      this.#initialized = false;
    });
    this.#reader = new JsonLineReader(this.#process.stdout);
    this.#reader.on('message', (message) => this.#onMessage(message));
    this.#reader.on('error', (error) => this.emit('protocolError', error));
    this.#reader.on('end', () => this.emit('end'));

    await this.request('initialize', {
      clientInfo: {
        name: 'codex-app-task-bridge',
        title: 'Codex App Task Bridge',
        version: '0.1.0',
      },
      capabilities: {
        experimentalApi: true,
      },
    });
    this.notify('initialized');
    this.#initialized = true;
    this.emit('ready');
  }

  #failAll(error) {
    for (const pending of this.#pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.#pending.clear();
  }

  #onMessage(message) {
    if (message?.method === 'remoteControl/status/changed' && message.params) {
      this.#hostIdentity = message.params;
      this.emit('hostIdentity', message.params);
    }
    if (isResponse(message)) {
      const pending = this.#pending.get(requestKey(message.id));
      if (!pending) {
        this.emit('orphanResponse', message);
        return;
      }
      this.#pending.delete(requestKey(message.id));
      clearTimeout(pending.timer);
      if (message.error) {
        pending.reject(
          new JsonRpcError(message.error.code, message.error.message, message.error.data),
        );
      } else {
        pending.resolve(message.result);
      }
      return;
    }
    if (isRequest(message)) {
      this.emit('request', message);
      return;
    }
    if (message && typeof message.method === 'string') {
      this.emit('notification', message);
      return;
    }
    this.emit('protocolError', new Error('Received an unknown App Server message shape'));
  }

  notify(method, params = undefined) {
    if (!this.#process?.stdin?.writable) throw new Error('App Server is not writable');
    const message = { jsonrpc: '2.0', method };
    if (params !== undefined) message.params = params;
    sendJsonLine(this.#process.stdin, message);
  }

  request(method, params, { timeoutMs = this.requestTimeoutMs } = {}) {
    if (!this.#process?.stdin?.writable) {
      return Promise.reject(new Error('App Server is not running'));
    }
    const id = nextId(this.#requestCounter);
    this.#requestCounter = id;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(requestKey(id));
        reject(new Error(`Timed out waiting for App Server method ${method}`));
      }, timeoutMs);
      this.#pending.set(requestKey(id), { resolve, reject, timer, method });
      sendJsonLine(this.#process.stdin, { jsonrpc: '2.0', id, method, params });
    });
  }

  respond(id, result) {
    if (!this.#process?.stdin?.writable) throw new Error('App Server is not writable');
    sendJsonLine(this.#process.stdin, { jsonrpc: '2.0', id, result });
  }

  reject(id, error, data = undefined) {
    if (!this.#process?.stdin?.writable) throw new Error('App Server is not writable');
    const message = {
      jsonrpc: '2.0',
      id,
      error: { code: error.code ?? -32000, message: error.message ?? String(error) },
    };
    if (data !== undefined) message.error.data = data;
    sendJsonLine(this.#process.stdin, message);
  }

  async close() {
    if (!this.#process) return;
    this.#failAll(new Error('App Server closed by bridge'));
    const child = this.#process;
    this.#process = undefined;
    this.#started = false;
    this.#initialized = false;
    this.#hostIdentity = undefined;
    if (!child.killed) child.kill();
    await new Promise((resolve) => child.once('close', resolve));
  }

  get isReady() {
    return this.#initialized;
  }

  get hostIdentity() {
    return this.#hostIdentity;
  }
}
