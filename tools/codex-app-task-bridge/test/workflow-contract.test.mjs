/* global URL, process */

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

const execFileAsync = promisify(execFile);
const fixturePath = fileURLToPath(new URL('./fixtures/fake-app-server.mjs', import.meta.url));
const temporaryRoots = [];

async function run(command, args, cwd) {
  return execFileAsync(command, args, { cwd, windowsHide: true });
}

async function makeRepo(trackedFiles = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-app-task-bridge-contract-'));
  temporaryRoots.push(root);
  await run('git', ['init', '--initial-branch', 'main'], root);
  await run('git', ['config', 'user.email', 'bridge-test@example.invalid'], root);
  await run('git', ['config', 'user.name', 'Bridge Test'], root);
  const files = { 'README.md': 'fixture\n', ...trackedFiles };
  for (const [file, contents] of Object.entries(files)) {
    await fs.writeFile(path.join(root, file), contents, 'utf8');
  }
  await run('git', ['add', '.'], root);
  await run('git', ['commit', '-m', 'fixture'], root);
  await fs.writeFile(path.join(root, 'dirty.txt'), 'must stay out of worktree\n', 'utf8');
  return root;
}

function makeBridge(repo, stateRoot, { persistentServer = false } = {}) {
  const args = [fixturePath];
  if (persistentServer) args.push(path.join(stateRoot, 'fake-app-server.json'));
  return new CodexAppTaskBridge({
    registry: new BridgeRegistry({ stateRoot, projectRoots: [repo] }),
    appServerOptions: { command: process.execPath, args },
  });
}

async function projectFor(bridge) {
  const result = await bridge.listProjects();
  assert.equal(result.projects.length, 1);
  return result.projects[0];
}

async function createWorker(bridge, project, workOrder) {
  return bridge.createThread({
    project_id: project.id,
    model: 'gpt-5.6-luna',
    effort: 'max',
    work_order: workOrder,
  });
}

async function waitFor(bridge, worker, timeoutMs = 2000) {
  const result = await bridge.waitThreads({
    thread_ids: [worker.threadId],
    host_id: worker.hostId,
    timeout_ms: timeoutMs,
  });
  return result.results[0];
}

async function cloneRepo(repo, name) {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-app-task-bridge-candidate-'));
  temporaryRoots.push(parent);
  const candidate = path.join(parent, name);
  await run('git', ['clone', '-c', 'core.autocrlf=false', '--no-local', repo, candidate]);
  return candidate;
}

