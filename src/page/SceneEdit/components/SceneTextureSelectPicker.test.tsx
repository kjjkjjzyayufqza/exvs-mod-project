import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SceneTextureSelectPicker } from "./SceneTextureSelectPicker";
import {
  useSceneTextureManagerStore,
  type TextureManagerEntry,
} from "../store/sceneTextureManagerStore";

function makeEntry(
  overrides: Partial<TextureManagerEntry> = {},
): TextureManagerEntry {
  return {
    id: overrides.id ?? "tex-1",
    filename: overrides.filename ?? "stage_wall_alb.nutexb",
    status: overrides.status ?? "existing",
    scope: overrides.scope ?? "model",
    infoCategory: overrides.infoCategory ?? null,
    format: overrides.format ?? "BC7_UNORM",
    width: overrides.width ?? 256,
    height: overrides.height ?? 256,
    sizeBytes: overrides.sizeBytes ?? 1024,
    referencedBy: overrides.referencedBy ?? [],
    thumbnailDataUrl: overrides.thumbnailDataUrl ?? null,
    nutexbPath:
      overrides.nutexbPath ?? `memory://stage/textures/${overrides.filename ?? "stage_wall_alb.nutexb"}`,
    sourceImagePath: overrides.sourceImagePath ?? null,
  };
}

describe("SceneTextureSelectPicker", () => {
  beforeEach(() => {
    useSceneTextureManagerStore.getState().clear();
  });

  afterEach(() => {
    useSceneTextureManagerStore.getState().clear();
  });

  it("refreshes visible options when scene texture entries change", async () => {
    useSceneTextureManagerStore.getState().setEntries([
      makeEntry({ id: "tex-1", filename: "stage_wall_alb.nutexb" }),
    ]);

    render(
      <SceneTextureSelectPicker
        value=""
        paramId="BaseColorMap"
        onChange={() => {}}
      />,
    );

    const input = screen.getByRole("combobox");
    act(() => {
      fireEvent.focus(input);
    });

    expect(await screen.findByText("stage_wall_alb")).toBeInTheDocument();

    act(() => {
      useSceneTextureManagerStore.getState().addEntry(
        makeEntry({
          id: "tex-2",
          filename: "stage_floor_nrm.nutexb",
        }),
      );
    });

    expect(await screen.findByText("stage_floor_nrm")).toBeInTheDocument();

    act(() => {
      useSceneTextureManagerStore.getState().removeEntry("tex-1");
    });

    expect(screen.queryByText("stage_wall_alb")).not.toBeInTheDocument();
    expect(screen.getByText("stage_floor_nrm")).toBeInTheDocument();
  });

  it("surfaces a newly added texture even when the unfiltered list is capped", async () => {
    useSceneTextureManagerStore.getState().setEntries(
      Array.from({ length: 81 }, (_, index) =>
        makeEntry({
          id: `tex-${index + 1}`,
          filename: `stage_tex_${String(index + 1).padStart(3, "0")}.nutexb`,
        }),
      ),
    );

    render(
      <SceneTextureSelectPicker
        value=""
        paramId="BaseColorMap"
        onChange={() => {}}
      />,
    );

    act(() => {
      fireEvent.focus(screen.getByRole("combobox"));
    });

    expect(screen.queryByText("recent_added")).not.toBeInTheDocument();

    act(() => {
      useSceneTextureManagerStore.getState().addEntry(
        makeEntry({
          id: "tex-added",
          filename: "recent_added.nutexb",
        }),
      );
    });

    expect(await screen.findByText("recent_added")).toBeInTheDocument();
  });

  it("surfaces a recently replaced texture even when it was outside the default cap", async () => {
    useSceneTextureManagerStore.getState().setEntries(
      Array.from({ length: 81 }, (_, index) =>
        makeEntry({
          id: `tex-${index + 1}`,
          filename: `stage_tex_${String(index + 1).padStart(3, "0")}.nutexb`,
        }),
      ),
    );

    render(
      <SceneTextureSelectPicker
        value=""
        paramId="BaseColorMap"
        onChange={() => {}}
      />,
    );

    act(() => {
      fireEvent.focus(screen.getByRole("combobox"));
    });

    expect(screen.queryByText("stage_tex_081")).not.toBeInTheDocument();

    act(() => {
      useSceneTextureManagerStore.getState().replaceEntry("tex-81", {
        format: "BC5_UNORM",
      });
    });

    expect(await screen.findByText("stage_tex_081")).toBeInTheDocument();
  });

  it("surfaces an unreferenced shared texture even when the default list is capped", async () => {
    useSceneTextureManagerStore.getState().setEntries([
      ...Array.from({ length: 80 }, (_, index) =>
        makeEntry({
          id: `tex-${index + 1}`,
          filename: `stage_tex_${String(index + 1).padStart(3, "0")}.nutexb`,
          referencedBy: ["base"],
        }),
      ),
      makeEntry({
        id: "atlas",
        filename: "atlas_66bdf54d_0.nutexb",
        referencedBy: [],
      }),
    ]);

    render(
      <SceneTextureSelectPicker
        value=""
        paramId="Texture1"
        onChange={() => {}}
      />,
    );

    act(() => {
      fireEvent.focus(screen.getByRole("combobox"));
    });

    expect(await screen.findByText("atlas_66bdf54d_0")).toBeInTheDocument();
  });

  it("does not show info folder textures as model material candidates", async () => {
    useSceneTextureManagerStore.getState().setEntries([
      makeEntry({ id: "model", filename: "stage_wall_alb.nutexb" }),
      makeEntry({
        id: "info",
        filename: "fog_lut.nutexb",
        scope: "info",
        infoCategory: "fog",
        nutexbPath: "E:/stage/info/fog/fog_lut.nutexb",
      }),
    ]);

    render(
      <SceneTextureSelectPicker
        value=""
        paramId="Texture1"
        onChange={() => {}}
      />,
    );

    act(() => {
      fireEvent.focus(screen.getByRole("combobox"));
    });

    expect(await screen.findByText("stage_wall_alb")).toBeInTheDocument();
    expect(screen.queryByText("fog_lut")).not.toBeInTheDocument();
  });

  it("matches and commits the basename when the user enters a full nutexb path", async () => {
    useSceneTextureManagerStore.getState().setEntries([
      makeEntry({ id: "atlas", filename: "atlas_66bdf54d_0.nutexb" }),
      makeEntry({ id: "wall", filename: "stage_wall_alb.nutexb" }),
    ]);

    const onChange = vi.fn();

    render(
      <SceneTextureSelectPicker
        value=""
        paramId="Texture1"
        onChange={onChange}
      />,
    );

    const input = screen.getByRole("combobox");
    act(() => {
      fireEvent.focus(input);
    });

    fireEvent.change(input, {
      target: {
        value: "E:\\XB\\解包\\com\\test\\0x16F73C97\\0\\0\\textures\\atlas_66bdf54d_0.nutexb",
      },
    });

    expect(await screen.findByText("atlas_66bdf54d_0")).toBeInTheDocument();

    fireEvent.keyDown(input, { key: "Enter" });

    expect(onChange).toHaveBeenLastCalledWith("atlas_66bdf54d_0");
  });
});
