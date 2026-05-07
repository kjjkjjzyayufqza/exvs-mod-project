# sub_1405C4400 — ComputeSpawnOffset

- **Address**: `0x1405C4400`
- **Size**: Large (complex 3D rotation with quaternion math)
- **Purpose**: Computes a 3D spawn offset position using quaternion rotation. Reads 5 hash fields from the param entry, two of which are degree values converted to radians.

## Pseudocode

```c
// Complex 3D rotation with quaternion
// Reads 5 hash fields from param entry
// 2 of the fields are angular values converted from degrees to radians:
//   radValue = degreeValue * 3.1415927 / 180.0
//
// Applies quaternion rotation to compute a final spawn offset position
// relative to the unit's current facing direction.
```

## Analysis

This function performs a full quaternion-based 3D rotation to position a spawned entity (projectile, effect, etc.) at an offset relative to the parent unit. The degree-to-radian conversion pattern (`* 3.1415927 / 180.0`) confirms two of the five hash fields are angular parameters (likely pitch and yaw offsets).

The five hash fields likely represent:

| # | Probable Meaning |
|---|-----------------|
| 1 | Forward offset distance |
| 2 | Lateral offset distance |
| 3 | Vertical offset distance |
| 4 | Yaw angle (degrees → radians) |
| 5 | Pitch angle (degrees → radians) |

Further reverse engineering is needed to identify the exact hash values and confirm the field mapping.
