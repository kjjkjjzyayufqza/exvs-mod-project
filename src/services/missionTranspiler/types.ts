export type Trigger =
  | { kind: "enemies_alive_at_most"; value: number }
  | { kind: "elapsed_frames_at_least"; value: number }
  | { kind: "slot_hp_percent_at_most"; slot: number; value: number };

export type MissionAction =
  | { op: "deploy"; slot: number }
  | { op: "message"; slot: number; messageHash: number }
  | { op: "bgm"; bgm: number }
  | { op: "raw_sys"; command: number; args: number[] };

export interface MissionPhase {
  trigger: Trigger;
  delaySeconds: number;
  actions: MissionAction[];
}

export interface MissionModel {
  battle: {
    map: number;
    teamCosts: { team: number; cost: number }[];
    win: number;
    lose: number;
    targetCount: number;
    allowedLosses: number;
    bgm: number;
  };
  /** Complete P0..P50 words, including unknown fields and signed bit patterns. */
  slots: number[][];
  opening: number[];
  phases: MissionPhase[];
}

