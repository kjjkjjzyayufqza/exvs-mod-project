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
        onChangeMeshObjectName={() => {}}
        onChangeMaterialLabel={onChangeMaterialLabel}
        onReplaceAll={() => {}}
        onAutoApply={() => {}}
      />,
    );

    expect(screen.getByDisplayValue("mesh-0")).toBeInTheDocument();
    expect(screen.getByDisplayValue("mesh-3")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("mesh-20")).not.toBeInTheDocument();

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
        onChangeMeshObjectName={() => {}}
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
        onChangeMeshObjectName={() => {}}
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
        onChangeMeshObjectName={() => {}}
        onChangeMaterialLabel={() => {}}
        onReplaceAll={() => {}}
        onAutoApply={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: /auto apply/i })).toBeDisabled();
  });

  it("invokes onRemoveRow with the original row index when the remove button is clicked", () => {
    const onRemoveRow = vi.fn();
    render(
      <NumdlbMaterialMappingEditor
        rows={makeRows(3)}
        availableMaterialLabels={[]}
        onChangeMeshObjectName={() => {}}
        onChangeMaterialLabel={() => {}}
        onReplaceAll={() => {}}
        onRemoveRow={onRemoveRow}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /remove mesh-1/i }));
    expect(onRemoveRow).toHaveBeenCalledTimes(1);
    expect(onRemoveRow).toHaveBeenCalledWith(1);
  });

  it("invokes onChangeMeshObjectName with the original row index on blur", () => {
    const onChangeMeshObjectName = vi.fn();
    render(
      <NumdlbMaterialMappingEditor
        rows={makeRows(3)}
        availableMaterialLabels={[]}
        onChangeMeshObjectName={onChangeMeshObjectName}
        onChangeMaterialLabel={() => {}}
        onReplaceAll={() => {}}
      />,
    );

    const meshInput = screen.getByDisplayValue("mesh-1");
    fireEvent.change(meshInput, { target: { value: "mesh-renamed" } });
    fireEvent.blur(meshInput);
    expect(onChangeMeshObjectName).toHaveBeenCalledTimes(1);
    expect(onChangeMeshObjectName).toHaveBeenCalledWith(1, "mesh-renamed");
  });
});
