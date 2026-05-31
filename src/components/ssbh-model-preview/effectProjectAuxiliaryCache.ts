import { dirname } from "@tauri-apps/api/path";
import { readDir, stat } from "@tauri-apps/plugin-fs";
import {
  jnttblReadFile,
  ssbhReadNusktbBoneNames,
  type JnttblReadResult,
} from "./jnttblIoService";

const MAX_SCAN_CONCURRENCY = 3;
const YIELD_EVERY_DIRECTORIES = 8;
const MAX_REPORTED_ERRORS = 24;

export type AuxiliaryErrorKind = "walk" | "stat" | "jnttbl" | "nusktb";

export type EffectProjectAuxiliaryError = {
  kind: AuxiliaryErrorKind;
  path: string;
  message: string;
};

export type EffectProjectAuxiliaryJnttblData = {
  path: string;
  loadError: string | null;
  entries: Array<{ hashId: number; boneIndex: number }>;
};

export type EffectProjectAuxiliaryNusktbData = {
  path: string;
  loadError: string | null;
  boneNames: string[];
};

export type CachedJnttbl = {
  path: string;
  mtimeMs: number;
  result: JnttblReadResult;
  loadError: string | null;
};

export type CachedNusktb = {
  path: string;
  mtimeMs: number;
  boneNames: string[];
  loadError: string | null;
};

export type EffectProjectAuxiliarySnapshot = {
  status: "idle" | "scanning" | "ready";
  rootDir: string | null;
  scannedDirectories: number;
  scannedFiles: number;
  jnttblDiscovered: number;
  nusktbDiscovered: number;
  jnttblReady: number;
  nusktbReady: number;
  failureCount: number;
  errors: EffectProjectAuxiliaryError[];
  jnttblData: EffectProjectAuxiliaryJnttblData[];
  nusktbData: EffectProjectAuxiliaryNusktbData[];
};

type SessionArtifacts = {
  rootDir: string;
  jnttblPaths: string[];
  nusktbPaths: string[];
};

type WalkResult = {
  scannedDirectories: number;
  scannedFiles: number;
  jnttblPaths: string[];
  nusktbPaths: string[];
  errors: EffectProjectAuxiliaryError[];
};

type StartScanInput = {
  sessionId: string;
  effectProjectPath: string;
  onUpdate: (snapshot: EffectProjectAuxiliarySnapshot) => void;
};

export function createIdleAuxiliarySnapshot(): EffectProjectAuxiliarySnapshot {
  return {
    status: "idle",
    rootDir: null,
    scannedDirectories: 0,
    scannedFiles: 0,
    jnttblDiscovered: 0,
    nusktbDiscovered: 0,
    jnttblReady: 0,
    nusktbReady: 0,
    failureCount: 0,
    errors: [],
    jnttblData: [],
    nusktbData: [],
  };
}

export class EffectProjectAuxiliaryCacheService {
  private readonly jnttblByPath = new Map<string, CachedJnttbl>();
  private readonly nusktbByPath = new Map<string, CachedNusktb>();
  private readonly activeScans = new Map<string, AbortController>();
  private readonly sessionArtifacts = new Map<string, SessionArtifacts>();

  startScan(input: StartScanInput): void {
    this.cancelSession(input.sessionId);
    const controller = new AbortController();
    this.activeScans.set(input.sessionId, controller);
    void this.runScan(input, controller);
  }

  cancelSession(sessionId: string): void {
    const active = this.activeScans.get(sessionId);
    if (active) {
      active.abort();
      this.activeScans.delete(sessionId);
    }
    this.sessionArtifacts.delete(sessionId);
  }

  clearAllSessions(): void {
    for (const [sessionId, controller] of this.activeScans) {
      controller.abort();
      this.activeScans.delete(sessionId);
    }
    this.sessionArtifacts.clear();
  }

