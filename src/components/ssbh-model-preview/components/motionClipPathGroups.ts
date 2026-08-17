const STYLE_TOKENS = new Set(["sht", "stk", "wepdef"]);
const SPACE_TOKENS = new Set(["air", "gnd"]);
const DIR_TOKENS = new Set(["fr", "bk", "lf", "rt", "up", "lw", "dn"]);

export function normalizeMotionPath(path: string): string {
  return path.replace(/\\/g, "/");
}

export function basenameMotionPath(path: string): string {
  const normalized = normalizeMotionPath(path);
  const parts = normalized.split("/");
  return parts[parts.length - 1] ?? path;
}

export function parentDirectory(path: string): string {
  const normalized = normalizeMotionPath(path).replace(/\/+$/, "");
  const idx = normalized.lastIndexOf("/");
  return idx <= 0 ? "" : normalized.slice(0, idx);
}

function splitSegments(path: string): string[] {
  return normalizeMotionPath(path).split("/").filter(Boolean);
}

function commonDirectoryPrefix(paths: readonly string[]): string {
  if (paths.length === 0) return "";
  const split = paths.map((path) => splitSegments(parentDirectory(path)));
  const first = split[0];
  if (!first) return "";
  let count = first.length;
  for (let i = 1; i < split.length; i += 1) {
    const other = split[i] ?? [];
    let shared = 0;
    while (shared < count && shared < other.length && first[shared] === other[shared]) {
      shared += 1;
    }
    count = shared;
    if (count === 0) return "";
  }
  const drive = first[0]?.endsWith(":") ? first[0] : "";
  const joined = first.slice(0, count).join("/");
  if (drive && count >= 1) {
    return joined;
  }
  return joined;
}

function trailingNumericSegments(dir: string, maxCount: number): string[] {
  const segs = splitSegments(dir);
  const out: string[] = [];
  for (let i = segs.length - 1; i >= 0 && out.length < maxCount; i -= 1) {
    const seg = segs[i];
    if (!seg || !/^\d+$/.test(seg)) break;
    out.unshift(seg);
  }
  if (out.length > 0) return out;
  const last = segs[segs.length - 1];
  return last ? [last] : [];
}

function relativeParentId(parentDir: string, commonDir: string): string {
  const parentSegs = splitSegments(parentDir);
  const commonSegs = splitSegments(commonDir);
  if (parentSegs.length <= commonSegs.length) return "";
  return parentSegs.slice(commonSegs.length).join("/");
}

export function compareMotionFolderIds(a: string, b: string): number {
  const aParts = a.split("/").filter(Boolean);
  const bParts = b.split("/").filter(Boolean);
  const max = Math.max(aParts.length, bParts.length);
  for (let i = 0; i < max; i += 1) {
    const ac = aParts[i];
    const bc = bParts[i];
    if (ac === undefined) return -1;
    if (bc === undefined) return 1;
    const an = Number(ac);
    const bn = Number(bc);
    if (ac !== "" && bc !== "" && Number.isInteger(an) && Number.isInteger(bn)) {
      if (an !== bn) return an - bn;
      continue;
    }
    const cmp = ac.localeCompare(bc);
    if (cmp !== 0) return cmp;
  }
  return 0;
}

export type MotionClipNameParts = {
  actor: string;
  source: string;
  remainder: string;
  actionHint: string | null;
  suffix: string;
};

function stripMotionSuffix(tokens: string[]): { actionTokens: string[]; suffix: string } {
  const next = [...tokens];
  const suffix: string[] = [];
  if (next.length > 0 && DIR_TOKENS.has(next[next.length - 1] ?? "")) {
    suffix.unshift(next.pop() ?? "");
  }
  if (next.length > 0 && SPACE_TOKENS.has(next[next.length - 1] ?? "")) {
    suffix.unshift(next.pop() ?? "");
  }
  if (next.length > 0 && STYLE_TOKENS.has(next[next.length - 1] ?? "")) {
    suffix.unshift(next.pop() ?? "");
  }
  return { actionTokens: next, suffix: suffix.join(" ") };
}

export function parseMotionClipFileName(fileName: string): MotionClipNameParts {
  const stem = fileName.replace(/\.nuanmb$/i, "");
  const tokens = stem.split("_").filter(Boolean);
  const actor = tokens[0] ?? stem;
  const looksPrefixed =
    tokens.length >= 5 &&
    /^\d+[a-z0-9]*$/i.test(tokens[1] ?? "") &&
    /^\d+[a-z0-9]*$/i.test(tokens[2] ?? "") &&
    /^\d{3}$/.test(tokens[3] ?? "");
  const source = looksPrefixed ? `${tokens[1]}_${tokens[2]}` : "";
  const remainderTokens = looksPrefixed ? tokens.slice(4) : tokens.slice(1);
  const remainder = remainderTokens.join("_");
  const { actionTokens, suffix } = stripMotionSuffix(remainderTokens);
  return {
    actor,
    source,
    remainder,
    actionHint: actionTokens.length > 0 ? actionTokens.join("_") : null,
    suffix,
  };
}

export type MotionClipEntry = {
  path: string;
  fileName: string;
  actor: string;
  source: string;
  remainder: string;
  actionHint: string | null;
  suffix: string;
  detail: string;
  searchText: string;
};

export type MotionClipFolderGroup = {
  id: string;
  label: string;
  actionHint: string | null;
  depth: number;
  clips: MotionClipEntry[];
};

