// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type {
  EfxbnControlLookupEntry,
  EfxbnEffectSummary,
  EfxbnSummary,
} from "@/services/effectFolder/effectFolderService";
import { EfxbnGraphCanvas } from "./EfxbnGraphCanvas";
import { EfxbnGraphEditor } from "./EfxbnGraphEditor";
import { EfxbnColorAuthor } from "./EfxbnColorAuthor";
import {
  EFXBN_CONTROL_NAMES,
  acceptEfxbnDocumentWrite,
  createEfxbnDocument,
  readEfxbnCurve,
  replaceEfxbnCurves,
  type EfxbnDocument,
} from "./efxbnDocument";
import { makeEfxbnEffectBlock } from "./efxbnTestFactory";

beforeAll(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class ResizeObserverStub {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

function lookup(index: number, key: number, value: number): EfxbnControlLookupEntry {
  return { index, key, value, keyF32Bits: 0, valueF32Bits: 0 };
}

function makeDocument(): EfxbnDocument {
  const entries: EfxbnControlLookupEntry[] = [];
  const controlReferences = EFXBN_CONTROL_NAMES.map((name, index) => {
    entries.push(lookup(index, 0, index === 12 ? 1 : index));
    return {
      index,
      name,
      rawOffset: 0x58 + index * 8,
      runtimeOffset: 0x60 + index * 8,
      selector: 1,
      lookupIndex: index,
    };
  });
  const effect = makeEfxbnEffectBlock({ index: 0, controlReferences }) as EfxbnEffectSummary;
  const summary = {
    path: "E:/pack/0/0/30.efxbn",
    magic: "EFXB",
    versionOrFlags: 0,
    fileSize: 0,
    actualSize: 0,
    effectCount: 1,
    curveKeyCount: entries.length,
    controlLookupRegionOffset: 0,
    controlLookupRegionSize: entries.length * 8,
    controlLookupRegionEnd: entries.length * 8,
    modelControlConfigCount: 0,
    modelControlRegionOffset: 0,
    modelControlRegionSize: 0,
    trailingOffset: 0,
    blockRegionOffset: 0x18,
    modelIds: [],
    animationIds: [],
    modelControlTextureIds: [],
    controlLookupEntries: entries,
    effects: [effect],
    modelControls: [],
    textureParameters: [],
    todo: { unknowns: [] },
  } as unknown as EfxbnSummary;
  return createEfxbnDocument(summary, summary.path, "E:/pack");
}

function makeColorDocument(): EfxbnDocument {
  let document = makeDocument();
  document = replaceEfxbnCurves(
    document,
    0,
    [
      { controlName: "colorR", keys: [{ key: 0, value: 1 }, { key: 100, value: 0.5 }] },
      { controlName: "colorG", keys: [{ key: 0, value: 1.75 }, { key: 100, value: 1.25 }] },
      { controlName: "colorA", keys: [{ key: 0, value: 0 }, { key: 20, value: 0.75 }, { key: 100, value: 0 }] },
    ],
    "Fixture curves",
  );
  return acceptEfxbnDocumentWrite(document, document.summary);
}

describe("EfxbnGraphCanvas", () => {
  it("renders named linear curves, accessible keys, and a playhead", () => {
    render(
      <EfxbnGraphCanvas
        width={800}
        height={260}
        curves={[
          {
            name: "colorR",
            visible: true,
            color: "#F87171",
            keys: [{ key: 0, value: 1 }, { key: 100, value: 0.5 }],
          },
        ]}
        view={{ progressMin: 0, progressMax: 100, valueMin: 0, valueMax: 2 }}
        progress={20}
        frameCount={100}
        selection={[]}
        disabled={false}
        onSelectionChange={vi.fn()}
        onPreviewDrag={vi.fn()}
        onCommitDrag={vi.fn()}
        onDeleteSelection={vi.fn()}
        onNudgeSelection={vi.fn()}
        onProgressChange={vi.fn()}
        onViewChange={vi.fn()}
      />,
    );
    expect(screen.getByRole("application", { name: "EFXBN curve graph" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "colorR key at frame 0, value 1" })).toBeInTheDocument();
    expect(screen.getByTestId("efxbn-playhead")).toHaveAttribute("data-progress", "20");
  });

  it("coalesces playhead scrubbing to one progress callback per animation frame", () => {
    const frames: FrameRequestCallback[] = [];
    const originalRaf = globalThis.requestAnimationFrame;
    const originalCaf = globalThis.cancelAnimationFrame;
    globalThis.requestAnimationFrame = ((callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    }) as typeof requestAnimationFrame;
    globalThis.cancelAnimationFrame = ((id: number) => {
      const index = id - 1;
      if (index >= 0 && index < frames.length) frames[index] = () => undefined;
    }) as typeof cancelAnimationFrame;
    const onProgressChange = vi.fn();
    render(
      <EfxbnGraphCanvas
        width={800}
        height={260}
        curves={[
          {
            name: "colorR",
            visible: true,
            color: "#F87171",
            keys: [{ key: 0, value: 1 }, { key: 100, value: 0.5 }],
          },
        ]}
        view={{ progressMin: 0, progressMax: 100, valueMin: 0, valueMax: 2 }}
        progress={20}
        frameCount={100}
        selection={[]}
        disabled={false}
        onSelectionChange={vi.fn()}
        onPreviewDrag={vi.fn()}
        onCommitDrag={vi.fn()}
        onDeleteSelection={vi.fn()}
        onNudgeSelection={vi.fn()}
        onProgressChange={onProgressChange}
        onViewChange={vi.fn()}
      />,
    );
    const graph = screen.getByRole("application", { name: "EFXBN curve graph" });
    Object.assign(graph, {
      setPointerCapture: vi.fn(),
      hasPointerCapture: vi.fn(() => true),
      releasePointerCapture: vi.fn(),
    });
    try {
      fireEvent.pointerDown(graph, { button: 0, pointerId: 1, clientX: 48, clientY: 8 });
      fireEvent.pointerMove(graph, { pointerId: 1, clientX: 200, clientY: 8 });
      fireEvent.pointerMove(graph, { pointerId: 1, clientX: 400, clientY: 8 });
      expect(onProgressChange.mock.calls.length).toBeLessThanOrEqual(1);
      frames[0]?.(0);
      expect(onProgressChange).toHaveBeenCalled();
      expect(onProgressChange.mock.calls.length).toBeLessThanOrEqual(2);
      const last = onProgressChange.mock.calls.at(-1)?.[0] as number;
      expect(last).toBeGreaterThan(20);
    } finally {
      globalThis.requestAnimationFrame = originalRaf;
      globalThis.cancelAnimationFrame = originalCaf;
    }
  });

  it("does not restore stale key refs after a drag click", () => {
    const selection = [
      { controlName: "colorR" as const, sourceKey: 0 },
      { controlName: "colorR" as const, sourceKey: 100 },
    ];
    const onSelectionChange = vi.fn();
    const onCommitDrag = vi.fn();
    render(
      <EfxbnGraphCanvas
        width={800}
        height={260}
        curves={[
          {
            name: "colorR",
            visible: true,
            color: "#F87171",
            keys: [{ key: 0, value: 1 }, { key: 100, value: 0.5 }],
          },
        ]}
        view={{ progressMin: 0, progressMax: 100, valueMin: 0, valueMax: 2 }}
        progress={20}
        frameCount={100}
        selection={selection}
        disabled={false}
        onSelectionChange={onSelectionChange}
        onPreviewDrag={vi.fn()}
        onCommitDrag={onCommitDrag}
        onDeleteSelection={vi.fn()}
        onNudgeSelection={vi.fn()}
        onProgressChange={vi.fn()}
        onViewChange={vi.fn()}
      />,
    );
    const graph = screen.getByRole("application", { name: "EFXBN curve graph" });
    Object.assign(graph, {
      setPointerCapture: vi.fn(),
      hasPointerCapture: vi.fn(() => false),
      releasePointerCapture: vi.fn(),
    });
    const key = screen.getByRole("button", { name: "colorR key at frame 0, value 1" });
    fireEvent.pointerDown(key, { button: 0, pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(graph, { pointerId: 1, clientX: 120, clientY: 100 });
    fireEvent.pointerUp(graph, { pointerId: 1, clientX: 120, clientY: 100 });
    fireEvent.click(key);

    expect(onCommitDrag).toHaveBeenCalledTimes(1);
    expect(onSelectionChange).toHaveBeenLastCalledWith(selection);
  });
});

describe("EfxbnGraphEditor", () => {
  it("lists all 18 channels and inserts a sampled key at the playhead", async () => {
    const user = userEvent.setup();
    const document = makeDocument();
    const onDocumentChange = vi.fn();
    render(
      <EfxbnGraphEditor
        document={document}
        blockIndex={0}
        progress={25}
        frameCount={100}
        focusedControlName="colorR"
        onFocusedControlNameChange={vi.fn()}
        onProgressChange={vi.fn()}
        onDocumentChange={onDocumentChange}
        onError={vi.fn()}
      />,
    );
    expect(screen.getAllByRole("checkbox", { name: /show .* curve/i })).toHaveLength(18);
    await user.click(screen.getByRole("button", { name: "Insert key for colorR at frame 25" }));
    const next = onDocumentChange.mock.calls[0]![0] as EfxbnDocument;
    expect(readEfxbnCurve(next.summary, 0, "colorR").keys).toEqual([
      { key: 0, value: 1 },
      { key: 25, value: 1 },
    ]);
  });

  it("freezes authoring during a write but still allows scrubbing", () => {
    render(
      <EfxbnGraphEditor
        document={makeDocument()}
        blockIndex={0}
        progress={25}
        frameCount={100}
        writing
        focusedControlName="colorR"
        onFocusedControlNameChange={vi.fn()}
        onProgressChange={vi.fn()}
        onDocumentChange={vi.fn()}
        onError={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: /insert key for colorR/i })).toBeDisabled();
    expect(screen.getByRole("slider", { name: "EFXBN progress" })).toBeEnabled();
  });
});

describe("EfxbnColorAuthor", () => {
  it("edits animated color channels when the playhead is on their keys", () => {
    const document = makeColorDocument();
    render(
      <EfxbnColorAuthor
        document={document}
        block={document.summary.effects[0]!}
        progress={100}
        frameCount={100}
        focusedControlName="colorR"
        onFocusedControlNameChange={vi.fn()}
        onDocumentChange={vi.fn()}
        onError={vi.fn()}
      />,
    );
    expect(screen.getByRole("spinbutton", { name: "R channel" })).toBeEnabled();
    expect(screen.getByRole("spinbutton", { name: "G channel" })).toBeEnabled();
    expect(screen.getByRole("spinbutton", { name: "B channel" })).toBeEnabled();
    expect(screen.getByRole("spinbutton", { name: "A channel" })).toBeEnabled();
  });

  it("requires explicit key insertion between animated keys", () => {
    const document = makeColorDocument();
    render(
      <EfxbnColorAuthor
        document={document}
        block={document.summary.effects[0]!}
        progress={50}
        frameCount={100}
        focusedControlName="colorR"
        onFocusedControlNameChange={vi.fn()}
        onDocumentChange={vi.fn()}
        onError={vi.fn()}
      />,
    );
    expect(screen.getByRole("spinbutton", { name: "R channel" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Insert R key at frame 50" })).toBeEnabled();
  });
});
