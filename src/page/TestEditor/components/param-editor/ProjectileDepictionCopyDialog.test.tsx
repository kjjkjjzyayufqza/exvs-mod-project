import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { EffectFolderInventory } from "@/services/effectFolder/effectFolderService"
import { ProjectileDepictionCopyDialog } from "./ProjectileDepictionCopyDialog"
import type { TypedParamEntry, TypedParamFile } from "./typedParamTypes"

const inspectEffectFolder = vi.fn()
const copyEffectFolderSelection = vi.fn()
const invoke = vi.fn()

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal("ResizeObserver", ResizeObserverStub)

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() },
}))

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invoke(...args),
}))

vi.mock("@/services/effectFolder/effectFolderService", async () => {
  const actual = await vi.importActual<typeof import("@/services/effectFolder/effectFolderService")>(
    "@/services/effectFolder/effectFolderService",
  )
  return {
    ...actual,
    inspectEffectFolder: (...args: unknown[]) => inspectEffectFolder(...args),
    copyEffectFolderSelection: (...args: unknown[]) => copyEffectFolderSelection(...args),
  }
})

vi.mock("@/components/ui/filePathInput", () => ({
  FilePathInput: ({
    id,
    value,
    onChange,
    disabled,
    placeholder,
  }: {
    id?: string
    value: string
    onChange: (event: { target: { value: string } }) => void
    disabled?: boolean
    placeholder?: string
  }) => (
    <input
      id={id}
      aria-label={placeholder}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange({ target: { value: event.target.value } })}
    />
  ),
}))

const CURRENT_PATH = "E:\\XB\\mod\\006effect\\projectile_depiction_table.bin"
const OTHER_PATH = "E:\\XB\\mod\\006effect\\other\\projectile_depiction_table.bin"

function sampleEntry(): TypedParamEntry {
  return {
    entryId: 0x75516b0d,
    mainEffectHash: 0,
    subEffectHash: 0,
    modelHash: 0,
    trailEffectHash: 0,
    soundEffectHash: 0,
    materialHash: 0,
    spawnEffectHash: 0,
    destroyEffectHash: 0,
  }
}

function sampleFile(entries: TypedParamEntry[]): TypedParamFile {
  return {
    header: { entrySize: 60 },
    fieldSpecs: [],
    entryIds: entries.map((entry) => (typeof entry.entryId === "number" ? entry.entryId : 0)),
    entries,
    trailingData: [],
  }
}

function emptyInventory(): EffectFolderInventory {
  return {
    effectRoot: "E:\\XB\\mod\\006effect\\srcpack",
    structureJsonPath: "E:\\XB\\mod\\006effect\\srcpack_structure.json",
    summary: {
      totalFiles: 0,
      efxbnCount: 0,
      modelCount: 0,
      textureCount: 0,
      unresolvedModelIds: [],
      unresolvedTextureIds: [],
      commonModelIds: [],
      commonTextureIds: [],
    },
    efxbns: [],
    models: [],
    textures: [],
    otherFiles: [],
    commonPack: null,
    warnings: [],
  }
}

describe("ProjectileDepictionCopyDialog", () => {
  beforeEach(() => {
    inspectEffectFolder.mockReset()
    copyEffectFolderSelection.mockReset()
    invoke.mockReset()
  })

  it("shows a scan error when the source effect folder cannot be inspected", async () => {
    const user = userEvent.setup()
    inspectEffectFolder.mockRejectedValue(new Error("Missing structure JSON"))
    render(
      <ProjectileDepictionCopyDialog
        open
        onOpenChange={() => {}}
        data={sampleFile([sampleEntry()])}
        selectedEntryIndex={0}
        onApplyToCurrentFile={() => {}}
      />,
    )

    await user.type(screen.getByLabelText("Source effect folder"), "E:\\XB\\mod\\006effect\\missing")
    await user.click(screen.getByRole("button", { name: "Scan source" }))

    expect(await screen.findByRole("alert")).toHaveTextContent("Missing structure JSON")
    expect(inspectEffectFolder).toHaveBeenCalled()
  })

  it("keeps the current table in memory when the selected row is already present", async () => {
    const user = userEvent.setup()
    const onApply = vi.fn()
    render(
      <ProjectileDepictionCopyDialog
        open
        onOpenChange={() => {}}
        data={sampleFile([sampleEntry()])}
        selectedEntryIndex={0}
        sourceFilePath={CURRENT_PATH}
        onApplyToCurrentFile={onApply}
      />,
    )

    await user.click(screen.getByRole("button", { name: "Next" }))
    await user.type(screen.getByLabelText("Target projectile_depiction_table.bin"), CURRENT_PATH)
    await user.click(screen.getByRole("button", { name: "Write depiction row" }))

    expect(await screen.findByRole("alert")).toHaveTextContent(/already contains this selected entry/i)
    expect(onApply).not.toHaveBeenCalled()
    expect(invoke).not.toHaveBeenCalled()
  })

  it("parses and rebuilds a different target bin", async () => {
    const user = userEvent.setup()
    invoke.mockImplementation(async (command: string) => {
      if (command === "parse_typed_param_file") return sampleFile([])
      return undefined
    })
    render(
      <ProjectileDepictionCopyDialog
        open
        onOpenChange={() => {}}
        data={sampleFile([sampleEntry()])}
        selectedEntryIndex={0}
        sourceFilePath={CURRENT_PATH}
        onApplyToCurrentFile={() => {}}
      />,
    )

    await user.click(screen.getByRole("button", { name: "Next" }))
    await user.type(screen.getByLabelText("Target projectile_depiction_table.bin"), OTHER_PATH)
    await user.click(screen.getByRole("button", { name: "Write depiction row" }))

    await waitFor(() => expect(invoke).toHaveBeenCalledWith("parse_typed_param_file", expect.any(Object)))
    expect(invoke).toHaveBeenCalledWith(
      "build_typed_param_file",
      expect.objectContaining({ outputPath: OTHER_PATH, paramType: "projectile_depiction_table" }),
    )
  })

  it("does not write when the target already has the entry and replace is not confirmed", async () => {
    const user = userEvent.setup()
    invoke.mockResolvedValue(sampleFile([sampleEntry()]))
    render(
      <ProjectileDepictionCopyDialog
        open
        onOpenChange={() => {}}
        data={sampleFile([sampleEntry()])}
        selectedEntryIndex={0}
        sourceFilePath={CURRENT_PATH}
        onApplyToCurrentFile={() => {}}
      />,
    )

    await user.click(screen.getByRole("button", { name: "Next" }))
    await user.type(screen.getByLabelText("Target projectile_depiction_table.bin"), OTHER_PATH)
    await user.click(screen.getByRole("button", { name: "Write depiction row" }))

    expect(await screen.findByRole("alert")).toHaveTextContent(/already exists/i)
    expect(invoke).toHaveBeenCalledWith("parse_typed_param_file", expect.any(Object))
    expect(invoke).not.toHaveBeenCalledWith("build_typed_param_file", expect.anything())
  })
})
