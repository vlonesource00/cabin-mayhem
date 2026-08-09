/* global clearTimeout, setTimeout */

import crypto from 'node:crypto';
import { BridgeRegistry } from './registry.mjs';
import { AppServerClient } from './app-server.mjs';
import { readGitDiff, readGitSnapshot, createIsolatedWorktree } from './worktrees.mjs';

const ACTIVE_STATUSES = new Set(['inProgress', 'running', 'started', 'queued', 'pending']);
const TERMINAL_STATUSES = new Set([
  'completed',
  'failed',
  'interrupted',
  'cancelled',
  'canceled',
  'error',
]);

function requireString(value, name) {
  if (typeof value !== 'string' || value.trim() === '')
    throw new Error(`${name} must be a non-empty string`);
  return value;
}

function idFrom(value) {
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (value && (typeof value.id === 'string' || typeof value.id === 'number'))
    return String(value.id);
  return undefined;
}

function threadIdFrom(result) {
  return idFrom(result?.thread) ?? idFrom(result?.threadId) ?? idFrom(result?.id);
}

function turnIdFrom(result) {
  return idFrom(result?.turn) ?? idFrom(result?.turnId) ?? idFrom(result?.id);
}

function threadListFrom(result) {
  if (Array.isArray(result)) return result;
  if (Array.isArray(result?.threads)) return result.threads;
  if (Array.isArray(result?.data)) return result.data;
  return [];
}

function hostIdentityFrom(value) {
  const installationId = value?.installationId;
  if (typeof installationId !== 'string' || installationId.trim() === '') return undefined;
  return {
    hostId: installationId,
    source: 'remoteControl/status/changed.installationId',
    installationId,
    serverName: typeof value.serverName === 'string' ? value.serverName : null,
    environmentId: typeof value.environmentId === 'string' ? value.environmentId : null,
    status: typeof value.status === 'string' ? value.status : null,
  };
}

function threadIdFromNotification(params) {
  return idFrom(params?.threadId) ?? idFrom(params?.thread) ?? idFrom(params?.turn?.threadId);
}

function turnIdFromNotification(params) {
  return idFrom(params?.turnId) ?? idFrom(params?.turn) ?? idFrom(params?.turn?.id);
}

function statusFromNotification(params) {
  return params?.status ?? params?.turn?.status ?? params?.thread?.status ?? 'unknown';
}

function inputText(message) {
  return [{ type: 'text', text: message }];
}

function now() {
  return new Date().toISOString();
}

function approvalResponseFor(method, decision) {
  if (
    method === 'item/commandExecution/requestApproval' ||
    method === 'item/fileChange/requestApproval'
  ) {
    const allowed = new Set(['accept', 'acceptForSession', 'decline', 'cancel']);
    if (typeof decision === 'string' && allowed.has(decision)) return { decision };
    if (decision && typeof decision === 'object') return { decision };
    throw new Error(
      `Invalid decision for ${method}; expected accept, acceptForSession, decline, or cancel`,
    );
  }
  if (
    decision &&
    typeof decision === 'object' &&
    !Object.prototype.hasOwnProperty.call(decision, 'decision')
  ) {
    return decision;
  }
  return { decision };
}

export const bridgeToolNames = [
  'list_projects',
  'list_threads',
  'create_thread',
  'wait_threads',
  'read_thread',
  'send_message_to_thread',
  'list_pending_approvals',
  'resolve_approval',
];

export class CodexAppTaskBridge {
  constructor({
    registry = undefined,
    appServer = undefined,
    stateRoot = undefined,
    projectRoots = undefined,
    appServerOptions = undefined,
  } = {}) {
    this.registry = registry ?? new BridgeRegistry({ stateRoot, projectRoots });
    this.appServer = appServer ?? new AppServerClient(appServerOptions);
    this.runtime = new Map();
    this.pendingApprovals = new Map();
    this.approvalCounter = 0;
    this.started = false;
    this.hostIdentity = hostIdentityFrom(this.appServer.hostIdentity);

    this.appServer.on('notification', (message) => {
      void this.#handleNotification(message);
    });
    this.appServer.on('hostIdentity', (identity) => {
      this.hostIdentity = hostIdentityFrom(identity) ?? this.hostIdentity;
    });
    this.appServer.on('request', (message) => {
      void this.#handleServerRequest(message);
    });
  }

