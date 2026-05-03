# Tauri MCP Debug Setup Process

## 2026-05-03

### Request
- User asked for an existing GitHub MCP tool for Tauri v2 that allows AI to read/manipulate Tauri UI for debugging, then set it up and start debugging.

### Discovery
- GitHub search via `gh` found multiple repositories.
- Most maintained and widely used candidate:
  - `https://github.com/hypothesi/mcp-server-tauri`
  - Tauri v2 explicit support, active updates, highest stars among Tauri MCP-specific servers in search results.

### Configuration applied
- Installed MCP server into Cursor config:
  - Command: `npx -y install-mcp @hypothesi/tauri-mcp-server --client cursor --yes --oauth no`
  - Updated file: `C:\Users\kjjkjj\.cursor\mcp.json`
  - Added server entry `@hypothesi/tauri-mcp-server`.

### Project integration applied
- Added Rust dependency:
  - `src-tauri/Cargo.toml`
  - `tauri-plugin-mcp-bridge = "0.2"`
- Registered plugin in debug builds:
  - `src-tauri/src/lib.rs`
  - `builder = builder.plugin(tauri_plugin_mcp_bridge::init());` under `#[cfg(debug_assertions)]`
- Added permission:
  - `src-tauri/capabilities/default.json`
  - `"mcp-bridge:default"`

### Validation
- `cargo check` in `src-tauri` succeeded.
- Existing dev session rebuilt app and printed:
  - `MCP Bridge plugin initialized ... on 0.0.0.0:9223`
  - `MCP Bridge WebSocket server listening on: 0.0.0.0:9223`
- Port check succeeded:
  - `Test-NetConnection 127.0.0.1 -Port 9223` => `TcpTestSucceeded: True`

### Remaining blocker
- Current Cursor MCP runtime has not yet loaded descriptors/tools for the newly added server in this chat session.
- Need Cursor MCP reload/restart before invoking those tools directly from the agent.
