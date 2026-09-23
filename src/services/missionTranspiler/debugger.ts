import type { MissionAction, MissionModel } from "./types";

export interface DebugInputs { enemiesAlive: number; elapsedFrames: number; hpPercent: Record<number, number> }
export interface DebugState { phase: number; counter: number; ticks: number; log: string[] }
export const initialDebugState = (): DebugState => ({ phase: 0, counter: 0, ticks: 0, log: [] });

export function describeAction(a: MissionAction): string {
  if (a.op === "deploy") return `deploy slot ${a.slot}`;
  if (a.op === "message") return `message 0x${a.messageHash.toString(16)} on slot ${a.slot}`;
  if (a.op === "bgm") return `BGM 0x${a.bgm.toString(16)}`;
  return `raw_sys 0x${a.command.toString(16)} (not simulated)`;
}

/** Simulate phase bookkeeping only. Syscall values are supplied by the user. */
export function stepMission(model: MissionModel, state: DebugState, inputs: DebugInputs, frames = 1): DebugState {
  if (!Number.isInteger(frames) || frames < 1 || frames > 600) throw new Error("Step must be 1..600 frames");
  const next: DebugState = { ...state, log: [...state.log] };
  for (let frame = 0; frame < frames; frame++) {
    next.ticks++;
    const p = model.phases[next.phase];
    if (!p) break;
    const t = p.trigger;
    const holds = t.kind === "enemies_alive_at_most" ? inputs.enemiesAlive <= t.value
      : t.kind === "elapsed_frames_at_least" ? inputs.elapsedFrames + frame >= t.value
      : inputs.hpPercent[t.slot] !== undefined && inputs.hpPercent[t.slot] <= t.value;
    if (!holds) continue;
    // Model the mission countdown, not C-language postfix semantics. The MSC
    // compiler lowers both spellings of decrement to opcode 0x15. This UI is
    // a phase simulator, not an emulator or proof of native opcode behaviour.
    if (next.counter === 0) next.counter = p.delaySeconds * 60;
    else if (next.counter >= -1) {
      next.counter--;
      if (next.counter === 0) next.counter = -1;
    }
    if (next.counter === -1) {
      next.log.push(`Tick ${next.ticks}: phase ${next.phase}: ${p.actions.map(describeAction).join("; ") || "advance"}`);
      next.phase++;
      next.counter = 0;
      // Deploy blocks in the template. Stop here so the caller can supply the
      // post-entrance syscall values before another phase is evaluated.
      break;
    }
  }
  return next;
}
