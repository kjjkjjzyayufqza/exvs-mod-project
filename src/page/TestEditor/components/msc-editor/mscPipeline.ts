/**
 * Pure helpers for the MSC workspace pipeline view.
 *
 * The MSC pack is always three sorted subfiles (FileIndex order):
 *   0 -> .bscex (behaviour script)
 *   1 -> .cscex (character script)
 *   2 -> .dscex (depiction script)
 * Each slot decompiles to `<index>.c` (with a `<index>.txt` disasm log) and
 * recompiles back to its source extension in place.
 */

export interface MscFileInfo {
  name: string;
  path: string;
}

export type MscFileRole = "script" | "c" | "log" | "other";

export interface MscPackSlot {
  index: number;
  sourceExtension: string;
  roleLabel: string;
}

export const MSC_PACK_SLOTS: readonly MscPackSlot[] = [
  { index: 0, sourceExtension: ".bscex", roleLabel: "Behaviour" },
  { index: 1, sourceExtension: ".cscex", roleLabel: "Character" },
  { index: 2, sourceExtension: ".dscex", roleLabel: "Depiction" },
];

const SCRIPT_EXTENSIONS = [".bscex", ".cscex", ".dscex"] as const;

/** Pack root C files that support Repack in this workspace. */
export function isMscPackScriptCFile(name: string): boolean {
  const lower = name.toLowerCase();
  return lower === "0.c" || lower === "1.c" || lower === "2.c";
}

export function getMscFileRole(name: string): MscFileRole {
  const lower = name.toLowerCase();
  if (SCRIPT_EXTENSIONS.some((ext) => lower.endsWith(ext))) return "script";
  if (lower.endsWith(".c")) return "c";
  if (lower.endsWith(".txt")) return "log";
  return "other";
}

export interface MscSlotStatus extends MscPackSlot {
  sourceName: string;
  decompiledName: string;
  logName: string;
  hasSource: boolean;
  hasDecompiled: boolean;
  hasLog: boolean;
}

/** Derive per-slot pipeline state from the (unfiltered) folder listing. */
export function computeMscSlotStatuses(fileNames: readonly string[]): MscSlotStatus[] {
  const present = new Set(fileNames.map((name) => name.toLowerCase()));
  return MSC_PACK_SLOTS.map((slot) => {
    const sourceName = `${slot.index}${slot.sourceExtension}`;
    const decompiledName = `${slot.index}.c`;
    const logName = `${slot.index}.txt`;
    return {
      ...slot,
      sourceName,
      decompiledName,
      logName,
      hasSource: present.has(sourceName),
      hasDecompiled: present.has(decompiledName),
      hasLog: present.has(logName),
    };
  });
}

/** Leading-number comparator so `0.c` < `1.c` < `2.c` and 0/1 decompile before 2. */
export function compareByLeadingIndex(a: MscFileInfo, b: MscFileInfo): number {
  return a.name.localeCompare(b.name, undefined, { numeric: true });
}

export interface MscFileGroup {
  role: MscFileRole;
  label: string;
  files: MscFileInfo[];
}

const GROUP_ORDER: ReadonlyArray<{ role: MscFileRole; label: string }> = [
  { role: "script", label: "Source scripts" },
  { role: "c", label: "Decompiled C" },
  { role: "log", label: "Logs" },
  { role: "other", label: "Other" },
];

export function groupMscFiles(files: readonly MscFileInfo[]): MscFileGroup[] {
  const byRole = new Map<MscFileRole, MscFileInfo[]>();
  for (const file of files) {
    const role = getMscFileRole(file.name);
    const bucket = byRole.get(role);
    if (bucket) {
      bucket.push(file);
    } else {
      byRole.set(role, [file]);
    }
  }
  return GROUP_ORDER.map(({ role, label }) => ({
    role,
    label,
    files: (byRole.get(role) ?? []).slice().sort(compareByLeadingIndex),
  })).filter((group) => group.files.length > 0);
}
