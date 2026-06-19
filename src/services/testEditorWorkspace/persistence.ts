import { join } from "@tauri-apps/api/path";
import { exists, readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import {
  TEST_EDITOR_WORKSPACE_FILENAME,
  type ParsedWorkspaceDocument,
  type TestEditorWorkspaceDocument,
} from "./types";
import { parseWorkspaceDocument } from "./validation";

export function workspaceDocumentPath(workspaceRoot: string): Promise<string> {
  return join(workspaceRoot, TEST_EDITOR_WORKSPACE_FILENAME);
}

function defaultsWithInvalidDocumentIssue(message: string): ParsedWorkspaceDocument {
  const parsed = parseWorkspaceDocument();
  return {
    ...parsed,
    issues: [
      ...parsed.issues,
      {
        code: "invalid_document",
        message,
      },
    ],
  };
}

export async function loadTestEditorWorkspace(
  workspaceRoot: string,
): Promise<ParsedWorkspaceDocument> {
  if (!workspaceRoot.trim()) {
    return parseWorkspaceDocument();
  }

  const filePath = await workspaceDocumentPath(workspaceRoot);
  if (!(await exists(filePath))) {
    return parseWorkspaceDocument();
  }

  try {
    const raw = await readTextFile(filePath);
    return parseWorkspaceDocument(JSON.parse(raw));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return defaultsWithInvalidDocumentIssue(
      `Failed to read TestEditor workspace document: ${message}`,
    );
  }
}

export async function saveTestEditorWorkspace(
  workspaceRoot: string,
  document: TestEditorWorkspaceDocument,
): Promise<void> {
  if (!workspaceRoot.trim()) {
    throw new Error("Workspace root is required to save TestEditor workspace settings.");
  }

  const parsed = parseWorkspaceDocument(document);
  if (parsed.issues.length > 0) {
    throw new Error("Invalid TestEditor workspace document.");
  }

  const filePath = await workspaceDocumentPath(workspaceRoot);
  await writeTextFile(filePath, `${JSON.stringify(parsed.document, null, 2)}\n`);
}
