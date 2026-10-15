import { describe, expect, it } from "vitest";
import { crc32IeeeUint32 } from "@/utils/crc32Ieee";
import {
  audioFileNameOk,
  audioFileStem,
  bankPackageForNewStem,
  bankPackageForOriginName,
  createVoiceDraft,
  missingVoicePackages,
  pilotVoiceStemFromPathKey,
  planNewVoiceBankPack,
  planNewVoiceOrderPack,
  planVoiceBankWorkspace,
  planVoiceOrderWorkspace,
  streamPathIdForStem,
  voiceKeyForStem,
  voiceOrderFileName,
  voiceSaveRepackHashes,
  voiceStemForKey,
  votPackageForStem,
  votStepStatus,
} from "./soundChainModel";

describe("sound chain model", () => {
  it("reads a pilot voice stem out of a stream path key", () => {
    expect(pilotVoiceStemFromPathKey("STREAMPATH_ST_VO_1000_P01_0")).toBe("VO_1000_P01_0");
    expect(pilotVoiceStemFromPathKey("streampath_st_vo_0001_n02_3")).toBe("VO_0001_N02_3");
    expect(pilotVoiceStemFromPathKey("STREAMPATH_BGM_MENU")).toBeNull();
  });

  it("reverses a known voice stem hash", () => {
    const stem = "VO_1000_P01_0";
    expect(voiceStemForKey(crc32IeeeUint32(stem))).toBe(stem);
    expect(voiceStemForKey(0)).toBeNull();
    expect(voiceStemForKey(1)).toBeNull();
  });

  it("derives VO_1001 hashes the same way as CRC-32/IEEE", () => {
    expect(voiceKeyForStem("VO_1001_P01_0")).toBe(0x26c008da);
    expect(streamPathIdForStem("vo_1001_p01_0")).toBe(0xce158c18);
    expect(bankPackageForNewStem("VO_1001_P01_0")).toBe(crc32IeeeUint32("VO_1001_P01_0_bank"));
    expect(bankPackageForNewStem("VO_1001_P01_0")).toBe(0xd1c59512);
    expect(bankPackageForOriginName("VO_1001_P01_0_01_ST_01")).toBe(0x04ef8d7a);
  });

  it("accepts only a voice-stem nus3audio file name", () => {
    expect(audioFileNameOk("VO_1000_P01_0.nus3audio")).toBe(true);
    expect(audioFileStem("VO_1000_P01_0.nus3audio")).toBe("VO_1000_P01_0");
    expect(audioFileNameOk("abcd.nus3audio")).toBe(false);
    expect(audioFileStem("C:/voices/vo_1001_p01_0.nus3audio")).toBe("VO_1001_P01_0");
    expect(
      audioFileStem(
        "E:/OBHK0.3_v27/data/x64/091waveform/voice/pilot/vo_1000/VO_1001_P01_0_01_ST_01.nus3audio",
      ),
    ).toBe("VO_1001_P01_0");
    expect(audioFileStem("abcd.nus3audio")).toBeNull();
    expect(audioFileStem("VO 1001.nus3audio")).toBeNull();
    expect(audioFileStem("VO_1001_P01_0 .nus3audio")).toBeNull();
    expect(audioFileStem("語音.nus3audio")).toBeNull();
    expect(audioFileStem("VO_1001_P01_0.wav")).toBeNull();
  });

  it("fills bankPackage from the picked file name", () => {
    const draft = createVoiceDraft(
      "VO_1001_P01_0",
      "E:/voice/VO_1001_P01_0_01_ST_01.nus3audio",
    );
    expect(draft.bankMode).toBe("new");
    expect(draft.originName).toBe("VO_1001_P01_0_01_ST_01");
    expect(draft.bankPackage).toBe(0x04ef8d7a);
    expect(draft.votPackage).toBe(votPackageForStem("VO_1001_P01_0"));
    expect(draft.donorVotPackage).toBe(0);
    expect(draft.donorStem).toBe("");
    expect(draft.saved).toBe(false);
    expect(draft.source).toBe(
      "091waveform/voice/pilot/vo_1001/VO_1001_P01_0_01_ST_01.nus3audio",
    );
  });

  it("lists repack hashes without the character list", () => {
    expect(voiceSaveRepackHashes(false)).toEqual(["0x8C428AF2"]);
    expect(voiceSaveRepackHashes(true)).toEqual(["0x8C428AF2", "0x264D1CA7"]);
    expect(voiceSaveRepackHashes(true, ["0xAABBCCDD", "0x8C428AF2"])).toEqual([
      "0x8C428AF2",
      "0x264D1CA7",
      "0xAABBCCDD",
    ]);
  });

  it("plans a new vot pack from the stem and a bank pack from the file name", () => {
    expect(votPackageForStem("VO_1001_P01_0")).toBe(crc32IeeeUint32("VO_1001_P01_0_vot"));
    expect(voiceOrderFileName("VO_1001_P01_0")).toBe("vo_1001_p01_0_01.vot");
    const vot = planNewVoiceOrderPack("E:/workspace", "VO_1001_P01_0");
    expect(vot.prefix).toBe("090sound/vot");
    expect(vot.routeId).toBe("unit.sound");
    expect(vot.innerName).toBe("0.vot");
    expect(vot.filePath).toBe(`E:/workspace/090sound/vot/${vot.hashHex}/0.vot`);
    expect(vot.structurePath).toBe(`E:/workspace/090sound/vot/${vot.hashHex}_structure.json`);
    expect(planVoiceOrderWorkspace("E:/workspace", 0x48b99707).filePath).toBe(
      "E:/workspace/090sound/vot/0x48B99707/0.vot",
    );
    const bank = planNewVoiceBankPack("E:\\workspace", "VO_1001_P01_0_01_ST_01");
    expect(bank.packageId).toBe(0x04ef8d7a);
    expect(bank.hashHex).toBe("0x04EF8D7A");
    expect(bank.prefix).toBe("091waveform/voice/pilot");
    expect(bank.folderPath).toBe("E:\\workspace\\091waveform\\voice\\pilot\\VO_1001_P01_0");
    expect(bank.filePath).toBe(
      "E:\\workspace\\091waveform\\voice\\pilot\\VO_1001_P01_0\\vo_1001_p01_0_01_st_01.nus3bank",
    );
    expect(bank.structurePath).toBe(
      "E:\\workspace\\091waveform\\voice\\pilot\\VO_1001_P01_0_structure.json",
    );
    expect(planVoiceBankWorkspace("E:/workspace", 0x04ef8d7a).folderPath).toBe(
      "E:/workspace/091waveform/voice/pilot/0x04EF8D7A",
    );
  });

  it("lists package ids that are still zero", () => {
    expect(
      missingVoicePackages({ votPackage: 0, dummyPackage: 0x147bc38e, bankPackage: 0 }),
    ).toEqual(["votPackage", "bankPackage"]);
  });

  it("describes the vot step from the saved slot row", () => {
    expect(votStepStatus({ previewPackage: 0 })).toEqual({ kind: "needPackage" });
    expect(votStepStatus({ previewPackage: 0x48b99707 })).toEqual({ kind: "hash", hash: 0x48b99707 });
    expect(votStepStatus({ slotTableMissing: true, votPackage: 0x48b99707 })).toEqual({ kind: "tableMissing" });
    expect(votStepStatus({ slotFound: false, votPackage: 0 })).toEqual({ kind: "unregistered" });
    expect(votStepStatus({ slotFound: true, votPackage: 0 })).toEqual({ kind: "needPackage" });
    expect(
      votStepStatus({
        slotFound: true,
        votPackage: 0x48b99707,
        votPackExists: false,
        votPackPath: "E:/dpl/0x48B99707.fhm2d",
      }),
    ).toEqual({ kind: "fileMissing" });
    expect(
      votStepStatus({
        slotFound: true,
        votPackage: 0x48b99707,
        votPackExists: true,
        votPackPath: "E:/dpl/0x48B99707.fhm2d",
      }),
    ).toEqual({ kind: "packFile", fileName: "0x48B99707.fhm2d" });
  });
});
