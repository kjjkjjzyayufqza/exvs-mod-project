export type SyncDurationMeasurement<TResult> = {
  label: string;
  iterations: number;
  warmupIterations: number;
  runsMs: number[];
  averageMs: number;
  maxMs: number;
  minMs: number;
  lastResult: TResult;
};

export type DurationBudget = {
  averageMs?: number;
  maxMs?: number;
};

export function measureSyncDurationBudget<TResult>(
  fn: () => TResult,
  options: {
    iterations: number;
    warmupIterations?: number;
    label?: string;
  },
): SyncDurationMeasurement<TResult> {
  const warmupIterations = options.warmupIterations ?? 0;
  const iterations = options.iterations;
  if (!Number.isInteger(iterations) || iterations < 1) {
    throw new Error(`iterations must be a positive integer, got ${iterations}`);
  }
  if (!Number.isInteger(warmupIterations) || warmupIterations < 0) {
    throw new Error(`warmupIterations must be a non-negative integer, got ${warmupIterations}`);
  }

  for (let index = 0; index < warmupIterations; index += 1) {
    fn();
  }

  const runsMs: number[] = [];
  let lastResult!: TResult;
  for (let index = 0; index < iterations; index += 1) {
    const start = performance.now();
    lastResult = fn();
    const end = performance.now();
    runsMs.push(end - start);
  }

  const totalMs = runsMs.reduce((sum, value) => sum + value, 0);
  return {
    label: options.label ?? "performance measurement",
    iterations,
    warmupIterations,
    runsMs,
    averageMs: totalMs / runsMs.length,
    maxMs: Math.max(...runsMs),
    minMs: Math.min(...runsMs),
    lastResult,
  };
}

export async function measureAsyncDurationMs(fn: () => Promise<unknown>): Promise<number> {
  const start = performance.now();
  await fn();
  return performance.now() - start;
}

export function assertDurationWithinBudget<TResult>(
  measurement: SyncDurationMeasurement<TResult>,
  budget: DurationBudget,
): void {
  const details = `${measurement.label}: avg ${measurement.averageMs.toFixed(2)} ms, max ${measurement.maxMs.toFixed(2)} ms, min ${measurement.minMs.toFixed(2)} ms across ${measurement.iterations} runs`;
  if (budget.averageMs !== undefined && measurement.averageMs > budget.averageMs) {
    throw new Error(`${details}; expected average <= ${budget.averageMs.toFixed(2)} ms`);
  }
  if (budget.maxMs !== undefined && measurement.maxMs > budget.maxMs) {
    throw new Error(`${details}; expected max <= ${budget.maxMs.toFixed(2)} ms`);
  }
}
