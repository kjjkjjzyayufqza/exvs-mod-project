import { describe, expect, it } from "vitest"
import {
  ACTION_FIELD,
  appendClonedRow,
  deleteRow,
  derivedLinks,
  describeInput,
  formMask,
  formsOf,
  incomingDerivedRows,
  isInputSelectable,
  parseCellInput,
  setCell,
} from "./chrSysModel"
import { renderInputLabel } from "./chrSysLabels"
import type { ChrSysParamFile } from "./chrSysTypes"

function row(overrides: Record<number, number>): number[] {
  const cells = new Array<number>(128).fill(0)
  cells[ACTION_FIELD.transitionFirst] = 0xffffffff
  cells[ACTION_FIELD.transitionLast] = 0xffffffff
  for (const field of [0x68, 0x69, 0x6a, 0x6b, 0x6c, 0x6d]) cells[field] = 0xffffffff
  for (const [field, value] of Object.entries(overrides)) cells[Number(field)] = value >>> 0
  return cells
}

function file(actionRows: number[][], transitionRows: number[][] = [[0]]): ChrSysParamFile {
  return {
    unitId: 15008001,
    headerReserved: 0,
    actionTable: { marker: 0xa8bbbab9, reserved: 0, columns: 128, rows: actionRows },
    transitionTable: { marker: 0xa8baa9ba, reserved: 0, columns: 1, rows: transitionRows },
  }
}

