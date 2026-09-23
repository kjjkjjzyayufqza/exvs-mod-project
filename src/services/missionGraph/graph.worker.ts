import { buildGraph, importCGraph, parseGraph } from "./graph";
import type { GraphRequest } from "./workerClient";

self.onmessage = (event: MessageEvent<GraphRequest>) => {
  try {
    const request = event.data;
    if (request.kind === "build") self.postMessage({ graph: request.graph, build: buildGraph(request.graph, request.source) });
    else self.postMessage({ graph: request.kind === "json" ? parseGraph(request.source) : importCGraph(request.source) });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : String(error) });
  }
};
