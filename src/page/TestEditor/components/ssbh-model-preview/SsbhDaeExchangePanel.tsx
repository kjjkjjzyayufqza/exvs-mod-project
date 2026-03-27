import { useShallow } from "zustand/react/shallow";
import { Button } from "@/components/ui/button";
import { useDaeSsbhSessionStore } from "./store/daeSsbhSessionStore";
import { DaeSsbhSourcePicker } from "./components/DaeSsbhSourcePicker";
import { DaeSsbhSessionLayout } from "./components/DaeSsbhSessionLayout";

export function SsbhDaeExchangePanel() {
  const { analysis, sourcePath, resetSession } = useDaeSsbhSessionStore(
    useShallow((state) => ({
      analysis: state.analysis,
      sourcePath: state.sourcePath,
      resetSession: state.resetSession,
    })),
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 rounded-md border bg-muted/10 px-3 py-2">
        <div className="space-y-0.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{"DAE -> SSBH Workflow"}</p>
          <p className="text-[11px] text-muted-foreground">
            {analysis && sourcePath
              ? "Detailed session state is persisted with Zustand and survives refresh."
              : "Pick a source file, analyze it, then configure numdlb and numatb before export."}
          </p>
        </div>
        {analysis ? (
          <Button type="button" variant="outline" size="sm" className="h-8 text-[10px] uppercase tracking-wide" onClick={resetSession}>
            New Session
          </Button>
        ) : null}
      </div>

      {analysis && sourcePath ? <DaeSsbhSessionLayout /> : <DaeSsbhSourcePicker />}
    </div>
  );
}
