/**
 * Semantic classification of an interactionid row into the four author-facing
 * hit effects, per docs/hitbox-research/03-hit-effect-taxonomy.md (phase 2, 2026-07-27,
 * proven by two independent IDA+MSC verifiers).
 *
 * KEY MECHANISM (proven): interactionid fields are read NOT by the engine's C++
 * by-hash accessor (they have no imm32 read-site in the exe — the same blind spot
 * as grapparam) but by the MSC receiver template via sys_0(0x60007, rowHash, fieldHash).
 * The victim's hit reaction is dispatched by MSC func_629 on interact_id (0x6A0CCB8A):
 *   200-212 -> basic reactions (よろけ etc.)        300-317 -> func_632
 *   400-410 -> timed states (func_633); 407 -> STUN state 0x16, duration = 0xFA03CBDA*100 (floor 500)
 *   500/501 -> GRAB/bind state 0x1A (func_634, gated on the attacker's hold check)
 *   604/607 -> rare anchor-hold family;  <2 -> no new reaction (neutral follow-up tick)
 *
 * So the four effects are all DATA-EDITABLE on the interactionid row:
 *   normal damage    -> damage (0x00C57BA3), displayed 1:1, truncated
 *   forced knockdown -> downValue (0x2A6A7D8F) drains the victim knockdown budget (~500);
 *                       knockbackType (0xBB0F3D7F) weights the reaction severity
 *   electric stun    -> interactId 407 + untechableFrame duration (the electric TICK itself
 *                       is interactId 1, a neutral follow-up on the already-stunned target)
 *   grab / bind      -> interactId 500/501; the hold animation is attacker-driven, but the
 *                       state entry is this data field
 */

import type { TypedParamEntry } from "@/page/TestEditor/components/param-editor/typedParamTypes";

export type HitEffectCategory =
  | "normal-hit"
  | "forced-knockdown"
  | "stun"
  | "grab"
  | "timed-state"
  | "neutral-followup";

export const HIT_EFFECT_CATEGORY_LABELS: Record<HitEffectCategory, string> = {
  "normal-hit": "Normal hit",
  "forced-knockdown": "Forced knockdown",
  stun: "Electric stun (スタン)",
  grab: "Grab / bind (捕縛)",
  "timed-state": "Timed reaction state",
  "neutral-followup": "Neutral follow-up tick",
};

/**
 * interact_id (0x6A0CCB8A) reaction-class selector values dispatched by MSC func_629.
 */
export const REACTION_ID = {
  STUN: 407,
  BIND: 500,
  BIND_VARIANT: 501,
} as const;

/** interact_id range for the timed-state reaction family (func_633). */
export const TIMED_STATE_RANGE = { min: 400, max: 410 } as const;

/**
 * The reaction duration field (0xFA03CBDA) is stored in wiki-frame units and scaled
 * ×100 into internal units at load; the internal timer floors at 500 and ticks -100/frame.
 */
export const REACTION_DURATION_SCALE = 100;

/**
 * knockbackType (0xBB0F3D7F) -> reaction-severity weight, from engine switch sub_14066CCA0
 * written into the hit-reaction event +64 (03 §4.3). Higher = stronger (1000 = strongest).
 */
export const KNOCKBACK_TYPE_WEIGHTS: Record<number, number> = {
  0: 0,
  1: 25,
  2: 125,
  3: 1000,
  4: 10,
};

export const KNOCKBACK_TYPE_DEFAULT_WEIGHT = 100;

/**
 * Full victim knockdown budget (03 §3): a single-hit downValue at or above this forces
 * knockdown. downValue is wiki ダウン値 x100.
 */
export const KNOCKDOWN_BUDGET = 500;

/** visualEffectClass value that marks a grab/wrap move visually (03 §5.4). */
export const GRAB_VISUAL_EFFECT_CLASS = 20;

export function knockbackWeight(knockbackType: number): number {
  return KNOCKBACK_TYPE_WEIGHTS[knockbackType] ?? KNOCKBACK_TYPE_DEFAULT_WEIGHT;
}

export function isTimedStateReaction(reactionId: number): boolean {
  return reactionId >= TIMED_STATE_RANGE.min && reactionId <= TIMED_STATE_RANGE.max;
}

export interface HitEffectFact {
  key: string;
  label: string;
  value: string;
  /** binary/MSC-proven vs strong/heuristic. */
  proven: boolean;
  note?: string;
}

export interface HitEffectClassification {
  category: HitEffectCategory;
  label: string;
  /** "reaction-id" = classified from the proven func_629 selector; "derived" = from data fields. */
  basis: "reaction-id" | "derived";
  /**
   * True when the full in-game behaviour needs attacker automata beyond this row.
   * Only grab qualifies: the state entry is data, but the hold is attacker-driven.
   */
  automataDependent: boolean;
  facts: HitEffectFact[];
  notes: string[];
}

function num(entry: TypedParamEntry, key: string): number | undefined {
  const v = entry[key];
  return typeof v === "number" ? v : undefined;
}

/**
 * Classify one interactionid row by its proven reaction-class selector, falling back
 * to the pure-data damage/knockdown fields when the row carries no reaction id.
 *
 * @param entry        interactionid entry (camelCase serde keys)
 * @param hasHitVolume whether any hitgroupiddef row's interactionId FK points at this
 *                     entry. Optional; used only to annotate follow-up ticks.
 */