  async ensureStarted() {
    await this.registry.init();
    if (!this.started) {
      await this.appServer.start();
      this.started = true;
    }
  }

  async close() {
    await this.appServer.close();
    this.started = false;
    this.hostIdentity = undefined;
  }

  async listProjects() {
    const result = await this.registry.listProjects();
    return {
      projects: result.projects,
      skipped: result.skipped,
    };
  }

  async listThreads({ project_id: projectId, cursor = null, limit = 100 } = {}) {
    requireString(projectId, 'project_id');
    await this.ensureStarted();
    const hostIdentity = await this.#requireHostIdentity();
    const project = await this.registry.getProject(projectId);
    const serverResult = await this.appServer.request('thread/list', {
      cursor,
      limit: Math.min(Math.max(Number(limit) || 100, 1), 1000),
      useStateDbOnly: true,
    });
    const localRecords = this.registry.listThreadsForProject(project.id);
    const migrations = [];
    const allowedCwds = new Set([
      project.root,
      ...localRecords.map((record) => record.worktreePath),
    ]);
    const serverThreads = threadListFrom(serverResult).filter((thread) => {
      const cwd = thread?.cwd ?? thread?.path ?? thread?.workspace;
      return (
        !cwd ||
        allowedCwds.has(cwd) ||
        localRecords.some((record) => record.threadId === threadIdFrom(thread))
      );
    });
    const localById = new Map(localRecords.map((record) => [record.threadId, record]));
    const merged = new Map(
      serverThreads.map((thread) => {
        const threadId = threadIdFrom(thread) ?? crypto.randomUUID();
        const local = localById.get(threadId);
        const enriched = {
          ...thread,
          hostId: thread.hostId ?? local?.hostId ?? hostIdentity.hostId,
          hostIdentity: thread.hostIdentity ?? local?.hostIdentity ?? hostIdentity,
        };
        if (local && !local.hostId) {
          migrations.push(
            this.registry.updateThread(threadId, {
              hostId: hostIdentity.hostId,
              hostIdentity,
              updatedAt: now(),
            }),
          );
        }
        return [threadId, enriched];
      }),
    );
    for (const record of localRecords) {
      if (!merged.has(record.threadId)) merged.set(record.threadId, record);
    }
    await Promise.all(migrations);
    return {
      project,
      threads: [...merged.values()],
      hostId: hostIdentity.hostId,
      hostIdentity,
      nextCursor: serverResult?.nextCursor ?? serverResult?.next_cursor ?? null,
    };
  }