afterEach(async () => {
  while (temporaryRoots.length) {
    const root = temporaryRoots.pop();
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('same-thread correction keeps durable thread and worktree identity', async () => {
  const repo = await makeRepo();
  const stateRoot = path.join(repo, '.bridge-state');
  const bridge = makeBridge(repo, stateRoot);
  try {
    const project = await projectFor(bridge);
    const created = await createWorker(bridge, project, 'same-thread-initial');
    const firstWait = await waitFor(bridge, created);
    assert.equal(firstWait.status, 'completed');

    const before = await bridge.readThread({
      thread_id: created.threadId,
      host_id: created.hostId,
    });
    const worktreePath = before.bridge.worktreePath;
    assert.equal(
      await fs.readFile(path.join(worktreePath, 'same-thread.txt'), 'utf8'),
      'initial\n',
    );

    const correction = await bridge.sendMessageToThread({
      thread_id: created.threadId,
      host_id: created.hostId,
      message: 'same-thread-correction',
    });
    assert.equal(correction.mode, 'start');
    assert.equal(correction.threadId, created.threadId);
    assert.equal((await waitFor(bridge, created)).timedOut, false);

    const after = await bridge.readThread({
      thread_id: created.threadId,
      host_id: created.hostId,
    });
    assert.equal(after.bridge.threadId, before.bridge.threadId);
    assert.equal(after.bridge.worktreePath, worktreePath);
    assert.equal(
      await fs.readFile(path.join(worktreePath, 'same-thread.txt'), 'utf8'),
      'corrected\n',
    );
  } finally {
    await bridge.close();
  }
});

test('two workers stay isolated until coordinator integration', async () => {
  const repo = await makeRepo();
  const stateRoot = path.join(repo, '.bridge-state');
  const bridge = makeBridge(repo, stateRoot);
  try {
    const project = await projectFor(bridge);
    const [workerA, workerB] = await Promise.all([
      createWorker(bridge, project, 'worker-a'),
      createWorker(bridge, project, 'worker-b'),
    ]);
    await Promise.all([waitFor(bridge, workerA), waitFor(bridge, workerB)]);

    assert.notEqual(workerA.worktree.path, workerB.worktree.path);
    assert.equal(workerA.sourceSnapshot.head, workerB.sourceSnapshot.head);
    assert.equal(
      await fs.readFile(path.join(workerA.worktree.path, 'worker-a.txt'), 'utf8'),
      'worker-a\n',
    );
    assert.equal(
      await fs.readFile(path.join(workerB.worktree.path, 'worker-b.txt'), 'utf8'),
      'worker-b\n',
    );
    await assert.rejects(fs.access(path.join(workerA.worktree.path, 'worker-b.txt')));
    await assert.rejects(fs.access(path.join(workerB.worktree.path, 'worker-a.txt')));
    await assert.rejects(fs.access(path.join(repo, 'worker-a.txt')));
    await assert.rejects(fs.access(path.join(repo, 'worker-b.txt')));
  } finally {
    await bridge.close();
  }
});

test('coordinator integrates compatible real diffs into one candidate', async () => {
  const repo = await makeRepo({ 'alpha.txt': 'base alpha\n', 'beta.txt': 'base beta\n' });
  const stateRoot = path.join(repo, '.bridge-state');
  const bridge = makeBridge(repo, stateRoot);
  try {
    const project = await projectFor(bridge);
    const [alpha, beta] = await Promise.all([
      createWorker(bridge, project, 'integration-alpha'),
      createWorker(bridge, project, 'integration-beta'),
    ]);
    await Promise.all([waitFor(bridge, alpha), waitFor(bridge, beta)]);
    const [alphaRead, betaRead] = await Promise.all([
      bridge.readThread({ thread_id: alpha.threadId, host_id: alpha.hostId }),
      bridge.readThread({ thread_id: beta.threadId, host_id: beta.hostId }),
    ]);
    assert.match(alphaRead.local.diff, /alpha\.txt/);
    assert.match(betaRead.local.diff, /beta\.txt/);

    const candidate = await cloneRepo(repo, 'integrated-candidate');
    const alphaPatch = path.join(path.dirname(candidate), 'alpha.patch');
    const betaPatch = path.join(path.dirname(candidate), 'beta.patch');
    await fs.writeFile(alphaPatch, alphaRead.local.diff, 'utf8');
    await fs.writeFile(betaPatch, betaRead.local.diff, 'utf8');
    await run('git', ['apply', alphaPatch], candidate);
    await run('git', ['apply', betaPatch], candidate);
    assert.equal(
      await fs.readFile(path.join(candidate, 'alpha.txt'), 'utf8'),
      'alpha implementation\n',
    );
    assert.equal(
      await fs.readFile(path.join(candidate, 'beta.txt'), 'utf8'),
      'beta implementation\n',
    );
  } finally {
    await bridge.close();
  }
});

test('conflicting worker patch fails cleanly during integration', async () => {
  const repo = await makeRepo({ 'conflict.txt': 'base conflict\n' });
  const stateRoot = path.join(repo, '.bridge-state');
  const bridge = makeBridge(repo, stateRoot);
  try {
    const project = await projectFor(bridge);
    const [workerA, workerB] = await Promise.all([
      createWorker(bridge, project, 'conflict-a'),
      createWorker(bridge, project, 'conflict-b'),
    ]);
    await Promise.all([waitFor(bridge, workerA), waitFor(bridge, workerB)]);
    const [readA, readB] = await Promise.all([
      bridge.readThread({ thread_id: workerA.threadId, host_id: workerA.hostId }),
      bridge.readThread({ thread_id: workerB.threadId, host_id: workerB.hostId }),
    ]);
    const candidate = await cloneRepo(repo, 'conflict-candidate');
    const patchA = path.join(path.dirname(candidate), 'conflict-a.patch');
    const patchB = path.join(path.dirname(candidate), 'conflict-b.patch');
    await fs.writeFile(patchA, readA.local.diff, 'utf8');
    await fs.writeFile(patchB, readB.local.diff, 'utf8');
    await run('git', ['apply', patchA], candidate);
    await assert.rejects(
      () => run('git', ['apply', patchB], candidate),
      (error) => /patch failed|does not apply|error/i.test(`${error.message}\n${error.stderr}`),
    );
    assert.equal(await fs.readFile(path.join(candidate, 'conflict.txt'), 'utf8'), 'worker A\n');
  } finally {
    await bridge.close();
  }
});

test('failed worker and timeout return bounded failure states', async () => {
  const repo = await makeRepo();
  const stateRoot = path.join(repo, '.bridge-state');
  const bridge = makeBridge(repo, stateRoot);
  try {
    const project = await projectFor(bridge);
    const failed = await createWorker(bridge, project, 'fail-worker');
    const failedResult = await waitFor(bridge, failed);
    assert.equal(failedResult.status, 'failed');
    assert.equal(failedResult.timedOut, false);

    const hanging = await createWorker(bridge, project, 'hang-worker');
    const timeoutResult = await waitFor(bridge, hanging, 100);
    assert.equal(timeoutResult.timedOut, true);
    assert.equal(timeoutResult.status, 'running');
  } finally {
    await bridge.close();
  }
});

test('registry restart reconnects persisted thread IDs to worktrees', async () => {
  const repo = await makeRepo();
  const stateRoot = path.join(repo, '.bridge-state');
  const bridgeOne = makeBridge(repo, stateRoot, { persistentServer: true });
  let bridgeTwo;
  try {
    const project = await projectFor(bridgeOne);
    const created = await createWorker(bridgeOne, project, 'same-thread-initial');
    await waitFor(bridgeOne, created);
    const original = await bridgeOne.readThread({
      thread_id: created.threadId,
      host_id: created.hostId,
    });
    await bridgeOne.close();

    bridgeTwo = makeBridge(repo, stateRoot, { persistentServer: true });
    const listed = await bridgeTwo.listThreads({ project_id: project.id });
    assert.equal(
      listed.threads.some((thread) => (thread.id ?? thread.threadId) === created.threadId),
      true,
    );
    const reconnected = await bridgeTwo.readThread({
      thread_id: created.threadId,
      host_id: created.hostId,
    });
    assert.equal(reconnected.bridge.threadId, created.threadId);
    assert.equal(reconnected.bridge.worktreePath, original.bridge.worktreePath);
    assert.equal(
      await fs.readFile(path.join(reconnected.bridge.worktreePath, 'same-thread.txt'), 'utf8'),
      'initial\n',
    );

    const correction = await bridgeTwo.sendMessageToThread({
      thread_id: created.threadId,
      host_id: created.hostId,
      message: 'same-thread-correction',
    });
    assert.equal(correction.threadId, created.threadId);
    await waitFor(bridgeTwo, created);
  } finally {
    await bridgeTwo?.close();
    await bridgeOne.close();
  }
});

test(
  'Desktop task-card visibility is a manual host check',
  {
    skip: 'Requires observing the running Codex Desktop UI; bridge protocol cannot assert task-card visibility.',
  },
  () => {},
);
