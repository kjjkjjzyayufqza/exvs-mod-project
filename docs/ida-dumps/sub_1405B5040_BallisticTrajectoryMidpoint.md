# sub_1405B5040 — BallisticTrajectoryMidpoint

- **Address**: `0x1405B5040`
- **Size**: Medium (calls BallisticAngleSolver, computes peak height)
- **Purpose**: Computes the midpoint of a ballistic arc between source and target, including the peak height. Used for visual trajectory preview or collision checks along the arc.

## Pseudocode

```c
__m128 *__fastcall sub_1405B5040(__m128 *result, __m128 *source, __m128 *target, unsigned int entryId)
{
  // Reads gravityRate(0x90423264) and turnRate(0x74F469FA) from param entry
  sub_1405C42E0(source, target, ...params, 1); // BallisticAngleSolver with highArc=true
  v15 = sinf(launchAngle);
  v16 = powf(sin * gravityRate, 2.0); // peakHeight = (sin(angle) * gravity)²
  midpoint = (source + target) * 0.5; // midpoint XZ
  midpoint.y = peakHeight / (gravity * 2) + source.y; // peak Y offset
  *result = midpoint;
}
```

## Analysis

| Hash | Field Name | Usage |
|------|-----------|-------|
| `0x90423264` | gravityRate | Gravity constant for the arc |
| `0x74F469FA` | turnRate | Projectile speed |

The midpoint is calculated as:

```
midXZ = (source + target) / 2
peakHeight = (sin(angle) × gravity)² / (2 × gravity)
midY = peakHeight + source.y
```

Always uses `highArc=true` (last parameter = 1) to get the lobbed trajectory peak, which produces the maximum apex for visual display.
