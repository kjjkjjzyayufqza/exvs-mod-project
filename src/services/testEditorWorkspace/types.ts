export const TEST_EDITOR_WORKSPACE_VERSION = 1 as const;
export const TEST_EDITOR_WORKSPACE_FILENAME = "test_editor_workspace.json";

export type WorkspaceRouteKind = "fhm2d-pack" | "directory";
export type WorkspaceAssetRouteId = string;

export interface WorkspaceAssetRouteConfig {
  prefix: string;
  kind: WorkspaceRouteKind;
  label: string;
}

export interface TestEditorWorkspaceDocument {
  version: typeof TEST_EDITOR_WORKSPACE_VERSION;
  legacyReadFallback: boolean;
  assetRoutes: Record<WorkspaceAssetRouteId, WorkspaceAssetRouteConfig>;
}

export interface WorkspaceValidationIssue {
  code: "invalid_document" | "unsupported_version" | "invalid_prefix" | "duplicate_prefix";
  message: string;
  routeId?: string;
}

export interface ParsedWorkspaceDocument {
  document: TestEditorWorkspaceDocument;
  issues: WorkspaceValidationIssue[];
  source: "defaults" | "workspace";
}

export interface WorkspacePackIdentity {
  packKey: string;
  routeId: WorkspaceAssetRouteId | null;
  prefix: string;
  hashFolderName: string;
  folderPath: string;
  structureJsonPath: string;
  sourceLayout: "configured" | "legacy";
}
