/**
 * Raw-level helpers for the settings store editor.
 *
 * Every value is presented and edited as JSON text so the page can show the
 * store exactly as it is persisted, including keys no typed form knows about.
 */

export type RawSettingEntry = {
  key: string;
  /** JSON text shown in the editor. */
  text: string;
  /** Value as stored, used for type labels and dirty comparison. */
  value: unknown;
};

export type SettingValueKind = "string" | "number" | "boolean" | "null" | "array" | "object";

export function settingValueKind(value: unknown): SettingValueKind {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  switch (typeof value) {
    case "string":
      return "string";
    case "number":
      return "number";
    case "boolean":
      return "boolean";
    case "object":
      return "object";
    default:
      throw new Error(`Unsupported setting value type: ${typeof value}`);
  }
}

/** JSON text for a stored value. Scalars stay on one line, containers are indented. */
export function formatSettingValue(value: unknown): string {
  const kind = settingValueKind(value);
  if (kind === "array" || kind === "object") return JSON.stringify(value, null, 2);
  return JSON.stringify(value);
}

/** Parses editor text back into a store value. Throws on malformed JSON. */
export function parseSettingValue(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) throw new Error("Value is empty. Use null for an empty value.");
  try {
    return JSON.parse(trimmed) as unknown;
  } catch (error) {
    throw new Error(
      `Not valid JSON: ${error instanceof Error ? error.message : String(error)}. ` +
        `Strings must be quoted, for example "E:\\\\XB\\\\mod".`,
    );
  }
}

/** Container values get a textarea; scalars get a single-line input. */
export function isMultilineSettingValue(value: unknown): boolean {
  const kind = settingValueKind(value);
  return kind === "array" || kind === "object";
}

export function validateSettingKey(key: string, existingKeys: readonly string[]): string {
  const trimmed = key.trim();
  if (!trimmed) throw new Error("Key is required");
  if (existingKeys.includes(trimmed)) throw new Error(`Key "${trimmed}" already exists`);
  return trimmed;
}

/** Store entries sorted by key so the list order is stable across reloads. */
export function toSortedRawEntries(entries: ReadonlyArray<[string, unknown]>): RawSettingEntry[] {
  return entries
    .map(([key, value]) => ({ key, value, text: formatSettingValue(value) }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

export function filterRawEntries(
  entries: readonly RawSettingEntry[],
  query: string,
): RawSettingEntry[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return entries.slice();
  return entries.filter(
    (entry) =>
      entry.key.toLowerCase().includes(needle) || entry.text.toLowerCase().includes(needle),
  );
}
