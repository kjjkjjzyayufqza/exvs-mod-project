import { describe, expect, it } from "vitest";
import { crc32IeeeUint32 } from "@/utils/crc32Ieee";
import {
  appendCue,
  cueIdFromCueName,
  removeCue,
  replaceCueId,
  type VoiceOrderCue,
  type VoiceOrderSituation,
} from "./voiceOrderTableDocument";

const cues: VoiceOrderCue[] = [
  { cueId: 1, flags: 0 },
  { cueId: 2, flags: 4 },
];

function situation(): VoiceOrderSituation {
  return {
    situationId: 0x4c9a9d5b,
    volumePercent: 100,
    param50: 50,
    param100: 100,
    gapBeforeVolume: [0, 0, 0, 0, 0, 0, 0, 0],
    gapBeforeCues: new Array(0x18).fill(0),
    cues,
  };
}

describe("voice order cue edits", () => {
  it("hashes a typed cue name in uppercase", () => {
    expect(cueIdFromCueName("  vo_01_p01_chara_select_01  ")).toBe(0xca143fc8);
    expect(cueIdFromCueName("  vo_01_p01_chara_select_01  ")).toBe(
      crc32IeeeUint32("VO_01_P01_CHARA_SELECT_01"),
    );
    expect(cueIdFromCueName("   ")).toBeNull();
  });

  it("replaces one cue id and leaves the others", () => {
    expect(replaceCueId(cues, 1, 0xca143fc8)).toEqual([
      { cueId: 1, flags: 0 },
      { cueId: 0xca143fc8, flags: 4 },
    ]);
  });

  it("appends an empty cue and can remove it", () => {
    const added = appendCue(situation());
    expect(added.cues).toEqual([...cues, { cueId: 0, flags: 0 }]);
    expect(added.situationId).toBe(situation().situationId);
    expect(removeCue(added, 2).cues).toEqual(cues);
  });
});
