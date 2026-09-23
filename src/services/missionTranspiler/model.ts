import { boundedInteger as integer, MissionError } from "./missionErrors";
import { MISSION_C_TEMPLATE } from "./template";
import type { MissionModel } from "./types";

export const INTRO_ACTIONS = ["hold", "run_forward", "fly_forward", "hop", "flip"] as const;
export const WIN_RULES = ["enemy_cost_exhausted", "targets_destroyed", "survive_time_limit", "any_target_destroyed"];
export const LOSE_RULES = ["player_cost_exhausted", "important_units_lost", "time_up"];
export const NAMED_PARAMS = new Set([0, 2, 3, 5, 7, 8, 13, 16, 17, 20, 21, 34, 35, 36, 37, 38, 39]);
export const TEMPLATE_SLOTS: readonly (readonly number[])[] = [...MISSION_C_TEMPLATE.matchAll(/sys_0\(0x400, ([^;]+)\);/g)]
  .map((match) => match[1].split(",").map((word) => Number(word.trim())));

const fail = (message: string): never => {
  throw new MissionError(message);
};

/** Cross-field and reference validation shared by C import and graph export. */
export function validateMission(model: MissionModel): string[] {
  const { battle: b, slots, phases, opening } = model;
  const warnings: string[] = [];
  if (!b.win || !b.lose || b.win > 15 || b.lose > 7) fail("Unsupported or empty win/lose flags");
  if ((b.win & 2) && b.targetCount < 1) fail("targets_destroyed requires target_count > 0");
  if ((b.lose & 2) && b.allowedLosses < 1) fail("important_units_lost requires allowed_losses > 0");
  if ((b.win & 4) && (b.lose & 4)) fail("survive_time_limit conflicts with time_up");
  if (new Set(b.teamCosts.map((c) => c.team)).size !== b.teamCosts.length) fail("Duplicate team costs");
  for (const c of b.teamCosts) {
    integer(c.team, "team", 0, 5);
    integer(c.cost, "cost", 0, 0x7fffffff);
  }
  if (!(b.teamCosts.find((c) => c.team === 0)?.cost)) fail("Player team cost must be positive");
  if (!slots.length || slots.length > 256 || new Set(slots.map((p) => p[0])).size !== slots.length) {
    fail("Invalid or duplicate slot definitions");
  }
  for (const p of slots) {
    if (p.length !== 51) fail(`Slot ${p[0]}: expected exactly 51 parameters`);
    p.forEach((word, i) => integer(word, `slot ${p[0]}.p${i}`));
    integer(p[0], "slot", 0, 255);
    integer(p[2], "unit_id", 1);
    integer(p[3], "team", 0, 1);
    for (const i of [5, 7, 33]) integer(p[i], `p${i}`, 0, 1);
    for (const i of [16, 17, 21]) integer(p[i], `level class p${i}`, 0, 9);
    integer(p[13], "briefing index", 0, 3);
    integer(p[20], "AI profile", 0, 23);
    if (p[20] === 10) fail("AI profile 10 is not supported by this schema");
    integer(p[37], "intro action", 0, 4);
    integer(p[38] | 0, "facing", -360, 360);
    integer(p[39], "intro frames", 0, 0x7fffffff);
    if (p[3] === 0 && p[0] > 1) fail("Only player slot 0 and partner slot 1 may use the player team");
    if (p[33]) {
      warnings.push(`Slot ${p[0]} uses external coordinates (P33); its authored position can be overridden by the game.`);
    }
  }
  if (!slots.some((p) => p[0] === 0 && p[3] === 0 && p[5] === 0)) fail("Player slot 0 is required");
  if (slots.filter((p) => p[5]).length !== 1 || !slots.some((p) => p[0] === 1 && p[3] === 0 && p[5] === 1)) {
    fail("Exactly one CPU partner in slot 1 is required");
  }
  if (phases.length > 256) fail("At most 256 phases are supported");
  const slot = (id: number) => slots.find((p) => p[0] === id) ?? fail(`Unknown slot ${id}`);
  const deployed = new Set<number>();
  function deploy(id: number) {
    if (slot(id)[3] === 0) fail(`Player-team slot ${id} cannot be deployed by the script`);
    if (deployed.has(id)) fail(`Slot ${id} is deployed more than once`);
    deployed.add(id);
  }
  opening.forEach(deploy);
  let upperBound = opening.length;
  if (upperBound > 12) warnings.push("Opening exceeds the 12-enemy on-field budget");
  phases.forEach((p, index) => {
    integer(p.delaySeconds, "delay_seconds", 1, Math.floor(0x7fffffff / 60));
    if (p.trigger.kind === "slot_hp_percent_at_most") {
      slot(p.trigger.slot);
      integer(p.trigger.value, "HP percent", 0, 100);
    } else {
      integer(p.trigger.value, "trigger", 0, p.trigger.kind === "enemies_alive_at_most" ? 12 : 0x7fffffff);
    }
    if (p.trigger.kind === "enemies_alive_at_most") upperBound = Math.min(upperBound, p.trigger.value);
    for (const a of p.actions) {
      if (a.op === "deploy") {
        deploy(a.slot);
        upperBound++;
      }
      if (a.op === "message") slot(a.slot);
      if (a.op === "raw_sys") {
        if ([0x601, 0x604, 0x802, 0x803].includes(a.command)) {
          fail(`Phase ${index}: sys_0(0x${a.command.toString(16)}) is runtime-owned; author blackboard and coroutine changes are not supported`);
        }
        if (a.args.length > 51) fail("raw_sys supports at most 51 arguments");
        warnings.push(`Phase ${index}: raw_sys ${a.command.toString(16)} has unverified runtime effects.`);
      }
    }
    if (upperBound > 12) {
      warnings.push(`Phase ${index}: on-field budget may exceed 12 enemies; use an enemies_alive_at_most gate`);
    }
  });
  const unused = slots.filter((p) => p[3] === 1 && !deployed.has(p[0]));
  if (unused.length) {
    warnings.push(`Defined but never deployed: ${unused.map((p) => p[0]).join(", ")}. These units are still preloaded.`);
  }
  if (b.win & 8) warnings.push("any_target_destroyed uses the template's sys_0(0x349) path; OB returns zero for that query.");
  warnings.push("Source-level review only. Map, unit, BGM, message and briefing references still require target assets and an in-game test.");
  return warnings;
}
