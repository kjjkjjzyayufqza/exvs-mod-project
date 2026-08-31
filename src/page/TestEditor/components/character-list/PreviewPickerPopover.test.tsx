import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PreviewPickerPopover } from "./PreviewPickerPopover";

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: () => ({
    getVirtualItems: () => [{ index: 0, key: 0, start: 0 }],
    getTotalSize: () => 64,
    measure: vi.fn(),
    scrollToIndex: vi.fn(),
  }),
}));

describe("PreviewPickerPopover", () => {
  it("does not select the row when the extract button handles Enter", () => {
    const onSelect = vi.fn();
    const onOpenChange = vi.fn();

    render(
      <PreviewPickerPopover
        title="009gui pack"
        triggerAriaLabel="Open 009gui pack picker"
        onSelect={onSelect}
        items={[
          {
            value: 0x9233d6ac,
            label: "vs_p_l_016_001_c01",
            previewSrc: "",
            secondaryText: "0x9233D6AC",
            canExtract: true,
          },
        ]}
        open={true}
        onOpenChange={onOpenChange}
        onExtract={vi.fn()}
      />,
    );

    fireEvent.keyDown(screen.getByRole("button", { name: "Extract 009gui pack" }), { key: "Enter" });

    expect(onSelect).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});
