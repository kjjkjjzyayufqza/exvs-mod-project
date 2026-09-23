import { useCallback, useRef, useState } from "react";
import type { GraphBuild, MissionGraph } from "@/services/missionGraph/graph";
import { runGraphTask } from "@/services/missionGraph/workerClient";

export type BuildLogEntry = { at: number; kind: "info" | "error"; message: string };

export function useMissionBuild() {
  const [build, setBuild] = useState<GraphBuild | null>(null);
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<BuildLogEntry[]>([]);
  const task = useRef<ReturnType<typeof runGraphTask> | null>(null);
  const mounted = useRef(true);
  const lock = useRef(false);

  const note = (kind: BuildLogEntry["kind"], message: string) => setLog((entries) => [...entries.slice(-80), { at: Date.now(), kind, message }]);

  const run = useCallback(async (action: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true; setBusy(true);
    try { await action(); } finally { lock.current = false; if (mounted.current) setBusy(false); }
  }, []);

  function cancel() { task.current?.cancel(); }

  async function generate(graph: MissionGraph, source?: string) {
    setBuild(null);
    const job = runGraphTask({ kind: "build", graph, source });
    task.current = job;
    const result = await job.promise;
    if (!mounted.current || !result.build) return null;
    setBuild(result.build);
    note("info", `Generated ${result.build.model.phases.length} phases from connected nodes.`);
    return result.build;
  }

  return { build, setBuild, busy, setBusy, log, note, run, cancel, generate, mounted, task };
}
