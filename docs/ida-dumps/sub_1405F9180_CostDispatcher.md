# sub_1405F9180 — CostDispatcher

- **Address**: `0x1405F9180`
- **Size**: Medium (switch dispatch over attack types)
- **Purpose**: Returns the ammo/boost cost for a given attack type. Case 18 applies a ceiling function with a character-list multiplier.

## Pseudocode

```c
switch (attackType) {
  case 0:  return getField(a1, 0x8199A311); // mainCost
  case 1:  return getField(a1, 0xD8F4FBD2); // subMainCost
  case 2:  return getField(a1, 0x22823596); // specialCost
  case 3:  return getField(a1, 0x0872029D); // subShotCost
  case 4/5/12: return getField(a1, 0xAE7FF94F); // meleeCost
  case 6/7: return getField(a1, 0xFEE76495); // assistCost
  case 9:  return getField(a1, 0x1EA3FAE1); // burstCost
  case 10: return getField(a1, 0xC6A88D7F); // specialRangedCost
  case 13: return getField(a1, 0x5E0DDDD8); // chargeCost
  case 14/15: return getField(a1, 0x04371326); // baseUnitCost
  case 18: return ceil(getField(0x04371326) * characterListFactor(0xCAE69E45));
}
```

## Analysis

| attackType | Hash | Field Name | Notes |
|-----------|------|-----------|-------|
| 0 | `0x8199A311` | mainCost | Primary ranged shot cost |
| 1 | `0xD8F4FBD2` | subMainCost | Secondary ranged shot cost |
| 2 | `0x22823596` | specialCost | Special attack cost |
| 3 | `0x0872029D` | subShotCost | Sub weapon shot cost |
| 4, 5, 12 | `0xAE7FF94F` | meleeCost | Melee attack cost |
| 6, 7 | `0xFEE76495` | assistCost | Assist call cost |
| 9 | `0x1EA3FAE1` | burstCost | Burst attack cost |
| 10 | `0xC6A88D7F` | specialRangedCost | Special ranged cost |
| 13 | `0x5E0DDDD8` | chargeCost | Charged attack cost |
| 14, 15 | `0x04371326` | baseUnitCost | Base unit cost (raw) |
| 18 | `0x04371326` × `0xCAE69E45` | derivedCost | `ceil(baseUnitCost × characterListFactor)` |

Case 18 is notable: it reads the same `baseUnitCost` hash (`0x04371326`) but multiplies it by a factor looked up from the character list via hash `0xCAE69E45`, then applies `ceil()` to round up.
