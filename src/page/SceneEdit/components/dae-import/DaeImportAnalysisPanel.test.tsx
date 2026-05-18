import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { DaeImportAnalysisPanel } from "./DaeImportAnalysisPanel";
import type { DaeAnalysisResult, DaeMeshAnalysisRow } from "./daeImportTypes";

function makeMeshRow(overrides?: Partial<DaeMeshAnalysisRow>): DaeMeshAnalysisRow {
  return {
    name: "mesh_0",
    vertexCount: 1200,
    indexCount: 3600,
    triangleCount: 1200,
    normalCount: 1200,
    uvCount: 1200,
    normalsMatchVertices: true,
    uvsMatchVertices: true,
    boneInfluenceGroups: 3,
    maxInfluencesPerVertex: 4,
    exceedsFourInfluences: false,
    ...overrides,
  };
}

function makeAnalysis(overrides?: Partial<DaeAnalysisResult>): DaeAnalysisResult {
  return {
    daePath: "D:\\output\\test.dae",
    upAxis: "y_up",
    meshRows: [makeMeshRow()],
    boneCount: 5,
    boneNames: ["root", "spine", "arm_L", "arm_R", "head"],
    geometryNames: ["mesh_0"],
    blockingErrors: [],
    warnings: [],
    canConvert: true,
    ...overrides,
  };
}

describe("DaeImportAnalysisPanel", () => {
  it("renders spinner when analyzing", () => {
    render(
      <DaeImportAnalysisPanel
        analysis={null}
        analyzing={true}
        analyzeError={null}
      />,
    );
    expect(screen.getByText("Analyzing DAE...")).toBeInTheDocument();
  });

  it("renders error when analyzeError is set", () => {
    render(
      <DaeImportAnalysisPanel
        analysis={null}
        analyzing={false}
        analyzeError="Failed to parse DAE"
      />,
    );
    expect(screen.getByText("Failed to parse DAE")).toBeInTheDocument();
  });

  it("renders nothing when analysis is null and not analyzing", () => {
    const { container } = render(
      <DaeImportAnalysisPanel
        analysis={null}
        analyzing={false}
        analyzeError={null}
      />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("displays mesh count and aggregated vertex count from meshRows", () => {
    const analysis = makeAnalysis({
      meshRows: [
        makeMeshRow({ name: "body", vertexCount: 5000 }),
        makeMeshRow({ name: "head", vertexCount: 3000 }),
        makeMeshRow({ name: "weapon", vertexCount: 2000 }),
      ],
    });
    render(
      <DaeImportAnalysisPanel
        analysis={analysis}
        analyzing={false}
        analyzeError={null}
      />,
    );
    expect(screen.getByText(/Meshes: 3/)).toBeInTheDocument();
    expect(screen.getByText(/10,000/)).toBeInTheDocument();
    expect(screen.getByText(/Bones:\s*5/)).toBeInTheDocument();
  });

  it("displays single mesh correctly", () => {
    const analysis = makeAnalysis({
      meshRows: [makeMeshRow({ vertexCount: 42 })],
      boneCount: 0,
    });
    render(
      <DaeImportAnalysisPanel
        analysis={analysis}
        analyzing={false}
        analyzeError={null}
      />,
    );
    expect(screen.getByText(/Meshes: 1/)).toBeInTheDocument();
    expect(screen.getByText(/42/)).toBeInTheDocument();
    expect(screen.getByText(/Bones:\s*0/)).toBeInTheDocument();
  });

  it("displays warnings from analysis", () => {
    const analysis = makeAnalysis({
      warnings: ["UV count mismatch", "Non-standard bone hierarchy"],
    });
    render(
      <DaeImportAnalysisPanel
        analysis={analysis}
        analyzing={false}
        analyzeError={null}
      />,
    );
    expect(screen.getByText("UV count mismatch")).toBeInTheDocument();
    expect(screen.getByText("Non-standard bone hierarchy")).toBeInTheDocument();
  });

  it("displays blocking errors from analysis", () => {
    const analysis = makeAnalysis({
      canConvert: false,
      blockingErrors: ["No mesh geometry found"],
    });
    render(
      <DaeImportAnalysisPanel
        analysis={analysis}
        analyzing={false}
        analyzeError={null}
      />,
    );
    expect(screen.getByText("No mesh geometry found")).toBeInTheDocument();
  });

  it("handles empty meshRows without crashing", () => {
    const analysis = makeAnalysis({ meshRows: [], boneCount: 0 });
    render(
      <DaeImportAnalysisPanel
        analysis={analysis}
        analyzing={false}
        analyzeError={null}
      />,
    );
    expect(screen.getByText(/Meshes: 0/)).toBeInTheDocument();
    expect(screen.getByText(/Bones:\s*0/)).toBeInTheDocument();
  });

  it("matches real zabanya backpack_up.dae analysis shape", () => {
    const realAnalysis: DaeAnalysisResult = {
      daePath: "D:\\output\\exvs2\\zabanya\\backpack_up.dae",
      upAxis: "y_up",
      meshRows: [
        {
          name: "backpack_up_mesh",
          vertexCount: 846,
          indexCount: 4272,
          triangleCount: 1424,
          normalCount: 846,
          uvCount: 846,
          normalsMatchVertices: true,
          uvsMatchVertices: true,
          boneInfluenceGroups: 7,
          maxInfluencesPerVertex: 4,
          exceedsFourInfluences: false,
        },
      ],
      boneCount: 7,
      boneNames: ["root", "bone1", "bone2", "bone3", "bone4", "bone5", "bone6"],
      geometryNames: ["backpack_up_mesh"],
      blockingErrors: [],
      warnings: [],
      canConvert: true,
    };
    render(
      <DaeImportAnalysisPanel
        analysis={realAnalysis}
        analyzing={false}
        analyzeError={null}
      />,
    );
    expect(screen.getByText(/Meshes: 1/)).toBeInTheDocument();
    expect(screen.getByText(/846/)).toBeInTheDocument();
    expect(screen.getByText(/Bones:\s*7/)).toBeInTheDocument();
  });
});
