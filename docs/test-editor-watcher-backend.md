# Test Editor folder watcher (backend follow-up)

## Current behavior (`src-tauri/src/commands.rs`)

- Each filesystem event is converted to **incremental** `FolderChangePayload` ops and emitted immediately on `test-editor:folder-change`.
- After a **400ms debounce** with no new events, `watch_loop` runs `build_tree` on the entire workspace root and emits a payload with **`full_tree`**, replacing the client tree in one shot.
- Watcher ignore: any path whose component is `.git` (the git metadata directory) is dropped, so index/object/lock churn never dirties **Repack Changes**. `.gitignore` and other sibling files are still watched. `__convert` remains ignored by substring.

## Cost at very large workspaces

- Incremental updates are cheap per event.
- `build_tree` recursively walks the full directory tree. On million-file roots this becomes CPU-heavy and produces large JSON payloads for IPC serialization.
- The frontend **buffers** watcher payloads when the Test Editor route is inactive in the background; the backend still performs full-tree work when the debounce fires.

## Recommended directions

1. **Make debounced full-tree optional or conditional**  
   Gate the post-debounce `full_tree` emit behind a size threshold or a configuration flag, or remove it when incremental coverage is verified to stay consistent.

2. **Lazy / partial tree**  
   Serve only top-level entries (or a bounded depth) from the backend and load children on demand.

3. **Backpressure**  
   Coalesce rapid events and cap how often `full_tree` can run.

4. **Explicit resync**  
   Rely on incrementals during normal operation; use the existing toolbar refresh path when the user needs a guaranteed full tree.

The UI should treat `full_tree` as a **resync** signal, not something that must run on every debounce window.
