/**
 * Performance tests for VirtualizedList.
 *
 * Tool choice: @testing-library/react + performance.now() + React <Profiler> API.
 * Rationale:
 *   - Zero additional dependencies — all tooling already present in devDependencies.
 *   - Runs fully headless in vitest/jsdom CI without a browser.
 *   - performance.now() gives wall-clock latency for interaction budgets.
 *   - React <Profiler> onRender gives actual commit-phase duration (excludes test
 *     harness overhead) for a tighter upper bound on React rendering work.
 *   - Alternatives evaluated:
 *     * vitest bench / tinybench — great for micro-benchmarks but adds complexity;
 *       overkill for component render/interaction latency assertions.
 *     * react-scan — browser DevTools-only; not runnable headless in vitest.
 *     * @testing-library/user-event — accurate browser simulation but ~10× slower
 *       than fireEvent; unsuitable for tight latency assertions.
 *
 * Latency budgets asserted in this file:
 *   RENDER_BUDGET_5K_MS   = 250 ms  (initial render, 5 000-item list)
 *   RENDER_BUDGET_20K_MS  = 400 ms  (initial render, 20 000-item list)
 *   RENDER_BUDGET_50K_MS  = 600 ms  (initial render, 50 000-item list)
 *   PROFILER_COMMIT_5K_MS = 150 ms  (React commit duration only, 5 000-item list)
 *   INTERACTION_BUDGET_MS = 100 ms  (click row / filter change latency)
 *
 * All budgets are well inside the "no 1-second button response" rule.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Profiler, useState } from "react";
import type { ProfilerOnRenderCallback } from "react";

import { VirtualizedList } from "./VirtualizedList";

// ── Latency budgets ────────────────────────────────────────────────────────────
// These are enforced assertions — a regression that makes the list slow will fail CI.
// Wall-clock numbers are measured in jsdom (V8 JIT), so they include React + DOM
// reconciliation but exclude browser paint; they are conservative.
const RENDER_BUDGET_5K_MS   = 250;
const RENDER_BUDGET_20K_MS  = 400;
const RENDER_BUDGET_50K_MS  = 600;
const PROFILER_COMMIT_5K_MS = 150;
const INTERACTION_BUDGET_MS = 100;

// Maximum DOM rows that should be rendered for a virtualized large list.
// With a 400 px container, 32 px rows, and overscan=8: 12 visible + 16 overscan = 28 rows.
// We allow up to 80 to give headroom for overscan tuning without breaking tests.
const MAX_RENDERED_ROWS_VIRTUALIZED = 80;

// ── jsdom environment stubs ────────────────────────────────────────────────────
// @tanstack/react-virtual v3 calls `new ResizeObserver(...)` to track container size.
// jsdom does not implement ResizeObserver; we stub a no-op so the hook does not throw.
class NoopResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeAll(() => {
  vi.stubGlobal("ResizeObserver", NoopResizeObserver);
});

afterAll(() => {
  vi.unstubAllGlobals();
});

// @tanstack/virtual-core v3 uses element.offsetHeight / offsetWidth (via getRect)
// to measure the scroll container — NOT getBoundingClientRect.
// jsdom returns 0 for both, so we override the prototype getters to 400 × 600 px.
// With rowHeight=32 and overscan=8: floor(400/32)=12 visible + 16 overscan = 28 rows.
const MOCK_CONTAINER_HEIGHT = 400;
const MOCK_CONTAINER_WIDTH = 600;

beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
    configurable: true,
    get: () => MOCK_CONTAINER_HEIGHT,
  });
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
    configurable: true,
    get: () => MOCK_CONTAINER_WIDTH,
  });
});

afterEach(() => {
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
    configurable: true,
    get: () => 0,
  });
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
    configurable: true,
    get: () => 0,
  });
});

// ── Test data helpers ──────────────────────────────────────────────────────────

interface Row {
  id: number;
  label: string;
}

function makeItems(n: number): Row[] {
  return Array.from({ length: n }, (_, i) => ({ id: i, label: `Row-${i}` }));
}

function getItemKey(item: Row) {
  return item.id;
}

function renderRowFn(item: Row) {
  return <button type="button">{item.label}</button>;
}

const ROW_HEIGHT = 32;

// ── Stateful wrapper for interaction tests ─────────────────────────────────────

function InteractiveList({ initialItems }: { initialItems: Row[] }) {
  const [items, setItems] = useState(initialItems);
  const [selected, setSelected] = useState<number | null>(null);

  function handleRowClick(id: number) {
    setSelected(id);
  }

  function handleFilter(keyword: string) {
    setItems(
      keyword
        ? initialItems.filter((r) => r.label.includes(keyword))
        : initialItems,
    );
  }

  return (
    <div>
      <input aria-label="filter" onChange={(e) => handleFilter(e.target.value)} />
      <div data-testid="selected">{selected ?? "none"}</div>
      <VirtualizedList
        items={items}
        rowHeight={ROW_HEIGHT}
        getItemKey={getItemKey}
        renderRow={(item) => (
          <button type="button" onClick={() => handleRowClick(item.id)}>
            {item.label}
          </button>
        )}
        className="overflow-auto"
        virtualizeThreshold={30}
        overscan={8}
      />
    </div>
  );
}

// ── Suite 1: Windowed DOM node count ──────────────────────────────────────────

describe("VirtualizedList – windowed DOM node count", () => {
  it("renders far fewer than 5 000 rows for a 5K-item list", () => {
    render(
      <VirtualizedList
        items={makeItems(5_000)}
        rowHeight={ROW_HEIGHT}
        getItemKey={getItemKey}
        renderRow={renderRowFn}
        className="overflow-auto"
      />,
    );
    const buttons = screen.getAllByRole("button");
    expect(buttons.length).toBeGreaterThan(0);
    expect(buttons.length).toBeLessThanOrEqual(MAX_RENDERED_ROWS_VIRTUALIZED);
  });

  it("renders far fewer than 20 000 rows for a 20K-item list", () => {
    render(
      <VirtualizedList
        items={makeItems(20_000)}
        rowHeight={ROW_HEIGHT}
        getItemKey={getItemKey}
        renderRow={renderRowFn}
        className="overflow-auto"
      />,
    );
    const buttons = screen.getAllByRole("button");
    expect(buttons.length).toBeGreaterThan(0);
    expect(buttons.length).toBeLessThanOrEqual(MAX_RENDERED_ROWS_VIRTUALIZED);
  });

  it("renders far fewer than 50 000 rows for a 50K-item list", () => {
    render(
      <VirtualizedList
        items={makeItems(50_000)}
        rowHeight={ROW_HEIGHT}
        getItemKey={getItemKey}
        renderRow={renderRowFn}
        className="overflow-auto"
      />,
    );
    const buttons = screen.getAllByRole("button");
    expect(buttons.length).toBeGreaterThan(0);
    expect(buttons.length).toBeLessThanOrEqual(MAX_RENDERED_ROWS_VIRTUALIZED);
  });

  it("renders ALL rows when item count is below virtualizeThreshold (15 < 30)", () => {
    render(
      <VirtualizedList
        items={makeItems(15)}
        rowHeight={ROW_HEIGHT}
        getItemKey={getItemKey}
        renderRow={renderRowFn}
        className="overflow-auto"
      />,
    );
    expect(screen.getAllByRole("button")).toHaveLength(15);
  });

  it("renders ALL rows when item count equals virtualizeThreshold (not strictly above)", () => {
    // shouldVirtualize = items.length > threshold → 30 > 30 = false
    render(
      <VirtualizedList
        items={makeItems(30)}
        rowHeight={ROW_HEIGHT}
        getItemKey={getItemKey}
        renderRow={renderRowFn}
        className="overflow-auto"
      />,
    );
    expect(screen.getAllByRole("button")).toHaveLength(30);
  });

  it("virtualizes when item count exceeds a custom threshold", () => {
    // threshold = 10, items = 200 (>> 28 viewport rows): should virtualize
    const threshold = 10;
    const totalItems = 200;
    render(
      <VirtualizedList
        items={makeItems(totalItems)}
        rowHeight={ROW_HEIGHT}
        getItemKey={getItemKey}
        renderRow={renderRowFn}
        className="overflow-auto"
        virtualizeThreshold={threshold}
      />,
    );
    const buttons = screen.getAllByRole("button");
    expect(buttons.length).toBeGreaterThan(0);
    expect(buttons.length).toBeLessThan(totalItems);
    expect(buttons.length).toBeLessThanOrEqual(MAX_RENDERED_ROWS_VIRTUALIZED);
  });

  it("renders an emptyState node when items array is empty", () => {
    render(
      <VirtualizedList
        items={[]}
        rowHeight={ROW_HEIGHT}
        getItemKey={getItemKey}
        renderRow={renderRowFn}
        className="overflow-auto"
        emptyState={<span data-testid="empty-msg">No items</span>}
      />,
    );
    expect(screen.getByTestId("empty-msg")).toBeInTheDocument();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
});

// ── Suite 2: Initial render wall-clock performance ────────────────────────────

describe("VirtualizedList – initial render wall-clock performance", () => {
  it(`renders 5 000 items within ${RENDER_BUDGET_5K_MS} ms`, () => {
    const items = makeItems(5_000);
    const t0 = performance.now();
    render(
      <VirtualizedList
        items={items}
        rowHeight={ROW_HEIGHT}
        getItemKey={getItemKey}
        renderRow={renderRowFn}
        className="overflow-auto"
      />,
    );
    const elapsed = performance.now() - t0;
    expect(elapsed).toBeLessThan(RENDER_BUDGET_5K_MS);
  });

  it(`renders 20 000 items within ${RENDER_BUDGET_20K_MS} ms`, () => {
    const items = makeItems(20_000);
    const t0 = performance.now();
    render(
      <VirtualizedList
        items={items}
        rowHeight={ROW_HEIGHT}
        getItemKey={getItemKey}
        renderRow={renderRowFn}
        className="overflow-auto"
      />,
    );
    const elapsed = performance.now() - t0;
    expect(elapsed).toBeLessThan(RENDER_BUDGET_20K_MS);
  });

  it(`renders 50 000 items within ${RENDER_BUDGET_50K_MS} ms`, () => {
    const items = makeItems(50_000);
    const t0 = performance.now();
    render(
      <VirtualizedList
        items={items}
        rowHeight={ROW_HEIGHT}
        getItemKey={getItemKey}
        renderRow={renderRowFn}
        className="overflow-auto"
      />,
    );
    const elapsed = performance.now() - t0;
    expect(elapsed).toBeLessThan(RENDER_BUDGET_50K_MS);
  });

  it("50K virtualized list renders no slower than 10× a 50-item plain list", () => {
    // Virtualization keeps DOM size constant regardless of total items.
    // Without virtualization, 50K items would be ~1 000× slower than 50 items.
    // With virtualization, it should be at most ~10× (mostly JS setup overhead).
    const bigItems = makeItems(50_000);
    const smallItems = makeItems(50);

    const t0 = performance.now();
    render(
      <VirtualizedList
        items={smallItems}
        rowHeight={ROW_HEIGHT}
        getItemKey={getItemKey}
        renderRow={renderRowFn}
        className="overflow-auto"
        virtualizeThreshold={100} // keep small list in non-virtual path for baseline
      />,
    );
    const smallElapsed = performance.now() - t0;

    const t1 = performance.now();
    render(
      <VirtualizedList
        items={bigItems}
        rowHeight={ROW_HEIGHT}
        getItemKey={getItemKey}
        renderRow={renderRowFn}
        className="overflow-auto"
      />,
    );
    const bigElapsed = performance.now() - t1;

    // Must also pass the absolute budget regardless of baseline variance.
    expect(bigElapsed).toBeLessThan(RENDER_BUDGET_50K_MS);
    // Virtualization efficiency: 50K should not take more than 10× a plain 50-item list.
    // A minimum floor of 5 ms prevents flaky failures when smallElapsed is near 0.
    expect(bigElapsed).toBeLessThan(Math.max(smallElapsed * 10, 5));
  });
});

// ── Suite 3: Interaction latency (≤ 1 000 ms rule) ───────────────────────────

describe("VirtualizedList – interaction latency", () => {
  it(`clicking a row in a 5K-item list updates state within ${INTERACTION_BUDGET_MS} ms`, () => {
    render(<InteractiveList initialItems={makeItems(5_000)} />);

    const buttons = screen.getAllByRole("button");
    const firstRowButton = buttons[0];

    const t0 = performance.now();
    fireEvent.click(firstRowButton);
    const elapsed = performance.now() - t0;

    // Verify the click actually triggered the handler (not a trivially true timing test).
    expect(screen.getByTestId("selected")).not.toHaveTextContent("none");
    expect(elapsed).toBeLessThan(INTERACTION_BUDGET_MS);
  });

  it(`clicking a row in a 50K-item list responds within ${INTERACTION_BUDGET_MS} ms`, () => {
    render(<InteractiveList initialItems={makeItems(50_000)} />);

    const buttons = screen.getAllByRole("button");
    const firstRowButton = buttons[0];

    const t0 = performance.now();
    fireEvent.click(firstRowButton);
    const elapsed = performance.now() - t0;

    expect(screen.getByTestId("selected")).not.toHaveTextContent("none");
    expect(elapsed).toBeLessThan(INTERACTION_BUDGET_MS);
  });

  it(`filter change re-renders within ${INTERACTION_BUDGET_MS} ms for 5K items`, () => {
    render(<InteractiveList initialItems={makeItems(5_000)} />);
    const input = screen.getByLabelText("filter");

    const t0 = performance.now();
    fireEvent.change(input, { target: { value: "Row-42" } });
    const elapsed = performance.now() - t0;

    // The filter itself (O(n) scan) plus React re-render must be within budget.
    expect(elapsed).toBeLessThan(INTERACTION_BUDGET_MS);
  });

  it(`filter change re-renders within ${INTERACTION_BUDGET_MS} ms for 50K items`, () => {
    render(<InteractiveList initialItems={makeItems(50_000)} />);
    const input = screen.getByLabelText("filter");

    const t0 = performance.now();
    fireEvent.change(input, { target: { value: "Row-42" } });
    const elapsed = performance.now() - t0;

    // 50K .filter() call + windowed re-render must stay well under 1 000 ms.
    expect(elapsed).toBeLessThan(INTERACTION_BUDGET_MS);
  });

  it("repeated clicks on different rows each respond within budget", () => {
    render(<InteractiveList initialItems={makeItems(5_000)} />);
    const buttons = screen.getAllByRole("button");
    const clickCount = Math.min(5, buttons.length);

    for (let i = 0; i < clickCount; i++) {
      const t0 = performance.now();
      fireEvent.click(buttons[i]);
      const elapsed = performance.now() - t0;
      expect(elapsed).toBeLessThan(INTERACTION_BUDGET_MS);
    }
  });
});

// ── Suite 4: React Profiler commit durations ──────────────────────────────────

describe("VirtualizedList – React Profiler commit durations", () => {
  it(`initial commit duration for 5K items is within ${PROFILER_COMMIT_5K_MS} ms`, () => {
    const durations: number[] = [];
    const onRender: ProfilerOnRenderCallback = (_, __, actualDuration) => {
      durations.push(actualDuration);
    };

    render(
      <Profiler id="list-5k" onRender={onRender}>
        <VirtualizedList
          items={makeItems(5_000)}
          rowHeight={ROW_HEIGHT}
          getItemKey={getItemKey}
          renderRow={renderRowFn}
          className="overflow-auto"
        />
      </Profiler>,
    );

    // Profiler fires at least once (initial mount commit).
    expect(durations.length).toBeGreaterThan(0);
    // actualDuration measures React rendering work only, excluding test harness overhead.
    const firstCommit = durations[0];
    expect(firstCommit).toBeLessThan(PROFILER_COMMIT_5K_MS);
  });

  it("re-render commit duration after 5K → 50K update stays within budget", () => {
    const renderCalls: { phase: string; duration: number }[] = [];
    const onRender: ProfilerOnRenderCallback = (_, phase, actualDuration) => {
      renderCalls.push({ phase, duration: actualDuration });
    };

    function ResizableList() {
      const [size, setSize] = useState(5_000);
      return (
        <div>
          <button type="button" onClick={() => setSize(50_000)}>
            grow-to-50k
          </button>
          <Profiler id="list-grow" onRender={onRender}>
            <VirtualizedList
              items={makeItems(size)}
              rowHeight={ROW_HEIGHT}
              getItemKey={getItemKey}
              renderRow={renderRowFn}
              className="overflow-auto"
            />
          </Profiler>
        </div>
      );
    }

    render(<ResizableList />);

    const mountDuration = renderCalls[renderCalls.length - 1]?.duration ?? 0;

    const t0 = performance.now();
    fireEvent.click(screen.getByRole("button", { name: "grow-to-50k" }));
    const wallClock = performance.now() - t0;

    const updateDuration = renderCalls[renderCalls.length - 1]?.duration ?? 0;

    // Wall-clock for the update must be within interaction budget.
    expect(wallClock).toBeLessThan(INTERACTION_BUDGET_MS);

    // Profiler commit duration for the update must not be much worse than initial mount.
    // Both operate on the same constant-size windowed DOM, so durations should be similar.
    // Budget: update commit < max(3× mount commit, 50 ms).
    expect(updateDuration).toBeLessThan(Math.max(mountDuration * 3, 50));
  });
});
