import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Fhm2d_type_format } from "@/models/fhm2d";
import { Fhm2dMemoryPreviewModal } from "./Fhm2dMemoryPreviewModal";

const createFhm2dMemorySessionMock = vi.fn();
const listFhm2dMemoryPreviewCandidatesMock = vi.fn();
const loadCharacterIdMemoryPreviewOptionsMock = vi.fn();
const useSsbhModelPreviewMock = vi.fn();

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getTotalSize: () => count * 40,
    getVirtualItems: () =>
      Array.from({ length: count }, (_, index) => ({
        index,
        key: `virtual-${index}`,
        start: index * 40,
        size: 40,
      })),
  }),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/store/configStore", () => ({
  useConfigStore: (selector: (state: { obDplCachePath: string }) => unknown) =>
    selector({ obDplCachePath: "C:\\cache" }),
}));

vi.mock("./fhm2dMemoryPreviewCharacterTable", () => ({
  loadCharacterIdMemoryPreviewOptions: (params: unknown) => loadCharacterIdMemoryPreviewOptionsMock(params),
}));

vi.mock("./fhm2dMemoryPreviewService", async () => {
  const actual = await vi.importActual<typeof import("./fhm2dMemoryPreviewService")>(
    "./fhm2dMemoryPreviewService",
  );
  return {
    ...actual,
    createFhm2dMemorySession: (params: unknown) => createFhm2dMemorySessionMock(params),
    listFhm2dMemoryPreviewCandidates: (sessionId: string) => listFhm2dMemoryPreviewCandidatesMock(sessionId),
    disposeFhm2dMemorySession: vi.fn(),
    buildSsbhPreviewBundleFromMemory: vi.fn(),
    renameFhm2dMemoryEntry: vi.fn(),
  };
});

vi.mock("./SsbhModelPreviewContext", () => ({
  useSsbhModelPreview: () => useSsbhModelPreviewMock(),
}));

function createPreviewContext() {
  return {
    memoryWorkspaceSession: null,
    memoryWorkspaceSourcePath: null,
    previewInstances: [],
    memoryPreviewModalOpen: true,
    previewBusy: false,
    workspaceRoot: "E:\\workspace",
    setMemoryWorkspaceSession: vi.fn(),
    setMemoryWorkspaceSourcePath: vi.fn(),
    setMemoryPreviewModalOpen: vi.fn(),
    loadMemoryPreviewBundles: vi.fn(),
    appendMemoryPreviewBundles: vi.fn(),
  };
}

describe("Fhm2dMemoryPreviewModal character picker", () => {
  beforeEach(() => {
    createFhm2dMemorySessionMock.mockReset();
    listFhm2dMemoryPreviewCandidatesMock.mockReset();
    loadCharacterIdMemoryPreviewOptionsMock.mockReset();
    useSsbhModelPreviewMock.mockReset();

    listFhm2dMemoryPreviewCandidatesMock.mockResolvedValue([]);
    createFhm2dMemorySessionMock.mockResolvedValue({
      sessionId: "session-1",
      sourceName: "0x00000010.fhm2d",
      format: "fhm2d_character",
      virtualRoot: "memory://session-1",
      namingWarning: null,
      virtualTree: [],
      previewCandidates: [],
      selectedCandidateIds: [],
      renameRevision: 0,
    });
    loadCharacterIdMemoryPreviewOptionsMock.mockResolvedValue({
      filePath: "E:\\workspace\\0x036B9E67\\character_id_table.bin",
      availableCount: 1,
      query: "",
      rows: [
        {
          characterId: 100,
          modelValue: 0x10,
          modelHashHex: "0x00000010",
          sourcePath: "C:\\cache\\0x00000010.fhm2d",
          sourceExists: true,
          disabledReason: null,
        },
        {
          characterId: 101,
          modelValue: 0x20,
          modelHashHex: "0x00000020",
          sourcePath: "",
          sourceExists: false,
          disabledReason: "Missing source .fhm2d in obDplCachePath.",
        },
      ],
    });
  });

  it("shows the Character ID picker and filters by CharacterId or Model hash", async () => {
    useSsbhModelPreviewMock.mockReturnValue(createPreviewContext());

    render(<Fhm2dMemoryPreviewModal />);

    expect(await screen.findByText("Character ID")).toBeInTheDocument();
    expect(await screen.findByText("Character ID 100")).toBeInTheDocument();
    expect(await screen.findByText("Character ID 101")).toBeInTheDocument();

    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText("Search Character ID or Model hash"), "20");

    await waitFor(() => {
      expect(loadCharacterIdMemoryPreviewOptionsMock).toHaveBeenLastCalledWith({
        workspaceRoot: "E:\\workspace",
        obDplCachePath: "C:\\cache",
        query: "20",
      });
    });
  });

  it("loads the mapped fhm2d when clicking a valid Character ID row and keeps invalid rows disabled", async () => {
    const previewContext = createPreviewContext();
    useSsbhModelPreviewMock.mockReturnValue(previewContext);

    render(<Fhm2dMemoryPreviewModal />);

    const validRow = await screen.findByRole("button", { name: /Character ID 100/i });
    const invalidRow = await screen.findByRole("button", { name: /Character ID 101/i });

    expect(invalidRow).toBeDisabled();

    const user = userEvent.setup();
    await user.click(validRow);

    await waitFor(() => {
      expect(createFhm2dMemorySessionMock).toHaveBeenCalledWith({
        sourcePath: "C:\\cache\\0x00000010.fhm2d",
        format: Fhm2d_type_format.fhm2d_character,
      });
    });
    expect(previewContext.setMemoryWorkspaceSourcePath).toHaveBeenCalledWith("C:\\cache\\0x00000010.fhm2d");
    expect(previewContext.setMemoryWorkspaceSession).toHaveBeenCalled();
  });
});
