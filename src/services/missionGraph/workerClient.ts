import type { GraphBuild, MissionGraph } from "./graph";

export type GraphRequest = { kind: "build"; graph: MissionGraph; source?: string } | { kind: "json" | "c"; source: string };
export interface GraphResponse { graph: MissionGraph; build?: GraphBuild }

export function runGraphTask(request: GraphRequest) {
  const worker = new Worker(new URL("./graph.worker.ts", import.meta.url), { type: "module" });
  let cancel = () => {};
  const promise = new Promise<GraphResponse>((resolve, reject) => {
    let settled = false;
    const finish = (result?: GraphResponse, error?: Error) => {
      if (settled) return;
      settled = true; clearTimeout(timeout); worker.terminate();
      if (error) reject(error); else resolve(result!);
    };
    const timeout = setTimeout(() => finish(undefined, new Error("Mission graph operation exceeded 15 seconds")), 15000);
    cancel = () => finish(undefined, new Error("Operation cancelled"));
    worker.onmessage = (event: MessageEvent<GraphResponse | { error: string }>) => {
      if ("error" in event.data) finish(undefined, new Error(event.data.error)); else finish(event.data);
    };
    worker.onerror = (event) => finish(undefined, new Error(event.message || "Mission graph worker failed"));
    worker.postMessage(request);
  });
  return { promise, cancel: () => cancel() };
}
