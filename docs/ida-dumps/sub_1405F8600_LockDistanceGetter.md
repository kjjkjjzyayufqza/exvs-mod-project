# sub_1405F8600 — LockDistanceGetter

- **Address**: `0x1405F8600`
- **Size**: Small (switch dispatch returning a float)
- **Purpose**: Returns the lock-on distance threshold for a given distance type. Used by the targeting system to determine lock-on range bands (red/mid/far/max/green).

## Pseudocode

```c
float __fastcall sub_1405F8600(entry, int distType)
{
  switch (distType) {
    case 0: hash = 0x08ECF0BE (= 149745854); break;  // redLock
    case 1: hash = 0x9271BEB4 (= -1847222012 → 2447745284); break; // midLock
    case 2: hash = 0xE69AD372 (= -421359214 → 3873608082); break; // farLock
    case 3: hash = 0x78903491 (= 2022048817); break; // maxLock
    case 4: hash = 0x0F8134A7 (= 260125863); break;  // greenLock
    default: hash = 0x55EECE85 (= 1441070965); break; // default
  }
  return getFloatField(entry, hash);
}
```

## Analysis

| distType | Hash | Unsigned Value | Field Name | Description |
|----------|------|---------------|-----------|-------------|
| 0 | `0x08ECF0BE` | 149745854 | redLock | Closest lock range (red lock indicator) |
| 1 | `0x9271BEB4` | 2447745284 | midLock | Medium lock range |
| 2 | `0xE69AD372` | 3873608082 | farLock | Far lock range |
| 3 | `0x78903491` | 2022048817 | maxLock | Maximum lock range |
| 4 | `0x0F8134A7` | 260125863 | greenLock | Green lock range (optimal) |
| default | `0x55EECE85` | 1441070965 | defaultLock | Fallback distance |

These distance thresholds define concentric lock-on / engagement zones around a unit (IDA labels are provisional).

**Empirical correction (2026-07-11):** in-game **红锁距离** responded to:

- `characterparam.lock_on_distance_max` (`0xA223C183`, `sub_1405F8720` a2=3)
- `characterparam.alert_range_distance` (`0xBAE8C388`, `sub_1405F8720` default branch)

**not** to case-0 `0x08ECF0BE` in user testing. Case-0 may still be a related band, but do not treat it as the sole “red lock UI distance” without re-verification. Tune both verified floats together when modding 红锁.

See `docs/characterparam-field-notes.md` and session log
`docs/msc-research/gyan-session-2026-07-11-handoff.md` §2.
