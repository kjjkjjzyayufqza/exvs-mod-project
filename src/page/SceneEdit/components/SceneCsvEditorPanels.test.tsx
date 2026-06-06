import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { GraphicParamPanel, type GraphicParam } from "./GraphicParamPanel";
import { PlacementCsvEditorPanel } from "./PlacementCsvEditorPanel";
import type { PlacementRow } from "../types/placement";

describe("Scene CSV editor panels", () => {
  beforeAll(() => {
    class ResizeObserverMock {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }

    globalThis.ResizeObserver = ResizeObserverMock;
  });

  it("renders every graphic_param row inside a flexible panel", () => {
    const params: GraphicParam[] = [
      { key: "directional_lighting_intensity", value: "3.14" },
      { key: "pfx_bloom_bright_threshold", value: "1.25" },
      { key: "stage_only_non_three_value", value: "abc" },
    ];

    render(
      <TooltipProvider>
        <GraphicParamPanel
          params={params}
          initialParams={null}
          appliedKeys={new Set(["directional_lighting_intensity"])}
          onValueChange={vi.fn()}
          onKeyChange={vi.fn()}
          onAdd={vi.fn()}
          onDelete={vi.fn()}
          onToggleApplied={vi.fn()}
          onApplyAll={vi.fn()}
          onClearApplied={vi.fn()}
          onResetValue={vi.fn()}
        />
      </TooltipProvider>,
    );

    expect(screen.getByText("Stage Only Non Three Value")).toBeInTheDocument();
    expect(screen.getByDisplayValue("abc")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Search parameters...")).toBeInTheDocument();
    expect(screen.getByTestId("graphic-param-panel")).toHaveClass("flex", "min-h-0");
    expect(screen.queryByTestId("graphic-param-fixed-scroll")).not.toBeInTheDocument();
  });

  it("keeps 0 and 1 graphic_param values as numeric inputs and commits on blur", () => {
    const onValueChange = vi.fn();
    const params: GraphicParam[] = [
      { key: "fog_alpha_boost", value: "1" },
    ];

    render(
      <TooltipProvider>
        <GraphicParamPanel
          params={params}
          initialParams={null}
          appliedKeys={new Set(["fog_alpha_boost"])}
          onValueChange={onValueChange}
          onKeyChange={vi.fn()}
          onAdd={vi.fn()}
          onDelete={vi.fn()}
          onToggleApplied={vi.fn()}
          onApplyAll={vi.fn()}
          onClearApplied={vi.fn()}
          onResetValue={vi.fn()}
        />
      </TooltipProvider>,
    );

    expect(screen.queryByText("On")).not.toBeInTheDocument();
    expect(screen.queryByText("Off")).not.toBeInTheDocument();

    const input = screen.getByDisplayValue("1");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "0.5" } });
    expect(onValueChange).not.toHaveBeenCalled();

    fireEvent.keyDown(input, { key: "Escape" });
    expect(onValueChange).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue("1")).toBeInTheDocument();

    fireEvent.change(input, { target: { value: "0.5" } });
    fireEvent.blur(input);
    expect(onValueChange).toHaveBeenCalledWith(0, "0.5");
  });

  it("adds graphic params through an explicit group composer", () => {
    const onAdd = vi.fn();
    const params: GraphicParam[] = [
      { key: "light_existing_param", value: "1" },
    ];

    render(
      <TooltipProvider>
        <GraphicParamPanel
          params={params}
          initialParams={null}
          appliedKeys={new Set()}
          onValueChange={vi.fn()}
          onKeyChange={vi.fn()}
          onAdd={onAdd}
          onDelete={vi.fn()}
          onToggleApplied={vi.fn()}
          onApplyAll={vi.fn()}
          onClearApplied={vi.fn()}
          onResetValue={vi.fn()}
        />
      </TooltipProvider>,
    );

    fireEvent.click(screen.getByLabelText("Add parameter"));

    expect(screen.getByText("light_custom_param")).toBeInTheDocument();
    expect(screen.queryByText("new_param")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(onAdd).toHaveBeenCalledWith([{ key: "light_custom_param", value: "0" }]);
  });

  it("uses category header context when adding RGB graphic params", () => {
    const onAdd = vi.fn();
    const params: GraphicParam[] = [
      { key: "fog_alpha_boost", value: "1" },
    ];

    render(
      <TooltipProvider>
        <GraphicParamPanel
          params={params}
          initialParams={null}
          appliedKeys={new Set()}
          onValueChange={vi.fn()}
          onKeyChange={vi.fn()}
          onAdd={onAdd}
          onDelete={vi.fn()}
          onToggleApplied={vi.fn()}
          onApplyAll={vi.fn()}
          onClearApplied={vi.fn()}
          onResetValue={vi.fn()}
        />
      </TooltipProvider>,
    );

    fireEvent.click(screen.getByLabelText("Add Post Process parameter"));
    fireEvent.click(screen.getByRole("button", { name: "RGB set" }));

    expect(screen.getByText("fog_custom_color_r")).toBeInTheDocument();
    expect(screen.getByText("fog_custom_color_g")).toBeInTheDocument();
    expect(screen.getByText("fog_custom_color_b")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(onAdd).toHaveBeenCalledWith([
      { key: "fog_custom_color_r", value: "0" },
      { key: "fog_custom_color_g", value: "0" },
      { key: "fog_custom_color_b", value: "0" },
    ]);
  });

  it("renders grouped placement fields inside a flexible panel", () => {
    const row: PlacementRow = {
      vdkType: "EFFECT",
      objectNumber: 7,
      posX: 10,
      posY: 20,
      posZ: 30,
      rotX: 0,
      rotY: 90,
      rotZ: 0,
      scaleX: 1,
      scaleY: 1,
      scaleZ: 1,
      rawFields: [
        "VDK_TYPE",
        "EFFECT",
        "VDK_POSITION_X",
        "10",
        "VDK_EFFECT_ID",
        "42",
      ],
    };

    render(
      <TooltipProvider>
        <PlacementCsvEditorPanel
          entries={[row]}
          initialEntries={null}
          placementHeader={[]}
          selectedIndex={0}
          subModels={[]}
          onSelectEntry={vi.fn()}
          onFieldPreview={vi.fn()}
          onFieldCommit={vi.fn()}
          onAddField={vi.fn()}
          onRemoveFieldPair={vi.fn()}
          onAddTyped={vi.fn()}
          onDeleteRow={vi.fn()}
          onResetRow={vi.fn()}
          onResetField={vi.fn()}
        />
      </TooltipProvider>,
    );

    expect(screen.getByText("Effect id")).toBeInTheDocument();
    expect(screen.getByDisplayValue("42")).toBeInTheDocument();
    expect(screen.getByText(/fields/)).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Search rows...")).toBeInTheDocument();
    expect(screen.getByTestId("placement-csv-editor-panel")).toHaveClass("flex", "min-h-0");
  });
});