describe("chrSysModel", () => {
  it("parses decimal and hex cell input and rejects everything else", () => {
    expect(parseCellInput("-1")).toBe(0xffffffff)
    expect(parseCellInput("0xdfd66752")).toBe(0xdfd66752)
    expect(parseCellInput("4294967295")).toBe(0xffffffff)
    expect(parseCellInput("4294967296")).toBeNull()
    expect(parseCellInput("0x123456789")).toBeNull()
    expect(parseCellInput("1.5")).toBeNull()
    expect(parseCellInput("abc")).toBeNull()
  })

  it("computes form bits like the sys_41(0, 4) builder", () => {
    const burst = row({ [ACTION_FIELD.formIndex]: 0, 0x68: 1, 0x69: 2 })
    expect(formMask(burst)).toBe(0b111)
    expect(formsOf(burst)).toEqual([0, 1, 2])
    const everyForm = row({ [ACTION_FIELD.formIndex]: 0xffffffff })
    expect(formsOf(everyForm)).toEqual([])
  })

  it("maps commands and levers to the EXVS vocabulary tokens", () => {
    const sub = describeInput(row({ [ACTION_FIELD.commandType]: 7 }))
    expect(sub).toMatchObject({ kind: "input", command: { key: "sub" }, lever: { key: "neutral" }, tier: 0 })

    const chargeShot = describeInput(row({ [ACTION_FIELD.commandType]: 111 }))
    expect(chargeShot.command.key).toBe("shotCharge")
    expect(chargeShot.tier).toBe(1)

    expect(describeInput(row({ [ACTION_FIELD.leverMask]: 0x30 })).lever).toEqual({ key: "side" })
    expect(describeInput(row({ [ACTION_FIELD.leverMask]: 0x3c })).lever).toEqual({ key: "anyDirection" })
    expect(describeInput(row({ [ACTION_FIELD.leverMask]: 0x24 })).lever).toEqual({
      key: "combo",
      params: { bits: "0x00000024" },
    })

    const derived = row({ [ACTION_FIELD.commandType]: 31, [ACTION_FIELD.leverMask]: 0x44 })
    expect(isInputSelectable(derived)).toBe(false)
    expect(describeInput(derived)).toMatchObject({
      kind: "derived",
      command: { key: "derivedOnly" },
      lever: { key: "schedule", params: { value: "44" } },
    })
  })

  it("renders the EXVS one-liner through i18n tokens", () => {
    const dictionary: Record<string, string> = {
      "command.specialMelee": "特格",
      "command.derivedOnly": "派生专用",
      "lever.neutral": "N",
      "lever.anyDirection": "方向",
      "lever.schedule": "调度 0x{{value}}",
      "row.summaryInput": "{{lever}}{{command}}",
      "row.summaryOther": "{{command}} · {{lever}}",
    }
    const t = ((key: string, params: Record<string, string | number> = {}) =>
      Object.entries(params).reduce(
        (text, [name, value]) => text.replace(`{{${name}}}`, String(value)),
        dictionary[key] ?? key,
      )) as unknown as Parameters<typeof renderInputLabel>[0]

    expect(renderInputLabel(t, row({ [ACTION_FIELD.commandType]: 9 })).summary).toBe("N特格")
    expect(
      renderInputLabel(t, row({ [ACTION_FIELD.commandType]: 9, [ACTION_FIELD.leverMask]: 0x3c })).summary,
    ).toBe("方向特格")
    expect(
      renderInputLabel(t, row({ [ACTION_FIELD.commandType]: 31, [ACTION_FIELD.leverMask]: 0x45 })).summary,
    ).toBe("派生专用 · 调度 0x45")
  })

  it("follows derived links by action hash", () => {
    const rows = [
      row({}),
      row({ [ACTION_FIELD.actionHash]: 0x11, [ACTION_FIELD.derivedHashFirst]: 0x22, [ACTION_FIELD.derivedDelayFirst]: 16 }),
      row({ [ACTION_FIELD.actionHash]: 0x22 }),
    ]
    expect(derivedLinks(rows, 1)).toEqual([{ slot: 0, hash: 0x22, targetRow: 2, delay: 16 }])
    expect(incomingDerivedRows(rows, 2)).toEqual([1])
  })

  it("clones, edits and deletes rows immutably with the same guards as the CLI", () => {
    const base = file([
      row({}),
      row({ [ACTION_FIELD.actionHash]: 0x11, [ACTION_FIELD.derivedHashFirst]: 0x22 }),
      row({ [ACTION_FIELD.actionHash]: 0x22 }),
    ])
    const cloned = appendClonedRow(base, "actionTable", 2)
    expect(cloned.actionTable.rows).toHaveLength(4)
    expect(base.actionTable.rows).toHaveLength(3)
    const edited = setCell(cloned, "actionTable", 3, ACTION_FIELD.actionHash, 0x33)
    expect(edited.actionTable.rows[3][ACTION_FIELD.actionHash]).toBe(0x33)
    expect(cloned.actionTable.rows[3][ACTION_FIELD.actionHash]).toBe(0x22)
    expect(deleteRow(edited, "actionTable", 3).actionTable.rows).toHaveLength(3)
    expect(() => deleteRow(edited, "actionTable", 2)).toThrow("derived target of row 1")
    expect(() => deleteRow(edited, "actionTable", 0)).toThrow("reserved")
  })

  it("shifts transition ranges after a deleted transition row and refuses to split a range", () => {
    const base = file(
      [
        row({}),
        row({ [ACTION_FIELD.actionHash]: 1, [ACTION_FIELD.transitionFirst]: 4, [ACTION_FIELD.transitionLast]: 4 }),
        row({ [ACTION_FIELD.actionHash]: 2, [ACTION_FIELD.transitionFirst]: 1, [ACTION_FIELD.transitionLast]: 2 }),
      ],
      [[0], [1], [2], [3], [4]],
    )
    const next = deleteRow(base, "transitionTable", 3)
    expect(next.transitionTable.rows).toEqual([[0], [1], [2], [4]])
    expect(next.actionTable.rows[1][ACTION_FIELD.transitionFirst]).toBe(3)
    expect(next.actionTable.rows[1][ACTION_FIELD.transitionLast]).toBe(3)
    expect(next.actionTable.rows[2][ACTION_FIELD.transitionFirst]).toBe(1)
    expect(() => deleteRow(base, "transitionTable", 2)).toThrow("inside the range of action row 2")
  })
})