  async createThread({
    project_id: projectId,
    model = 'gpt-5.6-luna',
    effort = 'max',
    work_order: workOrder,
    worktree_mode: worktreeMode = 'isolated',
    approval_policy: approvalPolicy = 'on-request',
    approval_mode: approvalMode = 'surface',
  } = {}) {
    requireString(projectId, 'project_id');
    requireString(workOrder, 'work_order');
    requireString(model, 'model');
    requireString(effort, 'effort');
    if (worktreeMode !== 'isolated') {
      throw new Error(
        "Only worktree_mode='isolated' is implemented; shared worktrees are intentionally fail-closed",
      );
    }
    if (!['surface', 'reject'].includes(approvalMode)) {
      throw new Error("approval_mode must be 'surface' or 'reject'");
    }

    await this.ensureStarted();
    const hostIdentity = await this.#requireHostIdentity();
    const project = await this.registry.getProject(projectId);
    const sourceSnapshot = await readGitSnapshot(project.root);
    const worktree = await createIsolatedWorktree({
      projectRoot: project.root,
      worktreeRoot: project.worktreeRoot,
      baseSha: sourceSnapshot.head,
    });

    const threadStart = await this.appServer.request('thread/start', {
      cwd: worktree.path,
      model,
      approvalPolicy,
      sandbox: 'read-only',
      ephemeral: false,
    });
    const threadId = threadIdFrom(threadStart);
    if (!threadId) {
      throw new Error(
        `App Server thread/start returned no thread id: ${JSON.stringify(threadStart)}`,
      );
    }

    const baseRecord = {
      threadId,
      hostId: hostIdentity.hostId,
      hostIdentity,
      projectId: project.id,
      projectRoot: project.root,
      worktreePath: worktree.path,
      worktreeMode,
      model,
      effort,
      approvalPolicy,
      approvalMode,
      sourceSnapshot,
      threadStartSandbox: 'read-only',
      turnSandboxPolicy: {
        type: 'workspaceWrite',
        writableRoots: [worktree.path],
        networkAccess: false,
      },
      status: 'starting',
      createdAt: now(),
      updatedAt: now(),
    };
    await this.registry.saveThread(baseRecord);
    this.#runtimeFor(threadId).approvalMode = approvalMode;

    try {
      const turnStart = await this.appServer.request('turn/start', {
        threadId,
        input: inputText(workOrder),
        model,
        effort,
        cwd: worktree.path,
        approvalPolicy,
        sandboxPolicy: baseRecord.turnSandboxPolicy,
      });
      const turnId = turnIdFrom(turnStart);
      await this.registry.updateThread(threadId, {
        activeTurnId: turnId ?? null,
        status: 'running',
        turnStart,
        updatedAt: now(),
      });
      return {
        threadId,
        turnId: turnId ?? null,
        hostId: hostIdentity.hostId,
        hostIdentity,
        project,
        worktree,
        sourceSnapshot,
        routing: {
          model,
          effort,
          hostId: hostIdentity.hostId,
          hostIdentity,
          threadStartSandbox: 'read-only',
          turnSandboxPolicy: baseRecord.turnSandboxPolicy,
        },
        approvalMode,
      };
    } catch (error) {
      await this.registry.updateThread(threadId, {
        status: 'failed',
        error: error.message,
        updatedAt: now(),
      });
      throw new Error(
        `turn/start failed for ${threadId}; worktree preserved at ${worktree.path}: ${error.message}`,
      );
    }
  }

  async waitThreads({
    thread_ids: threadIds,
    host_id: hostId,
    timeout_ms: timeoutMs = 120_000,
  } = {}) {
    if (!Array.isArray(threadIds) || threadIds.length === 0)
      throw new Error('thread_ids must be a non-empty array');
    requireString(hostId, 'host_id');
    await this.ensureStarted();
    const hostIdentity = await this.#requireHostIdentity();
    for (const threadId of threadIds)
      this.#assertThreadHost(requireString(threadId, 'thread_id'), hostId);
    const timeout = Math.min(Math.max(Number(timeoutMs) || 120_000, 100), 600_000);
    const results = await Promise.all(
      threadIds.map((threadId) =>
        this.#waitForThread(requireString(threadId, 'thread_id'), timeout),
      ),
    );
    return { results, timeoutMs: timeout, hostId: hostIdentity.hostId, hostIdentity };
  }

  async #waitForThread(threadId, timeoutMs) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      const record = this.registry.getThread(threadId);
      if (!record) throw new Error(`Unknown thread_id '${threadId}'`);
      const runtime = this.#runtimeFor(threadId);
      if (record.status && TERMINAL_STATUSES.has(record.status)) {
        return { threadId, status: record.status, timedOut: false, thread: record };
      }
      if (runtime.lastCompleted) {
        return {
          threadId,
          status: runtime.lastCompleted.status ?? 'completed',
          timedOut: false,
          thread: this.registry.getThread(threadId),
        };
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return {
      threadId,
      status: this.registry.getThread(threadId)?.status ?? 'timeout',
      timedOut: true,
      thread: this.registry.getThread(threadId),
    };
  }

