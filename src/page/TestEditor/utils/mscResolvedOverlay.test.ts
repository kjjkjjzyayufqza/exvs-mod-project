import { describe, expect, it } from "vitest";
import {
  applyResolvedOverlayToScript2,
  renderResolvedOverlayMarkdown,
} from "./mscResolvedOverlay";

describe("renderResolvedOverlayMarkdown", () => {
  it("renders stable keys first and keeps legacy names explicitly marked", () => {
    const markdown = renderResolvedOverlayMarkdown({
      actions: [
        {
          actionHashHex: "0x9475130e",
          actionIndexHex: "0x17",
          callbackName: "func_450",
          requestedSlots: ["0x23"],
          legacyWorkingName: "ACTION_TRANSFORM_DASH_ENTRY",
          legacyComment: "变形突入",
        },
      ],
      slotCallbacks: [
        {
          slotHex: "0x23",
          callbackName: "func_870",
          referencedByActionHashes: ["0x9475130e"],
        },
      ],
      weaponBindings: [
        {
          slotHex: "0x2",
          armsEntryHashHex: "0xa8e202bf",
          ownerCallbackName: "func_870",
          label: "GUN_015GNDMUC_004DELTPL_001_ASSIST",
        },
      ],
      resourceBindings: [
        {
          registryKindHex: "0x3",
          slotHex: "0x23",
          resourceValueHex: "0x37",
        },
      ],
      orphanActionFunctions: [
        {
          functionName: "func_450",
          requestedSlots: ["0x23"],
          resourceValues: ["0xe2c42dae"],
          notes: "Direct action registry callback is 0; slot registry callback is 0.",
        },
      ],
    });

    expect(markdown).toContain("# MSC Resolved Overlay");
    expect(markdown).toContain("Stable key: `0x9475130e`");
    expect(markdown).toContain("Legacy alias: `ACTION_TRANSFORM_DASH_ENTRY`");
    expect(markdown).toContain("Slot callback: `func_870`");
    expect(markdown).toContain("Registry kind: `0x3`");
    expect(markdown).toContain("Label: `GUN_015GNDMUC_004DELTPL_001_ASSIST`");
    expect(markdown).toContain("## Orphan Action-like Functions");
    expect(markdown).toContain("Function: `func_450`");
    expect(markdown).toContain("Requested slots: `0x23`");
  });

  it("writes overlay back into 2.c as replaceable comment block", () => {
    const rawScript2 = "func_241(0x9475130e, 0);\nvoid func_450()\n{\n    func_69(0x23);\n}\n";
    const markdown = "# MSC Resolved Overlay\n\n- Stable key: `0x9475130e`\n";

    const firstPass = applyResolvedOverlayToScript2(rawScript2, markdown);
    expect(firstPass).toContain("func_241(0x9475130e, 0);");
    expect(firstPass).toContain("/* MSC RESOLVED OVERLAY START");
    expect(firstPass).toContain("# MSC Resolved Overlay");

    const secondPass = applyResolvedOverlayToScript2(firstPass, "# MSC Resolved Overlay\n\n- Stable key: `0x77b100ff`\n");
    expect(secondPass).toContain("Stable key: `0x77b100ff`");
    expect(secondPass).not.toContain("Stable key: `0x9475130e`");
    expect(secondPass.match(/MSC RESOLVED OVERLAY START/g)).toHaveLength(1);
  });
});
