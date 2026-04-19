import type { Fhm2d_type_format } from "@/models/fhm2d";

export type Fhm2dVirtualEntry = {
  id: string;
  kind: "folder" | "file";
  name: string;
  virtualPath: string;
  relativePath: string;
  parentRelativePath: string | null;
  fileIndex: number | null;
  fileType: string | null;
  size: number | null;
  childCount: number;
  isModelRelated: boolean;
  hasReferenceIssue: boolean;
  selectedCandidate: boolean;
};

export type Fhm2dVirtualTreeNode = {
  id: string;
  kind: "folder" | "file";
  name: string;
  virtualPath: string;
  relativePath: string;
  parentRelativePath: string | null;
  fileIndex: number | null;
  fileType: string | null;
  size: number | null;
  childCount: number;
  isModelRelated: boolean;
  hasReferenceIssue: boolean;
  selectedCandidate: boolean;
  children: Fhm2dVirtualTreeNode[];
};

export type Fhm2dPreviewCandidate = {
  id: string;
  displayLabel: string;
  folderRelativePath: string;
  folderVirtualPath: string;
  modlEntryId: string;
  modlVirtualPath: string;
  meshVirtualPath: string | null;
  skelVirtualPath: string | null;
  matlVirtualPaths: string[];
  nutexbVirtualPaths: string[];
  issues: string[];
  complete: boolean;
};

export type CharacterIdMemoryPreviewOption = {
  characterId: number;
  modelValue: number;
  modelHashHex: string;
  sourcePath: string;
  sourceExists: boolean;
  disabledReason: string | null;
};

export type CharacterIdMemoryPreviewResponse = {
  filePath: string;
  availableCount: number;
  query: string;
  rows: CharacterIdMemoryPreviewOption[];
};

export type PreviewCollectionSourceItem = {
  id: string;
  displayLabel: string;
  modlPath: string;
};

export type PreviewCollectionItem = {
  id: string;
  displayLabel: string;
  modlPath: string;
  visible: boolean;
  selected: boolean;
  active: boolean;
};

export type PreviewCollectionSnapshot = {
  query: string;
  viewRange: "all" | "single";
  controlRange: "all" | "single";
  allVisible: boolean;
  activeItemId: string | null;
  selectedItemIds: string[];
  hiddenItemIds: string[];
  totalCount: number;
  filteredCount: number;
  items: PreviewCollectionItem[];
};

export type Fhm2dMemorySessionSummary = {
  sessionId: string;
  sourceName: string;
  format: string | null;
  virtualRoot: string;
  namingWarning: string | null;
  virtualTree: Fhm2dVirtualTreeNode[];
  previewCandidates: Fhm2dPreviewCandidate[];
  selectedCandidateIds: string[];
  renameRevision: number;
};

export type MemoryRenameImpact = {
  sessionId: string;
  entryId: string;
  previousVirtualPath: string;
  nextVirtualPath: string;
  affectedCandidateIds: string[];
  previewCandidates: Fhm2dPreviewCandidate[];
  virtualTree: Fhm2dVirtualTreeNode[];
  renameRevision: number;
};

export type CreateFhm2dMemorySessionParams = {
  sourcePath: string;
  format?: Fhm2d_type_format;
};
