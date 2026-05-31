import { fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import * as React from "react";
import { afterEach, describe, expect, it } from "vitest";
import {
  assertDurationWithinBudget,
  measureAsyncDurationMs,
  measureSyncDurationBudget,
} from "@/test/performance";
import type { Fhm2dPreviewCandidate, Fhm2dVirtualTreeNode } from "./fhm2dMemoryPreviewTypes";
import {
  flattenVirtualTree,
  groupPreviewCandidatesByFolder,
  indexVirtualTreeEntries,
} from "./fhm2dMemoryPreviewUtils";

function createLargeVirtualTree(
  folderCount: number,
  modelFilesPerFolder: number,
): Fhm2dVirtualTreeNode[] {
  return Array.from({ length: folderCount }, (_, folderIndex) => {
    const folderName = `folder_${folderIndex}`;
    const children = Array.from({ length: modelFilesPerFolder }, (_, fileIndex) => {
      const isModelFile = fileIndex % 3 !== 2;
      const suffix = isModelFile ? ".numdlb" : ".bin";
      return {
        id: `file:${folderIndex}:${fileIndex}`,
        kind: "file" as const,
        name: `model_${folderIndex}_${fileIndex}${suffix}`,
        virtualPath: `memory://session/${folderName}/model_${folderIndex}_${fileIndex}${suffix}`,
        relativePath: `${folderName}/model_${folderIndex}_${fileIndex}${suffix}`,
        parentRelativePath: folderName,
        fileIndex: folderIndex * 100 + fileIndex,
        fileType: suffix,
        size: 256 + fileIndex,
        childCount: 0,
        isModelRelated: isModelFile,
        hasReferenceIssue: false,
        selectedCandidate: false,
        children: [],
      };
    });

    return {
      id: `folder:${folderName}`,
      kind: "folder" as const,
      name: folderName,
      virtualPath: `memory://session/${folderName}`,
      relativePath: folderName,
      parentRelativePath: null,
      fileIndex: null,
      fileType: null,
      size: null,
      childCount: children.length,
      isModelRelated: true,
      hasReferenceIssue: false,
      selectedCandidate: false,
      children,
    };
  });
}

function createLargeCandidateList(
  folderCount: number,
  candidatesPerFolder: number,
): Fhm2dPreviewCandidate[] {
  return Array.from({ length: folderCount * candidatesPerFolder }, (_, index) => {
    const folderIndex = Math.floor(index / candidatesPerFolder);
    const candidateIndex = index % candidatesPerFolder;
    const folderRelativePath = `folder_${folderIndex}`;
    return {
      id: `candidate:${folderIndex}:${candidateIndex}`,
      displayLabel: `model_${folderIndex}_${candidateIndex}`,
      folderRelativePath,
      folderVirtualPath: `memory://session/${folderRelativePath}`,
      modlEntryId: `file:${folderIndex}:${candidateIndex}`,
      modlVirtualPath: `memory://session/${folderRelativePath}/model_${folderIndex}_${candidateIndex}.numdlb`,
      meshVirtualPath: `memory://session/${folderRelativePath}/model_${folderIndex}_${candidateIndex}.numshb`,
      skelVirtualPath: null,
      matlVirtualPaths: [
        `memory://session/${folderRelativePath}/model_${folderIndex}_${candidateIndex}.numatb`,
      ],
      nutexbVirtualPaths: [
        `memory://session/${folderRelativePath}/model_${folderIndex}_${candidateIndex}.nutexb`,
      ],
      issues: [],
      complete: candidateIndex % 5 !== 0,
    };
  });
}

function MemoryPreviewSearchHarness({
  tree,
}: {
  tree: Fhm2dVirtualTreeNode[];
}) {
  const [query, setQuery] = React.useState("");
  const deferredQuery = React.useDeferredValue(query);
  const rows = React.useMemo(
    () => flattenVirtualTree(tree, new Set(), deferredQuery, true),
    [tree, deferredQuery],
  );

  return (
    <div>
      <input
        aria-label="tree-search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <div data-testid="row-count">{rows.length}</div>
    </div>
  );
}

afterEach(() => {
  cleanup();
});

describe("memory preview performance budgets", () => {
  it("indexes large virtual trees within the ms budget", () => {
    const tree = createLargeVirtualTree(320, 10);
    const measurement = measureSyncDurationBudget(() => indexVirtualTreeEntries(tree), {
      iterations: 10,
      warmupIterations: 2,
      label: "indexVirtualTreeEntries",
    });

    expect(Object.keys(measurement.lastResult)).toHaveLength(3520);
    assertDurationWithinBudget(measurement, { averageMs: 18, maxMs: 35 });
  });

  it("flattens searched virtual trees within the ms budget", () => {
    const tree = createLargeVirtualTree(320, 10);
    const measurement = measureSyncDurationBudget(
      () => flattenVirtualTree(tree, new Set(), "model_319_4", true),
      {
        iterations: 10,
        warmupIterations: 2,
        label: "flattenVirtualTree(search)",
      },
    );

    expect(measurement.lastResult).toHaveLength(2);
    assertDurationWithinBudget(measurement, { averageMs: 20, maxMs: 40 });
  });

  it("groups large candidate lists within the ms budget", () => {
    const candidates = createLargeCandidateList(500, 5);
    const measurement = measureSyncDurationBudget(
      () => groupPreviewCandidatesByFolder(candidates),
      {
        iterations: 10,
        warmupIterations: 2,
        label: "groupPreviewCandidatesByFolder",
      },
    );

    expect(measurement.lastResult).toHaveLength(500);
    assertDurationWithinBudget(measurement, { averageMs: 15, maxMs: 30 });
  });

  it("updates tree search UI within the response budget in ms", async () => {
    const tree = createLargeVirtualTree(280, 12);
    render(<MemoryPreviewSearchHarness tree={tree} />);

    const initialCount = Number(screen.getByTestId("row-count").textContent ?? "0");
    expect(initialCount).toBeGreaterThan(2000);

    const elapsedMs = await measureAsyncDurationMs(async () => {
      fireEvent.change(screen.getByLabelText("tree-search"), {
        target: { value: "model_279_10" },
      });
      await waitFor(() => {
        expect(screen.getByTestId("row-count")).toHaveTextContent("2");
      });
    });

    expect(elapsedMs).toBeLessThanOrEqual(120);
  });
});
