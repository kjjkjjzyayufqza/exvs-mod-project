import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { SkeletonReadonlyTab } from "./SkeletonReadonlyTab";
import { MeshReadonlyTab } from "./MeshReadonlyTab";
import { TexturesReadonlyTab } from "./TexturesReadonlyTab";
import { canOpenDetailView } from "./sceneDetailViewTypes";

describe("canOpenDetailView", () => {
  it("returns true for base, sub_model, imported_dae, effect", () => {
    expect(canOpenDetailView("base")).toBe(true);
    expect(canOpenDetailView("sub_model")).toBe(true);
    expect(canOpenDetailView("imported_dae")).toBe(true);
    expect(canOpenDetailView("effect")).toBe(true);
  });

  it("returns false for root, placement, textures, collision", () => {
    expect(canOpenDetailView("root")).toBe(false);
    expect(canOpenDetailView("placement")).toBe(false);
    expect(canOpenDetailView("textures")).toBe(false);
    expect(canOpenDetailView("collision")).toBe(false);
  });
});

describe("SkeletonReadonlyTab", () => {
  it("shows empty message when skel is null", () => {
    render(<SkeletonReadonlyTab skel={null} />);
    expect(screen.getByText(/No skeleton data/)).toBeInTheDocument();
  });

  it("renders bone tree with count", () => {
    const skel = {
      bones: [
        { name: "root", transform: [[1, 0, 0, 0]], parent_index: null, billboard_type: null },
        { name: "spine", transform: [[1, 0, 0, 0]], parent_index: 0, billboard_type: null },
        { name: "head", transform: [[1, 0, 0, 0]], parent_index: 1, billboard_type: null },
      ],
    };
    render(<SkeletonReadonlyTab skel={skel} />);
    expect(screen.getByText("Bone Count: 3")).toBeInTheDocument();
    expect(screen.getByText("root")).toBeInTheDocument();
    expect(screen.getByText("spine")).toBeInTheDocument();
  });
});

describe("MeshReadonlyTab", () => {
  it("shows empty message when mesh is null", () => {
    render(<MeshReadonlyTab mesh={null} />);
    expect(screen.getByText(/No mesh data/)).toBeInTheDocument();
  });

  it("renders mesh objects table", () => {
    const mesh = {
      major_version: 1,
      minor_version: 0,
      is_vs2: false,
      objects: [
        {
          name: "body_shape",
          subindex: 0,
          parent_bone_name: "root",
          vertex_indices: [0, 1, 2, 3, 4, 5],
          positions: [{ name: "Position0", data: { Vector3: [[0, 0, 0], [1, 1, 1], [2, 2, 2]] } }],
          normals: [],
          texture_coordinates: [{ name: "map1", data: { Vector2: [[0, 0], [1, 1], [0.5, 0.5]] } }],
        },
      ],
    };
    render(<MeshReadonlyTab mesh={mesh} />);
    expect(screen.getByText("Objects: 1")).toBeInTheDocument();
    expect(screen.getByText("body_shape")).toBeInTheDocument();
  });
});

describe("TexturesReadonlyTab", () => {
  it("shows empty message when no textures", () => {
    render(<TexturesReadonlyTab textureResolve={[]} resolvedPaths={[]} />);
    expect(screen.getByText(/No texture references/)).toBeInTheDocument();
  });

  it("renders resolved and missing textures", () => {
    const textureResolve = [
      { reference: "alb_body", nutexbPath: "D:\\textures\\alb_body.nutexb" },
      { reference: "nrm_body", nutexbPath: null },
    ];
    render(<TexturesReadonlyTab textureResolve={textureResolve} resolvedPaths={[]} />);
    expect(screen.getByText("Resolved: 1")).toBeInTheDocument();
    expect(screen.getByText("Missing: 1")).toBeInTheDocument();
    expect(screen.getByText("alb_body")).toBeInTheDocument();
    expect(screen.getByText("nrm_body")).toBeInTheDocument();
  });
});