export function classifyHitEffect(
  entry: TypedParamEntry,
  hasHitVolume?: boolean,
): HitEffectClassification {
  const damage = num(entry, "damage") ?? 0;
  const downValue = num(entry, "downValue") ?? 0;
  const knockbackType = num(entry, "knockbackType");
  const visualEffectClass = num(entry, "visualEffectClass");
  // 0x6A0CCB8A / 0xFA03CBDA keep their pre-proof pool names (interactId / untechableFrame);
  // their proven semantics are reaction-id and reaction-duration (see module header).
  const reactionId = num(entry, "interactId");
  const durationRaw = num(entry, "untechableFrame") ?? 0;

  const facts: HitEffectFact[] = [];
  const notes: string[] = [];

  facts.push({
    key: "damage",
    label: "Damage",
    value: String(damage),
    proven: true,
    note: "Displayed damage 1:1 (truncated on apply)",
  });

  facts.push({
    key: "downValue",
    label: "Down value",
    value: `${downValue}  (÷100 = ${(downValue / 100).toFixed(2)} wiki)`,
    proven: true,
    note:
      downValue >= KNOCKDOWN_BUDGET
        ? `≥ ${KNOCKDOWN_BUDGET} budget → guaranteed one-hit knockdown`
        : `drains victim knockdown budget (full ≈ ${KNOCKDOWN_BUDGET})`,
  });

  if (reactionId !== undefined) {
    facts.push({
      key: "interactId",
      label: "Reaction id",
      value: String(reactionId),
      proven: true,
      note: "victim reaction-class selector (MSC func_629)",
    });
  }

  if (knockbackType !== undefined) {
    const w = knockbackWeight(knockbackType);
    facts.push({
      key: "knockbackType",
      label: "Reaction severity",
      value: `type ${knockbackType} → weight ${w}`,
      proven: true,
      note: w >= KNOCKBACK_TYPE_WEIGHTS[3] ? "strongest (knock-up / down)" : undefined,
    });
  }

  if (visualEffectClass !== undefined) {
    facts.push({
      key: "visualEffectClass",
      label: "Visual effect class",
      value: String(visualEffectClass),
      proven: true,
      note:
        visualEffectClass === GRAB_VISUAL_EFFECT_CLASS
          ? "grab visual (visual only)"
          : "selects on-hit VFX only",
    });
  }

  // Reaction-id classification first (proven func_629 dispatch), then pure-data fallbacks.
  if (reactionId === REACTION_ID.BIND || reactionId === REACTION_ID.BIND_VARIANT) {
    notes.push(
      `Reaction id ${reactionId} → grab/bind state 0x1A (MSC func_634). The state entry is ` +
        "this data field, but the hold is gated on the attacker's hold check — a full grab " +
        "needs a matching attacker automata (Sticker/projectile), not just this row.",
    );
    return {
      category: "grab",
      label: HIT_EFFECT_CATEGORY_LABELS.grab,
      basis: "reaction-id",
      automataDependent: true,
      facts,
      notes,
    };
  }

  if (reactionId === REACTION_ID.STUN) {
    const durationFrames = durationRaw;
    facts.push({
      key: "untechableFrame",
      label: "Stun duration",
      value: `${durationFrames}  (×${REACTION_DURATION_SCALE} internal, floor ${KNOCKDOWN_BUDGET})`,
      proven: true,
      note: "0xFA03CBDA reaction-state duration",
    });
    notes.push(
      "Reaction id 407 → stun state 0x16 (MSC func_633). Pure data: set interactId 407 and a " +
        "non-zero duration. The electric TICK damage is a separate interactId-1 follow-up row.",
    );
    return {
      category: "stun",
      label: HIT_EFFECT_CATEGORY_LABELS.stun,
      basis: "reaction-id",
      automataDependent: false,
      facts,
      notes,
    };
  }

  if (reactionId !== undefined && isTimedStateReaction(reactionId)) {
    notes.push(
      `Reaction id ${reactionId} is in the timed-state family (func_633, 400-410): sibling of ` +
        "stun (受身不可 / 強よろけ-like). Exact behaviour per id is unresolved.",
    );
    return {
      category: "timed-state",
      label: HIT_EFFECT_CATEGORY_LABELS["timed-state"],
      basis: "reaction-id",
      automataDependent: false,
      facts,
      notes,
    };
  }

  if (reactionId !== undefined && reactionId < 2) {
    notes.push(
      "Reaction id < 2 → no new reaction: a neutral follow-up tick (e.g. 電流追撃 on an " +
        "already-grabbed/stunned target). This is why a grab persists through the ticks.",
    );
    if (hasHitVolume === false) {
      notes.push("Confirmed: no hitgroupiddef volume — it does not need to 'hit', it re-applies to the locked target.");
    }
    return {
      category: "neutral-followup",
      label: HIT_EFFECT_CATEGORY_LABELS["neutral-followup"],
      basis: "reaction-id",
      automataDependent: false,
      facts,
      notes,
    };
  }

  if (downValue >= KNOCKDOWN_BUDGET || knockbackType === 3) {
    if (downValue < KNOCKDOWN_BUDGET && knockbackType === 3) {
      notes.push(
        "knockbackType 3 (weight 1000) is the strongest reaction; usually knock-up/down even " +
          "though this row's downValue alone is below the one-hit budget.",
      );
    }
    return {
      category: "forced-knockdown",
      label: HIT_EFFECT_CATEGORY_LABELS["forced-knockdown"],
      basis: "derived",
      automataDependent: false,
      facts,
      notes,
    };
  }

  return {
    category: "normal-hit",
    label: HIT_EFFECT_CATEGORY_LABELS["normal-hit"],
    basis: reactionId !== undefined ? "reaction-id" : "derived",
    automataDependent: false,
    facts,
    notes,
  };
}
