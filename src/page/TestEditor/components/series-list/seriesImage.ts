export function extractA0253FirstFolderSeriesBaseNameOrder(structureJson: unknown): Array<string | null> {
  const root = structureJson as any;
  const items: any[] | undefined = root?.SubFileStructure;
  if (!Array.isArray(items) || items.length === 0) return [];

  let depth = 0;
  let firstFolderDepth: number | null = null;
  let collecting = false;
  // IMPORTANT: preserve index alignment with the Nth Item inside the first Folder.
  // If a Name is missing, keep a null placeholder to avoid shifting indices.
  const baseNames: Array<string | null> = [];

  for (const it of items) {
    const type = String(it?.type ?? "");
    if (type === "Folder") {
      depth += 1;
      if (firstFolderDepth === null) {
        firstFolderDepth = depth;
        collecting = true;
      }
      continue;
    }

    if (type === "Item") {
      if (!collecting || firstFolderDepth === null) continue;
      if (depth !== firstFolderDepth) continue;
      // IMPORTANT: iconFileIndex maps to the Nth Item in the first Folder (0-based),
      // and the target series is decided by the item's Name (e.g. "ser_ms_015" / "ser_ms_001_1").
      const raw = typeof it?.Name === "string" ? it.Name.trim() : "";
      baseNames.push(raw ? raw : null);
      continue;
    }

    if (type === "EndMark") {
      const cRaw = Number(it?.endMarkCount);
      const c = Number.isFinite(cRaw) && cRaw > 0 ? Math.trunc(cRaw) : 1;
      depth = Math.max(0, depth - c);

      if (collecting && firstFolderDepth !== null && depth < firstFolderDepth) {
        collecting = false;
        break;
      }
    }
  }

  return baseNames;
}

export function resolveMappedSeriesBaseName(seriesBaseNameOrder: Array<string | null> | undefined, iconFileIndex: number): string | null {
  if (!seriesBaseNameOrder || seriesBaseNameOrder.length === 0) return null;
  if (!Number.isFinite(iconFileIndex)) return null;
  const idx = Math.trunc(iconFileIndex);
  if (idx < 0 || idx >= seriesBaseNameOrder.length) return null;
  const mapped = seriesBaseNameOrder[idx];
  if (typeof mapped !== "string") return null;
  const trimmed = mapped.trim();
  return trimmed ? trimmed : null;
}

export function formatSeriesPngFileNameFromBaseName(baseName: string): string | null {
  const trimmed = baseName.trim();
  if (!trimmed) return null;
  return `${trimmed}.png`;
}

export function formatSeriesNutexbFileNameFromBaseName(baseName: string): string | null {
  const trimmed = baseName.trim();
  if (!trimmed) return null;
  return `${trimmed}.nutexb`;
}

export function tryParseStrictSeriesMsIndex(baseName: string): number | null {
  const trimmed = baseName.trim();
  const m = /^ser_ms_(\d{3})$/i.exec(trimmed);
  if (!m) return null;
  const v = Number.parseInt(m[1] ?? "", 10);
  if (!Number.isFinite(v) || v < 1 || v > 999) return null;
  return v;
}