  async readThread({
    thread_id: threadId,
    host_id: hostId,
    include_turns: includeTurns = true,
    include_diff: includeDiff = true,
    include_usage: includeUsage = true,
  } = {}) {
    requireString(threadId, 'thread_id');
    requireString(hostId, 'host_id');
    await this.ensureStarted();
    const hostIdentity = await this.#requireHostIdentity();
    const record = this.#assertThreadHost(threadId, hostId);
    const appServerThread = await this.appServer.request('thread/read', {
      threadId,
      includeTurns: Boolean(includeTurns),
    });
    let local = undefined;
    if (includeDiff && record?.worktreePath) {
      local = await readGitDiff(record.worktreePath);
    }
    const runtime = this.#runtimeFor(threadId);
    return {
      thread: appServerThread,
      bridge: record,
      events: {
        diffs: includeDiff ? runtime.diffs : undefined,
        tokenUsage: includeUsage ? runtime.tokenUsage : undefined,
        status: runtime.status,
      },
      local,
      hostId: hostIdentity.hostId,
      hostIdentity,
    };
  }

  async sendMessageToThread({
    thread_id: threadId,
    host_id: hostId,
    message,
    model = undefined,
    effort = undefined,
  } = {}) {
    requireString(threadId, 'thread_id');
    requireString(hostId, 'host_id');
    requireString(message, 'message');
    await this.ensureStarted();
    const hostIdentity = await this.#requireHostIdentity();
    const record = this.#assertThreadHost(threadId, hostId);
    const runtime = this.#runtimeFor(threadId);
    const active =
      record.activeTurnId && (ACTIVE_STATUSES.has(record.status) || !runtime.lastCompleted);
    let response;
    let mode;
    if (active) {
      mode = 'steer';
      response = await this.appServer.request('turn/steer', {
        threadId,
        expectedTurnId: record.activeTurnId,
        input: inputText(message),
      });
    } else {
      mode = 'start';
      response = await this.appServer.request('turn/start', {
        threadId,
        input: inputText(message),
        model: model ?? record.model,
        effort: effort ?? record.effort,
        cwd: record.worktreePath,
        approvalPolicy: record.approvalPolicy,
        sandboxPolicy: record.turnSandboxPolicy,
      });
    }
    const turnId = turnIdFrom(response);
    runtime.lastCompleted = undefined;
    await this.registry.updateThread(threadId, {
      activeTurnId: turnId ?? record.activeTurnId ?? null,
      status: 'running',
      lastMessage: message,
      updatedAt: now(),
      lastTurn: response,
    });
    return {
      threadId,
      hostId: hostIdentity.hostId,
      hostIdentity,
      mode,
      turnId: turnId ?? null,
      response,
    };
  }

  listPendingApprovals() {
    return {
      approvals: [...this.pendingApprovals.values()].map((approval) => ({ ...approval })),
    };
  }

  async resolveApproval({
    approval_id: approvalId,
    decision = undefined,
    response = undefined,
  } = {}) {
    requireString(approvalId, 'approval_id');
    const pending = this.pendingApprovals.get(approvalId);
    if (!pending) throw new Error(`Unknown or already resolved approval_id '${approvalId}'`);
    if (response === undefined && decision === undefined)
      throw new Error('Provide decision or response');
    const result = response ?? approvalResponseFor(pending.method, decision);
    this.appServer.respond(pending.requestId, result);
    this.pendingApprovals.delete(approvalId);
    return { approvalId, resolved: true, method: pending.method, result };
  }

