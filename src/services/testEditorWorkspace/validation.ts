import { DEFAULT_TEST_EDITOR_WORKSPACE } from "./defaults";
import {
  TEST_EDITOR_WORKSPACE_VERSION,
  type ParsedWorkspaceDocument,
  type TestEditorWorkspaceDocument,
  type WorkspaceAssetRouteConfig,
  type WorkspaceRouteKind,
  type WorkspaceValidationIssue,
} from "./types";

const WINDOWS_INVALID_SEGMENT_CHARS = /[<>:"|?*\u0000-\u001f]/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isWorkspaceRouteKind(value: unknown): value is WorkspaceRouteKind {
  return value === "fhm2d-pack" || value === "directory";
}

function cloneWorkspaceDocument(
  document: TestEditorWorkspaceDocument = DEFAULT_TEST_EDITOR_WORKSPACE,
): TestEditorWorkspaceDocument {
  return {
    version: document.version,
    legacyReadFallback: document.legacyReadFallback,
    assetRoutes: Object.fromEntries(
      Object.entries(document.assetRoutes).map(([routeId, route]) => [routeId, { ...route }]),
    ),
  };
}

export function normalizeWorkspacePrefix(prefix: string): string {
  return prefix
    .trim()
    .replace(/\\/g, "/")
    .replace(/\/+/g, "/")
    .replace(/^\/+|\/+$/g, "");
}

function validatePrefix(prefix: string, routeId: string): WorkspaceValidationIssue | null {
  const trimmed = prefix.trim();

  if (trimmed === "") {
    return {
      code: "invalid_prefix",
      routeId,
      message: "Workspace route prefix must not be empty.",
    };
  }

  if (/^[a-zA-Z]:/.test(trimmed) || /^[\\/]/.test(trimmed)) {
    return {
      code: "invalid_prefix",
      routeId,
      message: "Workspace route prefix must be relative to the selected workspace.",
    };
  }

  const normalized = normalizeWorkspacePrefix(trimmed);
  const segments = normalized.split("/");
  const hasUnsafeSegment = segments.some(
    (segment) =>
      segment === "" ||
      segment === "." ||
      segment === ".." ||
      WINDOWS_INVALID_SEGMENT_CHARS.test(segment),
  );

  if (normalized === "" || hasUnsafeSegment) {
    return {
      code: "invalid_prefix",
      routeId,
      message: "Workspace route prefix contains an unsafe path segment.",
    };
  }

  return null;
}

function parseRouteConfig(
  routeId: string,
  value: unknown,
  issues: WorkspaceValidationIssue[],
): WorkspaceAssetRouteConfig | null {
  if (!isRecord(value)) {
    issues.push({
      code: "invalid_document",
      routeId,
      message: "Workspace route must be an object.",
    });
    return null;
  }

  const { prefix, kind, label } = value;
  if (typeof prefix !== "string" || !isWorkspaceRouteKind(kind) || typeof label !== "string") {
    issues.push({
      code: "invalid_document",
      routeId,
      message: "Workspace route must include prefix, kind, and label.",
    });
    return null;
  }

  const prefixIssue = validatePrefix(prefix, routeId);
  if (prefixIssue) {
    issues.push(prefixIssue);
    return null;
  }

  const normalizedPrefix = normalizeWorkspacePrefix(prefix);
  return {
    prefix: normalizedPrefix,
    kind,
    label: label.trim() || routeId,
  };
}

function removeConflictingRoutes(
  document: TestEditorWorkspaceDocument,
  issues: WorkspaceValidationIssue[],
): TestEditorWorkspaceDocument {
  const prefixKinds = new Map<string, WorkspaceRouteKind>();
  const conflictedRouteIds = new Set<string>();

  for (const [routeId, route] of Object.entries(document.assetRoutes)) {
    const existingKind = prefixKinds.get(route.prefix);
    if (existingKind && existingKind !== route.kind) {
      conflictedRouteIds.add(routeId);
      issues.push({
        code: "duplicate_prefix",
        routeId,
        message: `Workspace route prefix "${route.prefix}" is already used by another route kind.`,
      });
      continue;
    }
    prefixKinds.set(route.prefix, route.kind);
  }

  if (conflictedRouteIds.size === 0) {
    return document;
  }

  const cleaned = cloneWorkspaceDocument(document);
  for (const routeId of conflictedRouteIds) {
    const defaultRoute = DEFAULT_TEST_EDITOR_WORKSPACE.assetRoutes[routeId];
    if (defaultRoute) {
      cleaned.assetRoutes[routeId] = { ...defaultRoute };
    } else {
      delete cleaned.assetRoutes[routeId];
    }
  }
  return cleaned;
}

export function parseWorkspaceDocument(value?: unknown): ParsedWorkspaceDocument {
  const issues: WorkspaceValidationIssue[] = [];
  const document = cloneWorkspaceDocument();

  if (value === undefined || value === null) {
    return { document, issues, source: "defaults" };
  }

  if (!isRecord(value)) {
    return {
      document,
      issues: [
        {
          code: "invalid_document",
          message: "Workspace document must be an object.",
        },
      ],
      source: "defaults",
    };
  }

  if (value.version !== TEST_EDITOR_WORKSPACE_VERSION) {
    return {
      document,
      issues: [
        {
          code: "unsupported_version",
          message: `Unsupported TestEditor workspace document version "${String(value.version)}".`,
        },
      ],
      source: "defaults",
    };
  }

  if (typeof value.legacyReadFallback === "boolean") {
    document.legacyReadFallback = value.legacyReadFallback;
  } else {
    issues.push({
      code: "invalid_document",
      message: "Workspace document must include a boolean legacyReadFallback value.",
    });
  }

  if (!isRecord(value.assetRoutes)) {
    issues.push({
      code: "invalid_document",
      message: "Workspace document must include an assetRoutes object.",
    });
    return { document, issues, source: "workspace" };
  }

  for (const [routeId, routeValue] of Object.entries(value.assetRoutes)) {
    const parsedRoute = parseRouteConfig(routeId, routeValue, issues);
    if (parsedRoute) {
      document.assetRoutes[routeId] = parsedRoute;
    }
  }

  return {
    document: removeConflictingRoutes(document, issues),
    issues,
    source: "workspace",
  };
}
