export function canonicalMscHashHex(value: string | number): string {
  if (typeof value === "number") {
    return `0x${(value >>> 0).toString(16).padStart(8, "0")}`;
  }

  const trimmed = value.trim();
  const radix = trimmed.startsWith("0x") || trimmed.startsWith("0X") ? 16 : 10;
  const parsed = Number.parseInt(trimmed, radix);
  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid MSC hash literal: ${value}`);
  }
  return `0x${(parsed >>> 0).toString(16).padStart(8, "0")}`;
}
