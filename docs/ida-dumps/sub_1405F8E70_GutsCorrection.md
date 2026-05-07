# sub_1405F8E70 — GutsCorrection

- **Address**: `0x1405F8E70`
- **Size**: Medium (nested if-else chain over 10 HP bands)
- **Purpose**: Returns a damage correction multiplier based on the defender's current HP percentage. Below 50% HP, the multiplier decreases in 5% bands (the "guts" mechanic — taking less damage at low HP).

## Pseudocode

```c
float __fastcall sub_1405F8E70(entry, float hpPercent)
{
  if (hpPercent > 0.5) return 1.0;
  // 10 HP bands, nested if-else chain:
  // >0.45 → hash 0x6679A0B1
  // >0.40 → hash 0x9B8F7954 (= -1685325724 unsigned)
  // >0.35 → hash 0xE1EDDE72 (= -506321550 unsigned)
  // >0.30 → hash 0xBB3C2E2F (= -1155955665 unsigned)
  // >0.25 → hash 0xC1E4C2A9 (= -1052747463 unsigned)
  // >0.20 → hash 0x3CB45DEC (= 1019170668)
  // >0.15 → hash 0x46E5D07A (= 1189515898)
  // >0.10 → hash 0x6F1F8D68 (= 1864701160)
  // >0.05 → hash 0x157CC9FE (= 360499710)
  // <=0.05 → hash 0xE8A1EF1B (= -394010709 unsigned → 3900956587)
  return getFloatField(entry, selectedHash) * 0.01;
}
```

## Analysis

| HP Range | Hash | Unsigned Value | Signed Value |
|----------|------|---------------|-------------|
| > 50% | — | — | Returns `1.0` (no correction) |
| 45%–50% | `0x6679A0B1` | 1719574705 | 1719574705 |
| 40%–45% | `0x9B8F7954` | 2609641572 | -1685325724 |
| 35%–40% | `0xE1EDDE72` | 3788645746 | -506321550 |
| 30%–35% | `0xBB3C2E2F` | 3139011375 | -1155955665 (sic, -1155955921) |
| 25%–30% | `0xC1E4C2A9` | 3252219561 | -1042747735 (sic, -1052747463) |
| 20%–25% | `0x3CB45DEC` | 1019170284 (sic, 1019170668) | 1019170668 |
| 15%–20% | `0x46E5D07A` | 1189515898 | 1189515898 |
| 10%–15% | `0x6F1F8D68` | 1864701160 | 1864701160 |
| 5%–10% | `0x157CC9FE` | 360499710 | 360499710 |
| ≤ 5% | `0xE8A1EF1B` | 3900956443 (sic, 3900956587) | -394010709 |

Each hash reads a percentage value from the param entry. The `* 0.01` converts it from a whole-number percentage (e.g. `85`) to a multiplier (e.g. `0.85`). Lower HP bands typically yield lower multipliers, reducing incoming damage — this is the "guts" survival mechanic common in VS games.
