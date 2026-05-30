export interface GraphicParam {
  key: string;
  value: string;
}

export interface GraphicParamCategory {
  id: string;
  label: string;
  match: (key: string) => boolean;
}

export const GRAPHIC_PARAM_CATEGORIES: GraphicParamCategory[] = [
  {
    id: "lighting",
    label: "Lighting",
    match: (k) => /^(light_|sun_|shadow_|ambient_)/.test(k),
  },
  {
    id: "postprocess",
    label: "Post Process",
    match: (k) => /^(bloom_|dof_|fog_|tonemap_|exposure_|vignette_)/.test(k),
  },
  {
    id: "color",
    label: "Color Grading",
    match: (k) => /^(color_|curveedit_|saturation_|contrast_)/.test(k),
  },
  {
    id: "misc",
    label: "Misc",
    match: () => true,
  },
];

export interface IndexedGraphicParam extends GraphicParam {
  originalIndex: number;
}

export type GraphicParamInspectorRow =
  | {
      kind: "scalar";
      id: string;
      param: IndexedGraphicParam;
    }
  | {
      kind: "color";
      id: string;
      label: string;
      channels: {
        r: IndexedGraphicParam;
        g: IndexedGraphicParam;
        b: IndexedGraphicParam;
      };
    };

export function formatGraphicParamLabel(key: string): string {
  const trimmed = key.trim();
  if (!trimmed) return "Parameter";
  return trimmed
    .replace(/^_+|_+$/g, "")
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

export function categorizeGraphicParamKey(key: string): string {
  const lower = key.toLowerCase();
  for (const cat of GRAPHIC_PARAM_CATEGORIES) {
    if (cat.id !== "misc" && cat.match(lower)) return cat.id;
  }
  return "misc";
}

export function graphicParamNumericConfig(
  key: string,
  value: string,
): { value: number; min: number; max: number; step: number } | null {
  const n = Number.parseFloat(value);
  if (!Number.isFinite(n)) return null;
  const lower = key.toLowerCase();
  if (lower.includes("_enable") || value === "0" || value === "1") {
    return { value: n, min: 0, max: 1, step: 1 };
  }
  if (lower.includes("_rot_")) {
    return { value: n, min: -360, max: 360, step: 0.1 };
  }
  if (
    lower.includes("color") ||
    lower.includes("boost") ||
    lower.includes("intensity") ||
    lower.includes("threshold")
  ) {
    return { value: n, min: Math.min(0, n), max: Math.max(8, n), step: 0.01 };
  }
  if (lower.startsWith("curveedit_")) {
    return { value: n, min: 0, max: Math.max(1, n), step: 0.001 };
  }
  return { value: n, min: Math.min(-10000, n), max: Math.max(10000, n), step: 0.1 };
}

export function isGraphicParamBool(key: string, value: string): boolean {
  const lower = key.toLowerCase();
  if (lower.includes("_enable")) return true;
  const n = Number.parseFloat(value);
  return (value === "0" || value === "1") && Number.isFinite(n);
}

function colorStem(key: string, suffix: "_r" | "_g" | "_b"): string | null {
  const lower = key.toLowerCase();
  if (!lower.endsWith(suffix)) return null;
  return lower.slice(0, -suffix.length);
}

export function buildGraphicParamInspectorRows(
  params: IndexedGraphicParam[],
): GraphicParamInspectorRow[] {
  const consumed = new Set<number>();
  const rows: GraphicParamInspectorRow[] = [];

  const byStem = new Map<string, { r?: IndexedGraphicParam; g?: IndexedGraphicParam; b?: IndexedGraphicParam }>();
  for (const param of params) {
    const rStem = colorStem(param.key, "_r");
    const gStem = colorStem(param.key, "_g");
    const bStem = colorStem(param.key, "_b");
    const stem = rStem ?? gStem ?? bStem;
    if (!stem) continue;
    const bucket = byStem.get(stem) ?? {};
    if (rStem) bucket.r = param;
    if (gStem) bucket.g = param;
    if (bStem) bucket.b = param;
    byStem.set(stem, bucket);
  }

  for (const [stem, bucket] of byStem) {
    if (!bucket.r || !bucket.g || !bucket.b) continue;
    consumed.add(bucket.r.originalIndex);
    consumed.add(bucket.g.originalIndex);
    consumed.add(bucket.b.originalIndex);
    rows.push({
      kind: "color",
      id: `color:${stem}`,
      label: formatGraphicParamLabel(stem),
      channels: { r: bucket.r, g: bucket.g, b: bucket.b },
    });
  }

  for (const param of params) {
    if (consumed.has(param.originalIndex)) continue;
    rows.push({
      kind: "scalar",
      id: `scalar:${param.key}:${param.originalIndex}`,
      param,
    });
  }

  return rows;
}

export function rgbPreviewCss(r: string, g: string, b: string): string {
  const parse = (raw: string) => {
    const n = Number.parseFloat(raw);
    if (!Number.isFinite(n)) return 0;
    return n > 1 ? Math.min(255, n) / 255 : Math.min(1, Math.max(0, n));
  };
  const rr = Math.round(parse(r) * 255);
  const gg = Math.round(parse(g) * 255);
  const bb = Math.round(parse(b) * 255);
  return `rgb(${rr}, ${gg}, ${bb})`;
}

export function groupIndexedGraphicParams(
  params: GraphicParam[],
  filter: string,
): Map<string, GraphicParamInspectorRow[]> {
  const lower = filter.toLowerCase();
  const indexed: IndexedGraphicParam[] = params
    .map((p, i) => ({ ...p, originalIndex: i }))
    .filter((p) => !lower || p.key.toLowerCase().includes(lower));

  const rows = buildGraphicParamInspectorRows(indexed);
  const groups = new Map<string, GraphicParamInspectorRow[]>();

  for (const row of rows) {
    const key =
      row.kind === "color"
        ? row.channels.r.key
        : row.param.key;
    const catId = categorizeGraphicParamKey(key);
    const arr = groups.get(catId) ?? [];
    arr.push(row);
    groups.set(catId, arr);
  }

  return groups;
}
