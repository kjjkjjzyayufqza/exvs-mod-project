import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { TypedParamDataPanel } from "./TypedParamDataPanel"
import type { TypedParamFile } from "./typedParamTypes"

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() },
}))

function sampleData(): TypedParamFile {
  return {
    header: { entrySize: 60 },
    fieldSpecs: [],
    entryIds: [0x75516b0d],
    entries: [
      {
        entryId: 0x75516b0d,
        mainEffectHash: 742107763,
      },
    ],
    trailingData: [],
  }
}

describe("TypedParamDataPanel Copy Effect button", () => {
  it("shows Copy Effect only for projectile_depiction_table", () => {
    const { rerender } = render(
      <TypedParamDataPanel
        fileType="projectile_depiction_table"
        data={sampleData()}
        selectedEntryIndex={0}
        onSelectEntry={() => {}}
        onChange={() => {}}
      />,
    )
    expect(screen.getByRole("button", { name: "Copy Effect" })).toBeInTheDocument()

    rerender(
      <TypedParamDataPanel
        fileType="bulletparam"
        data={sampleData()}
        selectedEntryIndex={0}
        onSelectEntry={() => {}}
        onChange={() => {}}
      />,
    )
    expect(screen.queryByRole("button", { name: "Copy Effect" })).not.toBeInTheDocument()
  })

  it("shows Import, JSON view, and Clone for typed param entries", () => {
    render(
      <TypedParamDataPanel
        fileType="armsparam"
        data={sampleData()}
        selectedEntryIndex={0}
        onSelectEntry={() => {}}
        onChange={() => {}}
      />,
    )
    expect(screen.getByRole("button", { name: "Import" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /^JSON$/ })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Clone" })).toBeInTheDocument()
  })
})