  private async runScan(input: StartScanInput, controller: AbortController): Promise<void> {
    const { sessionId, effectProjectPath, onUpdate } = input;
    const signal = controller.signal;
    try {
      const rootDir = await dirname(effectProjectPath);
      this.emitIfLatest(sessionId, controller, onUpdate, {
        status: "scanning",
        rootDir,
        scannedDirectories: 0,
        scannedFiles: 0,
        jnttblDiscovered: 0,
        nusktbDiscovered: 0,
        jnttblReady: 0,
        nusktbReady: 0,
        failureCount: 0,
        errors: [],
        jnttblData: [],
        nusktbData: [],
      });

      const walk = await walkAuxiliaryFiles(rootDir, signal);
      if (!this.isLatestController(sessionId, controller)) return;

      const errors = [...walk.errors];
      this.emitIfLatest(sessionId, controller, onUpdate, {
        status: "scanning",
        rootDir,
        scannedDirectories: walk.scannedDirectories,
        scannedFiles: walk.scannedFiles,
        jnttblDiscovered: walk.jnttblPaths.length,
        nusktbDiscovered: walk.nusktbPaths.length,
        jnttblReady: 0,
        nusktbReady: 0,
        failureCount: errors.length,
        errors: errors.slice(0, MAX_REPORTED_ERRORS),
        jnttblData: [],
        nusktbData: [],
      });

      const loadErrors: EffectProjectAuxiliaryError[] = [];

      await runWithConcurrencyLimit(walk.jnttblPaths, MAX_SCAN_CONCURRENCY, async (filePath) => {
        const loadError = await this.loadJnttblFile(filePath, signal);
        if (!loadError) return;
        loadErrors.push({ kind: "jnttbl", path: filePath, message: loadError });
      });
      await runWithConcurrencyLimit(walk.nusktbPaths, MAX_SCAN_CONCURRENCY, async (filePath) => {
        const loadError = await this.loadNusktbFile(filePath, signal);
        if (!loadError) return;
        loadErrors.push({ kind: "nusktb", path: filePath, message: loadError });
      });

      if (!this.isLatestController(sessionId, controller)) return;
      this.activeScans.delete(sessionId);
      this.sessionArtifacts.set(sessionId, {
        rootDir,
        jnttblPaths: walk.jnttblPaths,
        nusktbPaths: walk.nusktbPaths,
      });

      const mergedErrors = [...errors, ...loadErrors];
      onUpdate({
        status: "ready",
        rootDir,
        scannedDirectories: walk.scannedDirectories,
        scannedFiles: walk.scannedFiles,
        jnttblDiscovered: walk.jnttblPaths.length,
        nusktbDiscovered: walk.nusktbPaths.length,
        jnttblReady: walk.jnttblPaths.filter((path) => this.getJnttbl(path)?.loadError === null).length,
        nusktbReady: walk.nusktbPaths.filter((path) => this.getNusktb(path)?.loadError === null).length,
        failureCount: mergedErrors.length,
        errors: mergedErrors.slice(0, MAX_REPORTED_ERRORS),
        jnttblData: walk.jnttblPaths
          .map((path) => this.getJnttbl(path))
          .filter((item): item is CachedJnttbl => Boolean(item))
          .map((item) => ({
            path: item.path,
            loadError: item.loadError,
            entries: item.result.entries.map((entry) => ({
              hashId: entry.hashId,
              boneIndex: entry.boneIndex,
            })),
          })),
        nusktbData: walk.nusktbPaths
          .map((path) => this.getNusktb(path))
          .filter((item): item is CachedNusktb => Boolean(item))
          .map((item) => ({
            path: item.path,
            loadError: item.loadError,
            boneNames: item.boneNames,
          })),
      });
    } catch (error) {
      if (!this.isLatestController(sessionId, controller)) return;
      this.activeScans.delete(sessionId);
      if (String(error) === "Error: Auxiliary scan aborted") return;
      onUpdate({
        status: "ready",
        rootDir: null,
        scannedDirectories: 0,
        scannedFiles: 0,
        jnttblDiscovered: 0,
        nusktbDiscovered: 0,
        jnttblReady: 0,
        nusktbReady: 0,
        failureCount: 1,
        errors: [{ kind: "walk", path: effectProjectPath, message: String(error) }],
        jnttblData: [],
        nusktbData: [],
      });
    }
  }

  private emitIfLatest(
    sessionId: string,
    controller: AbortController,
    onUpdate: (snapshot: EffectProjectAuxiliarySnapshot) => void,
    snapshot: EffectProjectAuxiliarySnapshot,
  ): void {
    if (!this.isLatestController(sessionId, controller)) return;
    onUpdate(snapshot);
  }

  private isLatestController(sessionId: string, controller: AbortController): boolean {
    return this.activeScans.get(sessionId) === controller && !controller.signal.aborted;
  }

  private async loadJnttblFile(filePath: string, signal: AbortSignal): Promise<string | null> {
    const key = normalizeAuxiliaryPathKey(filePath);
    try {
      const mtimeMs = await readFileMtimeMs(filePath, signal);
      const cached = this.jnttblByPath.get(key);
      if (cached && cached.mtimeMs === mtimeMs) return cached.loadError;
      const result = await jnttblReadFile(filePath);
      this.jnttblByPath.set(key, {
        path: filePath,
        mtimeMs,
        result,
        loadError: null,
      });
      return null;
    } catch (error) {
      const message = String(error);
      const existing = this.jnttblByPath.get(key);
      if (existing) {
        this.jnttblByPath.set(key, { ...existing, loadError: message });
      }
      return message;
    }
  }

