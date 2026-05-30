import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { createEmptyNumatbFile } from "../daeSsbhTypes";
import type { MissingTexturePathSlotRef } from "../store/numatbTemplateStoreHelpers";
import { useStableMissingTextureFillSlots } from "./useStableMissingTextureFillSlots";

const maya = createEmptyNumatbFile();
const nust = createEmptyNumatbFile();

function slot(paramId: string, value = ""): MissingTexturePathSlotRef {
  return {
    profile: "maya",
    materialLabel: "m1",
    paramId,
    materialIndex: 0,
    attributeIndex: 0,
    value,
    textureDataKind: "String",
  };
}

describe("useStableMissingTextureFillSlots", () => {
  it("keeps filled rows until resetKey changes", () => {
    const missing = [slot("Texture1", "")];
    const { result, rerender } = renderHook(
      ({ live }) => useStableMissingTextureFillSlots("model-a", maya, nust, live),
      { initialProps: { live: missing } },
    );

    expect(result.current).toHaveLength(1);

    rerender({ live: [] });
    expect(result.current).toHaveLength(1);

    act(() => {
      rerender({ live: [] });
    });
    expect(result.current[0].paramId).toBe("Texture1");
  });

  it("clears rows when resetKey changes", () => {
    const { result, rerender } = renderHook(
      ({ key, live }) => useStableMissingTextureFillSlots(key, maya, nust, live),
      { initialProps: { key: "model-a", live: [slot("Texture1")] } },
    );
    expect(result.current).toHaveLength(1);

    rerender({ key: "model-b", live: [] });
    expect(result.current).toHaveLength(0);
  });
});
