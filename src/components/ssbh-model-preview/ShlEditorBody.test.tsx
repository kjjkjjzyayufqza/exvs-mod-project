import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ShlEditorBody } from "./ShlEditorBody";
import type { ShlFileData, ShlRecord } from "./shlIoService";

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
  },
}));

function record(overrides: Partial<ShlRecord> = {}): ShlRecord {
  return {
    modelId: 0,
    modelType: 0,
    folderIndex: 0,
    unk1: 0,
    slotIndex: 0,
    ...overrides,
  };
}

function file(records: ShlRecord[]): ShlFileData {
  return {
    version: 100,
    reserved08: 0,
    records,
    trailingData: [],
  };
}

describe("ShlEditorBody", () => {
  it("changing the folder index does not copy another record's model id", () => {
    const data = file([
      record({ modelId: 0x11111111, folderIndex: 0, slotIndex: 0 }),
      record({ modelId: 0x22222222, folderIndex: 1, slotIndex: 1 }),
    ]);
    const onChange = vi.fn();

    render(
      <ShlEditorBody
        data={data}
        onChange={onChange}
        modelFolderNames={["body", "weapon"]}
      />,
    );

    fireEvent.change(screen.getByLabelText("Model folder row 1"), {
      target: { value: "1" },
    });

    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0]![0] as ShlFileData;
    expect(next.records[0]).toMatchObject({
      folderIndex: 1,
      modelId: 0x11111111,
    });
  });

  it("adds new slots with unk1 defaulting to 1", () => {
    const data = file([record({ modelId: 0x11111111, folderIndex: 0, slotIndex: 0 })]);
    const onChange = vi.fn();

    render(
      <ShlEditorBody
        data={data}
        onChange={onChange}
        modelFolderNames={["body", "weapon"]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add slot" }));

    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0]![0] as ShlFileData;
    expect(next.records[1]).toMatchObject({
      folderIndex: 1,
      modelType: 3,
      unk1: 1,
      slotIndex: 1,
    });
  });

  it("renders two-digit slot indices fully (not clipped as a single digit)", () => {
    // Real shell: from F5179C68 onward folder/slot are 10+; narrow columns + number spinners
    // previously made "10" look like "1" in the UI.
    const data = file([
      record({
        modelId: 0x689c17f5,
        modelType: 3,
        folderIndex: 10,
        unk1: 2,
        slotIndex: 10,
      }),
    ]);

    render(
      <ShlEditorBody
        data={data}
        onChange={() => {}}
        modelFolderNames={Array.from({ length: 15 }, (_, i) => `model_${i}`)}
      />,
    );

    expect(screen.getByLabelText("Slot index row 1")).toHaveValue(10);
    expect(screen.getByLabelText("unk1 row 1")).toHaveValue(2);
  });
});
