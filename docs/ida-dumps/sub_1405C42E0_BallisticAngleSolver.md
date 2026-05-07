# sub_1405C42E0 — BallisticAngleSolver

- **Address**: `0x1405C42E0`
- **Size**: Small (single-purpose math function)
- **Purpose**: Computes a ballistic launch angle given source/target positions, projectile speed, and gravity. Returns either a high-arc or low-arc angle clamped to a maximum.

## Pseudocode

```c
__m128 __fastcall sub_1405C42E0(__m128 *a1, __m128 *a2, float a3, float a4, char a5)
{
  __m128 v6 = _mm_sub_ps(*a2, *a1);
  // delta = target - source
  // v8 = dot(delta_xz, delta_xz) → horizontal distance squared
  v10 = fmaxf(0.000099999997, sqrt(v8)); // dist = max(0.0001, length(delta))
  v11 = (dist * dist * a4) / ((a3 + a3) * a3); // gTerm = (dist² * gravity) / (2 * speed²)
  v13 = fmaxf(0.0, dist² - (delta.y + gTerm) * (gTerm * 4.0)); // discriminant
  if (a5) { maxAngle = 1.5; sign = 1.0; } // high arc
  else    { maxAngle = 0.8; sign = -1.0; } // low arc
  if (v13 >= 0.0) sqrtDisc = sqrtf(v13);
  return fminf(maxAngle, atan2f(sqrtDisc * sign + dist, gTerm + gTerm));
}
```

## Analysis

| Parameter | Meaning |
|-----------|---------|
| `a1` | Source position (XYZW packed) |
| `a2` | Target position (XYZW packed) |
| `a3` | Projectile speed |
| `a4` | Gravity rate |
| `a5` | Arc selection: `1` = high arc, `0` = low arc |

The function solves the standard ballistic angle equation:

```
gTerm = (dist² × gravity) / (2 × speed²)
discriminant = dist² − 4 × gTerm × (deltaY + gTerm)
angle = atan2(±√discriminant + dist, 2 × gTerm)
```

High arc (`a5=1`) clamps to 1.5 rad (~86°), low arc (`a5=0`) clamps to 0.8 rad (~46°).
