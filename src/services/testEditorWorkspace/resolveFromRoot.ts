/**
 * Resolve workspace content from just the EXVS2 Workspace folder.
 *
 * Views inside the workspace already hold the parsed workspace document and
 * call `resolveWorkspaceContent` directly. Everything outside it — the map
 * editor, standalone tools — only knows the folder, so it needs the document
 * loaded first.
 *
 * Use this instead of building `<root>/012list/<name>/<name>.bin` by hand:
 * a workspace can remap its asset routes, and the configured root is
 * `testEditorFolder`, not `extractOutputPath`.
 */

import {
  resolveWorkspaceContent,
  type WorkspaceContentId,
} from "./contentCatalog";
import { loadTestEditorWorkspace } from "./persistence";
import { resolveWorkspaceRouteRoot } from "./paths";
import type { TestEditorWorkspaceDocument, WorkspaceAssetRouteId } from "./types";

export function requireWorkspaceRoot(workspaceRoot: string): string {
  const root = workspaceRoot.trim().replace(/[/\\]+$/, "");
  if (!root) {
    throw new Error("EXVS2 Workspace folder is not open");
  }
  return root;
}

export async function loadWorkspaceDocumentFor(
  workspaceRoot: string,
): Promise<{ root: string; document: TestEditorWorkspaceDocument }> {
  const root = requireWorkspaceRoot(workspaceRoot);
  const { document } = await loadTestEditorWorkspace(root);
  return { root, document };
}

/**
 * Path of one catalog content file, preferring the pack that exists on disk
 * over the configured location.
 */
export async function resolveWorkspaceContentFilePath(
  workspaceRoot: string,
  contentId: WorkspaceContentId,
): Promise<string> {
  const { root, document } = await loadWorkspaceDocumentFor(workspaceRoot);
  const content = await resolveWorkspaceContent(root, document, contentId);
  const filePath = content.existing?.filePath ?? content.configured.filePath;
  if (!filePath) {
    throw new Error(`No ${contentId} path is configured for workspace ${root}`);
  }
  return filePath;
}

/** Root directory of one asset route, honouring a remapped prefix. */
export async function resolveWorkspaceRouteRootFor(
  workspaceRoot: string,
  routeId: WorkspaceAssetRouteId,
): Promise<string> {
  const { root, document } = await loadWorkspaceDocumentFor(workspaceRoot);
  return resolveWorkspaceRouteRoot(root, document, routeId);
}
