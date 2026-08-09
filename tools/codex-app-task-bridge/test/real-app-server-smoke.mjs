/* global console, process */

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { BridgeRegistry } from '../src/registry.mjs';
import { CodexAppTaskBridge } from '../src/bridge.mjs';

const execFileAsync = promisify(execFile);

async function run(command, args, cwd) {
  return execFileAsync(command, args, { cwd, windowsHide: true, maxBuffer: 4 * 1024 * 1024 });
}

async function main() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-app-task-bridge-real-'));
  const stateRoot = path.join(root, 'bridge-state');
  let bridge;
  let created;
  try {
    await run('git', ['init', '--initial-branch', 'main'], root);
    await run('git', ['config', 'user.email', 'bridge-smoke@example.invalid'], root);
    await run('git', ['config', 'user.name', 'Bridge Smoke'], root);
    await fs.writeFile(
      path.join(root, 'README.md'),
      'disposable bridge smoke repository\n',
      'utf8',
    );
    await run('git', ['add', 'README.md'], root);
    await run('git', ['commit', '-m', 'bridge smoke fixture'], root);

    const configPath = path.join(
      process.env.CODEX_HOME ?? path.join(os.homedir(), '.codex'),
      'config.toml',
    );
    let configBefore;
    try {
      configBefore = await fs.readFile(configPath, 'utf8');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }

    const registry = new BridgeRegistry({ stateRoot, projectRoots: [root] });
    bridge = new CodexAppTaskBridge({ registry });
    const project = (await bridge.listProjects()).projects[0];
    assert.ok(project?.id, 'real smoke project was not registered');
    created = await bridge.createThread({
      project_id: project.id,
      model: process.env.CODEX_APP_TASK_BRIDGE_SMOKE_MODEL ?? 'gpt-5.6-luna',
      effort: 'max',
      work_order:
        'Reply with exactly BRIDGE_SMOKE_OK. Do not edit files, run commands, or ask for approval.',
      approval_policy: 'never',
      approval_mode: 'surface',
    });
    const waited = await bridge.waitThreads({
      thread_ids: [created.threadId],
      host_id: created.hostId,
      timeout_ms: 180_000,
    });
    const read = await bridge.readThread({
      thread_id: created.threadId,
      host_id: created.hostId,
      include_diff: true,
      include_usage: true,
    });
    assert.equal(waited.results[0].timedOut, false, JSON.stringify(waited));
    assert.equal(read.local.status, '', `smoke changed the worktree: ${read.local.status}`);
    if (configBefore !== undefined) {
      const configAfter = await fs.readFile(configPath, 'utf8');
      assert.equal(
        configAfter,
        configBefore,
        'App Server changed global config.toml during the read-only thread/start probe',
      );
    }
    console.log(
      JSON.stringify(
        {
          pass: true,
          threadId: created.threadId,
          hostId: created.hostId,
          hostIdentity: created.routing.hostIdentity,
          turnId: created.turnId,
          status: waited.results[0].status,
          model: created.routing.model,
          threadStartSandbox: created.routing.threadStartSandbox,
          turnSandboxType: created.routing.turnSandboxPolicy.type,
          usageEvents: read.events.tokenUsage.length,
          diffBytes: read.local.byteLength,
          configUnchanged: configBefore === undefined ? 'not_present' : true,
        },
        null,
        2,
      ),
    );
  } finally {
    if (bridge) await bridge.close();
    if (created?.worktree?.path) {
      try {
        await run('git', ['worktree', 'remove', '--force', created.worktree.path], root);
      } catch {
        // The disposable root is removed below even if Git has already detached it.
      }
    }
    await fs.rm(root, { recursive: true, force: true });
  }
}

await main();
