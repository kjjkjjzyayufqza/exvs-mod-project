/**
 * Delta Kai TDD: body right hand (TE_R) hosts beam rifle (GBL_RT).
 *
 * Real assets (required when present; fail-closed if missing):
 *   E:\XB\mod\002chara\026gnbelt_003delatkai_001\models\…body_normal…
 *   E:\XB\mod\002chara\026gnbelt_003delatkai_001\models\…wep_brifle00…
 *
 * MSC 2.c is external context only — this suite proves the preview attachment
 * pipeline the viewport consumes (bind → edge → resolve + matrix composition).
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildAttachmentTemplate,
  composeGuestAttachRootMatrix,
  createAttachmentEdgeId,
  mat4FromTranslation,
  mat4Translation,
  preferBoneIndex,
  resolveAttachmentTemplate,
} from "./attachmentTemplateService";

const PACK_ROOT = "E:\\XB\\mod\\002chara\\026gnbelt_003delatkai_001";
const BODY_NUSKTB = path.join(
  PACK_ROOT,
  "models",
  "015gndmuc_004deltpl_001_body_normal",
  "026gnbelt_003delatkai_001.nusktb",
);
const BODY_NUMDLB = path.join(
  PACK_ROOT,
  "models",
  "015gndmuc_004deltpl_001_body_normal",
  "026gnbelt_003delatkai_001.numdlb",
);
const BRIFLE_NUSKTB = path.join(
  PACK_ROOT,
  "models",
  "015gndmuc_004deltpl_001_wep_brifle00",
  "015gndmuc_004deltpl_001_wep_brifle00__maya__.nusktb",
);
const BRIFLE_NUMDLB = path.join(
  PACK_ROOT,
  "models",
  "015gndmuc_004deltpl_001_wep_brifle00",
  "015gndmuc_004deltpl_001_wep_brifle00.numdlb",
);

const HOST_BONE = "TE_R";
const GUEST_BONE = "GBL_RT";
/** Manual modelId bindings (8-hex only); product does not auto-hash names. */
const BODY_MODEL_ID = "d317a0bd";
const BRIFLE_MODEL_ID = "b21f1e00";

const EXVS2_JSON_CANDIDATES = [
  path.resolve(process.cwd(), "src-tauri/target/debug/exvs2_json.exe"),
  path.resolve(process.cwd(), "src-tauri/target/debug/exvs2_json"),
  path.resolve(process.cwd(), "../src-tauri/target/debug/exvs2_json.exe"),
];

function requireRealPack(): void {
  const missing = [PACK_ROOT, BODY_NUSKTB, BODY_NUMDLB, BRIFLE_NUSKTB, BRIFLE_NUMDLB].filter(
    (p) => !fs.existsSync(p),
  );
  if (missing.length > 0) {
    throw new Error(
      `Delta Kai real assets missing (fail-closed; not a silent pass):\n${missing.join("\n")}`,
    );
  }
}

function resolveExvs2JsonExe(): string {
  for (const candidate of EXVS2_JSON_CANDIDATES) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error(
    `exvs2_json debug binary not found (build with: cargo build --bin exvs2_json). Tried:\n${EXVS2_JSON_CANDIDATES.join("\n")}`,
  );
}

