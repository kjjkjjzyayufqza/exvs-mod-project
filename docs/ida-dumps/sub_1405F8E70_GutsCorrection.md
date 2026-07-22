# `sub_1405F8E70`: low-durability incoming-damage multiplier

Re-audited: 2026-07-15 against OB `vsac27_Release.exe`
Status: Grade A native consumer proof

## Purpose

`sub_1405F8E70(characterparam, current_hp_ratio)` returns `1.0` above 50%
durability. At or below 50%, it selects one of ten 5%-wide
`characterparam` fields and returns the stored percentage multiplied by
`0.01`.

The result is not merely a generic "HP correction." The only caller,
`sub_1405F89C0`, stores it at HP-state offset `+0x18`; `sub_1405F9480`
multiplies that offset into incoming damage immediately before subtracting the
integer result from current HP. It is therefore a low-durability incoming-
damage multiplier (the usual VS-series guts mechanic).

## Correct OB hashes

| Durability ratio | Hash | Canonical JSON key |
|---|---|---|
| 45–50% | `0x6674EE31` | `lowDurabilityIncomingDamageMultiplierBand45To50` |
| 40–45% | `0x9B8BF864` | `lowDurabilityIncomingDamageMultiplierBand40To45` |
| 35–40% | `0xE1D22572` | `lowDurabilityIncomingDamageMultiplierBand35To40` |
| 30–35% | `0xBB19842F` | `lowDurabilityIncomingDamageMultiplierBand30To35` |
| 25–30% | `0xC1405939` | `lowDurabilityIncomingDamageMultiplierBand25To30` |
| 20–25% | `0x3CBF4F6C` | `lowDurabilityIncomingDamageMultiplierBand20To25` |
| 15–20% | `0x46E6927A` | `lowDurabilityIncomingDamageMultiplierBand15To20` |
| 10–15% | `0x6F2514E8` | `lowDurabilityIncomingDamageMultiplierBand10To15` |
| 5–10% | `0x157CC9FE` | `lowDurabilityIncomingDamageMultiplierBand05To10` |
| 0–5% | `0xE883DFAB` | `lowDurabilityIncomingDamageMultiplierBand00To05` |

Equivalent logic:

```text
if ratio > 0.50:
    return 1.0

hash = select_5_percent_band(ratio)
return characterparam_float(hash) * 0.01
```

## Correction to the earlier dump

The previous version of this note listed near-miss hashes such as
`0x6679A0B1`, `0x9B8F7954`, and `0xE8A1EF1B`. Those values do not match the
OB instructions in `sub_1405F8E70`. The table above is transcribed from the
live OB function and agrees with the hashes already present in the binary
parameter schema.

The old JSON names `hpCorrectionPctTier01..10` remain accepted only as input
aliases. New output uses ratio-explicit incoming-damage names so band order and
runtime effect are both visible.

## Consumer chain

```text
sub_140601F90 (per-frame unit update)
  -> sub_1405F89C0 (refresh HP-state multipliers)
       -> sub_1405F8E70 (select ratio band)
  -> later damage dispatch
       -> sub_1405F9480 (multiply +0x18 and subtract HP)
```

See `docs/characterparam-burst-multiplier-audit.md` for the complete HP
application formula and the two other incoming/final-damage multiplier
families found during the same audit.
