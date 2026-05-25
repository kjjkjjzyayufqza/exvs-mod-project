import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MissingTexturePathFillPanel } from "./MissingTexturePathFillPanel";
import type { MissingTexturePathSlotRef } from "../store/numatbTemplateStoreHelpers";

vi.mock("@/page/SceneEdit/components/SceneTextureSelectPicker", () => ({
  SceneTextureSelectPicker: ({
    value,
    onChange,
  }: {
    value: string;
    onChange: (basename: string) => void;
  }) => (
    <input
      aria-label="texture-picker"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}));

describe("MissingTexturePathFillPanel", () => {
  const slot: MissingTexturePathSlotRef = {
    profile: "maya",
    materialLabel: "bodyMaterial",
    paramId: "DiffuseMap",
    materialIndex: 0,
    attributeIndex: 3,
    value: "",
    textureDataKind: "String",
  };

  it("renders one row per slot with param id and profile hint", () => {
    render(<MissingTexturePathFillPanel slots={[slot]} onFillSlot={vi.fn()} />);

    expect(screen.getByText("DiffuseMap")).toBeInTheDocument();
    expect(screen.getByText("Maya · bodyMaterial")).toBeInTheDocument();
    expect(screen.getByLabelText("texture-picker")).toBeInTheDocument();
  });

  it("forwards picker changes to onFillSlot", () => {
    const onFillSlot = vi.fn();

    render(<MissingTexturePathFillPanel slots={[slot]} onFillSlot={onFillSlot} />);

    fireEvent.change(screen.getByLabelText("texture-picker"), {
      target: { value: "wall_alb.nutexb" },
    });

    expect(onFillSlot).toHaveBeenCalledWith(slot, "wall_alb.nutexb");
  });

  it("returns null when there are no slots", () => {
    const { container } = render(<MissingTexturePathFillPanel slots={[]} onFillSlot={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
});
