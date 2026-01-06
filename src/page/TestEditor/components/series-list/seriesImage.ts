export function formatSeriesImageFileName(iconFileIndex: number): string | null {
  if (!Number.isFinite(iconFileIndex)) return null;
  const idx = Math.trunc(iconFileIndex);
  if (idx < 1 || idx > 999) return null;
  const padded = String(idx).padStart(3, "0");
  return `ser_ms_${padded}.png`;
}

