/**
 * Font coverage checking for allowed Unicode codepoints.
 *
 * Uses allowed_ranges.json format (exvs2_nuf_allowed_ranges_v1) to determine
 * whether characters will render in the game's bitmap font without falling
 * back to missing glyph (*).
 *
 * The game uses 16-bit code units (uint16) for this font path, so codepoints
 * > U+FFFF (emoji, many rare CJK) are treated as not covered.
 */

import { readTextFile } from "@tauri-apps/plugin-fs";

import allowedRangesJson from "@/assets/allowed_ranges.json";

export type AllowedRange = [number, number];

export interface AllowedRangesData {
  format: string;
  sources?: string[];
  present_codepoints?: number;
  ranges: AllowedRange[];
}

export interface MissingCodepoint {
  cp: number;
  hex: string;
  char: string;
}

export interface StringCoverageResult {
  ok: boolean;
  missing: MissingCodepoint[];
}

/**
 * Common Traditional/Simplified Chinese -> Japanese (Shinjitai) replacements
 * for characters often missing from the font. Used for save validation suggestions.
 */
const CJK_TO_JAPANESE_SUGGESTIONS: Record<number, number> = {
  0x7522: 0x7523, // 產 -> 産
  0x570b: 0x56fd, // 國 -> 国
  0x5c6c: 0x5c5e, // 屬 -> 属
  0x6fa4: 0x6ca2, // 澤 -> 沢
  0x64c1: 0x62e1, // 擁 -> 拡
  0x9ed1: 0x9ed2, // 黑 -> 黒
  0x7d93: 0x7d4c, // 經 -> 経
  0x840a: 0x83b1, // 萊 -> 莱
  0x5fb7: 0x5fb3, // 德 -> 徳
  0x588a: 0x57ab, // 墊 -> 垫
  0x64ca: 0x6483, // 擊 -> 撃
  0x6eab: 0x6e29, // 溫 -> 温
  0x7da0: 0x7dd1, // 綠 -> 緑
  0x4f48: 0x5e03, // 佈 -> 布
};

/**
 * Get suggested Japanese replacement for a codepoint, if available.
 */
export function getSuggestedJapaneseReplacement(cp: number): string | null {
  const suggested = CJK_TO_JAPANESE_SUGGESTIONS[cp];
  if (suggested !== undefined) return String.fromCodePoint(suggested);
  return null;
}

/**
 * Check whether a codepoint is covered by allowed ranges.
 * Uses binary search since ranges are sorted by start.
 *
 * @param cp - Unicode codepoint (e.g. 0x4F60 for '你')
 * @param ranges - Inclusive [start, end] ranges, sorted by start
 * @returns true if the codepoint is within any range
 */
export function isCodepointAllowed(cp: number, ranges: AllowedRange[]): boolean {
  if (!Number.isInteger(cp) || cp < 0 || cp > 0x10ffff) return false;
  if (cp > 0xffff) return false; // This font set is u16-based
  if (cp === 0x0a || cp === 0x0d) return true; // LF/CR - skip validation

  let lo = 0;
  let hi = ranges.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const [start, end] = ranges[mid];
    if (cp < start) {
      hi = mid - 1;
    } else if (cp > end) {
      lo = mid + 1;
    } else {
      return true;
    }
  }
  return false;
}

/**
 * Check a string and return all missing codepoints (unique).
 * Iterates by Unicode codepoints via for-of.
 *
 * @param str - Input string to validate
 * @param ranges - Inclusive [start, end] ranges from allowed_ranges.json
 * @returns Result with ok flag and list of missing codepoints
 */
export function checkStringCoverage(str: string, ranges: AllowedRange[]): StringCoverageResult {
  const missingSet = new Set<number>();
  for (const ch of str) {
    const cp = ch.codePointAt(0) ?? 0;
    if (!isCodepointAllowed(cp, ranges)) {
      missingSet.add(cp);
    }
  }

  const missing: MissingCodepoint[] = Array.from(missingSet)
    .sort((a, b) => a - b)
    .map((cp) => ({
      cp,
      hex: `U+${cp.toString(16).toUpperCase().padStart(4, "0")}`,
      char: String.fromCodePoint(cp),
    }));

  return { ok: missing.length === 0, missing };
}

/**
 * Get the bundled default allowed ranges (from src/assets/allowed_ranges.json).
 * Use this for synchronous validation without loading from disk.
 */
export function getDefaultRanges(): AllowedRange[] {
  const data = allowedRangesJson as unknown as AllowedRangesData;
  return data.ranges;
}

/**
 * Load allowed_ranges.json from a file path using Tauri fs.
 * Caller must provide the absolute path to the JSON file.
 *
 * @param filePath - Absolute path to allowed_ranges.json
 * @returns Parsed ranges data
 */
export async function loadAllowedRangesFromFile(filePath: string): Promise<AllowedRangesData> {
  const text = await readTextFile(filePath);
  const data = JSON.parse(text) as AllowedRangesData;
  if (!Array.isArray(data.ranges)) {
    throw new Error("Invalid allowed_ranges.json: missing or invalid 'ranges' array");
  }
  return data;
}
