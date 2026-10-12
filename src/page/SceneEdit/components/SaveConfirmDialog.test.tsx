import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SaveConfirmDialog } from "./SaveConfirmDialog";
import type { SaveChangePreview } from "../utils/sceneSaveConfirm";

const NO_CHANGES: SaveChangePreview = {
  added: [],
  modified: [],
  deleted: [],
  replaced: [],
  globalChanges: [],
  hasChanges: false,
};

const OUTPUT_PATH = String.raw`E:\OBHK0.3_v27\data\x64\mod\0xD421D6E0.fhm2d`;

describe("SaveConfirmDialog", () => {
  it("asks before repacking into the OB mod folder even without pending edits", () => {
    const onConfirm = vi.fn();
    render(
      <SaveConfirmDialog
        open
        preview={NO_CHANGES}
        stageRoot={String.raw`E:\XB\mod\001stage\pairs_map`}
        fhm2dOutputPath={OUTPUT_PATH}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByText("Repack into the OB mod folder?")).toBeInTheDocument();
    expect(screen.getByText(OUTPUT_PATH)).toBeInTheDocument();
    expect(screen.getByText("No pending edits. The current folder is packed as-is.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Repack and overwrite" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("keeps the folder-save wording when no repack target is given", () => {
    render(
      <SaveConfirmDialog
        open
        preview={{ ...NO_CHANGES, added: ["obj_a"], hasChanges: true }}
        stageRoot="stage"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Save to Folder" })).toBeInTheDocument();
    expect(screen.queryByText("Repack into the OB mod folder?")).not.toBeInTheDocument();
  });
});
