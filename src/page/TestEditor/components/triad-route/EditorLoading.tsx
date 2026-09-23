import { cn } from "@/lib/utils";

/**
 * Placeholders shaped like the editor they stand in for, so opening a course
 * does not swap the pane for a spinner.
 */

function Pulse({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-muted/70", className)} />;
}

/** Course form + stage identity + briefing + slot table. */
export function EditorPaneSkeleton({ label }: { label: string }) {
  return (
    <div
      className="flex min-h-0 min-w-0 flex-col gap-3 pr-2.5 pb-3"
      aria-busy="true"
      aria-label={label}
    >
      <div className="flex flex-col gap-3 rounded-lg border bg-card/40 p-3">
        <Pulse className="h-4 w-40" />
        <div className="grid gap-3 md:grid-cols-3">
          <Pulse className="h-9" />
          <Pulse className="h-9" />
          <Pulse className="h-9" />
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <Pulse className="h-9" />
          <Pulse className="h-9" />
        </div>
      </div>
      <div className="flex gap-1.5">
        <Pulse className="h-9 w-16 rounded-full" />
        <Pulse className="h-9 w-16 rounded-full" />
        <Pulse className="h-9 w-16 rounded-full" />
      </div>
      <div className="flex flex-col gap-3 rounded-lg border bg-card/40 p-3">
        <Pulse className="h-4 w-52" />
        <div className="grid gap-3 md:grid-cols-3">
          <Pulse className="h-9" />
          <Pulse className="h-9" />
          <Pulse className="h-9" />
        </div>
        <Pulse className="h-24" />
      </div>
      <SlotTableSkeleton />
    </div>
  );
}

/** Slot table while the mission script is still being read. */
export function SlotTableSkeleton({ label }: { label?: string }) {
  return (
    <div
      className="flex flex-col gap-2 rounded-lg border border-dashed bg-card/20 p-3"
      aria-busy="true"
      aria-label={label}
    >
      <Pulse className="h-4 w-28" />
      <Pulse className="h-8" />
      <Pulse className="h-8" />
      <Pulse className="h-8" />
      <Pulse className="h-8 w-5/6" />
    </div>
  );
}
