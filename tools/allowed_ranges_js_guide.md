## Purpose

`allowed_ranges.json` is an exported allowlist of Unicode codepoints that exist in the game's bitmap font tables (`*.nuf`).

You can use it to answer:

- "Will this character likely render without falling back to `*` (missing glyph)?"  
- "Which characters in this string are not covered by the current font set?"

This is **font coverage checking**, not text decoding.

## File format (v1)

Key fields:

- `format`: `"exvs2_nuf_allowed_ranges_v1"`
- `sources`: which `.nuf` files were merged
- `ranges`: an array of `[start, end]` pairs (inclusive), in **decimal integers**

Example:

```json
{
  "format": "exvs2_nuf_allowed_ranges_v1",
  "present_codepoints": 7100,
  "ranges": [
    [32, 126],
    [160, 255]
  ]
}
```

Interpretation:

- `[32, 126]` means U+0020..U+007E are covered.
- `[160, 255]` means U+00A0..U+00FF are covered.

## Important limitations

- **It only represents the `.nuf` files listed in `sources`**. If the game uses other font assets in other contexts, you must export a new JSON including them.
- **The game internally uses 16-bit code units for this font path** (`uint16`).  
  If your input contains codepoints > U+FFFF (emoji, many rare CJK), treat them as "not covered" unless you have evidence the game supports them via another path.

## JavaScript: core functions (binary search)

The `ranges` array is sorted. The fastest membership test is a binary search.

```js
/**
 * Check whether a codepoint is covered by allowed ranges.
 *
 * @param {number} cp - Unicode codepoint (e.g. 0x4F60 for '你')
 * @param {Array<[number, number]>} ranges - Inclusive [start,end] ranges, sorted by start
 * @returns {boolean}
 */
export function isCodepointAllowed(cp, ranges) {
  if (!Number.isInteger(cp) || cp < 0 || cp > 0x10FFFF) return false;
  if (cp > 0xFFFF) return false; // This font set is u16-based

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
 *
 * Note: `for (const ch of str)` iterates by Unicode codepoints.
 *
 * @param {string} str
 * @param {Array<[number, number]>} ranges
 * @returns {{ ok: boolean, missing: Array<{ cp: number, hex: string, char: string }> }}
 */
export function checkStringCoverage(str, ranges) {
  const missingSet = new Set();
  for (const ch of str) {
    const cp = ch.codePointAt(0);
    if (!isCodepointAllowed(cp, ranges)) {
      missingSet.add(cp);
    }
  }

  const missing = Array.from(missingSet)
    .sort((a, b) => a - b)
    .map((cp) => ({
      cp,
      hex: `U+${cp.toString(16).toUpperCase().padStart(4, "0")}`,
      char: String.fromCodePoint(cp),
    }));

  return { ok: missing.length === 0, missing };
}
```

## Loading `allowed_ranges.json`

### Node.js (ESM)

```js
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkStringCoverage } from "./your-functions.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const jsonPath = path.resolve(__dirname, "../xDocs/LocalizedText_research/font/allowed_ranges.json");
const data = JSON.parse(await fs.readFile(jsonPath, "utf-8"));
const ranges = data.ranges;

const res = checkStringCoverage("你好", ranges);
console.log(res.ok, res.missing);
```

### Browser (Fetch)

```js
import { checkStringCoverage } from "./your-functions.js";

const resp = await fetch("/xDocs/LocalizedText_research/font/allowed_ranges.json");
const data = await resp.json();
const ranges = data.ranges;

console.log(checkStringCoverage("你好", ranges));
```

## Example: interpreting results

If `res.ok === false`, `res.missing` contains the unique missing characters.

Example output shape:

```js
{
  ok: false,
  missing: [
    { cp: 29986, hex: "U+7522", char: "產" }
  ]
}
```

That means the font set does **not** include U+7522 (`產`), and the game will likely fall back to `*` for that character in bitmap-font rendering.

