import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DualValueProperty } from "@/components/ui/dual-value-property";
import { GuiHashFieldExtras, GuiHashFieldPreview } from "./GuiHashFieldExtras";
import type { GuiPackPickerItem } from "./guiPackIndex";

vi.mock("@/page/MiscTools/components/nutexb-view/DiskNutexbImage", () => ({
  DiskNutexbImage: ({ path }: { path: string }) => <div data-testid="nutexb">{path}</div>,
}));

function pack(overrides: Partial<GuiPackPickerItem> = {}): GuiPackPickerItem {
  return {
    hash: 0x01335bc0,
    label: "ms_vs_l_001_001_001",
    secondaryText: "0x01335BC0",
    folderPath: null,
    packagePath: "009gui/image/ms/ms_vs_l/ms_vs_l_001_001_001",
    nutexbPath: "E:/tmp/ms_vs_l.nutexb",
    source: "name-map",
    ...overrides,
  };
}

describe("GuiHashFieldPreview", () => {
  it("renders a full-width preview when the pack has a nutexb", () => {
    const { container } = render(
      <GuiHashFieldPreview value={0x01335bc0} items={[pack()]} />,
    );

    expect(container.firstElementChild).toHaveClass("h-28", "w-full");
    expect(screen.getByTestId("nutexb")).toHaveTextContent("E:/tmp/ms_vs_l.nutexb");
  });

  it("renders nothing when the pack has no nutexb", () => {
    const { container } = render(
      <GuiHashFieldPreview value={0x01335bc0} items={[pack({ nutexbPath: null })]} />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});

describe("GuiHashFieldExtras", () => {
  it("keeps the tiny header thumb out of the action row", () => {
    render(
      <GuiHashFieldExtras
        fieldKey="msVsL"
        value={0x01335bc0}
        items={[pack()]}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.queryByTestId("nutexb")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open 009gui pack picker" })).toBeInTheDocument();
  });

  it("shows a clone button that is disabled when the hash is zero", () => {
    const { rerender } = render(
      <GuiHashFieldExtras
        fieldKey="msMsS"
        value={0x01335bc0}
        items={[pack()]}
        onSelect={vi.fn()}
        onClone={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Clone 009gui pack" })).toBeEnabled();

    rerender(
      <GuiHashFieldExtras
        fieldKey="msMsS"
        value={0}
        items={[pack()]}
        onSelect={vi.fn()}
        onClone={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Clone 009gui pack" })).toBeDisabled();
  });
});

describe("DualValueProperty preview slot", () => {
  it("shows the preview in the compact live card body", () => {
    render(
      <DualValueProperty
        label="MS VS L"
        preview={<div data-testid="field-preview">preview</div>}
        value={20143040}
        property="msVsL"
        editable
        editingProperty={null}
        editValue=""
        validationError=""
        onStartEdit={() => {}}
        onSaveEdit={() => {}}
        onCancelEdit={() => {}}
        onValueChange={() => {}}
        variant="compact"
        mode="live"
        onCommit={() => {}}
      />,
    );

    expect(screen.getByTestId("field-preview")).toBeInTheDocument();
    expect(screen.getByDisplayValue("20143040")).toBeInTheDocument();
  });
});
