/* global URL, process, setTimeout */

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { test, afterEach } from 'node:test';
import { fileURLToPath } from 'node:url';
import { BridgeRegistry } from '../src/registry.mjs';
import { CodexAppTaskBridge } from '../src/bridge.mjs';
import { McpBridgeServer } from '../src/mcp-server.mjs';

const execFileAsync = promisify(execFile);
const fixturePath = fileURLToPath(new URL('./fixtures/fake-app-server.mjs', import.meta.url));
const temporaryRoots = [];

async function run(command, args, cwd) {
  return execFileAsync(command, args, { cwd, windowsHide: true });
}

async function makeRepo() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-app-task-bridge-test-'));
  temporaryRoots.push(root);
  await run('git', ['init', '--initial-branch', 'main'], root);
  await run('git', ['config', 'user.email', 'bridge-test@example.invalid'], root);
  await run('git', ['config', 'user.name', 'Bridge Test'], root);
  await fs.writeFile(path.join(root, 'README.md'), 'fixture\n', 'utf8');
  await run('git', ['add', 'README.md'], root);
  await run('git', ['commit', '-m', 'fixture'], root);
  await fs.writeFile(path.join(root, 'dirty.txt'), 'must stay out of worktree\n', 'utf8');
  return root;
}

afterEach(async () => {
  while (temporaryRoots.length) {
    const root = temporaryRoots.pop();
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('bridge maps the six workflow calls onto a durable fake App Server thread', async () => {
  const repo = await makeRepo();
  const stateRoot = path.join(repo, '.bridge-state');
  const registry = new BridgeRegistry({ stateRoot, projectRoots: [repo] });
  const bridge = new CodexAppTaskBridge({
    registry,
    appServerOptions: { command: process.execPath, args: [fixturePath] },
  });

  try {
    const projects = await bridge.listProjects();
    assert.equal(projects.projects.length, 1);
    const project = projects.projects[0];
    assert.ok(project?.id);

    const created = await bridge.createThread({
      project_id: project.id,
      model: 'gpt-5.6-luna',
      effort: 'max',
      work_order: 'bounded fixture work',
    });
    assert.match(created.threadId, /^fake-thread-/);
    assert.equal(created.hostId, 'fake-installation-id');
    assert.equal(
      created.routing.hostIdentity.source,
      'remoteControl/status/changed.installationId',
    );
    assert.equal(created.sourceSnapshot.dirty, true);
    assert.equal(created.routing.threadStartSandbox, 'read-only');
    assert.equal(created.routing.turnSandboxPolicy.type, 'workspaceWrite');
    assert.equal(
      await fs.stat(path.join(created.worktree.path, 'README.md')).then(() => true),
      true,
    );
    await assert.rejects(fs.stat(path.join(created.worktree.path, 'dirty.txt')));

    const waited = await bridge.waitThreads({
      thread_ids: [created.threadId],
      host_id: created.hostId,
      timeout_ms: 2000,
    });
    assert.equal(waited.results[0].timedOut, false);
    assert.equal(waited.results[0].status, 'completed');

    const listed = await bridge.listThreads({ project_id: project.id });
    assert.equal(
      listed.threads.some((thread) => (thread.id ?? thread.threadId) === created.threadId),
      true,
    );

    const read = await bridge.readThread({ thread_id: created.threadId, host_id: created.hostId });
    assert.equal(read.bridge.threadId, created.threadId);
    assert.equal(read.events.tokenUsage.length, 1);
    assert.equal(Array.isArray(read.local.untracked), true);

    const correction = await bridge.sendMessageToThread({
      thread_id: created.threadId,
      host_id: created.hostId,
      message: 'correction',
    });
    assert.equal(correction.mode, 'start');
    await bridge.waitThreads({
      thread_ids: [created.threadId],
      host_id: created.hostId,
      timeout_ms: 2000,
    });
  } finally {
    await bridge.close();
  }
});

test('approval requests are surfaced and require an explicit resolution', async () => {
  const repo = await makeRepo();
  const registry = new BridgeRegistry({
    stateRoot: path.join(repo, '.bridge-state'),
    projectRoots: [repo],
  });
  const bridge = new CodexAppTaskBridge({
    registry,
    appServerOptions: { command: process.execPath, args: [fixturePath] },
  });
  try {
    const project = (await bridge.listProjects()).projects[0];
    const created = await bridge.createThread({
      project_id: project.id,
      work_order: 'bounded fixture work',
    });
    await bridge.waitThreads({
      thread_ids: [created.threadId],
      host_id: created.hostId,
      timeout_ms: 2000,
    });
    await bridge.sendMessageToThread({
      thread_id: created.threadId,
      host_id: created.hostId,
      message: 'request-approval',
    });
    await new Promise((resolve) => setTimeout(resolve, 80));
    const pending = bridge.listPendingApprovals();
    assert.equal(pending.approvals.length, 1);
    assert.equal(pending.approvals[0].method, 'item/commandExecution/requestApproval');
    const resolved = await bridge.resolveApproval({
      approval_id: pending.approvals[0].approvalId,
      decision: 'decline',
    });
    assert.equal(resolved.resolved, true);
    assert.equal(bridge.listPendingApprovals().approvals.length, 0);
  } finally {
    await bridge.close();
  }
});

test('host identity is required and mismatches are rejected', async () => {
  const repo = await makeRepo();
  const registry = new BridgeRegistry({
    stateRoot: path.join(repo, '.bridge-state'),
    projectRoots: [repo],
  });
  const bridge = new CodexAppTaskBridge({
    registry,
    appServerOptions: { command: process.execPath, args: [fixturePath] },
  });
  try {
    const project = (await bridge.listProjects()).projects[0];
    const created = await bridge.createThread({
      project_id: project.id,
      work_order: 'bounded fixture work',
    });
    await assert.rejects(
      () => bridge.waitThreads({ thread_ids: [created.threadId], host_id: 'wrong-host' }),
      /does not match thread/,
    );
    await assert.rejects(
      () => bridge.readThread({ thread_id: created.threadId }),
      /host_id must be a non-empty string/,
    );
  } finally {
    await bridge.close();
  }
});

test('listed legacy bridge records are backfilled from current App Server host', async () => {
  const repo = await makeRepo();
  const registry = new BridgeRegistry({
    stateRoot: path.join(repo, '.bridge-state'),
    projectRoots: [repo],
  });
  const bridge = new CodexAppTaskBridge({
    registry,
    appServerOptions: { command: process.execPath, args: [fixturePath] },
  });
  try {
    const project = (await bridge.listProjects()).projects[0];
    const created = await bridge.createThread({
      project_id: project.id,
      work_order: 'bounded fixture work',
    });
    await registry.updateThread(created.threadId, { hostId: undefined, hostIdentity: undefined });
    const listed = await bridge.listThreads({ project_id: project.id });
    const listedThread = listed.threads.find(
      (thread) => (thread.id ?? thread.threadId) === created.threadId,
    );
    assert.equal(listedThread.hostId, 'fake-installation-id');
    assert.equal(registry.getThread(created.threadId).hostId, 'fake-installation-id');
  } finally {
    await bridge.close();
  }
});

test('MCP surface exposes the six workflow tools and approval control plane', async () => {
  const mcp = new McpBridgeServer({
    listProjects: async () => ({ projects: [] }),
    listThreads: async () => ({ threads: [] }),
    createThread: async () => ({}),
    waitThreads: async () => ({}),
    readThread: async () => ({}),
    sendMessageToThread: async () => ({}),
    listPendingApprovals: () => ({ approvals: [] }),
    resolveApproval: async () => ({}),
  });
  const response = await mcp.handle({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
  const names = response.result.tools.map((tool) => tool.name);
  for (const name of [
    'list_projects',
    'list_threads',
    'create_thread',
    'wait_threads',
    'read_thread',
    'send_message_to_thread',
  ]) {
    assert.equal(names.includes(name), true, name);
  }
  assert.equal(names.includes('resolve_approval'), true);
  const waitTool = response.result.tools.find((tool) => tool.name === 'wait_threads');
  const readTool = response.result.tools.find((tool) => tool.name === 'read_thread');
  const sendTool = response.result.tools.find((tool) => tool.name === 'send_message_to_thread');
  assert.equal(waitTool.inputSchema.required.includes('host_id'), true);
  assert.equal(readTool.inputSchema.required.includes('host_id'), true);
  assert.equal(sendTool.inputSchema.required.includes('host_id'), true);
});
