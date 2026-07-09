export type MscBatchDirectoryEntry = {
  name?: string;
  isFile?: boolean;
  isDirectory?: boolean;
};

export interface MscBatchSourceFile {
  name: string;
  index: number;
  extension: ".bscex" | ".cscex" | ".dscex";
}

export interface MscBatchScriptPlan extends MscBatchSourceFile {
  path: string;
  outputPath: string;
  logPath: string;
}

export interface MscBatchFolderPlan {
  name: string;
  path: string;
  scripts: MscBatchScriptPlan[];
}

export type MscBatchSourceScope = "batch-root" | "single-folder";

export interface MscBatchPlan {
  rootPath: string;
  sourceScope: MscBatchSourceScope;
  folders: MscBatchFolderPlan[];
  totalScripts: number;
}

export interface MscBatchRunStats {
  totalFolders: number;
  totalScripts: number;
  completedFolders: number;
  completedScripts: number;
  failedScripts: number;
  resolvedOverlays: number;
  partialOverlays: number;
  skippedOverlays: number;
  failedOverlays: number;
  currentLabel: string | null;
  errors: string[];
  completed: boolean;
  cancelled: boolean;
}

const MSC_SOURCE_FILE_NAME_PATTERN = /^(\d+)\.(bscex|cscex|dscex)$/i;
const MSC_BATCH_EXPECTED_EXTENSION_BY_INDEX: Record<number, MscBatchSourceFile["extension"] | undefined> = {
  0: ".bscex",
  1: ".cscex",
  2: ".dscex",
};
const MIN_BATCH_CONCURRENCY = 1;
const DEFAULT_BATCH_CONCURRENCY = 10;
const MAX_BATCH_CONCURRENCY = 50;
const DEFAULT_BATCH_SCAN_CONCURRENCY = 4;

export interface BuildMscSourceBatchPlanParams {
  sourcePath: string;
  sourceScope: MscBatchSourceScope;
  readDir: (path: string) => Promise<readonly MscBatchDirectoryEntry[]>;
  joinPath: (...parts: string[]) => Promise<string>;
  getOutputPath: (path: string) => string;
  getLogPath: (path: string) => string;
  scanConcurrency?: number;
}

export function clampMscBatchConcurrency(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_BATCH_CONCURRENCY;
  return Math.min(MAX_BATCH_CONCURRENCY, Math.max(MIN_BATCH_CONCURRENCY, Math.trunc(value)));
}

export function normalizeMscBatchSourcePath(path: string): string {
  return path.trim().replace(/[\\/]+$/, "");
}

export function getMscBatchPathBasename(path: string): string {
  return normalizeMscBatchSourcePath(path).split(/[\\/]/).filter(Boolean).pop() ?? path;
}

export function getMscBatchSourceFile(entryName: string): MscBatchSourceFile | null {
  const match = entryName.match(MSC_SOURCE_FILE_NAME_PATTERN);
  if (!match) return null;
  return {
    name: entryName,
    index: Number.parseInt(match[1], 10),
    extension: `.${match[2].toLowerCase()}` as MscBatchSourceFile["extension"],
  };
}

export function collectMscBatchSourceFiles(entries: readonly MscBatchDirectoryEntry[]): MscBatchSourceFile[] {
  return entries
    .filter((entry): entry is MscBatchDirectoryEntry & { name: string } => Boolean(entry.isFile && entry.name))
    .map((entry) => getMscBatchSourceFile(entry.name))
    .filter((file): file is MscBatchSourceFile => file !== null)
    .filter((file) => MSC_BATCH_EXPECTED_EXTENSION_BY_INDEX[file.index] === file.extension)
    .sort((left, right) => left.index - right.index || left.name.localeCompare(right.name));
}

async function buildMscBatchScriptPlan(
  folderPath: string,
  file: MscBatchSourceFile,
  params: Pick<BuildMscSourceBatchPlanParams, "joinPath" | "getOutputPath" | "getLogPath">,
): Promise<MscBatchScriptPlan> {
  const path = await params.joinPath(folderPath, file.name);
  return {
    ...file,
    path,
    outputPath: params.getOutputPath(path),
    logPath: params.getLogPath(path),
  };
}

