# sub_1405F9010 — DamageDispatcher

- **Address**: `0x1405F9010`
- **Size**: Medium (switch dispatch over attack types)
- **Purpose**: Returns the damage value for a given attack type. Some cases apply a correction factor from `*(float*)(a1+20)`.

## Pseudocode

```c
__int64 __fastcall sub_1405F9010(__int64 a1, int attackType)
{
  switch (attackType) {
    case 0: case 1:  return getField(a1, 0xEB30FE24); // rangedDamage
    case 2: case 14: return getField(a1, 0x333722B6); // meleeDamage
    case 3: case 15: case 18: return getField(a1, 0x9054ACF0); // subDamage
    case 4: case 5: case 12: return (int)((float)getField(a1, 0xE301E496) * *(float*)(a1+20)); // corrected
    case 6: case 7:  return getField(a1, 0x1D6EA3F1); // assistDamage
    case 8:          return getField(a1, 0x00D7CEDB); // maxHp
    case 9:          return (int)((float)getField(a1, 0x7765F2E9) * *(float*)(a1+20)); // corrected2
    case 10:         return getField(a1, 0x539BE76D); // rangedSpecial
    case 11:         return getField(a1, 0x2DA8874F); // specialMelee
    case 13:         return getField(a1, 0xE301E496); // same as 4/5/12 without correction
    default: return 0;
  }
}
```

## Analysis

| attackType | Hash | Field Name | Notes |
|-----------|------|-----------|-------|
| 0, 1 | `0xEB30FE24` | rangedDamage | Main/sub ranged shots |
| 2, 14 | `0x333722B6` | meleeDamage | Melee and base-unit melee |
| 3, 15, 18 | `0x9054ACF0` | subDamage | Sub weapon / special melee / derived |
| 4, 5, 12 | `0xE301E496` | correctedDamage | Multiplied by `*(float*)(a1+20)` correction factor |
| 6, 7 | `0x1D6EA3F1` | assistDamage | Assist attacks |
| 8 | `0x00D7CEDB` | maxHp | HP value (used as "damage" in context) |
| 9 | `0x7765F2E9` | correctedDamage2 | Also multiplied by correction factor |
| 10 | `0x539BE76D` | rangedSpecial | Special ranged attack |
| 11 | `0x2DA8874F` | specialMelee | Special melee attack |
| 13 | `0xE301E496` | rawDamage | Same hash as 4/5/12 but without correction |

Cases 4/5/12 and 9 apply a floating-point correction factor stored at offset `a1+20`. Case 13 reads the same base value as 4/5/12 but returns it uncorrected.
