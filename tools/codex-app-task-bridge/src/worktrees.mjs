/* global Buffer, process */

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export class GitCommandError extends Error {
  constructor(message, { command, stdout = '', stderr = '' } = {}) {
    super(message);
    this.name = 'GitCommandError';
    this.command = command;
    this.stdout = stdout;
    this.stderr = stderr;
  }
}

function gitExecutable() {
  return process.env.CODEX_APP_TASK_BRIDGE_GIT_BIN ?? 'git';
}

async function runGit(args, cwd) {
  const command = `${gitExecutable()} ${args.join(' ')}`;
  try {
    const result = await execFileAsync(gitExecutable(), args, {
      cwd,
      windowsHide: true,
      maxBuffer: 16 * 1024 * 1024,
    });
    return { ...result, command };
  } catch (error) {
    throw new GitCommandError(`Git command failed: ${command}`, {
      command,
      stdout: error.stdout ?? '',
      stderr: error.stderr ?? error.message,
    });
  }
}

export async function resolveGitRoot(candidate) {
  const absolute = path.resolve(candidate);
  const result = await runGit(['-C', absolute, 'rev-parse', '--show-toplevel'], absolute);
  return path.normalize(result.stdout.trim());
}

export async function readGitSnapshot(root) {
  const [head, status] = await Promise.all([
    runGit(['rev-parse', '--verify', 'HEAD'], root),
    runGit(['status', '--porcelain=v1'], root),
  ]);
  const statusText = status.stdout;
  return {
    head: head.stdout.trim(),
    dirty: statusText.length > 0,
    status: statusText,
    capturedAt: new Date().toISOString(),
  };
}

function ensureInside(root, candidate) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  if (
    relative === '' ||
    (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
  ) {
    return path.resolve(candidate);
  }
  throw new Error(`Refusing path outside the allowed root: ${candidate}`);
}

export function worktreeName() {
  const timestamp = new Date()
    .toISOString()
    .replace(/[-:.TZ]/g, '')
    .slice(0, 14);
  const suffix = crypto.randomBytes(5).toString('hex');
  return `${timestamp}-${suffix}`;
}

export async function createIsolatedWorktree({ projectRoot, worktreeRoot, baseSha }) {
  const safeRoot = path.resolve(worktreeRoot);
  await fs.mkdir(safeRoot, { recursive: true });
  const worktreePath = ensureInside(safeRoot, path.join(safeRoot, worktreeName()));
  await runGit(['worktree', 'add', '--detach', worktreePath, baseSha], projectRoot);
  return {
    path: worktreePath,
    baseSha,
    createdAt: new Date().toISOString(),
  };
}

export async function readGitDiff(root, { maxBytes = 512 * 1024 } = {}) {
  const [diff, status, untracked] = await Promise.all([
    runGit(['diff', '--no-ext-diff', '--binary'], root),
    runGit(['status', '--porcelain=v1'], root),
    runGit(['ls-files', '--others', '--exclude-standard', '-z'], root),
  ]);
  const diffText = diff.stdout;
  const bytes = Buffer.byteLength(diffText, 'utf8');
  return {
    diff: bytes > maxBytes ? `${diffText.slice(0, maxBytes)}\n[diff truncated]` : diffText,
    truncated: bytes > maxBytes,
    byteLength: bytes,
    status: status.stdout,
    untracked: untracked.stdout.split('\0').filter(Boolean),
  };
}

export function defaultStateRoot() {
  if (process.env.CODEX_APP_TASK_BRIDGE_STATE) {
    return path.resolve(process.env.CODEX_APP_TASK_BRIDGE_STATE);
  }
  const localAppData = process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData', 'Local');
  return path.join(localAppData, 'Codex', 'app-task-bridge');
}

export function isPathInside(root, candidate) {
  try {
    ensureInside(root, candidate);
    return true;
  } catch {
    return false;
  }
}
