import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import {
  HitboxParamAnalysisContent,
  HitboxParamAnalysisPanel,
  type HitboxParamFileType,
} from "./HitboxParamAnalysisPanel"

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}))

vi.mock("@/components/ui/filePathInput", () => ({
  FilePathInput: () => <input aria-label="Related table file" />,
}))
import type { TypedParamEntry, TypedParamFile } from "./typedParamTypes"

function paramFile(entries: TypedParamEntry[]): TypedParamFile {
  return {
    header: {},
    fieldSpecs: [],
    entryIds: entries.map((entry, index) =>
      typeof entry.entryId === "number" ? entry.entryId : index,
    ),
    entries,
    trailingData: [],
  }
}

function renderContent(
  fileType: HitboxParamFileType,
  entries: TypedParamEntry[],
  siblingEntries: TypedParamEntry[] | null,
) {
  return render(
    <HitboxParamAnalysisContent
      fileType={fileType}
      data={paramFile(entries)}
      selectedEntryIndex={0}
      siblingData={siblingEntries ? paramFile(siblingEntries) : null}
    />,
  )
}

const hitgroupEntry: TypedParamEntry = {
  entryId: 0x100,
  interactionId: 0x200,
  sphereRadius: 7,
  centerX: 0,
  centerY: -3,
  centerZ: 18,
  shapeMode: 1,
  boneId: 12,
  collisionFlags: 0,
  hitType: 0,
}

const stunInteractionEntry: TypedParamEntry = {
  entryId: 0x200,
  interactId: 407,
  untechableFrame: 50,
  damage: 65,
  downValue: 170,
  knockbackType: 2,
  rehitInterval: 600,
  maxHitCount: 1,
}

describe("HitboxParamAnalysisContent", () => {
  it("renders hitgroup geometry and resolves its interaction effect", () => {
    renderContent("hitgroupiddef", [hitgroupEntry], [stunInteractionEntry])

    expect(screen.getByText(/Hitbox Sphere/)).toBeInTheDocument()
    expect(screen.getByText("Sphere coverage")).toBeInTheDocument()
    expect(screen.getByText("Referenced interaction effect")).toBeInTheDocument()
    expect(screen.getByText("Electric stun (スタン)")).toBeInTheDocument()
    expect(screen.queryByText("Not loaded")).not.toBeInTheDocument()
  })

  it("marks an unresolved interaction table as not loaded", () => {
    renderContent("hitgroupiddef", [hitgroupEntry], null)
    expect(screen.getByText("Not loaded")).toBeInTheDocument()
    expect(
      screen.getByText("Load interactionid.bin to classify the referenced hit effect."),
    ).toBeInTheDocument()
  })

  it("lists reverse hitgroup references and changes the preview", async () => {
    const user = userEvent.setup()
    const secondHitgroup: TypedParamEntry = {
      ...hitgroupEntry,
      entryId: 0x101,
      sphereRadius: 6,
      centerZ: 10,
    }

    renderContent(
      "interactionid",
      [stunInteractionEntry],
      [
        hitgroupEntry,
        secondHitgroup,
        { ...hitgroupEntry, entryId: 0x102, interactionId: 0x999 },
      ],
    )

    expect(screen.getByText("Electric stun (スタン)")).toBeInTheDocument()
    expect(screen.getByText(/Hitgroup rows using this interaction \(2\)/)).toBeInTheDocument()
    expect(screen.getByText("r=7.00")).toBeInTheDocument()

    const goToButtons = screen.getAllByRole("button", { name: "Go to" })
    await user.click(goToButtons[1]!)
    expect(screen.getByText("r=6.00")).toBeInTheDocument()
  })
})

describe("HitboxParamAnalysisPanel", () => {
  it("keeps the related table collapsed until the header is opened", async () => {
    const user = userEvent.setup()
    render(
      <HitboxParamAnalysisPanel
        fileType="interactionid"
        data={paramFile([stunInteractionEntry])}
        selectedEntryIndex={0}
      />,
    )

    expect(screen.getByRole("button", { name: /Related Hit Group ID Def table/i })).toBeInTheDocument()
    expect(screen.queryByTestId("interaction-param-analysis")).not.toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: /Related Hit Group ID Def table/i }))
    expect(screen.getByTestId("interaction-param-analysis")).toBeInTheDocument()
  })
})

