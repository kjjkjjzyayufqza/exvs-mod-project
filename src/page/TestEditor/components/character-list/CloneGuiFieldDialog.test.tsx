import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { previewGuiCloneFieldName } from "./guiClonePlan";
import { CloneGuiFieldDialog } from "./CloneGuiFieldDialog";
import type { GuiPackPickerItem } from "./guiPackIndex";

vi.mock("@/components/AppRndModalShell", () => ({
  AppRndModalShell: ({
    title,
    children,
    footer,
  }: {
    title: string;
    children: React.ReactNode;
    footer?: React.ReactNode;
  }) => (
    <div>
      <h2>{title}</h2>
      {children}
      {footer}
    </div>
  ),
}));

vi.mock("@/store/configStore", () => ({
  useConfigStore: (selector: (state: { testEditorFolder: string }) => unknown) =>
    selector({ testEditorFolder: "E:\\XB\\mod" }),
}));

function pack(overrides: Partial<GuiPackPickerItem> = {}): GuiPackPickerItem {
  return {
    hash: 0x120f67fe,
    label: "ms_ms_s_016_001_001",
    secondaryText: "0x120F67FE",
    folderPath: null,
    packagePath: "009gui/image/ms/ms_ms_s/ms_ms_s_016_001_001",
    nutexbPath: null,
    source: "name-map",
    ...overrides,
  };
}

describe("CloneGuiFieldDialog", () => {
  it("updates HashName when the custom Name changes", () => {
    const onConfirm = vi.fn();
    render(
      <CloneGuiFieldDialog
        open
        fieldKey="msMsS"
        donorHash={0x120f67fe}
        items={[pack()]}
        targetEntryId={900000004}
        onOpenChange={vi.fn()}
        onConfirm={onConfirm}
      />,
    );

    expect(screen.getByRole("heading", { name: "Clone MS MS S" })).toBeInTheDocument();
    const nameInput = screen.getByLabelText("Name");
    fireEvent.change(nameInput, { target: { value: "ms_ms_s_custom" } });

    const preview = previewGuiCloneFieldName(900000004, "msMsS", "ms_ms_s_custom");
    expect(screen.getAllByText(preview.hashHex).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "Clone pack" }));
    expect(onConfirm).toHaveBeenCalledWith("ms_ms_s_custom");
  });
});