/** Drive the real exvs2_json inspect path against an on-disk .nusktb (shipped CLI). */
function readNusktbBoneNamesFromDisk(nusktbPath: string): string[] {
  const exe = resolveExvs2JsonExe();
  const stdout = execFileSync(exe, ["inspect", nusktbPath, "--summary", "--pretty"], {
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
  const parsed = JSON.parse(stdout) as {
    data?: { boneNames?: unknown };
  };
  const names = parsed.data?.boneNames;
  if (!Array.isArray(names) || names.length === 0) {
    throw new Error(`exvs2_json inspect returned no boneNames for ${nusktbPath}`);
  }
  return names.map((name) => {
    if (typeof name !== "string" || !name.trim()) {
      throw new Error(`Invalid bone name entry in ${nusktbPath}`);
    }
    return name;
  });
}

describe("Delta Kai attachment TDD (real pack)", () => {
  it("requires real body + brifle assets on disk (fail-closed)", () => {
    requireRealPack();
    expect(fs.existsSync(BODY_NUSKTB)).toBe(true);
    expect(fs.existsSync(BRIFLE_NUSKTB)).toBe(true);
  });

  it("body nusktb includes TE_R (right hand) and brifle includes GBL_RT", () => {
    requireRealPack();
    const bodyBones = readNusktbBoneNamesFromDisk(BODY_NUSKTB);
    const brifleBones = readNusktbBoneNamesFromDisk(BRIFLE_NUSKTB);

    expect(bodyBones).toContain(HOST_BONE);
    expect(bodyBones).toContain("ATH_TE_R"); // helper exists but attach host must be TE_R
    expect(bodyBones).not.toContain("Hand_R");
    expect(brifleBones).toContain(GUEST_BONE);

    // preferBoneIndex must resolve TE_R by name (not default index 0 = GBL_RT).
    expect(bodyBones[preferBoneIndex(bodyBones, HOST_BONE)]).toBe(HOST_BONE);
    expect(preferBoneIndex(bodyBones, HOST_BONE)).not.toBe(preferBoneIndex(bodyBones));
  });

  it("builds and resolves body TE_R → brifle GBL_RT for the shipped template path", () => {
    requireRealPack();
    const bodyBones = readNusktbBoneNamesFromDisk(BODY_NUSKTB);
    const brifleBones = readNusktbBoneNamesFromDisk(BRIFLE_NUSKTB);
    expect(bodyBones).toContain(HOST_BONE);
    expect(brifleBones).toContain(GUEST_BONE);

    const template = buildAttachmentTemplate({
      name: "DeltaKai body+brifle TE_R",
      description: "TDD fixture: right hand hosts beam rifle",
      bindings: [
        {
          modelId: BODY_MODEL_ID,
          ref: { kind: "numdlbPath", path: BODY_NUMDLB },
          role: "body",
          displayName: "026gnbelt_003delatkai_001",
        },
        {
          modelId: BRIFLE_MODEL_ID,
          ref: { kind: "numdlbPath", path: BRIFLE_NUMDLB },
          role: "weapon",
          displayName: "wep_brifle00",
        },
      ],
      edges: [
        {
          id: createAttachmentEdgeId(),
          hostModelId: BODY_MODEL_ID,
          hostBoneName: HOST_BONE,
          guestModelId: BRIFLE_MODEL_ID,
          guestBoneName: GUEST_BONE,
          enabled: true,
        },
      ],
      primaryModelId: BODY_MODEL_ID,
    });

    const instanceByModelId = new Map([
      [BODY_MODEL_ID, "inst-body"],
      [BRIFLE_MODEL_ID, "inst-brifle"],
    ]);
    const boneNamesByInstanceId = new Map<string, readonly string[]>([
      ["inst-body", bodyBones],
      ["inst-brifle", brifleBones],
    ]);

    const resolved = resolveAttachmentTemplate({
      template,
      instanceByModelId,
      boneNamesByInstanceId,
    });

    expect(resolved.errors).toEqual([]);
    expect(resolved.primaryInstanceId).toBe("inst-body");
    expect(resolved.attachments).toHaveLength(1);
    expect(resolved.attachments[0]).toMatchObject({
      parentInstanceId: "inst-body",
      parentBoneName: HOST_BONE,
      childInstanceId: "inst-brifle",
      childBoneName: GUEST_BONE,
    });
    // Viewport consumes these exact fields (PreviewModelAttachment).
    expect(resolved.attachments[0]!.parentBoneName).not.toBe("Hand_R");
    expect(resolved.attachments[0]!.parentBoneName).not.toBe("ATH_TE_R");
  });

  it("composeGuestAttachRootMatrix glues guest bone origin to host bone origin", () => {
    // Representative numeric case (column-major translations only).
    // Host TE_R world at (10, 20, 30); guest GBL_RT currently at (1, 2, 3) relative to guest root identity.
    // After composition, applying guestRoot to guestBoneWorld should place guest bone at host translation.
    const hostBoneWorld = mat4FromTranslation(10, 20, 30);
    const guestBoneWorld = mat4FromTranslation(1, 2, 3);
    const guestRoot = composeGuestAttachRootMatrix(hostBoneWorld, guestBoneWorld);

    // guestRoot × guestBoneWorld ≈ hostBoneWorld (within float noise)
    // Multiply guestRoot * guestBoneWorld
    const composed = (() => {
      const a = guestRoot;
      const b = guestBoneWorld;
      const out = new Array<number>(16);
      for (let col = 0; col < 4; col += 1) {
        for (let row = 0; row < 4; row += 1) {
          out[col * 4 + row] =
            a[0 * 4 + row]! * b[col * 4 + 0]! +
            a[1 * 4 + row]! * b[col * 4 + 1]! +
            a[2 * 4 + row]! * b[col * 4 + 2]! +
            a[3 * 4 + row]! * b[col * 4 + 3]!;
        }
      }
      return out;
    })();

    const [tx, ty, tz] = mat4Translation(composed);
    expect(tx).toBeCloseTo(10, 5);
    expect(ty).toBeCloseTo(20, 5);
    expect(tz).toBeCloseTo(30, 5);

    // Guest root translation should be host − guest bone local offset when both are pure T.
    const [rx, ry, rz] = mat4Translation(guestRoot);
    expect(rx).toBeCloseTo(9, 5);
    expect(ry).toBeCloseTo(18, 5);
    expect(rz).toBeCloseTo(27, 5);
  });
});
