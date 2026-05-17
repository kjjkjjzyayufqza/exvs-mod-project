import { render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
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
      <GraphicParamPanel
        params={params}
        appliedKeys={new Set(["directional_lighting_intensity"])}
        onValueChange={vi.fn()}
        onKeyChange={vi.fn()}
        onAdd={vi.fn()}
        onDelete={vi.fn()}
        onToggleApplied={vi.fn()}
        onApplyAll={vi.fn()}
        onClearApplied={vi.fn()}
      />,
    );

    expect(screen.getByDisplayValue("stage_only_non_three_value")).toBeInTheDocument();
    expect(screen.getByDisplayValue("abc")).toBeInTheDocument();
    expect(screen.getByTestId("graphic-param-panel")).toHaveClass("flex", "min-h-0");
    expect(screen.queryByTestId("graphic-param-fixed-scroll")).not.toBeInTheDocument();
  });

  it("renders full placement key-value fields inside a flexible panel", () => {
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
        "VDK_LENS_FLARE_ENABLE",
        "TRUE",
      ],
    };

    render(
      <PlacementCsvEditorPanel
        draftEntries={[row]}
        appliedEntries={[]}
        selectedIndex={0}
        onSelectEntry={vi.fn()}
        onDraftRowChange={vi.fn()}
        onAddRow={vi.fn()}
        onDeleteRow={vi.fn()}
        onApplyRow={vi.fn()}
        onApplyAll={vi.fn()}
      />,
    );

    expect(screen.getByText("VDK_LENS_FLARE_ENABLE")).toBeInTheDocument();
    expect(screen.getByDisplayValue("TRUE")).toBeInTheDocument();
    expect(screen.getByTestId("placement-csv-editor-panel")).toHaveClass("flex", "min-h-0");
    expect(screen.queryByTestId("placement-fixed-scroll")).not.toBeInTheDocument();
  });
});
