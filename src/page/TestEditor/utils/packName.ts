export function normalizePackFolderName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "";

  const matched = /^0x([0-9a-fA-F]{8})$/i.exec(trimmed);
  if (!matched) {
    return trimmed;
  }

  return `0x${matched[1].toUpperCase()}`;
}

