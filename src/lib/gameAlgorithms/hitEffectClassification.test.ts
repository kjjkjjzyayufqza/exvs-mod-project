import { describe, test, expect } from "vitest";
import {
  classifyHitEffect,
  knockbackWeight,
  isTimedStateReaction,
  KNOCKDOWN_BUDGET,
  REACTION_ID,
  GRAB_VISUAL_EFFECT_CLASS,
} from "./hitEffectClassification";
import type { TypedParamEntry } from "@/page/TestEditor/components/param-editor/typedParamTypes";

// Real interactionid rows (camelCase serde keys). interactId = victim reaction id
// (0x6A0CCB8A), untechableFrame = reaction duration (0xFA03CBDA). Values from the
// Gouf Ignited / Gyan dumps cross-checked by workflow B3/B4 (2026-07-27).
const WRAP: TypedParamEntry = {
  entryId: 0x0d80a0ca,
  damage: 10,
  downValue: 10,
  visualEffectClass: GRAB_VISUAL_EFFECT_CLASS,
  interactId: REACTION_ID.BIND, // 500
  knockbackType: 2,
};

const ELECTRIC_TICK: TypedParamEntry = {
  entryId: 0x0c4addf4,
  damage: 13,
  downValue: 0,
  visualEffectClass: 24,
  interactId: 1, // neutral: no new reaction, applied to the already-grabbed target
  knockbackType: 2,
};

const STUN: TypedParamEntry = {
  entryId: 0x2ab260f6,
  damage: 55,
  downValue: 0,
  interactId: REACTION_ID.STUN, // 407
  untechableFrame: 80, // reaction duration
  knockbackType: 2,
};

const NORMAL_SLASH: TypedParamEntry = {
  entryId: 0x3971b286,
  damage: 80,
  downValue: 200,
  visualEffectClass: 13,
  interactId: 307, // basic reaction band (func_632)
  knockbackType: 2,
};

const HARD_KNOCKDOWN: TypedParamEntry = {
  entryId: 0x6c81990f,
  damage: 150,
  downValue: 1000,
  interactId: 201, // basic reaction, but downValue alone forces knockdown
  knockbackType: 2,
};

describe("knockbackWeight", () => {
  test("maps the engine switch cases and falls through to 100", () => {
    expect(knockbackWeight(0)).toBe(0);
    expect(knockbackWeight(3)).toBe(1000);
    expect(knockbackWeight(4)).toBe(10);
    expect(knockbackWeight(99)).toBe(100);
  });
});

describe("isTimedStateReaction", () => {
  test("covers the 400-410 family", () => {
    expect(isTimedStateReaction(400)).toBe(true);
    expect(isTimedStateReaction(407)).toBe(true);
    expect(isTimedStateReaction(410)).toBe(true);
    expect(isTimedStateReaction(399)).toBe(false);
    expect(isTimedStateReaction(500)).toBe(false);
  });
});

describe("classifyHitEffect", () => {
  test("reaction id 500 is a grab, attacker-hold-dependent", () => {
    const c = classifyHitEffect(WRAP);
    expect(c.category).toBe("grab");
    expect(c.basis).toBe("reaction-id");
    expect(c.automataDependent).toBe(true);
    expect(c.notes.join(" ")).toMatch(/func_634|hold/);
  });

  test("reaction id 407 is an electric stun, pure data with a duration", () => {
    const c = classifyHitEffect(STUN);
    expect(c.category).toBe("stun");
    expect(c.automataDependent).toBe(false);
    const durationFact = c.facts.find((f) => f.key === "untechableFrame");
    expect(durationFact?.value).toMatch(/80/);
    expect(c.notes.join(" ")).toMatch(/407|state 0x16/);
  });

  test("reaction id 1 is a neutral follow-up tick (electric while grabbed)", () => {
    const c = classifyHitEffect(ELECTRIC_TICK, false);
    expect(c.category).toBe("neutral-followup");
    expect(c.notes.join(" ")).toMatch(/neutral|follow-up/);
  });

  test("timed-state sibling (e.g. 401) is surfaced but not forced into stun", () => {
    const c = classifyHitEffect({ entryId: 1, damage: 60, downValue: 0, interactId: 401 });
    expect(c.category).toBe("timed-state");
  });

  test("downValue at or above budget forces knockdown even with a basic reaction id", () => {
    const c = classifyHitEffect(HARD_KNOCKDOWN);
    expect(c.category).toBe("forced-knockdown");
    expect(HARD_KNOCKDOWN.downValue).toBeGreaterThanOrEqual(KNOCKDOWN_BUDGET);
  });

  test("knockbackType 3 forces knockdown below the one-hit budget", () => {
    const c = classifyHitEffect({ entryId: 1, damage: 50, downValue: 100, interactId: 305, knockbackType: 3 });
    expect(c.category).toBe("forced-knockdown");
    expect(c.notes.join(" ")).toMatch(/1000|strongest/);
  });

  test("ordinary melee hit with a basic reaction is normal", () => {
    const c = classifyHitEffect(NORMAL_SLASH, true);
    expect(c.category).toBe("normal-hit");
    expect(c.automataDependent).toBe(false);
  });

  test("always reports damage, downValue and the reaction id as proven facts", () => {
    const c = classifyHitEffect(STUN);
    const keys = c.facts.map((f) => f.key);
    expect(keys).toContain("damage");
    expect(keys).toContain("downValue");
    expect(keys).toContain("interactId");
  });
});