export type MotionClipCatalog = {
  commonDir: string;
  groups: MotionClipFolderGroup[];
};

export function inferFolderActionHint(clips: readonly MotionClipEntry[]): string | null {
  if (clips.length === 0) return null;
  const tokenSets = clips.map((clip) => {
    const hint = clip.actionHint ?? "";
    return new Set(hint.split("_").filter(Boolean));
  });
  const first = tokenSets[0];
  if (!first) return null;
  const shared: string[] = [];
  for (const token of first) {
    if (tokenSets.every((set) => set.has(token))) {
      shared.push(token);
    }
  }
  if (shared.length === 0) return null;
  return shared[shared.length - 1] ?? null;
}

function folderLabel(relativeId: string, commonDir: string): string {
  const prefix = trailingNumericSegments(commonDir, 2);
  const relative = relativeId ? relativeId.split("/").filter(Boolean) : [];
  const parts = [...prefix, ...relative];
  return parts.join("/") || "Root";
}

function stripTokenSequence(haystack: string, needle: string): string {
  if (!needle) return haystack;
  const parts = haystack.split("_").filter(Boolean);
  const drop = needle.split("_").filter(Boolean);
  if (drop.length === 0) return haystack;
  for (let i = 0; i <= parts.length - drop.length; i += 1) {
    if (drop.every((token, offset) => parts[i + offset] === token)) {
      return [...parts.slice(0, i), ...parts.slice(i + drop.length)].join("_");
    }
  }
  return haystack;
}

function clipDetail(entry: Pick<MotionClipEntry, "actionHint" | "remainder" | "suffix">): string {
  if (entry.suffix && entry.actionHint) {
    const leftover = stripTokenSequence(entry.remainder, entry.actionHint).replace(/_/g, " ").trim();
    if (!leftover || leftover === entry.suffix) return entry.suffix;
    const withoutSuffix = leftover.replace(entry.suffix, "").trim();
    if (!withoutSuffix) return entry.suffix;
    return `${withoutSuffix} · ${entry.suffix}`;
  }
  if (entry.suffix) return entry.suffix;
  return entry.remainder.replace(/_/g, " ");
}

export function buildMotionClipCatalog(paths: readonly string[]): MotionClipCatalog {
  const normalizedPaths = paths.filter((path) => path.trim().length > 0);
  const commonDir = commonDirectoryPrefix(normalizedPaths);
  const groups = new Map<string, MotionClipEntry[]>();

  for (const path of normalizedPaths) {
    const fileName = basenameMotionPath(path);
    const parsed = parseMotionClipFileName(fileName);
    const parent = parentDirectory(path);
    const id = relativeParentId(parent, commonDir);
    const entry: MotionClipEntry = {
      path,
      fileName,
      actor: parsed.actor,
      source: parsed.source,
      remainder: parsed.remainder,
      actionHint: parsed.actionHint,
      suffix: parsed.suffix,
      detail: "",
      searchText: "",
    };
    entry.detail = clipDetail(entry);
    entry.searchText = [
      normalizeMotionPath(path).toLowerCase(),
      fileName.toLowerCase(),
      entry.actor.toLowerCase(),
      entry.source.toLowerCase(),
      entry.remainder.toLowerCase(),
      entry.actionHint?.toLowerCase() ?? "",
      entry.detail.toLowerCase(),
    ].join(" ");
    const list = groups.get(id);
    if (list) list.push(entry);
    else groups.set(id, [entry]);
  }

  const shortestDepth = Math.min(
    ...[...groups.keys()].map((id) => (id ? id.split("/").length : 0)),
  );

  const built: MotionClipFolderGroup[] = [...groups.entries()]
    .map(([id, clips]) => ({
      id,
      label: folderLabel(id, commonDir),
      actionHint: inferFolderActionHint(clips),
      depth: Math.max(0, (id ? id.split("/").length : 0) - shortestDepth),
      clips,
    }))
    .sort((a, b) => compareMotionFolderIds(a.label, b.label));

  return { commonDir, groups: built };
}

export function filterMotionClipCatalog(
  catalog: MotionClipCatalog,
  query: string,
): MotionClipFolderGroup[] {
  const q = query.trim().toLowerCase();
  if (!q) return catalog.groups;
  const out: MotionClipFolderGroup[] = [];
  for (const group of catalog.groups) {
    const folderHit =
      group.label.toLowerCase().includes(q) ||
      group.id.toLowerCase().includes(q) ||
      (group.actionHint?.toLowerCase().includes(q) ?? false);
    const clips = folderHit ? group.clips : group.clips.filter((clip) => clip.searchText.includes(q));
    if (clips.length > 0) {
      out.push({ ...group, clips });
    }
  }
  return out;
}

export function findMotionClipGroup(
  groups: readonly MotionClipFolderGroup[],
  path: string | null,
): MotionClipFolderGroup | null {
  if (!path) return groups[0] ?? null;
  return groups.find((group) => group.clips.some((clip) => clip.path === path)) ?? groups[0] ?? null;
}

export function formatMotionClipTrigger(params: {
  groups: readonly MotionClipFolderGroup[];
  path: string | null;
}): { title: string; subtitle: string } {
  if (!params.path) {
    return { title: "Select clip", subtitle: "" };
  }
  const group = findMotionClipGroup(params.groups, params.path);
  const clip = group?.clips.find((entry) => entry.path === params.path);
  if (!clip || !group) {
    return { title: basenameMotionPath(params.path), subtitle: "" };
  }
  return { title: clip.fileName, subtitle: group.label };
}
