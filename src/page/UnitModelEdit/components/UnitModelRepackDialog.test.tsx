import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { UnitModelRepackDialog } from "./UnitModelRepackDialog";
import type { UnitModelValidationResult } from "../utils/unitModelRepackService";

const { buildPathMock, repackMock, toastErrorMock, validateMock } = vi.hoisted(() => ({
  buildPathMock: vi.fn(),
  repackMock: vi.fn(),
  toastErrorMock: vi.fn(),
  validateMock: vi.fn(),
}));

vi.mock("@/components/AppRndModalShell", () => ({
  AppRndModalShell: ({
    children,
    footer,
    title,
  }: {
    children: React.ReactNode;
    footer?: React.ReactNode;
    title: string;
  }) => (
    <div>
      <h1>{title}</h1>
      {children}
      <footer>{footer}</footer>
    </div>
  ),
}));

vi.mock("sonner", () => ({
  toast: {
    error: toastErrorMock,
    success: vi.fn(),
  },
}));

vi.mock("../utils/unitModelRepackService", () => ({
  inferUnitModelModOutputPath: vi.fn((modFolder: string, structurePath: string) => {
    const name = structurePath.split(/[\\/]/).pop()?.replace(/_structure\.json$/i, ".fhm2d") ?? "unit.fhm2d";
    return `${modFolder}\\${name}`;
  }),
  repackValidatedUnitModelFolderToModFolder: repackMock,
  validateUnitModelForRepack: validateMock,
}));

vi.mock("@/utils/repackRunner", () => ({
  buildRepackOutputPathFromMetadata: buildPathMock,
}));

const validValidation: UnitModelValidationResult = {
  valid: true,
  modelRoot: "E:\\pkg\\0xTEST",
  structureJsonPath: "E:\\pkg\\0xTEST_structure.json",
  summary: {
    modelCount: 1,
    numatbCount: 2,
    nuhlpbCount: 1,
    shlCount: 1,
    shlDeclaredModelCount: null,
    textureReferenceCount: 0,
  },
  errors: [],
  warnings: ["Legacy SHL referenced but missing on disk: .\\0xTEST\\shell_model.shl"],
};

const blockedValidation: UnitModelValidationResult = {
  ...validValidation,
  valid: false,
  errors: [
    {
      phase: "files",
      model: "model_a",
      message: "Referenced file is missing on disk: .\\0xTEST\\model_a.nusktb",
      path: "E:\\pkg\\0xTEST\\model_a.nusktb",
    },
  ],
};

function renderDialog(validation: UnitModelValidationResult | null, overrides = {}) {
  return render(
    <UnitModelRepackDialog
      open
      modelRoot="E:\\pkg\\0xTEST"
      structurePath="E:\\pkg\\0xTEST_structure.json"
      modFolder="E:\\mod"
      folderName="0xTEST"
      validation={validation}
      isValidating={false}
      onOpenChange={vi.fn()}
      onValidationResult={vi.fn()}
      onRepacked={vi.fn()}
      {...overrides}
    />,
  );
}

describe("UnitModelRepackDialog", () => {
  beforeEach(() => {
    buildPathMock.mockReset();
    buildPathMock.mockImplementation(async (_structurePath: string, outputDir: string) => `${outputDir}\\0xTEST.fhm2d`);
    validateMock.mockReset();
    repackMock.mockReset();
    toastErrorMock.mockReset();
  });

  it("shows blocking validation issues and disables repack", () => {
    renderDialog(blockedValidation);

    expect(screen.getByText("Repack blocked by 1 issue(s)")).toBeInTheDocument();
    expect(screen.getByText(blockedValidation.errors[0].message)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Repack/ })).toBeDisabled();
  });

  it("writes final guard validation failures back to shared state", async () => {
    const onValidationResult = vi.fn();
    validateMock.mockResolvedValueOnce(blockedValidation);

    renderDialog(validValidation, { onValidationResult });
    fireEvent.click(screen.getByRole("button", { name: /Repack/ }));

    await waitFor(() => expect(validateMock).toHaveBeenCalledTimes(1));
    expect(onValidationResult).toHaveBeenCalledWith(blockedValidation);
    expect(repackMock).not.toHaveBeenCalled();
    expect(toastErrorMock).toHaveBeenCalledWith(
      "Repack blocked by validation",
      expect.objectContaining({ description: blockedValidation.errors[0].message }),
    );
  });
});
