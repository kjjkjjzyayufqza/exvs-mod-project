# OB lock-distance threshold families

Date: 2026-07-15
Binary: OB `vsac27_Release.exe`
Safety: executable and IDB inspected read-only

## Result boundary

`sub_1405F8600` and `sub_1405F8720` are two six-way `characterparam` float
getters used by the same target-distance classifier. Their selector order and
hashes are proven. Names such as `redLock`, `midLock`, `farLock`, `maxLock`,
and `greenLock` are not proven by either getter and must not be attached to
individual slots from selector number or value magnitude alone.

## Family 1: `sub_1405F8600`

| Selector | Exact OB hash |
|---:|---|
| 0 | `0x08ECF0BE` |
| 1 | `0x91E5A104` |
| 2 | `0xE6E29192` |
| 3 | `0x78860431` |
| 4 | `0x0F8134A7` |
| default | `0x55E4FF75` |

Earlier notes contained four near-miss hashes in this family
(`9271BEB4`, `E69AD372`, `78903491`, and `55EECE85`). They are rejected; the
table above comes from the live OB instructions at `0x1405F8625..0x1405F864D`
and agrees with the current characterparam schema.

## Family 2: `sub_1405F8720`

| Selector | Exact OB hash |
|---:|---|
| 0 | `0xD249350C` |
| 1 | `0x4B4064B6` |
| 2 | `0x3C475420` |
| 3 | `0xA223C183` |
| 4 | `0xD524F115` |
| default | `0xBAE8C388` |

`sub_1405F8290` computes target distance squared and compares it with values
derived from both families through `sub_1405F86A0` and `sub_1405F8520`. The
result is a three-band target-distance state. This proves a lock/target-distance
threshold subsystem, but not a one-to-one UI color label for each hash.

## HUD color-state cross-check

The user-provided local string dump exposes exact strings at:

- `0x141516140`: `Lockon_Red`
- `0x141516150`: `Lockon_Green`
- `0x141516160`: `Lockon_Yellow`

Their only xrefs are in `sub_140A2DBB0`, which selects animation states on
`/Info_Bg_mc/BG_mc`. Its caller `sub_140A2BD90` receives a HUD state through a
callback. Neither function directly reads either characterparam threshold
family. Therefore the HUD strings confirm the color-state UI exists, but do
not provide the missing dataflow from a particular threshold hash to a color.

## Empirical editing evidence

The user's in-game experiment found red-lock behavior when editing both:

- `0xA223C183` (`lockOnDistanceMax` compatibility name)
- `0xBAE8C388` (`alertRangeDistance` compatibility name)

The deployed Gyan mod also changes three Family-1 fields, so it is not a clean
two-field isolation test. For practical editing, change the two empirically
verified Family-2 fields together in every selected row. For semantic naming,
retain the broader lock/target-distance-threshold wording until a controlled
single-field test or a native dataflow connects classifier output to the HUD
color state.

See `docs/characterparam-field-notes.md` and
`docs/agent-sessions/2026-07-14-param-ida-audit.md` for real-file values and
cross-version evidence.
