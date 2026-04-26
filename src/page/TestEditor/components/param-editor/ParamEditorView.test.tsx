import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import ParamEditorView from "./ParamEditorView"

const invokeMock = vi.fn()
const getSettingMock = vi.fn()
const onTypedChangeMock = vi.fn()

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (command: string, args: unknown) => invokeMock(command, args),
}))

vi.mock("@tauri-apps/plugin-fs", () => ({
  writeFile: vi.fn(),
}))

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock("@/store/configStore", () => ({
  useConfigStore: (selector: (state: { getSetting: typeof getSettingMock }) => unknown) =>
    selector({ getSetting: getSettingMock }),
}))

vi.mock("@/components/ui/filePathInput", () => ({
  FilePathInput: ({
    value,
    onChange,
  }: {
    value: string
    onChange: (event: { target: { value: string } }) => void
  }) => (
    <input
      aria-label="File"
      value={value}
      onChange={(event) => onChange({ target: { value: event.target.value } })}
    />
  ),
}))

vi.mock("@/components/ui/select", () => ({
  Select: ({
    value,
    onValueChange,
    children,
  }: {
    value: string
    onValueChange: (value: string) => void
    children: React.ReactNode
  }) => (
    <select aria-label="Table type" value={value} onChange={(event) => onValueChange(event.target.value)}>
      {children}
    </select>
  ),
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => (
    <option value={value}>{children}</option>
  ),
  SelectTrigger: () => null,
  SelectValue: () => null,
}))

vi.mock("./TypedParamDataPanel", () => ({
  TypedParamDataPanel: ({
    fileType,
    data,
    onChange,
  }: {
    fileType: string
    data: { entries: Array<Record<string, unknown>> }
    onChange: (next: { entries: Array<Record<string, unknown>> }) => void
  }) => (
    <div>
      <span data-testid="typed-file-type">{fileType}</span>
      <button
        type="button"
        onClick={() => {
          const next = { ...data, entries: [{ entryId: 1, value: 2 }] }
          onTypedChangeMock(next)
          onChange(next)
        }}
      >
        Make dirty
      </button>
    </div>
  ),
}))

vi.mock("./ChrSysDataPanel", () => ({
  ChrSysDataPanel: () => <div>Chr sys panel</div>,
}))

describe("ParamEditorView table type changes", () => {
  beforeEach(() => {
    invokeMock.mockReset()
    getSettingMock.mockReset()
    onTypedChangeMock.mockReset()
    getSettingMock.mockResolvedValue("E:\\params\\armsparam.bin")
    invokeMock.mockResolvedValue({
      entries: [{ entryId: 1, value: 1 }],
      entryIds: [1],
      fieldSpecs: [],
    })
  })

  it("keeps the current type until dirty changes are explicitly discarded", async () => {
    const user = userEvent.setup()
    const onUnsavedChanges = vi.fn()

    render(<ParamEditorView onUnsavedChanges={onUnsavedChanges} />)

    await waitFor(() => expect(screen.getByRole("button", { name: /^load$/i })).toBeEnabled())
    await user.click(screen.getByRole("button", { name: /^load$/i }))
    await screen.findByText("Make dirty")

    await user.click(screen.getByText("Make dirty"))
    await user.selectOptions(screen.getByLabelText("Table type"), "bulletparam")

    expect(screen.getByText("Discard unsaved changes and switch type?")).toBeInTheDocument()
    expect(screen.getByLabelText("Table type")).toHaveValue("armsparam")

    await user.click(screen.getByRole("button", { name: /cancel/i }))

    expect(screen.queryByText("Discard unsaved changes and switch type?")).not.toBeInTheDocument()
    expect(screen.getByLabelText("Table type")).toHaveValue("armsparam")

    await user.selectOptions(screen.getByLabelText("Table type"), "bulletparam")
    await user.click(screen.getByRole("button", { name: /discard changes/i }))

    expect(screen.getByLabelText("Table type")).toHaveValue("bulletparam")
    expect(screen.queryByText("Make dirty")).not.toBeInTheDocument()
    expect(onUnsavedChanges).toHaveBeenLastCalledWith(false)
  })
})
