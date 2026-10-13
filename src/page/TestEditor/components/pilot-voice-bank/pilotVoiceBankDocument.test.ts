import { describe, expect, it } from "vitest";
import {
  applySyncReport,
  dirtyCueNames,
  secondsFromSamples,
  type PilotVoiceCue,
  type SyncReport,
} from "./pilotVoiceBankDocument";

function cue(name: string, nSamples: number): PilotVoiceCue {
  return {
    name,
    nSamples,
    loopStart: 0,
    loopEnd: 0,
    loopFlag: 0,
    hasClock: true,
    seconds: nSamples / 48000,
  };
}

describe("pilotVoiceBankDocument", () => {
  it("rounds 47824 samples to one decimal second", () => {
    expect(secondsFromSamples(47824)).toBe("1.0");
  });

  it("applySyncReport replaces n_samples only for updated rows", () => {
    const cues = [cue("Alpha", 100), cue("Beta", 200)];
    const report: SyncReport = {
      updated: [{ name: "Alpha", oldNSamples: 100, newNSamples: 300, note: null }],
      unchanged: [],
      bankOnly: ["Beta"],
      audioOnly: ["gamma"],
      skipped: [],
    };
    const next = applySyncReport(cues, report);
    expect(next[0].nSamples).toBe(300);
    expect(next[1].nSamples).toBe(200);
    expect(next[1].loopFlag).toBe(0);
  });

  it("marks a row dirty when n_samples differs from the loaded document", () => {
    const loaded = [cue("Alpha", 100), cue("Beta", 200)];
    const current = [cue("Alpha", 300), cue("Beta", 200)];
    expect(dirtyCueNames(current, loaded)).toEqual(["Alpha"]);
  });
});
