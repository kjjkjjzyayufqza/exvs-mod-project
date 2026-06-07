# EXVS MSC Syscall 4B Investigation Notes

## Native Mapping

- Domain: `VDK::GAM::CDepictionScript`
- Handler table slot: `79`
- Syscall id: `79 - 4 = 0x4B`
- Native handler: `sub_14067F620`
- Install site: `sub_140664F70` at `0x14066501F`

The handler reads the shell system object from `a2[15]` and dispatches on the
first script argument. It is a `CShellAbstract` entry and visual-state control
bus, not a globally stable generic syscall.

## Confirmed Initial Subcommands

### `sys_4B(0, entry_id, optional_resource)`

Activates or selects a shell entry:

- disables the previous active entry;
- resolves or creates the requested entry;
- marks it active;
- stores it as the current entry;
- optionally resolves and applies an additional resource.

Current semantic label: `activate_shell_entry`.

### `sys_4B(1)`

Returns the active shell entry id directly from the shell system field at
offset `+64`.

This value is frequently passed into `sys_47`, which explains patterns such as:

```text
sys_47(..., sys_4B(1), ...)
```

Current semantic label: `get_active_shell_entry_id`.

### `sys_4B(2, entry_id, ..., resource_id, optional_parent)`

Configures or creates a shell entry, resolves a native resource, updates its
runtime state, and optionally associates it with the current or explicit parent
entry.

Current conservative semantic label: `configure_shell_entry`.

### `sys_4B(3, optional_entry_id)`

Clears either a specific shell entry or the shell entry collection, depending on
whether an id is supplied.

Current semantic label: `clear_shell_entry_or_all`.

### `sys_4B(4, entry_id)`

Calls `sub_1405E8990` and returns whether the shell entry exists.

Current semantic label: `shell_entry_exists`.

## Design Implication

From the original engine design perspective, `sys_4B(1)` is an object-context
operation. Human-readable MSC should render it as the active shell entry id,
not as an opaque numeric syscall. This context is also required to interpret
many `sys_47` object and spatial operations correctly.

## Remaining Cases

The handler also owns visual effect, material, camera-adjacent, and per-entry
state branches through at least subcommand `0x17`. These require separate helper
analysis before stable naming.