async function buildMscBatchFolderPlanFromEntries(
  folderPath: string,
  folderName: string,
  entries: readonly MscBatchDirectoryEntry[],
  params: Pick<BuildMscSourceBatchPlanParams, "joinPath" | "getOutputPath" | "getLogPath">,
): Promise<MscBatchFolderPlan | null> {
  const sourceFiles = collectMscBatchSourceFiles(entries);
  if (sourceFiles.length === 0) return null;
  const scripts: MscBatchScriptPlan[] = [];
  for (const file of sourceFiles) {
    scripts.push(await buildMscBatchScriptPlan(folderPath, file, params));
  }
  return { name: folderName, path: folderPath, scripts };
}

async function buildMscBatchFolderPlan(
  folderPath: string,
  folderName: string,
  params: Pick<BuildMscSourceBatchPlanParams, "readDir" | "joinPath" | "getOutputPath" | "getLogPath">,
): Promise<MscBatchFolderPlan | null> {
  const entries = await params.readDir(folderPath);
  return buildMscBatchFolderPlanFromEntries(folderPath, folderName, entries, params);
}

export async function buildMscSourceBatchPlan(params: BuildMscSourceBatchPlanParams): Promise<MscBatchPlan> {
  const rootPath = normalizeMscBatchSourcePath(params.sourcePath);
  const folders: MscBatchFolderPlan[] = [];

  if (params.sourceScope === "single-folder") {
    const folderPlan = await buildMscBatchFolderPlan(rootPath, getMscBatchPathBasename(rootPath), params);
    if (folderPlan) {
      folders.push(folderPlan);
    }
  } else {
    const rootEntries = await params.readDir(rootPath);
    const rootPlan = await buildMscBatchFolderPlanFromEntries(rootPath, getMscBatchPathBasename(rootPath), rootEntries, params);
    if (rootPlan) {
      folders.push(rootPlan);
    }

    const childFolders = rootEntries
      .filter((entry) => Boolean(entry.isDirectory && entry.name))
      .map((entry) => ({ name: entry.name! }))
      .sort((left, right) => left.name.localeCompare(right.name));

    await runLimitedConcurrency(
      childFolders,
      params.scanConcurrency ?? DEFAULT_BATCH_SCAN_CONCURRENCY,
      () => false,
      async (entry) => {
        const folderPath = await params.joinPath(rootPath, entry.name);
        try {
          const folderPlan = await buildMscBatchFolderPlan(folderPath, entry.name, params);
          if (folderPlan) {
            folders.push(folderPlan);
          }
        } catch {
          // Stale or inaccessible folders are skipped during scan; run output stays limited to real MSC folders.
        }
      },
    );
  }

  folders.sort((left, right) => left.name.localeCompare(right.name));
  return {
    rootPath,
    sourceScope: params.sourceScope,
    folders,
    totalScripts: folders.reduce((total, folder) => total + folder.scripts.length, 0),
  };
}

export async function runLimitedConcurrency<T>(
  items: readonly T[],
  concurrency: number,
  shouldStop: () => boolean,
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
  const limit = clampMscBatchConcurrency(concurrency);
  let nextIndex = 0;

  async function runWorker(): Promise<void> {
    while (!shouldStop()) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;
      await worker(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => runWorker()));
}

export function createInitialMscBatchRunStats(totalFolders: number, totalScripts: number): MscBatchRunStats {
  return {
    totalFolders,
    totalScripts,
    completedFolders: 0,
    completedScripts: 0,
    failedScripts: 0,
    resolvedOverlays: 0,
    partialOverlays: 0,
    skippedOverlays: 0,
    failedOverlays: 0,
    currentLabel: null,
    errors: [],
    completed: false,
    cancelled: false,
  };
}
