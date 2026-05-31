import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MissingTexturePathFillPanel } from "./MissingTexturePathFillPanel";
import type { MissingTexturePathSlotRef } from "../store/numatbTemplateStoreHelpers";

vi.mock("@/page/SceneEdit/components/SceneTextureSelectPicker", () => ({
  SceneTextureSelectPicker: ({
    value,
    onChange,
    paramId,
  }: {
    value: string;
    paramId: string;
    onChange: (basename: string) => void;
  }) => (
    <input
      aria-label={paramId === "__bulk_texture_apply__" ? "bulk-texture-picker" : "texture-picker"}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}));

describe("MissingTexturePathFillPanel", () => {
  const slotA: MissingTexturePathSlotRef = {
    profile: "maya",
    materialLabel: "bodyMaterial",
    paramId: "DiffuseMap",
    materialIndex: 0,
    attributeIndex: 3,
    value: "",
    textureDataKind: "String",
  };

  const slotB: MissingTexturePathSlotRef = {
    profile: "nust",
    materialLabel: "bodyMaterial",
    paramId: "Texture1",
    materialIndex: 0,
    attributeIndex: 1,
    value: "",
    textureDataKind: "String1",
  };

  it("renders one row per slot with param id and profile hint", () => {
    render(<MissingTexturePathFillPanel slots={[slotA]} onFillSlot={vi.fn()} />);

    expect(screen.getByText("DiffuseMap")).toBeInTheDocument();
    expect(screen.getByText("Maya · bodyMaterial")).toBeInTheDocument();
    expect(screen.getByLabelText("texture-picker")).toBeInTheDocument();
  });

  it("forwards picker changes to onFillSlot", () => {
    const onFillSlot = vi.fn();

    render(<MissingTexturePathFillPanel slots={[slotA]} onFillSlot={onFillSlot} />);

    fireEvent.change(screen.getByLabelText("texture-picker"), {
      target: { value: "wall_alb.nutexb" },
    });

    expect(onFillSlot).toHaveBeenCalledWith(slotA, "wall_alb.nutexb");
  });

  it("returns null when there are no slots", () => {
    const { container } = render(<MissingTexturePathFillPanel slots={[]} onFillSlot={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("applies bulk value only to checked slots", () => {
    const onFillSlot = vi.fn();

    render(<MissingTexturePathFillPanel slots={[slotA, slotB]} onFillSlot={onFillSlot} />);

    fireEvent.click(screen.getByLabelText("Select DiffuseMap"));
    fireEvent.change(screen.getByLabelText("bulk-texture-picker"), {
      target: { value: "shared_tex" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply to selected (1)" }));

    expect(onFillSlot).toHaveBeenCalledTimes(1);
    expect(onFillSlot).toHaveBeenCalledWith(slotB, "shared_tex");
  });

  it("applies bulk value to all slots when all are selected", () => {
    const onFillSlot = vi.fn();

    render(<MissingTexturePathFillPanel slots={[slotA, slotB]} onFillSlot={onFillSlot} />);

    fireEvent.change(screen.getByLabelText("bulk-texture-picker"), {
      target: { value: "shared_tex" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply to selected (2)" }));

    expect(onFillSlot).toHaveBeenCalledTimes(2);
    expect(onFillSlot).toHaveBeenCalledWith(slotA, "shared_tex");
    expect(onFillSlot).toHaveBeenCalledWith(slotB, "shared_tex");
  });

  it("select all toggles every row checkbox", () => {
    render(<MissingTexturePathFillPanel slots={[slotA, slotB]} onFillSlot={vi.fn()} />);

    fireEvent.click(screen.getByLabelText("Select all texture path slots"));
    expect(screen.getByRole("button", { name: "Apply to selected (0)" })).toBeDisabled();

    fireEvent.click(screen.getByLabelText("Select all texture path slots"));
    expect(screen.getByRole("button", { name: "Apply to selected (2)" })).toBeInTheDocument();
  });
});
