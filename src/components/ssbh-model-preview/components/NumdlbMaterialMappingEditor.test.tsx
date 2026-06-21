import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NumdlbMaterialMappingEditor } from "./NumdlbMaterialMappingEditor";

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getTotalSize: () => count * 49,
    getVirtualItems: () =>
      Array.from({ length: Math.min(count, 4) }, (_, index) => ({
        index,
        key: index,
        size: 49,
        start: index * 49,
      })),
  }),
}));

function makeRows(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    meshObjectName: `mesh-${index}`,
    meshObjectSubindex: index,
    materialLabel: `material-${index}`,
  }));
}

describe("NumdlbMaterialMappingEditor", () => {
  it("mounts only virtual rows and keeps original row indexes for combobox edits", () => {
    const rows = makeRows(250);
    const onChangeMaterialLabel = vi.fn();
    render(
      <NumdlbMaterialMappingEditor
        rows={rows}
        availableMaterialLabels={[]}
        onChangeMaterialLabel={onChangeMaterialLabel}
        onReplaceAll={() => {}}
        onAutoApply={() => {}}
      />,
    );

    expect(screen.getByText("mesh-0")).toBeInTheDocument();
    expect(screen.getByText("mesh-3")).toBeInTheDocument();
    expect(screen.queryByText("mesh-20")).not.toBeInTheDocument();

    const rowInput = screen.getByDisplayValue("material-2");
    fireEvent.change(rowInput, { target: { value: "material-edited" } });
    fireEvent.blur(rowInput);
    expect(onChangeMaterialLabel).toHaveBeenCalledWith(2, "material-edited");
  });

  it("offers numatb-sourced labels (not present in rows) in the replace-all combobox", () => {
    render(
      <NumdlbMaterialMappingEditor
        rows={makeRows(2)}
        availableMaterialLabels={["external-mtl"]}
        onChangeMaterialLabel={() => {}}
        onReplaceAll={() => {}}
        onAutoApply={() => {}}
      />,
    );
    fireEvent.focus(screen.getByPlaceholderText("New material label"));
    expect(screen.getByText("external-mtl")).toBeInTheDocument();
  });

  it("invokes onAutoApply when the Auto apply button is clicked", () => {
    const onAutoApply = vi.fn();
    render(
      <NumdlbMaterialMappingEditor
        rows={makeRows(3)}
        availableMaterialLabels={[]}
        onChangeMaterialLabel={() => {}}
        onReplaceAll={() => {}}
        onAutoApply={onAutoApply}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /auto apply/i }));
    expect(onAutoApply).toHaveBeenCalledTimes(1);
  });

  it("disables Auto apply when there are no rows", () => {
    render(
      <NumdlbMaterialMappingEditor
        rows={[]}
        availableMaterialLabels={[]}
        onChangeMaterialLabel={() => {}}
        onReplaceAll={() => {}}
        onAutoApply={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: /auto apply/i })).toBeDisabled();
  });
});
