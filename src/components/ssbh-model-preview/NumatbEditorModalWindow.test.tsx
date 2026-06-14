import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createEmptyNumatbFile } from "./daeSsbhTypes";
import {
  NumatbEditorModalWindow,
  type NumatbEditorWindowSession,
} from "./NumatbEditorModalWindow";

vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({
  writeText: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
}));

vi.mock("@tauri-apps/api/path", () => ({
  join: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-fs", () => ({
  writeTextFile: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock("./NumatbTemplateEditorModalBody", () => ({
  NumatbTemplateEditorModalBody: ({
    onCopyProfilesJson,
  }: {
    onCopyProfilesJson?: () => void | Promise<void>;
  }) => (
    <div>
      {onCopyProfilesJson ? (
        <button
          type="button"
          aria-label="Copy NUMATB profiles as JSON"
          onClick={() => void onCopyProfilesJson()}
        >
          Copy JSON
        </button>
      ) : null}
    </div>
  ),
}));

vi.mock("./SsbhEditorModalWindowShell", () => ({
  isSsbhEditorDialogActive: vi.fn(() => false),
  SsbhEditorModalWindowShell: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

function profile(materialLabel: string) {
  const file = createEmptyNumatbFile();
  file.entries.push({
    material_label: materialLabel,
    shader_label: "",
    textures: [],
    samplers: [],
    floats: [],
    booleans: [],
    vectors: [],
    colors: [],
    rasterizer_states: [],
    blend_states: [],
  });
  return file;
}

function createSession(): NumatbEditorWindowSession {
  const bundle = {
    mayaFile: profile("maya_material"),
    nustFile: profile("nust_material"),
    mirrorTexturePathsAcrossProfiles: true,
  };
  return {
    id: "numatb-1",
    filePath: "E:\\unit\\body__maya__.numatb",
    primaryProfile: "maya",
    profilePaths: {
      maya: "E:\\unit\\body__maya__.numatb",
      nust: "E:\\unit\\body__nust__.numatb",
    },
    loading: false,
    saving: false,
    loadError: null,
    baseData: bundle,
    draftData: bundle,
    isDirty: false,
    zIndex: 1000,
  };
}

describe("NumatbEditorModalWindow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("exposes the AI copy action and copies both current profiles", async () => {
    render(
      <NumatbEditorModalWindow
        session={createSession()}
        cascadeIndex={0}
        onActivate={() => {}}
        onCloseRequest={() => {}}
        onDraftChange={() => {}}
        onSave={() => {}}
        onReset={() => {}}
        onReloadRequest={() => {}}
      />,
    );

    fireEvent.click(screen.getByLabelText("Copy NUMATB profiles as JSON"));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledTimes(1);
    });
    const payload = JSON.parse(String(vi.mocked(writeText).mock.calls[0][0]));
    expect(payload.modelName).toBe("body");
    expect(payload.numatbPaths).toEqual({
      maya: "E:\\unit\\body__maya__.numatb",
      nust: "E:\\unit\\body__nust__.numatb",
    });
    expect(payload.mayaProfile.entries[0].material_label).toBe("maya_material");
    expect(payload.nustProfile.entries[0].material_label).toBe("nust_material");
  });
});
