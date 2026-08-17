export {
  type Vec3,
  vec3Add,
  vec3Sub,
  vec3Scale,
  vec3Dot,
  vec3Cross,
  vec3Length,
  vec3LengthSq,
  vec3HorizontalDist,
  vec3HorizontalDistSq,
  vec3Normalize,
  vec3Lerp,
  vec3RotateX,
  vec3RotateY,
  degToRad,
  radToDeg,
  VEC3_ZERO,
  VEC3_UP,
  VEC3_FORWARD,
} from "./vec3";

export {
  ballisticAngleSolver,
  gravityTargetOffset,
  ballisticTrajectoryMidpoint,
  computeSpawnOffset,
} from "./ballisticSolver";

export {
  type MoveTypeDefinition,
  type MoveTypeCategory,
  MOVE_TYPE_CATEGORIES,
  MOVE_TYPE_DEFINITIONS,
  getMoveTypeDefinition,
  getMoveTypeLabel,
  getMoveTypeCategory,
  getMoveTypesByCategory,
} from "./moveTypes";

export {
  ATTACK_TYPE_LABELS,
  getDamageForAttackType,
  getCostForAttackType,
  getDamageFieldInfo,
  getCostFieldInfo,
  lowDurabilityIncomingDamageMultiplier,
  lowDurabilityIncomingDamageTable,
  gutsCorrection,
  gutsTable,
  LOCK_DISTANCE_TYPES,
  getLockDistance,
} from "./damageCalculation";

export {
  type ReloadBehaviorType,
  type ReloadDurationGroup,
  type ArmsReloadProfile,
  RELOAD_BEHAVIOR_TYPE_LABELS,
  RELOAD_BEHAVIOR_TYPE_DESCRIPTIONS,
  getArmsReloadProfile,
  getReloadDurationForSelector,
} from "./reloadSystem";

export {
  type ChargeDurationFamily,
  type ArmsChargeProfile,
  CHARGE_INPUT_FLAG_LABELS,
  getArmsChargeProfile,
  getChargeDurationForSelector,
  getChargeFullDurationForSelector,
  describeChargeInputFlags,
} from "./chargeSystem";

export {
  type EvidenceGrade,
  type MovementCurveParameters,
  type BoostAscentParameters,
  type TransformOrientationParameters,
  getMovementCurves,
  getBoostAscentParameters,
  getTransformOrientationParameters,
} from "./movementParamSemantics";

export {
  type HitVolume,
  type ShapeMode,
  type SweepCoverage,
  SHAPE_MODE_LABELS,
  COLLISION_FLAG_LABELS,
  getHitVolume,
  boundingSphereRadius,
  groupVolumesByInteraction,
  describeSweepCoverage,
  verticalHitReach,
} from "./collisionGeometry";

export {
  type HitEffectCategory,
  type HitEffectFact,
  type HitEffectClassification,
  HIT_EFFECT_CATEGORY_LABELS,
  KNOCKBACK_TYPE_WEIGHTS,
  KNOCKBACK_TYPE_DEFAULT_WEIGHT,
  KNOCKDOWN_BUDGET,
  GRAB_VISUAL_EFFECT_CLASS,
  knockbackWeight,
  classifyHitEffect,
} from "./hitEffectClassification";

export {
  type ParamKind,
  type CrossReference,
  type CrossReferenceMap,
  BULLET_CROSS_REFERENCES,
  HITGROUP_CROSS_REFERENCES,
  INTERACTION_CROSS_REFERENCES,
  PARAM_KIND_LABELS,
  findEntryByHash,
  findEntryById,
  resolveBulletCrossReferences,
  resolveSingleReference,
  findReferencingEntries,
  buildReverseReferenceMap,
  followChildBulletChain,
} from "./crossParamResolver";

export {
  type ShootingEndReason,
  type ShootingTrajectorySummary,
  classifyShootingEndReason,
} from "./shootingLoop";
