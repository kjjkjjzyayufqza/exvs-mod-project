import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StageIconIndexPickerPopover } from "./StageIconIndexPickerPopover";

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getTotalSize: () => count * 112,
    getVirtualItems: () =>
      Array.from({ length: Math.min(count, 3) }, (_, index) => ({
        index,
        key: index,
        size: 112,
        start: index * 112,
      })),
  }),
}));

describe("StageIconIndexPickerPopover", () => {
  it("mounts thumbnails only for virtual rows", () => {
    const items = Array.from({ length: 100 }, (_, index) => ({
      index,
      name: `icon-${index}`,
      previewSrc: `asset://icon-${index}.png`,
    }));

    render(
      <StageIconIndexPickerPopover
        open
        onOpenChange={() => {}}
        onSelect={() => {}}
        groups={[
          { key: "first", title: "Group 1", items },
          { key: "second", title: "Group 2", items },
        ]}
      />,
    );

    expect(screen.getAllByText(/^Index:/)).toHaveLength(3);
    expect(screen.getAllByRole("img")).toHaveLength(6);
    expect(screen.queryByText("Index: 50")).not.toBeInTheDocument();
  });
});
