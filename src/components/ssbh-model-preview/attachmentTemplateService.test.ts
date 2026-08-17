import { describe, expect, it } from "vitest";
import {
  buildAttachmentTemplate,
  buildMotionPlayPlanFromNode,
  collectRequiredModelIds,
  composeBoneLocalChainMatrix,
  composeGuestAttachRootMatrix,
  createAttachmentEdgeId,
  guestAttachBoneRelativeToRoot,
  hasAttachmentCycle,
  mat4FromTranslation,
  mat4Translation,
  normalizeModelId,
  preferBoneIndex,
  resolveAttachmentTemplate,
  validateAttachmentTemplate,
} from "./attachmentTemplateService";

describe("attachmentTemplateService", () => {
  it("normalizes model ids and prefers GBL_RT when no name is given", () => {
    expect(normalizeModelId("0xAABBCCDD")).toBe("aabbccdd");
    expect(preferBoneIndex(["ROOT", "GBL_RT", "Hand_L"])).toBe(1);
    expect(preferBoneIndex(["ROOT", "GBL_RT", "Hand_L"], "Hand_L")).toBe(2);
  });

  it("detects attachment cycles", () => {
    const graph = new Map<string, string[]>([
      ["a", ["b"]],
      ["b", ["c"]],
      ["c", ["a"]],
    ]);
    expect(hasAttachmentCycle(graph)).toBe(true);
    expect(hasAttachmentCycle(new Map([["a", ["b"]], ["b", ["c"]]]))).toBe(false);
  });

  it("builds and validates a template", () => {
    const template = buildAttachmentTemplate({
      name: "Gyan body+shield",
      bindings: [
        { modelId: "43309cab", ref: { kind: "unitModelLabel", label: "body" }, role: "body" },
        { modelId: "59990c22", ref: { kind: "unitModelLabel", label: "shield" }, role: "weapon" },
      ],
      edges: [
        {
          id: createAttachmentEdgeId(),
          hostModelId: "43309cab",
          hostBoneName: "Hand_L",
          guestModelId: "59990c22",
          guestBoneName: "GBL_RT",
          enabled: true,
        },
      ],
      primaryModelId: "43309cab",
    });
    expect(validateAttachmentTemplate(template)).toEqual([]);
    expect(template.bindings).toHaveLength(2);
  });

  it("rejects self-attach and missing bindings", () => {
    expect(() =>
      buildAttachmentTemplate({
        name: "bad",
        bindings: [{ modelId: "43309cab", ref: { kind: "previewSlot", slot: 0 } }],
        edges: [
          {
            id: "e1",
            hostModelId: "43309cab",
            hostBoneName: "Hand_L",
            guestModelId: "43309cab",
            guestBoneName: "GBL_RT",
            enabled: true,
          },
        ],
      }),
    ).toThrow(/same host and guest/);
  });

  it("resolves template edges to instance attachments", () => {
    const template = buildAttachmentTemplate({
      name: "resolve-me",
      bindings: [
        { modelId: "11111111", ref: { kind: "previewSlot", slot: 0 } },
        { modelId: "22222222", ref: { kind: "previewSlot", slot: 1 } },
      ],
      edges: [
        {
          id: "e1",
          hostModelId: "11111111",
          hostBoneName: "Hand_R",
          guestModelId: "22222222",
          guestBoneName: "GBL_RT",
          enabled: true,
        },
      ],
      primaryModelId: "11111111",
    });
    const result = resolveAttachmentTemplate({
      template,
      instanceByModelId: new Map([
        ["11111111", "inst-body"],
        ["22222222", "inst-weapon"],
      ]),
      boneNamesByInstanceId: new Map([
        ["inst-body", ["GBL_RT", "Hand_R"]],
        ["inst-weapon", ["GBL_RT", "BASE"]],
      ]),
    });
    expect(result.errors).toEqual([]);
    expect(result.primaryInstanceId).toBe("inst-body");
    expect(result.attachments).toEqual([
      {
        id: "e1",
        parentInstanceId: "inst-body",
        parentBoneName: "Hand_R",
        childInstanceId: "inst-weapon",
        childBoneName: "GBL_RT",
      },
    ]);
  });

  it("builds single and folder motion play plans", () => {
    const single = buildMotionPlayPlanFromNode({
      kind: "item",
      unk1: "0F1FC213",
      unk2: "00000000",
      name: "idle",
      filePath: "E:\\m\\idle.nuanmb",
    });
    expect(single).toEqual({
      kind: "single",
      actionId: "0f1fc213",
      nuanmbPath: "E:\\m\\idle.nuanmb",
      name: "idle",
    });
    expect(collectRequiredModelIds(single)).toEqual([]);

    const bundle = buildMotionPlayPlanFromNode({
      kind: "folder",
      unk1: "0f1fc213",
      children: [
        {
          kind: "item",
          unk1: "00000000",
          unk2: "43309cab",
          name: "body",
          filePath: "E:\\m\\body.nuanmb",
        },
        {
          kind: "item",
          unk1: "00000000",
          unk2: "59990c22",
          name: "weapon",
          filePath: "E:\\m\\weapon.nuanmb",
        },
      ],
    });
    expect(bundle.kind).toBe("bundle");
    if (bundle.kind === "bundle") {
      expect(bundle.actionId).toBe("0f1fc213");
      expect(bundle.clips).toHaveLength(2);
      expect(collectRequiredModelIds(bundle)).toEqual(["43309cab", "59990c22"]);
    }
  });

  it("rejects folder clips with zero model id", () => {
    expect(() =>
      buildMotionPlayPlanFromNode({
        kind: "folder",
        unk1: "0f1fc213",
        children: [
          {
            kind: "item",
            unk1: "00000000",
            unk2: "00000000",
            name: "bad",
            filePath: "E:\\m\\bad.nuanmb",
          },
        ],
      }),
    ).toThrow(/00000000/);
  });

  it("composeBoneLocalChainMatrix multiplies root→leaf locals", () => {
    const locals = new Map<string, number[]>([
      ["root", mat4FromTranslation(1, 0, 0)],
      ["hand", mat4FromTranslation(0, 2, 0)],
    ]);
    const parents = new Map<string, string | null>([
      ["hand", "root"],
      ["root", null],
    ]);
    const m = composeBoneLocalChainMatrix(
      "hand",
      (id) => parents.get(id) ?? null,
      (id) => locals.get(id)!,
    );
    const [x, y, z] = mat4Translation(m);
    expect(x).toBeCloseTo(1, 5);
    expect(y).toBeCloseTo(2, 5);
    expect(z).toBeCloseTo(0, 5);
  });

  it("relative guest bone prevents attach feedback when host animates (rifle flyaway regression)", () => {
    // Guest attach bone is fixed +1 on X relative to guest root (like GBL_RT offset).
    const guestLocal = mat4FromTranslation(1, 0, 0);

    // Simulate previous-frame guest root already attached near host at frame 0.
    let guestRoot = mat4FromTranslation(10, 0, 0);
    // guestBoneWorld = guestRoot × guestLocal (bones parented under group).
    const multiply = (a: number[], b: number[]) => {
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
    };

    // Host TE_R animates far to the right across frames.
    for (let frame = 0; frame < 5; frame += 1) {
      const hostX = 10 + frame * 20;
      const hostWorld = mat4FromTranslation(hostX, 0, 0);
      const guestBoneWorld = multiply(guestRoot, guestLocal);

      // Correct: strip root, then compose.
      const relative = guestAttachBoneRelativeToRoot(guestRoot, guestBoneWorld);
      guestRoot = composeGuestAttachRootMatrix(hostWorld, relative);

      // Wrong (old): compose with full guestBoneWorld → exponential drift.
      const wrongRoot = composeGuestAttachRootMatrix(hostWorld, guestBoneWorld);

      const [gx] = mat4Translation(guestRoot);
      expect(gx).toBeCloseTo(hostX - 1, 5);

      const [wx] = mat4Translation(wrongRoot);
      // After frame 0, wrong path diverges from stable attach.
      if (frame >= 1) {
        expect(Math.abs(wx - (hostX - 1))).toBeGreaterThan(1);
      }
    }
  });
});