  #runtimeFor(threadId) {
    let runtime = this.runtime.get(threadId);
    if (!runtime) {
      runtime = {
        diffs: [],
        tokenUsage: [],
        status: undefined,
        lastCompleted: undefined,
        approvalMode: 'surface',
      };
      this.runtime.set(threadId, runtime);
    }
    return runtime;
  }

  async #requireHostIdentity(timeoutMs = 5_000) {
    if (this.hostIdentity?.hostId) return this.hostIdentity;
    const existing = this.appServer.hostIdentity;
    if (existing) {
      this.hostIdentity = hostIdentityFrom(existing) ?? this.hostIdentity;
      if (this.hostIdentity?.hostId) return this.hostIdentity;
    }
    await new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        this.appServer.off('hostIdentity', onIdentity);
        reject(
          new Error(
            'App Server did not expose host identity via remoteControl/status/changed.installationId',
          ),
        );
      }, timeoutMs);
      const onIdentity = (identity) => {
        const normalized = hostIdentityFrom(identity);
        if (!normalized || settled) return;
        settled = true;
        clearTimeout(timer);
        this.hostIdentity = normalized;
        this.appServer.off('hostIdentity', onIdentity);
        resolve();
      };
      this.appServer.on('hostIdentity', onIdentity);
    });
    return this.hostIdentity;
  }

  #assertThreadHost(threadId, hostId) {
    const record = this.registry.getThread(threadId);
    if (!record) throw new Error(`Unknown thread_id '${threadId}'`);
    if (!record.hostId) {
      throw new Error(
        `Thread '${threadId}' has no recorded host_id; create a new bridge thread before using it`,
      );
    }
    if (record.hostId !== hostId) {
      throw new Error(`host_id '${hostId}' does not match thread '${threadId}' host_id`);
    }
    return record;
  }

  async #handleNotification(message) {
    const params = message.params ?? {};
    const threadId = threadIdFromNotification(params);
    if (!threadId) return;
    const runtime = this.#runtimeFor(threadId);
    if (message.method === 'turn/diff/updated') {
      runtime.diffs.push({ receivedAt: now(), params });
      return;
    }
    if (message.method === 'thread/tokenUsage/updated') {
      runtime.tokenUsage.push({ receivedAt: now(), params });
      return;
    }
    if (message.method === 'thread/status/changed') {
      runtime.status = statusFromNotification(params);
      await this.registry.updateThread(threadId, { status: runtime.status, updatedAt: now() });
      return;
    }
    if (message.method === 'turn/started') {
      const turnId = turnIdFromNotification(params);
      await this.registry.updateThread(threadId, {
        activeTurnId: turnId ?? null,
        status: 'running',
        updatedAt: now(),
      });
      return;
    }
    if (message.method === 'turn/completed') {
      const status = statusFromNotification(params);
      runtime.lastCompleted = { status, params };
      await this.registry.updateThread(threadId, {
        activeTurnId: null,
        status: TERMINAL_STATUSES.has(status) ? status : 'completed',
        completedTurn: params,
        updatedAt: now(),
      });
    }
  }

  async #handleServerRequest(message) {
    const params = message.params ?? {};
    const threadId = threadIdFromNotification(params);
    const record = threadId ? this.registry.getThread(threadId) : undefined;
    const approvalMode =
      record?.approvalMode ?? this.#runtimeFor(threadId ?? 'unknown').approvalMode;
    if (
      approvalMode === 'reject' &&
      (message.method === 'item/commandExecution/requestApproval' ||
        message.method === 'item/fileChange/requestApproval')
    ) {
      this.appServer.respond(message.id, { decision: 'decline' });
      return;
    }
    const approvalId = `approval_${++this.approvalCounter}_${crypto.randomBytes(4).toString('hex')}`;
    this.pendingApprovals.set(approvalId, {
      approvalId,
      requestId: message.id,
      method: message.method,
      threadId: threadId ?? null,
      receivedAt: now(),
      params,
      note: 'No decision was made automatically. Resolve this request explicitly.',
    });
  }
}
