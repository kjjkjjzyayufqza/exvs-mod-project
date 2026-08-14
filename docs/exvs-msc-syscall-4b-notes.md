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

### `sys_4B(2, model_id, bone_hash, action_hash[, parent_model_id])`

Configures or creates a shell entry, resolves a native model resource, updates
its runtime state, and optionally associates it with an explicit parent entry.

Current semantic label: `configure_shell_entry` / **attach model to bone**.

#### Correct attach form (proven)

```c
sys_4B(0x2, model_id, bone_hash, action_hash);
// optional parent:
sys_4B(0x2, model_id, bone_hash, action_hash, parent_model_id);
```

| Arg | Meaning | How to get it |
|-----|---------|----------------|
| `0x2` | subcmd attach/configure | fixed |
| `model_id` | SHL model id (MSC integer) | SHL editor LE display (e.g. `03AA066E`) → MSC `0x6E06AA03` (LE bytes as u32). Same rule as dual-hand guns `74D21FCB` → `0xCB1FD274`. |
| `bone_hash` | **Body (parent) `.jnttbl` `boneHash` field** | Open active body `.jnttbl`, find the mount bone by matching `boneIndex` to `.nusktb` bone order/name, then use **`boneHash`**, not the sequential nusktb index. |
| `action_hash` | attach action / resource | common weapon attach: `0x4094B0F4` (many official units) |
| `parent_model_id` | optional parent shell | only when official code passes a 5th arg |

#### Critical: `bone_hash` ≠ nusktb bone index

**Wrong (common agent mistake):** use nusktb sequential index as the third arg
(e.g. ATAMA is bone #35 → write `0x23`).

**Right:** look up that bone’s **jnttbl `boneHash`**.

Proven on Wing Zero Rebellion body (`016…_body_normal.jnttbl` + nusktb names):

| Mount bone (nusktb name) | nusktb order index | jnttbl `boneHash` (use this in `sys_4B`) |
|--------------------------|-------------------:|------------------------------------------|
| `ATH_TE_L` | 42 | **`0x18`** |
| `ATH_TE_R` | 50 | **`0x19`** |
| `ATAMA` | 35 | **`0xE`** |

Official dual-hand attach (already in unit `2.c` / `func_887`):

```c
sys_4B(0x2, 0xcb1fd274, 0x19, 0x4094b0f4); // right hand gun → ATH_TE_R via hash 0x19
sys_4B(0x2, 0x521683ce, 0x18, 0x4094b0f4); // left hand gun  → ATH_TE_L via hash 0x18
```

2026-08-12 in-game proven (Wing Gundam Zero Rebellion transform): model id + boneHash
rules hold; **do not mount shield on `ATAMA` for gameplay**.

```c
// SHL LE model id 03AA066E == MSC 0x6E06AA03
// boneHash must be jnttbl boneHash (ATAMA = 0xE works as a mount point, but…)
sys_4B(0x2, 0x6e06aa03, 0xe, 0x4094b0f4); // attach works
sys_4B(0x3, 0x6e06aa03);                   // detach this model only
```

Using `0x23` (ATAMA’s nusktb index) fails the mount; using **`0xE`** succeeds as a
hash. However **`ATAMA` is driven by engine look-at / lock-on**, so any child
model tracks the enemy and keeps moving.

**TV Zero (`028gunwtv`, `func_897`) never puts the shield on ATAMA:**

| Form | `global143` | Model | Mount boneHash | nusktb name |
|------|-------------|-------|----------------|-------------|
| Normal | `0` | `0xFF02AFD5` | **`0x3CE712CC`** | `ATH_SHIELD` on `body_normal` |
| Bird | nonzero | `0xFF02AFD5` | **`0x27`** | `SHIELD` on **`body_tf`** |

Rebellion `body_normal` has **neither** `ATH_SHIELD` nor `SHIELD` (no `body_tf`
yet). Interim non-lookat mount used in the port: **`MUNE2` jnttbl hash `0x4`**.
Proper TV parity needs `body_tf` + its `SHIELD` bone, or add `ATH_SHIELD` to the
Rebellion skeleton.

Optional local TRS after attach (deg×100):  
`sys_47(0x10, modelId, rootBoneHash, x, y, z, duration)`.

#### Other bone_hash notes

- Not `.shl` `modelType` / `folderIndex`.
- Do not copy a bone hash from another unit’s body without checking the target
  body’s `.jnttbl`.
- 2026-07-05 Hyaku Shiki → Gyan: Dodai uses
  `sys_4B(0x2, 0x7AD84955, 0x8CCFAE67, 0x4094B0F4)` where `0x8CCFAE67` is a bone
  hash for that Dodai model; on a different model without that hash the attach
  pins to the ground — use `0` or a hash proven from the target `.jnttbl`.

### `sys_4B(3, optional_entry_id)`

Clears either a specific shell entry or the shell entry collection, depending on
whether an id is supplied.

| Form | Meaning |
|------|---------|
| `sys_4B(0x3)` | clear **all** shell entries |
| `sys_4B(0x3, model_id)` | clear **one** entry (preferred for temporary attach) |

Current semantic label: `clear_shell_entry_or_all`.

### `sys_4B(4, entry_id)`

Calls `sub_1405E8990` and returns whether the shell entry exists.

Current semantic label: `shell_entry_exists`.

## Design Implication

From the original engine design perspective, `sys_4B(1)` is an object-context
operation. Human-readable MSC should render it as the active shell entry id,
not as an opaque numeric syscall. This context is also required to interpret
many `sys_47` object and spatial operations correctly.

## Agent checklist (attach a model to a body bone)

1. Confirm model id is in target SHL (LE display in editor → MSC u32 as above).
2. Open **body** `.nusktb` → find bone **name** (e.g. `ATAMA`).
3. Open **body** `.jnttbl` → find the row whose `boneIndex` equals that nusktb
   order index → read **`boneHash`**.
4. Call `sys_4B(0x2, model_id, boneHash, 0x4094b0f4)` (or unit’s proven action).
5. Detach with `sys_4B(0x3, model_id)` (not bare `sys_4B(0x3)` unless full rebuild).
6. Never pass nusktb sequential index as the third arg unless it happens to equal
   the jnttbl `boneHash` (usually only true for a few early bones).

## Remaining Cases

The handler also owns visual effect, material, camera-adjacent, and per-entry
state branches through at least subcommand `0x17`. These require separate helper
analysis before stable naming.
