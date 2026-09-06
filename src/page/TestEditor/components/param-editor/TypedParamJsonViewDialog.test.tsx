import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { TypedParamJsonViewDialog } from "./TypedParamJsonViewDialog"
import type { TypedParamFile } from "./typedParamTypes"

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() },
}))

vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({
  writeText: vi.fn(),
  readText: vi.fn(),
}))

vi.mock("@/components/AppRndModalShell", () => ({
  AppRndModalShell: ({
    title,
    headerActions,
    children,
    footer,
  }: {
    title: string
    headerActions?: React.ReactNode
    children: React.ReactNode
    footer?: React.ReactNode
  }) => (
    <div>
      <h2>{title}</h2>
      {headerActions}
      {children}
      {footer}
    </div>
  ),
}))

function sampleData(): TypedParamFile {
  return {
    header: { entryCount: 1, entrySize: 16 },
    fieldSpecs: [
      { entryOffset: 0, kind: 1 },
      { entryOffset: 4, kind: 1 },
    ],
    entryIds: [0x12345678],
    entries: [
      {
        entryId: 0x12345678,
        ammoCount: 1,
        initialAmmoCount: 1,
      },
    ],
    trailingData: [],
  }
}

describe("TypedParamJsonViewDialog", () => {
  it("applies edited JSON onto the selected entry", async () => {
    const onApply = vi.fn()
    const onClone = vi.fn()
    const onOpenChange = vi.fn()

    render(
      <TypedParamJsonViewDialog
        open
        onOpenChange={onOpenChange}
        fileType="armsparam"
        data={sampleData()}
        selectedEntryIndex={0}
        onApply={onApply}
        onClone={onClone}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "Edit" }))
    const editor = screen.getByRole("textbox", { name: "Edit entry JSON" })
    fireEvent.change(editor, {
      target: {
        value: JSON.stringify({
          fileType: "armsparam",
          index: 0,
          entryId: 0x12345678,
          entry: {
            entryId: 0x12345678,
            ammoCount: 2,
            initialAmmoCount: 2,
          },
        }),
      },
    })
    fireEvent.click(screen.getByRole("button", { name: "Apply to current" }))

    expect(onApply).toHaveBeenCalledTimes(1)
    expect(onApply.mock.calls[0]?.[0]).toMatchObject({
      entryId: 0x12345678,
      ammoCount: 2,
      initialAmmoCount: 2,
    })
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(onClone).not.toHaveBeenCalled()
  })

  it("clones edited JSON as a new unique entryId", () => {
    const onApply = vi.fn()
    const onClone = vi.fn()

    render(
      <TypedParamJsonViewDialog
        open
        onOpenChange={vi.fn()}
        fileType="armsparam"
        data={sampleData()}
        selectedEntryIndex={0}
        onApply={onApply}
        onClone={onClone}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "Clone as new" }))

    expect(onClone).toHaveBeenCalledTimes(1)
    expect(onClone.mock.calls[0]?.[0]).toMatchObject({
      entryId: 0x12345679,
      ammoCount: 1,
      initialAmmoCount: 1,
    })
    expect(onApply).not.toHaveBeenCalled()
  })
})
