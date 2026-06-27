import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NumdlbMappingEditorBody } from "./NumdlbMappingEditorBody";
import type { NumdlbReadResult } from "./ssbhDaeIoService";

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getTotalSize: () => count * 49,
    getVirtualItems: () =>
      Array.from({ length: Math.min(count, 8) }, (_, index) => ({
        index,
        key: index,
        size: 49,
        start: index * 49,
      })),
  }),
}));

function makeData(): NumdlbReadResult {
  return {
    modelName: "model",
    meshFileName: "model.numshb",
    skeletonFileName: "model.nusktb",
    animationFileName: null,
    materialFileNames: ["model.numatb"],
    entries: [
      { meshObjectName: "body__part0", meshObjectSubindex: 0, materialLabel: "wrong" },
      { meshObjectName: "wing__part2", meshObjectSubindex: 0, materialLabel: "stale" },
    ],
  };
}

describe("NumdlbMappingEditorBody", () => {
  it("Auto apply snaps every material label to its stripped mesh name", () => {
    const onChange = vi.fn();
    render(
      <NumdlbMappingEditorBody data={makeData()} availableMaterialLabels={[]} onChange={onChange} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /auto apply/i }));

    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0][0] as NumdlbReadResult;
    expect(next.entries.map((entry) => entry.materialLabel)).toEqual(["body", "wing"]);
  });

  it("remove row drops the selected mapping entry from draft data", () => {
    const onChange = vi.fn();
    render(
      <NumdlbMappingEditorBody data={makeData()} availableMaterialLabels={[]} onChange={onChange} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /remove body__part0/i }));

    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0][0] as NumdlbReadResult;
    expect(next.entries).toEqual([
      { meshObjectName: "wing__part2", meshObjectSubindex: 0, materialLabel: "stale" },
    ]);
  });

  it("mesh object name edit updates the selected mapping entry on blur", () => {
    const onChange = vi.fn();
    render(
      <NumdlbMappingEditorBody data={makeData()} availableMaterialLabels={[]} onChange={onChange} />,
    );

    const meshInput = screen.getByDisplayValue("body__part0");
    fireEvent.change(meshInput, { target: { value: "torso__part0" } });
    fireEvent.blur(meshInput);

    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0][0] as NumdlbReadResult;
    expect(next.entries[0].meshObjectName).toBe("torso__part0");
  });
});
