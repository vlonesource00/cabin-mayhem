/* global process */

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { defaultStateRoot, resolveGitRoot } from './worktrees.mjs';

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return fallback;
    throw new Error(`Unable to read bridge state ${filePath}: ${error.message}`);
  }
}

function stableId(root) {
  return crypto.createHash('sha256').update(root.toLowerCase()).digest('hex').slice(0, 16);
}

function projectName(root) {
  return path.basename(root) || root;
}

function configuredRoots() {
  const configured = process.env.CODEX_APP_TASK_BRIDGE_PROJECTS ?? '';
  const separator = path.delimiter;
  const roots = configured
    .split(separator)
    .map((value) => value.trim())
    .filter(Boolean);
  if (process.env.CODEX_APP_TASK_BRIDGE_PROJECT_ROOT) {
    roots.push(process.env.CODEX_APP_TASK_BRIDGE_PROJECT_ROOT);
  }
  roots.push(process.cwd());
  return [...new Set(roots.map((root) => path.resolve(root)))];
}

async function writeJsonAtomic(filePath, value) {
  const temporary = `${filePath}.tmp-${process.pid}`;
  await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await fs.rename(temporary, filePath);
}

export class BridgeRegistry {
  #writeQueue = Promise.resolve();

  constructor({ stateRoot = defaultStateRoot(), projectRoots = undefined } = {}) {
    this.stateRoot = path.resolve(stateRoot);
    this.projectRoots = projectRoots;
    this.projects = new Map();
    this.threads = new Map();
    this.initialized = false;
  }

  async init() {
    if (this.initialized) return;
    await fs.mkdir(this.stateRoot, { recursive: true });
    const [projects, threads] = await Promise.all([
      readJson(path.join(this.stateRoot, 'projects.json'), []),
      readJson(path.join(this.stateRoot, 'threads.json'), []),
    ]);
    for (const project of Array.isArray(projects) ? projects : []) {
      if (project?.id && project?.root) this.projects.set(project.id, project);
    }
    for (const thread of Array.isArray(threads) ? threads : []) {
      if (thread?.threadId) this.threads.set(thread.threadId, thread);
    }
    this.initialized = true;
  }

  #queueWrite(fileName, value) {
    this.#writeQueue = this.#writeQueue.then(async () => {
      await writeJsonAtomic(path.join(this.stateRoot, fileName), value);
    });
    return this.#writeQueue;
  }

  async addProject(candidate, { source = 'configured' } = {}) {
    await this.init();
    const root = await resolveGitRoot(candidate);
    const id = stableId(root);
    const existing = this.projects.get(id);
    const project = {
      id,
      name: existing?.name ?? projectName(root),
      root,
      worktreeRoot: existing?.worktreeRoot ?? path.join(this.stateRoot, 'worktrees', id),
      source: existing?.source ?? source,
      registeredAt: existing?.registeredAt ?? new Date().toISOString(),
    };
    this.projects.set(id, project);
    await this.#queueWrite('projects.json', [...this.projects.values()]);
    return project;
  }

  async listProjects() {
    await this.init();
    const roots = this.projectRoots ?? configuredRoots();
    const skipped = [];
    for (const root of roots) {
      try {
        await this.addProject(root);
      } catch (error) {
        skipped.push({ root, reason: error.message });
      }
    }
    return { projects: [...this.projects.values()], skipped };
  }

  async getProject(projectId) {
    const listed = await this.listProjects();
    const project = this.projects.get(projectId);
    if (!project) {
      throw new Error(
        `Unknown project_id '${projectId}'. Known projects: ${listed.projects.map((item) => item.id).join(', ') || 'none'}`,
      );
    }
    return project;
  }

  getThread(threadId) {
    return this.threads.get(threadId);
  }

  listThreadsForProject(projectId) {
    return [...this.threads.values()].filter((thread) => thread.projectId === projectId);
  }

  async saveThread(record) {
    await this.init();
    this.threads.set(record.threadId, { ...this.threads.get(record.threadId), ...record });
    await this.#queueWrite('threads.json', [...this.threads.values()]);
    return this.threads.get(record.threadId);
  }

  async updateThread(threadId, changes) {
    const current = this.threads.get(threadId);
    if (!current) return undefined;
    return this.saveThread({ ...current, ...changes });
  }

  snapshot() {
    return {
      projects: [...this.projects.values()],
      threads: [...this.threads.values()],
    };
  }
}

export { configuredRoots, stableId };
