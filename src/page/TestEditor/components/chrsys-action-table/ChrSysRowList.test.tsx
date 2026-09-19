import { fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ACTION_FIELD } from "./chrSysModel"
import { ChrSysRowList } from "./ChrSysRowList"

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getTotalSize: () => count * 46,
    getVirtualItems: () =>
      Array.from({ length: count }, (_, index) => ({
        index,
        key: index,
        size: 46,
        start: index * 46,
      })),
  }),
}))

function emptyRow(): number[] {
  return new Array<number>(128).fill(0)
}

function actionRow(hash: number, commandType = 0): number[] {
  const cells = emptyRow()
  cells[ACTION_FIELD.actionHash] = hash
  cells[ACTION_FIELD.commandType] = commandType
  return cells
}

describe("ChrSysRowList", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("renders row labels as selectable text instead of buttons", () => {
    const { container } = render(
      <ChrSysRowList
        rows={[emptyRow(), actionRow(0xdfd66752)]}
        visibleIndices={[1]}
        tableKey="actionTable"
        selectedRow={1}
        onSelectRow={vi.fn()}
        issues={[]}
      />,
    )

    expect(container.querySelector("button")).toBeNull()
    const option = screen.getByRole("option", { name: /0xDFD66752/ })
    expect(option).toHaveClass("select-text")
    expect(option).toHaveTextContent("Shot")
    expect(screen.getByText("0xDFD66752")).toHaveClass("select-text")
  })

  it("selects a row on click when the pointer did not highlight text", () => {
    const onSelectRow = vi.fn()
    render(
      <ChrSysRowList
        rows={[emptyRow(), actionRow(0xdfd66752), actionRow(0x12345678)]}
        visibleIndices={[1, 2]}
        tableKey="actionTable"
        selectedRow={1}
        onSelectRow={onSelectRow}
        issues={[]}
      />,
    )

    fireEvent.click(screen.getByRole("option", { name: /0x12345678/ }))
    expect(onSelectRow).toHaveBeenCalledWith(2)
  })

  it("keeps the current row when the click finishes a text highlight", () => {
    const onSelectRow = vi.fn()
    render(
      <ChrSysRowList
        rows={[emptyRow(), actionRow(0xdfd66752)]}
        visibleIndices={[1]}
        tableKey="actionTable"
        selectedRow={1}
        onSelectRow={onSelectRow}
        issues={[]}
      />,
    )

    const option = screen.getByRole("option", { name: /0xDFD66752/ })
    vi.spyOn(window, "getSelection").mockReturnValue({
      isCollapsed: false,
      toString: () => "0xDFD66752",
      anchorNode: option,
    } as unknown as Selection)

    fireEvent.click(option)
    expect(onSelectRow).not.toHaveBeenCalled()
  })
})
