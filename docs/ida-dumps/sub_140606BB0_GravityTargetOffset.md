# sub_140606BB0 — GravityTargetOffset

- **Address**: `0x140606BB0`
- **Size**: Medium (wrapper around BallisticAngleSolver)
- **Purpose**: Modifies a target position's Y coordinate in-place so that a ballistic projectile fired from the unit's position will arc through gravity and land at the target.

## Pseudocode

```c
void __fastcall sub_140606BB0(__m128 *a1, __m128 *a2)
{
  // a1 = unit data, a2 = target position (modified in-place)
  v6 = *a2 - a1[83]; // delta = target - unit.pos
  // Reads 3 fields via hash lookup:
  //   hitEffectHash  (0x0D6A5CD5)
  //   gravityRate    (0x74F469FA)
  //   turnRate       (0x90423264)
  sub_1405C42E0(unitPos, targetPos, ...); // call BallisticAngleSolver
  v13 = tanf(launchAngle);
  horizDist = sqrt(delta.x² + delta.z²);
  a2->y = tan(angle) * horizDist + unitPos.y; // modify target Y
}
```

## Analysis

| Hash | Field Name | Usage |
|------|-----------|-------|
| `0x0D6A5CD5` | hitEffectHash | Projectile type identifier |
| `0x74F469FA` | gravityRate | Passed as gravity to the angle solver |
| `0x90423264` | turnRate | Passed as speed to the angle solver |

The function computes `targetY = tan(launchAngle) × horizontalDistance + sourceY`, effectively raising the aim point so the projectile's parabolic trajectory passes through the original target position under gravity.
