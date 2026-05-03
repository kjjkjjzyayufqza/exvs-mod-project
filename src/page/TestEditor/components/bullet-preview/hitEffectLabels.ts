/**
 * hitEffectHash encoding: SSSUUUVVNN
 *   SSS = Series ID (e.g. 001=Gundam, 017=Gyakuten CCA, 033=Gundam AGE)
 *   UUU = Unit ID (e.g. 001=RX-78-2, 002=Sazabi, 004=AGE-FX)
 *   VV  = Variant
 *   NN  = Weapon index within unit
 *
 * Generic (shared) IDs use small values (1-255).
 */

export const GENERIC_HIT_EFFECT_LABELS: Record<number, string> = {
  1: "Generic melee hit",
  3: "Generic projectile",
  4: "Generic projectile type 4",
  40: "Funnel beam",
  60: "Beam rifle / beam shot",
  100: "Explosion / shockwave",
  101: "Generic impact",
  104: "Special explosion",
};

export function decodeHitEffectHash(hash: number): string {
  if (hash <= 0) return "None";
  if (hash < 1000) return GENERIC_HIT_EFFECT_LABELS[hash] ?? `Generic (${hash})`;

  const str = hash.toString().padStart(9, "0");
  if (str.length >= 9) {
    const series = str.slice(0, 3);
    const unit = str.slice(3, 6);
    const variant = str.slice(6, 8);
    const weapon = str.slice(8);
    return `${series}-${unit}-${variant}-${weapon}`;
  }

  return `Hash ${hash}`;
}

export const BULLETPARAM_FIELD_DESCRIPTIONS: Record<string, string> = {
  moveType:
    "0=Missile, 1=Throw, 2=Funnel, 3=FunnelApproach, 4=Anchor/Chain, 5=FunnelFlysword, 6=AttachChange, 7=FunnelThrow, 255=Generic",
  hitEffectHash:
    "UnitTaskAutomata dispatch key (hash 0x0D6A5CD5). Encoding: SSSUUUVVNN = Series+Unit+Variant+WeaponIdx",
  initialSpeed:
    "Launch velocity. Fed to CCmdActionManager physics body as initial speed vector magnitude",
  gravityRate:
    "Gravity coefficient per frame. Used by FreeFall/ThrowMortar physics: vy -= gravityRate each frame",
  lifetime:
    "Total lifetime in frames (60fps). CCmdAction_WaitForLifeTimeEnd destroys entity when expired",
  homingStrength:
    "Tracking blend factor (0~1). StandardHomingMoveSet blends velocity toward target each frame",
  turnRate:
    "Max turn rate in degrees/frame. Limits how fast the projectile can change direction",
  homingDuration:
    "Frames of active tracking. After this, projectile flies straight",
  maxRange:
    "CanHitTarget threshold: 3D distance < maxRange = hit. Used by vtable[54]",
  effectiveRange:
    "ShouldCancel threshold: 3D distance >= effectiveRange = self-destruct. Used by vtable[55]",
  blastRadius:
    "Explosion radius on impact. Shown as transparent sphere at impact point",
  accelerationValue:
    "Speed change per frame (positive=accelerate, negative=decelerate)",
  hitboxWidth: "Collision box width (X axis)",
  hitboxHeight: "Collision box height (Y axis)",
  hitboxDepth: "Collision box depth (Z axis)",
  initialAngle: "Horizontal launch angle in degrees. Converted to radians in Throw pipeline",
  elevationAngle: "Vertical launch angle in degrees. Converted to radians in Throw pipeline",
  rotationAngle: "Roll/spin angle in degrees. Used by rotation bone actions",
  bulletActionHash: "CCmdActionManager behavior reference (1474 unique values across all units)",
  bulletEffectHash: "Visual effect reference for the projectile body",
  trailEffectHash: "Trail/ribbon visual effect",
  muzzleFlashHash: "Muzzle flash effect on spawn",
  collisionType: "0=None, 1=Standard, 2=Special",
  pierceCount: "Number of targets the projectile can pass through",
  homingType: "0=None, 1=Standard, 2=Funnel, 3=Advanced",
  bulletShape: "Visual shape enum (0~8)",
  durationFrame: "Additional duration after main lifetime",
  delayFrame: "Delay before projectile becomes active",
};
