/**
 * Bullet move type definitions from actual bulletparam.bin field data.
 *
 * Verified sources:
 *   - hitEffectLabels.ts BULLETPARAM_FIELD_DESCRIPTIONS.moveType
 *   - IDA: sub_14043C200 is a command query dispatcher (NOT bullet physics)
 *   - IDA: sub_14043E3A0 is a command action dispatcher
 *   - The 513-595 range in those functions are entity command IDs, not moveType values
 *
 * The moveType field in bulletparam uses values 0-7 and 255.
 */

export interface MoveTypeDefinition {
  id: number;
  label: string;
  category: MoveTypeCategory;
  description: string;
}

export type MoveTypeCategory = "projectile" | "funnel" | "anchor" | "special";

export const MOVE_TYPE_CATEGORIES: Record<
  MoveTypeCategory,
  { label: string; color: string }
> = {
  projectile: { label: "Projectile", color: "#4ade80" },
  funnel: { label: "Funnel", color: "#60a5fa" },
  anchor: { label: "Anchor", color: "#f97316" },
  special: { label: "Special", color: "#a78bfa" },
};

export const MOVE_TYPE_DEFINITIONS: MoveTypeDefinition[] = [
  {
    id: 0,
    label: "Missile",
    category: "projectile",
    description: "Standard straight-line projectile (CCmdAction physics body)",
  },
  {
    id: 1,
    label: "Throw",
    category: "projectile",
    description:
      "Thrown projectile with FreeFall/ThrowMortar physics (gravity applied)",
  },
  {
    id: 2,
    label: "Funnel",
    category: "funnel",
    description: "Orbiting funnel/bit unit",
  },
  {
    id: 3,
    label: "Funnel Approach",
    category: "funnel",
    description: "Funnel attacking target (approach phase)",
  },
  {
    id: 4,
    label: "Anchor",
    category: "anchor",
    description: "Anchor/chain grapple projectile",
  },
  {
    id: 5,
    label: "Funnel Flysword",
    category: "funnel",
    description: "Funnel in fly-sword melee mode",
  },
  {
    id: 6,
    label: "Attach Change",
    category: "special",
    description: "Transformation-linked projectile (attach state change)",
  },
  {
    id: 7,
    label: "Funnel Throw",
    category: "funnel",
    description: "Thrown funnel deployment",
  },
  {
    id: 255,
    label: "Generic",
    category: "projectile",
    description: "Generic projectile (default behavior)",
  },
];

const _byId = new Map(MOVE_TYPE_DEFINITIONS.map((d) => [d.id, d]));

export function getMoveTypeDefinition(
  id: number,
): MoveTypeDefinition | undefined {
  return _byId.get(id);
}

export function getMoveTypeLabel(id: number): string {
  return _byId.get(id)?.label ?? `Unknown (${id})`;
}

export function getMoveTypeCategory(id: number): MoveTypeCategory {
  return _byId.get(id)?.category ?? "projectile";
}

export function getMoveTypesByCategory(
  category: MoveTypeCategory,
): MoveTypeDefinition[] {
  return MOVE_TYPE_DEFINITIONS.filter((d) => d.category === category);
}