  private async loadNusktbFile(filePath: string, signal: AbortSignal): Promise<string | null> {
    const key = normalizeAuxiliaryPathKey(filePath);
    try {
      const mtimeMs = await readFileMtimeMs(filePath, signal);
      const cached = this.nusktbByPath.get(key);
      if (cached && cached.mtimeMs === mtimeMs) return cached.loadError;
      const boneNames = await ssbhReadNusktbBoneNames(filePath);
      this.nusktbByPath.set(key, {
        path: filePath,
        mtimeMs,
        boneNames,
        loadError: null,
      });
      return null;
    } catch (error) {
      const message = String(error);
      const existing = this.nusktbByPath.get(key);
      if (existing) {
        this.nusktbByPath.set(key, { ...existing, loadError: message });
      }
      return message;
    }
  }

  private getJnttbl(path: string): CachedJnttbl | undefined {
    return this.jnttblByPath.get(normalizeAuxiliaryPathKey(path));
  }

  private getNusktb(path: string): CachedNusktb | undefined {
    return this.nusktbByPath.get(normalizeAuxiliaryPathKey(path));
  }
}

async function walkAuxiliaryFiles(rootDir: string, signal: AbortSignal): Promise<WalkResult> {
  const queue: string[] = [rootDir];
  const visited = new Set<string>();
  const jnttblPaths: string[] = [];
  const nusktbPaths: string[] = [];
  const errors: EffectProjectAuxiliaryError[] = [];
  let scannedDirectories = 0;
  let scannedFiles = 0;

  while (queue.length > 0) {
    throwIfAborted(signal);
    const current = queue.shift();
    if (!current) throw new Error("Directory queue contained an invalid path");
    const key = normalizeAuxiliaryPathKey(current);
    if (visited.has(key)) continue;
    visited.add(key);
    scannedDirectories += 1;
    let entries: Awaited<ReturnType<typeof readDir>>;
    try {
      entries = await readDir(current);
    } catch (error) {
      errors.push({ kind: "walk", path: current, message: String(error) });
      continue;
    }
    for (const entry of entries) {
      throwIfAborted(signal);
      if (!entry.name) {
        errors.push({ kind: "walk", path: current, message: "readDir returned an entry without name" });
        continue;
      }
      let entryPath: string;
      try {
        entryPath = buildChildPath(current, entry.name);
      } catch (error) {
        errors.push({ kind: "walk", path: current, message: String(error) });
        continue;
      }
      if (entry.isDirectory) {
        queue.push(entryPath);
        continue;
      }
      if (!entry.isFile) continue;
      scannedFiles += 1;
      const name = entry.name;
      if (isJnttblCandidate(name)) {
        jnttblPaths.push(entryPath);
        continue;
      }
      if (isNusktbCandidate(name)) {
        nusktbPaths.push(entryPath);
      }
    }
    if (scannedDirectories % YIELD_EVERY_DIRECTORIES === 0) {
      await yieldThread();
    }
  }

  return {
    scannedDirectories,
    scannedFiles,
    jnttblPaths,
    nusktbPaths,
    errors,
  };
}

async function readFileMtimeMs(filePath: string, signal: AbortSignal): Promise<number> {
  throwIfAborted(signal);
  const fileInfo = await stat(filePath);
  throwIfAborted(signal);
  const mtime = fileInfo.mtime;
  if (!mtime) {
    throw new Error(`File has no mtime: ${filePath}`);
  }
  const mtimeMs = mtime instanceof Date ? mtime.getTime() : Number(mtime);
  if (!Number.isFinite(mtimeMs)) {
    throw new Error(`Invalid mtime for ${filePath}: ${String(mtime)}`);
  }
  return mtimeMs;
}

async function runWithConcurrencyLimit<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  if (!Number.isInteger(concurrency) || concurrency <= 0) {
    throw new Error(`Invalid concurrency limit: ${concurrency}`);
  }
  if (items.length === 0) return;
  let nextIndex = 0;
  const runWorker = async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      await worker(items[currentIndex]!);
    }
  };
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => runWorker());
  await Promise.all(workers);
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new Error("Auxiliary scan aborted");
  }
}

function yieldThread(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function buildChildPath(parent: string, name: string): string {
  const trimmedParent = parent.trim();
  const trimmedName = name.trim();
  if (!trimmedParent) {
    throw new Error("Cannot join child path: parent is empty");
  }
  if (!trimmedName) {
    throw new Error("Cannot join child path: name is empty");
  }
  const useBackslash = trimmedParent.includes("\\");
  const separator = useBackslash ? "\\" : "/";
  const normalizedParent = trimmedParent.replace(/[\\/]+$/, "");
  const normalizedName = trimmedName.replace(/^[\\/]+/, "");
  return `${normalizedParent}${separator}${normalizedName}`;
}

export function normalizeAuxiliaryPathKey(path: string): string {
  return path.trim().replace(/\\/g, "/").toLowerCase();
}

export function isJnttblCandidate(name: string): boolean {
  return name.trim().toLowerCase().endsWith(".jnttbl");
}

export function isNusktbCandidate(name: string): boolean {
  return name.trim().toLowerCase().endsWith(".nusktb");
}
