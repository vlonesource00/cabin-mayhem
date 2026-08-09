# Codex App Task Bridge

This is a local, dependency-free MCP server that turns six high-level tools into
durable Codex App Server threads running in bridge-managed Git worktrees.

The bridge is deliberately standalone. It does not modify the repository's game
runtime and it does not silently edit global Codex configuration.

## Run

From this repository:

```powershell
node tools/codex-app-task-bridge/src/server.mjs
```

For a global Codex MCP configuration, register the command using an absolute path
to this checkout. A representative entry is:

```toml
[mcp_servers.codex_app_task_bridge]
command = "node"
args = ["C:/path/to/Dear Passengers clone/tools/codex-app-task-bridge/src/server.mjs"]
```

The bridge uses the process working directory as a default project when it is a
Git repository. Additional approved repositories can be supplied with
`CODEX_APP_TASK_BRIDGE_PROJECTS`, separated by the platform path delimiter.

State is stored outside the repository by default:

```text
%LOCALAPPDATA%/Codex/app-task-bridge/
```

Set `CODEX_APP_TASK_BRIDGE_STATE` to choose an explicit state directory. Set
`CODEX_APP_TASK_BRIDGE_BIN` if the `codex` executable is not discoverable as
`codex.cmd` on Windows or `codex` elsewhere.

## Tools

The six workflow tools are:

- `list_projects`
- `list_threads`
- `create_thread`
- `wait_threads`
- `read_thread`
- `send_message_to_thread`

The bridge also exposes `list_pending_approvals` and `resolve_approval`. They are
the approval-control plane required because App Server can send server-initiated
approval requests while a turn is running.

`create_thread` defaults to an isolated worktree, starts the durable thread with
`sandbox: "read-only"`, and applies `sandboxPolicy.type = "workspaceWrite"`
only on the implementation turn. This is the compatibility probe described in
the bridge specification: it avoids requesting writable trust at `thread/start`.

Each live App Server connection reports a stable installation identity through
`remoteControl/status/changed.installationId`. The bridge exposes that observed
value as `hostId` and records its provenance as
`remoteControl/status/changed.installationId`. `create_thread` and
`list_threads` return it; `wait_threads`, `read_thread`, and
`send_message_to_thread` require the same `host_id` and reject missing or
mismatched identities. Persisted bridge records without an identity are
backfilled only when the current App Server lists the same thread; stale records
that are not returned remain blocked until recreated.

Approval requests are surfaced, never auto-approved. Callers must explicitly use
`resolve_approval`; `approval_mode = "reject"` is available for a deliberate
fail-closed run.

## Current boundary

The bridge proves durable App Server threads, model/effort/host routing,
worktree ownership, diff/status collection, token/event capture, steering, and
approval transport. It cannot claim that a bridge-created thread becomes a
normal Codex Desktop task card until that is verified in the running Desktop
client.

The worktree manager intentionally has no delete/cleanup tool yet. Worktrees are
recoverable and remain available for audit until an explicit cleanup policy is
implemented.
