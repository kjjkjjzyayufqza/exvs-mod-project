import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import { UnitModelToolbar } from "./UnitModelToolbar";

describe("UnitModelToolbar EXVS Common entry", () => {
  it("offers an independent Open / Extract EXVS Common action", async () => {
    const user = userEvent.setup();
    const onOpenExvsCommon = vi.fn();
    render(
      <TooltipProvider>
        <UnitModelToolbar
          folderName=""
          statusLabel="No folder"
          hasErrors={false}
          validationValid={false}
          isValidating={false}
          busy={null}
          canUseLoadedRoot={false}
          canOperateOnRoot={false}
          canExportModels={false}
          onOpenFolder={vi.fn()}
          onExtractFhm2d={vi.fn()}
          onOpenExvsCommon={onOpenExvsCommon}
          onUseLoadedRoot={vi.fn()}
          onValidate={vi.fn()}
          onRepack={vi.fn()}
          onCopyReviewPayload={vi.fn()}
          onExportModels={vi.fn()}
          showGrid={false}
          showAxes={false}
          wireframe={false}
          showStats={false}
          onToggleGrid={vi.fn()}
          onToggleAxes={vi.fn()}
          onToggleWireframe={vi.fn()}
          onToggleStats={vi.fn()}
          onResetCamera={vi.fn()}
        />
      </TooltipProvider>,
    );

    await user.click(screen.getByRole("button", { name: /file/i }));
    await user.click(await screen.findByText("Open / Extract EXVS Common"));
    expect(onOpenExvsCommon).toHaveBeenCalledOnce();
  });
});
