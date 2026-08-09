/* global process, setTimeout */

import fs from 'node:fs/promises';
import path from 'node:path';
import { JsonLineReader, sendJsonLine } from '../../src/protocol.mjs';

const reader = new JsonLineReader(process.stdin);
const statePath = process.argv[2] || undefined;
const threads = new Map();
let threadCounter = 0;
let turnCounter = 0;

async function loadState() {
  if (!statePath) return;
  try {
    const state = JSON.parse(await fs.readFile(statePath, 'utf8'));
    threadCounter = Number(state.threadCounter) || 0;
    turnCounter = Number(state.turnCounter) || 0;
    for (const thread of Array.isArray(state.threads) ? state.threads : []) {
      if (thread?.id) threads.set(thread.id, thread);
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

const stateReady = loadState();

function response(id, result) {
  sendJsonLine(process.stdout, { jsonrpc: '2.0', id, result });
}

function notification(method, params) {
  sendJsonLine(process.stdout, { jsonrpc: '2.0', method, params });
}

async function persist() {
  if (!statePath) return;
  await fs.mkdir(path.dirname(statePath), { recursive: true });
  const temporary = `${statePath}.tmp-${process.pid}`;
  await fs.writeFile(
    temporary,
    `${JSON.stringify({ threadCounter, turnCounter, threads: [...threads.values()] }, null, 2)}\n`,
    'utf8',
  );
  await fs.rename(temporary, statePath);
}

async function applyTask(thread, text) {
  const files = {
    'same-thread-initial': ['same-thread.txt', 'initial\n'],
    'same-thread-correction': ['same-thread.txt', 'corrected\n'],
    'worker-a': ['worker-a.txt', 'worker-a\n'],
    'worker-b': ['worker-b.txt', 'worker-b\n'],
    'integration-alpha': ['alpha.txt', 'alpha implementation\n'],
    'integration-beta': ['beta.txt', 'beta implementation\n'],
    'conflict-a': ['conflict.txt', 'worker A\n'],
    'conflict-b': ['conflict.txt', 'worker B\n'],
  };
  const task = files[text];
  if (task) await fs.writeFile(path.join(thread.cwd, task[0]), task[1], 'utf8');
}

function completeTurn(threadId, turnId, status = 'completed') {
  const thread = threads.get(threadId);
  if (thread) thread.status = 'inProgress';
  notification('turn/started', { threadId, turn: { id: turnId, status: 'inProgress' } });
  setTimeout(() => {
    void (async () => {
      if (thread) thread.status = status;
      await persist();
      notification('thread/tokenUsage/updated', {
        threadId,
        tokenUsage: { inputTokens: 2, outputTokens: 3 },
      });
      notification('turn/diff/updated', { threadId, turnId, diff: '' });
      notification('turn/completed', {
        threadId,
        turn: {
          id: turnId,
          status,
          ...(status === 'failed' ? { error: { message: 'fixture worker failure' } } : {}),
        },
        status,
      });
    })();
  }, 25);
}

reader.on('message', (message) => {
  void stateReady.then(() => handleMessage(message));
});

async function handleMessage(message) {
  if (message.method === 'initialize') {
    response(message.id, { userAgent: 'fake-app-server' });
    notification('remoteControl/status/changed', {
      status: 'disabled',
      serverName: 'fake-app-server',
      installationId: 'fake-installation-id',
      environmentId: null,
    });
    return;
  }
  if (message.method === 'initialized') return;
  if (message.method === 'thread/start') {
    const threadId = `fake-thread-${++threadCounter}`;
    const thread = {
      id: threadId,
      cwd: message.params.cwd,
      model: message.params.model,
      status: 'idle',
    };
    threads.set(threadId, thread);
    await persist();
    response(message.id, { thread });
    return;
  }
  if (message.method === 'thread/list') {
    response(message.id, { data: [...threads.values()], nextCursor: null });
    return;
  }
  if (message.method === 'thread/read') {
    const thread = threads.get(message.params.threadId);
    response(message.id, { thread, turns: [] });
    return;
  }
  if (message.method === 'turn/start' || message.method === 'turn/steer') {
    const threadId = message.params.threadId;
    const turnId = `fake-turn-${++turnCounter}`;
    const thread = threads.get(threadId);
    response(message.id, { turn: { id: turnId, status: 'inProgress' } });
    const text = message.params.input?.[0]?.text;
    if (text === 'request-approval') {
      setTimeout(() => {
        sendJsonLine(process.stdout, {
          jsonrpc: '2.0',
          id: 900,
          method: 'item/commandExecution/requestApproval',
          params: {
            itemId: 'item-1',
            command: 'git status',
            cwd: message.params.cwd ?? 'C:/fixture',
            startedAtMs: Date.now(),
            threadId,
            turnId,
          },
        });
      }, 5);
    } else if (text === 'hang-worker') {
      notification('turn/started', { threadId, turn: { id: turnId, status: 'inProgress' } });
    } else {
      void applyTask(thread, text).then(() => {
        completeTurn(threadId, turnId, text === 'fail-worker' ? 'failed' : 'completed');
      });
    }
  }
}
