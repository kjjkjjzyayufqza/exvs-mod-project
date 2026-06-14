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

describe("NumdlbMaterialMappingEditor", () => {
  it("mounts only virtual rows and keeps original row indexes for edits", () => {
    const rows = Array.from({ length: 250 }, (_, index) => ({
      meshObjectName: `mesh-${index}`,
      meshObjectSubindex: index,
      materialLabel: `material-${index}`,
    }));
    const onChangeMaterialLabel = vi.fn();
    const { container } = render(
      <NumdlbMaterialMappingEditor
        rows={rows}
        onChangeMaterialLabel={onChangeMaterialLabel}
        onReplaceAll={() => {}}
      />,
    );

    expect(screen.getByText("mesh-0")).toBeInTheDocument();
    expect(screen.getByText("mesh-3")).toBeInTheDocument();
    expect(screen.queryByText("mesh-20")).not.toBeInTheDocument();
    expect(container.querySelectorAll("datalist option")).toHaveLength(200);

    fireEvent.change(screen.getByDisplayValue("material-2"), { target: { value: "material-edited" } });
    expect(onChangeMaterialLabel).toHaveBeenCalledWith(2, "material-edited");
  });
});
