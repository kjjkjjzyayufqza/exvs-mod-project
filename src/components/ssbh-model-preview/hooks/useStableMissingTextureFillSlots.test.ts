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
      ({ current, live }) =>
        useStableMissingTextureFillSlots("model-a", maya, nust, current, live),
      { initialProps: { current: missing, live: missing } },
    );

    expect(result.current).toHaveLength(1);

    rerender({ current: [slot("Texture1", "filled")], live: [] });
    expect(result.current).toHaveLength(1);

    act(() => {
      rerender({ current: [slot("Texture1", "filled")], live: [] });
    });
    expect(result.current[0].paramId).toBe("Texture1");
  });

  it("clears rows when resetKey changes", () => {
    const { result, rerender } = renderHook(
      ({ key, current, live }) =>
        useStableMissingTextureFillSlots(key, maya, nust, current, live),
      {
        initialProps: {
          key: "model-a",
          current: [slot("Texture1")],
          live: [slot("Texture1")],
        },
      },
    );
    expect(result.current).toHaveLength(1);

    rerender({
      key: "model-b",
      current: [slot("Texture1", "from-template")],
      live: [],
    });
    expect(result.current).toHaveLength(0);
  });

  it("removes rows that are no longer valid in the current profile", () => {
    const missing = [slot("Texture1")];
    const { result, rerender } = renderHook(
      ({ current, live }) =>
        useStableMissingTextureFillSlots("model-a", maya, nust, current, live),
      { initialProps: { current: missing, live: missing } },
    );
    expect(result.current).toHaveLength(1);

    rerender({ current: [], live: [] });

    expect(result.current).toHaveLength(0);
  });
});
