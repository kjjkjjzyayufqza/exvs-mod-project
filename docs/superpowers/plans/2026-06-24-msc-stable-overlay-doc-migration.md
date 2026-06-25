# MSC Stable Overlay And Doc Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the brittle MSC action-rename mutation flow with a stable-evidence overlay flow that keeps raw `2.c` untouched, generates a sibling resolved overlay artifact, and updates the core MSC docs to cite stable keys instead of legacy display names.

**Architecture:** Keep the current `mscdec.py` / `msclang.py` toolchain unchanged. Build a front-end-first overlay pipeline in `TestEditor`: extract stable registry evidence from `0.c` and `2.c`, enrich it with optional param labels when nearby param files exist, and render the result into a sidecar `2.resolved.md` file instead of rewriting raw decompiled C. Preserve the old mask-based action renamer only as a legacy alias source, then update the two highest-value MSC docs so future research cites `action hash` / slot / resource evidence instead of treating `func_N` or `ACTION_*` as durable identities.

**Tech Stack:** React 19, TypeScript, Vitest, existing Tauri commands (`parse_typed_param_file`, `read_file`), `@tauri-apps/plugin-fs`, `@tauri-apps/plugin-shell`, existing `obfString.ts`

---

## File Map

- Create: `src/page/TestEditor/utils/mscStableOverlayTypes.ts`
- Create: `src/page/TestEditor/utils/mscStableEvidence.ts`
- Create: `src/page/TestEditor/utils/mscStableEvidence.test.ts`
- Create: `src/page/TestEditor/utils/mscParamLabelResolver.ts`
- Create: `src/page/TestEditor/utils/mscParamLabelResolver.test.ts`
- Create: `src/page/TestEditor/utils/mscResolvedOverlay.ts`
- Create: `src/page/TestEditor/utils/mscResolvedOverlay.test.ts`
- Create: `src/page/TestEditor/utils/mscActionRename.test.ts`
- Modify: `src/page/TestEditor/utils/mscActionRename.ts`
- Modify: `src/page/TestEditor/utils/mscWorkspaceUtils.ts`
- Modify: `src/page/TestEditor/components/msc-editor/mscPipeline.ts`
- Modify: `src/page/TestEditor/components/msc-editor/mscPipeline.test.ts`
- Modify: `src/page/TestEditor/components/msc-editor/MscWorkspaceView.tsx`
- Modify: `src/page/TestEditor/components/msc-editor/MscWorkspaceView.test.tsx`
- Modify: `docs/msc-research/msc-auto-rename-mapping.md`
- Modify: `docs/msc-research/0c-to-2c-input-action-boundary.md`

---

### Task 1: Stabilize Legacy Alias Extraction Without Making It The Truth

**Files:**
- Create: `src/page/TestEditor/utils/mscActionRename.test.ts`
- Modify: `src/page/TestEditor/utils/mscActionRename.ts`

- [ ] **Step 1: Write a failing test that extracts legacy aliases without rewriting the raw file**

```ts
import { describe, expect, it } from "vitest";
import {
  collectLegacyActionAliases,
  renameScript2CallbacksByActionMask,
} from "./mscActionRename";

const SCRIPT0 = `
void func_143()
{
    if ((global48 & 0x1) != 0)
    {
        func_95(0xf48d2d49, 0, 0);
    }
    else if ((global48 & 0x80) != 0)
    {
        func_95(0x31f61d6c, 0, 0);
    }
}
`;

const SCRIPT2 = `
func_241(0xf48d2d49, func_912);
func_241(0x31f61d6c, func_926);
`;

describe("collectLegacyActionAliases", () => {
  it("returns legacy alias hints keyed by action hash", () => {
    const aliases = collectLegacyActionAliases(SCRIPT0, SCRIPT2);
    expect(aliases.get("0xf48d2d49")).toEqual({
      hashHex: "0xf48d2d49",
      workingName: "ACTION_A_SHOT",
      comment: "射击",
    });
    expect(aliases.get("0x31f61d6c")).toEqual({
      hashHex: "0x31f61d6c",
      workingName: "ACTION_AB_SUB",
      comment: "副射",
    });
  });
});

describe("renameScript2CallbacksByActionMask", () => {
  it("keeps the old mutation path working as a compatibility wrapper", () => {
    const result = renameScript2CallbacksByActionMask(SCRIPT0, SCRIPT2);
    expect(result.updatedScript2).toContain("func_241(0xf48d2d49, ACTION_A_SHOT); //射击");
    expect(result.updatedScript2).toContain("func_241(0x31f61d6c, ACTION_AB_SUB); //副射");
  });
});
```

- [ ] **Step 2: Run the test to verify the new helper does not exist yet**

Run: `npm test -- src/page/TestEditor/utils/mscActionRename.test.ts`

Expected: FAIL with an error such as `collectLegacyActionAliases is not exported`.

- [ ] **Step 3: Add a reusable alias-hint API and keep the old rename wrapper on top**

```ts
export interface MscLegacyActionAlias {
  hashHex: string;
  workingName: string;
  comment: string;
}

export function collectLegacyActionAliases(
  script0Content: string,
  script2Content: string,
): Map<string, MscLegacyActionAlias> {
  const descriptorsByHash = extractActionDescriptorsFrom0(script0Content);
  const aliases = new Map<string, MscLegacyActionAlias>();
  const bindingRegex = /func_241\(\s*(0x[0-9a-fA-F]+)\s*,\s*([A-Za-z_][A-Za-z0-9_]*)\s*\);/g;

  let bindingMatch: RegExpExecArray | null;
  while ((bindingMatch = bindingRegex.exec(script2Content)) !== null) {
    const hashHex = bindingMatch[1].toLowerCase();
    const descriptor = descriptorsByHash.get(hashHex);
    if (!descriptor) continue;
    aliases.set(hashHex, {
      hashHex,
      workingName: descriptor.functionName,
      comment: descriptor.comment,
    });
  }

  return aliases;
}

export function renameScript2CallbacksByActionMask(
  script0Content: string,
  script2Content: string,
): MscActionRenameResult {
  const aliases = collectLegacyActionAliases(script0Content, script2Content);
  const callbackRenameMap = new Map<string, string>();
  const commentByHash = new Map<string, string>();
  const bindingRegex = /func_241\(\s*(0x[0-9a-fA-F]+)\s*,\s*([A-Za-z_][A-Za-z0-9_]*)\s*\);/g;
  const usedNames = new Set<string>();

  let bindingMatch: RegExpExecArray | null;
  while ((bindingMatch = bindingRegex.exec(script2Content)) !== null) {
    const hashHex = bindingMatch[1].toLowerCase();
    const callbackName = bindingMatch[2];
    const alias = aliases.get(hashHex);
    if (!alias) continue;

    let nextName = alias.workingName;
    if (usedNames.has(nextName) && callbackRenameMap.get(callbackName) !== nextName) {
      let suffix = 2;
      while (usedNames.has(`${nextName}_${suffix}`)) suffix += 1;
      nextName = `${nextName}_${suffix}`;
    }

    usedNames.add(nextName);
    callbackRenameMap.set(callbackName, nextName);
    commentByHash.set(hashHex, alias.comment);
  }

  if (callbackRenameMap.size === 0) {
    throw new Error("MSC action rename: no func_241 bindings matched legacy action routes");
  }

  let updatedScript2 = script2Content;
  for (const [oldName, newName] of callbackRenameMap.entries()) {
    updatedScript2 = updatedScript2.replace(new RegExp(`\\b${escapeRegex(oldName)}\\b`, "g"), newName);
  }
  for (const [hashHex, comment] of commentByHash.entries()) {
    const updatedBindingRegex = new RegExp(
      `(func_241\\(\\s*${escapeRegex(hashHex)}\\s*,\\s*([A-Za-z_][A-Za-z0-9_]*)\\s*\\);)(?:\\s*//.*)?`,
      "g",
    );
    updatedScript2 = updatedScript2.replace(updatedBindingRegex, (match, bindingPrefix: string) => {
      return `${bindingPrefix} //${comment}`;
    });
  }

  return {
    updatedScript2,
    renamedCallbackCount: callbackRenameMap.size,
    bindingCommentCount: commentByHash.size,
  };
}
```

- [ ] **Step 4: Run the legacy alias tests**

Run: `npm test -- src/page/TestEditor/utils/mscActionRename.test.ts`

Expected: PASS with two tests.

- [ ] **Step 5: Commit the compatibility refactor**

```bash
git add src/page/TestEditor/utils/mscActionRename.ts src/page/TestEditor/utils/mscActionRename.test.ts
git commit -m "refactor(msc): extract legacy action alias hints"
```

---

### Task 2: Parse Stable Registry Evidence From `2.c`

**Files:**
- Create: `src/page/TestEditor/utils/mscStableOverlayTypes.ts`
- Create: `src/page/TestEditor/utils/mscStableEvidence.ts`
- Create: `src/page/TestEditor/utils/mscStableEvidence.test.ts`

- [ ] **Step 1: Write failing tests for stable action / slot / resource extraction**

```ts
import { describe, expect, it } from "vitest";
import { buildStableMscEvidence } from "./mscStableEvidence";

const SCRIPT0 = `
sys_1(0x10000, 0x1, 0x17, 0x9475130e);
`;

const SCRIPT2 = `
func_241(0x9475130e, func_450);
sys_1(0x10001, 0x2, 0x23, func_870);
sys_1(0x10001, 0x3, 0x23, 0x37);

void func_450()
{
    func_69(0x23);
}

void func_870()
{
    sys_4F(0xb, 0x2, 0xa8e202bf);
}
`;

describe("buildStableMscEvidence", () => {
  it("extracts action bindings, slot callback bindings, and weapon bindings", () => {
    const evidence = buildStableMscEvidence({
      script0Content: SCRIPT0,
      script2Content: SCRIPT2,
      legacyAliases: new Map([
        ["0x9475130e", { hashHex: "0x9475130e", workingName: "ACTION_TRANSFORM_DASH_ENTRY", comment: "变形突入" }],
      ]),
    });

    expect(evidence.actions).toEqual([
      expect.objectContaining({
        actionHashHex: "0x9475130e",
        callbackName: "func_450",
        actionIndexHex: "0x17",
        requestedSlots: ["0x23"],
        legacyWorkingName: "ACTION_TRANSFORM_DASH_ENTRY",
      }),
    ]);

    expect(evidence.slotCallbacks).toEqual([
      expect.objectContaining({
        slotHex: "0x23",
        callbackName: "func_870",
        referencedByActionHashes: ["0x9475130e"],
      }),
    ]);

    expect(evidence.weaponBindings).toEqual([
      expect.objectContaining({
        slotHex: "0x2",
        armsEntryHashHex: "0xa8e202bf",
        ownerCallbackName: "func_870",
      }),
    ]);
  });

  it("does not depend on a specific func_N number", () => {
    const renumbered = SCRIPT2.replace(/func_450/g, "func_900").replace(/func_870/g, "func_1158");
    const evidence = buildStableMscEvidence({
      script0Content: SCRIPT0,
      script2Content: renumbered,
      legacyAliases: new Map(),
    });
    expect(evidence.actions[0]?.callbackName).toBe("func_900");
    expect(evidence.slotCallbacks[0]?.callbackName).toBe("func_1158");
  });
});
```

- [ ] **Step 2: Run the stable evidence test and confirm it fails**

Run: `npm test -- src/page/TestEditor/utils/mscStableEvidence.test.ts`

Expected: FAIL because `mscStableEvidence.ts` does not exist yet.

- [ ] **Step 3: Create focused overlay types**

```ts
// src/page/TestEditor/utils/mscStableOverlayTypes.ts
export interface MscStableActionEvidence {
  actionHashHex: string;
  actionIndexHex: string | null;
  callbackName: string;
  requestedSlots: string[];
  legacyWorkingName?: string;
  legacyComment?: string;
}

export interface MscStableSlotCallbackEvidence {
  slotHex: string;
  callbackName: string;
  referencedByActionHashes: string[];
}

export interface MscStableWeaponBindingEvidence {
  slotHex: string;
  armsEntryHashHex: string;
  ownerCallbackName: string;
  label?: string;
}

export interface MscStableOverlayEvidence {
  actions: MscStableActionEvidence[];
  slotCallbacks: MscStableSlotCallbackEvidence[];
  weaponBindings: MscStableWeaponBindingEvidence[];
}
```

- [ ] **Step 4: Create the stable registry parser**

```ts
// src/page/TestEditor/utils/mscStableEvidence.ts
import type { MscLegacyActionAlias } from "./mscActionRename";
import type {
  MscStableActionEvidence,
  MscStableOverlayEvidence,
  MscStableSlotCallbackEvidence,
  MscStableWeaponBindingEvidence,
} from "./mscStableOverlayTypes";

function normalizeHex(value: string): string {
  return `0x${value.replace(/^0x/i, "").toLowerCase()}`;
}

function toHexLiteral(value: string): string {
  return value.trim().startsWith("0x")
    ? normalizeHex(value.trim())
    : `0x${Number.parseInt(value.trim(), 10).toString(16)}`;
}

function readFunctionBodies(source: string): Map<string, string> {
  const bodies = new Map<string, string>();
  const headerRegex = /void\s+([A-Za-z_][A-Za-z0-9_]*)\s*\([^)]*\)\s*\{/g;
  let match: RegExpExecArray | null;
  while ((match = headerRegex.exec(source)) !== null) {
    const name = match[1];
    const braceStart = source.indexOf("{", match.index);
    let depth = 0;
    for (let i = braceStart; i < source.length; i += 1) {
      if (source[i] === "{") depth += 1;
      if (source[i] === "}") {
        depth -= 1;
        if (depth === 0) {
          bodies.set(name, source.slice(braceStart + 1, i));
          break;
        }
      }
    }
  }
  return bodies;
}

export function buildStableMscEvidence(params: {
  script0Content: string;
  script2Content: string;
  legacyAliases: Map<string, MscLegacyActionAlias>;
}): MscStableOverlayEvidence {
  const { script0Content, script2Content, legacyAliases } = params;
  const callbackBodies = readFunctionBodies(script2Content);

  const actionIndexByHash = new Map<string, string>();
  const actionIndexRegex = /sys_1\(\s*0x10000\s*,\s*0x1\s*,\s*(0x[0-9a-fA-F]+|\d+)\s*,\s*(0x[0-9a-fA-F]+)\s*\)/g;
  let actionIndexMatch: RegExpExecArray | null;
  while ((actionIndexMatch = actionIndexRegex.exec(script0Content)) !== null) {
    actionIndexByHash.set(normalizeHex(actionIndexMatch[2]), toHexLiteral(actionIndexMatch[1]));
  }

  const actions: MscStableActionEvidence[] = [];
  const actionBindingRegex = /func_241\(\s*(0x[0-9a-fA-F]+)\s*,\s*([A-Za-z_][A-Za-z0-9_]*)\s*\);/g;
  let actionBindingMatch: RegExpExecArray | null;
  while ((actionBindingMatch = actionBindingRegex.exec(script2Content)) !== null) {
    const actionHashHex = normalizeHex(actionBindingMatch[1]);
    const callbackName = actionBindingMatch[2];
    const body = callbackBodies.get(callbackName) ?? "";
    const requestedSlots = Array.from(
      body.matchAll(/func_69\(\s*(0x[0-9a-fA-F]+|\d+)\s*\)/g),
      (match) => toHexLiteral(match[1]),
    );
    const legacy = legacyAliases.get(actionHashHex);
    actions.push({
      actionHashHex,
      actionIndexHex: actionIndexByHash.get(actionHashHex) ?? null,
      callbackName,
      requestedSlots,
      legacyWorkingName: legacy?.workingName,
      legacyComment: legacy?.comment,
    });
  }

  const slotCallbacks: MscStableSlotCallbackEvidence[] = [];
  const slotRegistryRegex = /sys_1\(\s*0x10001\s*,\s*0x2\s*,\s*(0x[0-9a-fA-F]+|\d+)\s*,\s*([A-Za-z_][A-Za-z0-9_]*)\s*\);/g;
  let slotRegistryMatch: RegExpExecArray | null;
  while ((slotRegistryMatch = slotRegistryRegex.exec(script2Content)) !== null) {
    const slotHex = toHexLiteral(slotRegistryMatch[1]);
    const callbackName = slotRegistryMatch[2];
    slotCallbacks.push({
      slotHex,
      callbackName,
      referencedByActionHashes: actions
        .filter((action) => action.requestedSlots.includes(slotHex))
        .map((action) => action.actionHashHex),
    });
  }

  const weaponBindings: MscStableWeaponBindingEvidence[] = [];
  for (const [callbackName, body] of callbackBodies.entries()) {
    for (const match of body.matchAll(/sys_4F\(\s*0xb\s*,\s*(0x[0-9a-fA-F]+|\d+)\s*,\s*(0x[0-9a-fA-F]+)\s*\)/g)) {
      weaponBindings.push({
        slotHex: toHexLiteral(match[1]),
        armsEntryHashHex: normalizeHex(match[2]),
        ownerCallbackName: callbackName,
      });
    }
  }

  return { actions, slotCallbacks, weaponBindings };
}
```

- [ ] **Step 5: Run the stable evidence tests**

Run: `npm test -- src/page/TestEditor/utils/mscStableEvidence.test.ts`

Expected: PASS with both extraction tests green.

- [ ] **Step 6: Commit the registry parser**

```bash
git add src/page/TestEditor/utils/mscStableOverlayTypes.ts src/page/TestEditor/utils/mscStableEvidence.ts src/page/TestEditor/utils/mscStableEvidence.test.ts
git commit -m "feat(msc): parse stable action and slot evidence"
```

---

### Task 3: Decode Optional Param Labels Without Adding A New Rust Command

**Files:**
- Create: `src/page/TestEditor/utils/mscParamLabelResolver.ts`
- Create: `src/page/TestEditor/utils/mscParamLabelResolver.test.ts`

- [ ] **Step 1: Write failing tests for label decoding from kind-7 offsets**

```ts
import { describe, expect, it } from "vitest";
import type { TypedParamFile } from "../components/param-editor/typedParamTypes";
import { obfEncodeFromUtf8String } from "@/utils/obfString";
import {
  buildParamLabelIndex,
  readObfLabelAtOffset,
} from "./mscParamLabelResolver";

describe("readObfLabelAtOffset", () => {
  it("decodes an obfuscated null-terminated string from byte 0 of the pointed record", () => {
    const bytes = new Uint8Array(0x80);
    bytes.set(obfEncodeFromUtf8String("GUN_TEST"), 0x20);
    expect(readObfLabelAtOffset(bytes, 0x20)).toBe("GUN_TEST");
  });
});

describe("buildParamLabelIndex", () => {
  it("maps entry ids to action/resource labels when the offsets exist", () => {
    const bytes = new Uint8Array(0x100);
    bytes.set(obfEncodeFromUtf8String("ACTION_DELTA"), 0x20);
    bytes.set(obfEncodeFromUtf8String("RESOURCE_DELTA"), 0x40);

    const parsed: TypedParamFile = {
      header: {},
      fieldSpecs: [],
      entryIds: [0xa8e202bf],
      entries: [
        {
          entryId: 0xa8e202bf,
          actionLabelOffset: 0x20,
          resourceLabelOffset: 0x40,
        },
      ],
      trailingData: [],
    };

    const labels = buildParamLabelIndex(parsed, bytes);
    expect(labels.get("0xa8e202bf")).toEqual({
      actionLabel: "ACTION_DELTA",
      resourceLabel: "RESOURCE_DELTA",
    });
  });
});
```

- [ ] **Step 2: Run the label resolver test and confirm it fails**

Run: `npm test -- src/page/TestEditor/utils/mscParamLabelResolver.test.ts`

Expected: FAIL because `mscParamLabelResolver.ts` does not exist yet.

- [ ] **Step 3: Create a pure label decoder plus a thin async wrapper around existing Tauri APIs**

```ts
import { invoke } from "@tauri-apps/api/core";
import { IOReadFile } from "@/IO/fileSystem";
import { obfDecodeToUtf8String } from "@/utils/obfString";
import type { TypedParamFile, TypedParamEntry } from "../components/param-editor/typedParamTypes";

export interface MscParamLabels {
  actionLabel: string | null;
  resourceLabel: string | null;
}

function normalizeHash(value: number): string {
  return `0x${(value >>> 0).toString(16).padStart(8, "0")}`;
}

function readNumericField(entry: TypedParamEntry, key: string): number | null {
  const value = entry[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function readObfLabelAtOffset(bytes: Uint8Array, offset: number): string | null {
  if (offset <= 0 || offset >= bytes.length) return null;
  const slice = bytes.subarray(offset);
  return obfDecodeToUtf8String(slice).trim() || null;
}

export function buildParamLabelIndex(parsed: TypedParamFile, bytes: Uint8Array): Map<string, MscParamLabels> {
  const labels = new Map<string, MscParamLabels>();
  for (const entry of parsed.entries) {
    const entryId = readNumericField(entry, "entryId");
    if (entryId == null) continue;
    const actionOffset = readNumericField(entry, "actionLabelOffset");
    const resourceOffset = readNumericField(entry, "resourceLabelOffset");
    labels.set(normalizeHash(entryId), {
      actionLabel: actionOffset == null ? null : readObfLabelAtOffset(bytes, actionOffset),
      resourceLabel: resourceOffset == null ? null : readObfLabelAtOffset(bytes, resourceOffset),
    });
  }
  return labels;
}

export async function loadParamLabelIndex(
  path: string,
  paramType: "armsparam" | "characterparam" | "speedparam",
): Promise<Map<string, MscParamLabels>> {
  const parsed = await invoke<TypedParamFile>("parse_typed_param_file", { path, paramType });
  const raw = new Uint8Array(await IOReadFile(path));
  return buildParamLabelIndex(parsed, raw);
}

export async function loadBestEffortParamLabels(
  candidates: Array<{ path: string; paramType: "armsparam" | "characterparam" | "speedparam" }>,
): Promise<Map<string, MscParamLabels>> {
  const merged = new Map<string, MscParamLabels>();
  for (const candidate of candidates) {
    try {
      const next = await loadParamLabelIndex(candidate.path, candidate.paramType);
      for (const [hashHex, labels] of next.entries()) {
        const previous = merged.get(hashHex);
        merged.set(hashHex, {
          actionLabel: previous?.actionLabel ?? labels.actionLabel ?? null,
          resourceLabel: previous?.resourceLabel ?? labels.resourceLabel ?? null,
        });
      }
    } catch {
      // Best-effort only: missing or incompatible param files must not block overlay generation.
    }
  }
  return merged;
}
```

- [ ] **Step 4: Run the label resolver tests**

Run: `npm test -- src/page/TestEditor/utils/mscParamLabelResolver.test.ts`

Expected: PASS with both label-decoding tests green.

- [ ] **Step 5: Commit the label resolver**

```bash
git add src/page/TestEditor/utils/mscParamLabelResolver.ts src/page/TestEditor/utils/mscParamLabelResolver.test.ts
git commit -m "feat(msc): decode optional param labels for overlay"
```

---

### Task 4: Render The Stable Evidence Into A Sidecar Resolved Overlay

**Files:**
- Create: `src/page/TestEditor/utils/mscResolvedOverlay.ts`
- Create: `src/page/TestEditor/utils/mscResolvedOverlay.test.ts`

- [ ] **Step 1: Write a failing test for resolved overlay markdown generation**

```ts
import { describe, expect, it } from "vitest";
import { renderResolvedOverlayMarkdown } from "./mscResolvedOverlay";

describe("renderResolvedOverlayMarkdown", () => {
  it("renders stable keys first and keeps legacy names explicitly marked", () => {
    const markdown = renderResolvedOverlayMarkdown({
      actions: [
        {
          actionHashHex: "0x9475130e",
          actionIndexHex: "0x17",
          callbackName: "func_450",
          requestedSlots: ["0x23"],
          legacyWorkingName: "ACTION_TRANSFORM_DASH_ENTRY",
          legacyComment: "变形突入",
        },
      ],
      slotCallbacks: [
        {
          slotHex: "0x23",
          callbackName: "func_870",
          referencedByActionHashes: ["0x9475130e"],
        },
      ],
      weaponBindings: [
        {
          slotHex: "0x2",
          armsEntryHashHex: "0xa8e202bf",
          ownerCallbackName: "func_870",
          label: "GUN_015GNDMUC_004DELTPL_001_ASSIST",
        },
      ],
    });

    expect(markdown).toContain("# MSC Resolved Overlay");
    expect(markdown).toContain("Stable key: `0x9475130e`");
    expect(markdown).toContain("Legacy alias: `ACTION_TRANSFORM_DASH_ENTRY`");
    expect(markdown).toContain("Slot callback: `func_870`");
    expect(markdown).toContain("Label: `GUN_015GNDMUC_004DELTPL_001_ASSIST`");
  });
});
```

- [ ] **Step 2: Run the overlay rendering test and confirm it fails**

Run: `npm test -- src/page/TestEditor/utils/mscResolvedOverlay.test.ts`

Expected: FAIL because `mscResolvedOverlay.ts` does not exist yet.

- [ ] **Step 3: Implement the resolved overlay formatter**

```ts
import type { MscStableOverlayEvidence } from "./mscStableOverlayTypes";

function bullet(lines: string[], value: string): void {
  lines.push(`- ${value}`);
}

export function renderResolvedOverlayMarkdown(evidence: MscStableOverlayEvidence): string {
  const lines: string[] = [];
  lines.push("# MSC Resolved Overlay");
  lines.push("");
  lines.push("This file is generated from stable registry evidence. Raw `2.c` remains unchanged.");
  lines.push("");
  lines.push("## Action Registry");
  if (evidence.actions.length === 0) {
    bullet(lines, "No action bindings found.");
  } else {
    for (const action of evidence.actions) {
      bullet(lines, `Stable key: \`${action.actionHashHex}\``);
      bullet(lines, `Current callback: \`${action.callbackName}\``);
      bullet(lines, `Action index: ${action.actionIndexHex ? `\`${action.actionIndexHex}\`` : "`unknown`"}`);
      bullet(lines, `Requested slots: ${action.requestedSlots.length > 0 ? action.requestedSlots.map((slot) => `\`${slot}\``).join(", ") : "`none`"}`);
      bullet(lines, `Legacy alias: ${action.legacyWorkingName ? `\`${action.legacyWorkingName}\`` : "`none`"}`);
      bullet(lines, `Legacy comment: ${action.legacyComment ? `\`${action.legacyComment}\`` : "`none`"}`);
      lines.push("");
    }
  }

  lines.push("## Slot Callback Registry");
  if (evidence.slotCallbacks.length === 0) {
    bullet(lines, "No slot callbacks found.");
  } else {
    for (const slotCallback of evidence.slotCallbacks) {
      bullet(lines, `Stable slot key: \`${slotCallback.slotHex}\``);
      bullet(lines, `Slot callback: \`${slotCallback.callbackName}\``);
      bullet(lines, `Referenced by: ${slotCallback.referencedByActionHashes.map((hash) => `\`${hash}\``).join(", ") || "`none`"}`);
      lines.push("");
    }
  }

  lines.push("## Weapon / Resource Bindings");
  if (evidence.weaponBindings.length === 0) {
    bullet(lines, "No weapon/resource bindings found.");
  } else {
    for (const binding of evidence.weaponBindings) {
      bullet(lines, `Slot: \`${binding.slotHex}\``);
      bullet(lines, `Arms entry hash: \`${binding.armsEntryHashHex}\``);
      bullet(lines, `Owner callback: \`${binding.ownerCallbackName}\``);
      bullet(lines, `Label: ${binding.label ? `\`${binding.label}\`` : "`unresolved`"}`);
      lines.push("");
    }
  }

  return `${lines.join("\n").trim()}\n`;
}
```

- [ ] **Step 4: Run the overlay rendering tests**

Run: `npm test -- src/page/TestEditor/utils/mscResolvedOverlay.test.ts`

Expected: PASS with the markdown-generation test green.

- [ ] **Step 5: Commit the resolved overlay renderer**

```bash
git add src/page/TestEditor/utils/mscResolvedOverlay.ts src/page/TestEditor/utils/mscResolvedOverlay.test.ts
git commit -m "feat(msc): render resolved overlay markdown"
```

---

### Task 5: Rewire `MscWorkspaceView` To Generate `2.resolved.md` And Leave Raw `2.c` Alone

**Files:**
- Modify: `src/page/TestEditor/utils/mscWorkspaceUtils.ts`
- Modify: `src/page/TestEditor/components/msc-editor/mscPipeline.ts`
- Modify: `src/page/TestEditor/components/msc-editor/mscPipeline.test.ts`
- Modify: `src/page/TestEditor/components/msc-editor/MscWorkspaceView.tsx`
- Modify: `src/page/TestEditor/components/msc-editor/MscWorkspaceView.test.tsx`

- [ ] **Step 1: Write failing workspace tests for the new resolved-overlay file role and action**

```ts
// mscPipeline.test.ts
it("classifies resolved overlay companions separately from logs", () => {
  expect(getMscFileRole("2.resolved.md")).toBe("resolved");
});

it("groups resolved overlays between decompiled C and logs", () => {
  const groups = groupMscFiles([file("2.resolved.md"), file("2.c"), file("2.txt")]);
  expect(groups.map((g) => g.role)).toEqual(["c", "resolved", "log"]);
});

// MscWorkspaceView.test.tsx
const {
  openMock,
  folderContainsMscScriptFilesMock,
  readDirMock,
  readTextFileMock,
  writeTextFileMock,
} = vi.hoisted(() => ({
  openMock: vi.fn(),
  folderContainsMscScriptFilesMock: vi.fn(),
  readDirMock: vi.fn(),
  readTextFileMock: vi.fn(),
  writeTextFileMock: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-fs", () => ({
  exists: vi.fn(async () => true),
  readDir: readDirMock,
  readTextFile: readTextFileMock,
  writeTextFile: writeTextFileMock,
}));

it("shows a Resolve Overlay action for 2.c", async () => {
  readDirMock.mockResolvedValue([
    { isFile: true, name: "0.c" },
    { isFile: true, name: "2.c" },
  ]);
  render(
    <MscWorkspaceView
      workspaceRoot="E:/workspace"
      workspaceDefaultPath="E:/workspace/040msc"
      mscFolderPath="E:/workspace/040msc/0x12345678"
      onMscFolderChange={() => {}}
      isActive
    />,
  );
  expect(await screen.findByRole("button", { name: /resolve overlay/i })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the workspace tests to confirm they fail**

Run: `npm test -- src/page/TestEditor/components/msc-editor/mscPipeline.test.ts src/page/TestEditor/components/msc-editor/MscWorkspaceView.test.tsx`

Expected:
- `getMscFileRole("2.resolved.md")` fails because no `resolved` role exists yet.
- `Resolve Overlay` button is missing from the `2.c` row.

- [ ] **Step 3: Add a sibling overlay path helper and a `resolved` file role**

```ts
// src/page/TestEditor/utils/mscWorkspaceUtils.ts
export function getMscResolvedOverlayPath(cFilePath: string): string {
  const extension = getLowerCaseFileExtension(cFilePath);
  if (extension !== ".c") {
    throw new Error(`MSC workspace: unsupported resolved overlay source: ${cFilePath}`);
  }
  return replaceTrailingExtension(cFilePath, extension, ".resolved.md");
}
```

```ts
// src/page/TestEditor/components/msc-editor/mscPipeline.ts
export type MscFileRole = "script" | "c" | "resolved" | "log" | "other";

export function getMscFileRole(name: string): MscFileRole {
  const lower = name.toLowerCase();
  if (SCRIPT_EXTENSIONS.some((ext) => lower.endsWith(ext))) return "script";
  if (lower.endsWith(".resolved.md")) return "resolved";
  if (lower.endsWith(".c")) return "c";
  if (lower.endsWith(".txt")) return "log";
  return "other";
}

const GROUP_ORDER: ReadonlyArray<{ role: MscFileRole; label: string }> = [
  { role: "script", label: "Source scripts" },
  { role: "c", label: "Decompiled C" },
  { role: "resolved", label: "Resolved overlays" },
  { role: "log", label: "Logs" },
  { role: "other", label: "Other" },
];
```

- [ ] **Step 4: Replace the old `2.c` mutation path with a sidecar overlay generator**

```tsx
// inside MscWorkspaceView.tsx
import { getMscResolvedOverlayPath } from "../../utils/mscWorkspaceUtils";
import { collectLegacyActionAliases } from "../../utils/mscActionRename";
import { buildStableMscEvidence } from "../../utils/mscStableEvidence";
import { loadBestEffortParamLabels } from "../../utils/mscParamLabelResolver";
import { renderResolvedOverlayMarkdown } from "../../utils/mscResolvedOverlay";

// keep decompile raw: remove the old 2.c post-process branch entirely
const convertScriptCore = useCallback(
  async (file: MscFileInfo): Promise<string> => {
    const inputPath = file.path;
    const outputPath = getMscConvertOutputPath(inputPath);
    const logPath = getMscConvertLogPath(inputPath);
    const resourcePath = await resourceDir();
    const exvsMappingPath = await resolveOptionalExvsMappingPath();

    const command = await Command.create("exec-python", [
      resourcePath + "/tools/mscdec.py",
      inputPath,
      "-o",
      outputPath,
      "-log",
      logPath,
      ...buildOptionalExvsMappingArgs(exvsMappingPath),
    ]).execute();

    if (command.code !== 0) {
      throw new Error(command.stderr || `mscdec failed for ${file.name}`);
    }

    return `${file.name} converted to raw C`;
  },
  [resolveOptionalExvsMappingPath],
);

const handleResolveOverlay = useCallback(
  async (file: MscFileInfo) => {
    setProcessingFile(file.name);
    try {
      const scriptFolder = await dirname(file.path);
      const script0Path = await join(scriptFolder, "0.c");
      if (!(await exists(script0Path))) {
        throw new Error("MSC workspace: 0.c not found, cannot build stable overlay");
      }

      const script0Content = await readTextFile(script0Path);
      const script2Content = await readTextFile(file.path);
      const legacyAliases = collectLegacyActionAliases(script0Content, script2Content);
      const evidence = buildStableMscEvidence({
        script0Content,
        script2Content,
        legacyAliases,
      });

      const candidateParams = [
        { path: await join(scriptFolder, "armsparam.bin"), paramType: "armsparam" as const },
        { path: await join(scriptFolder, "characterparam.bin"), paramType: "characterparam" as const },
        { path: await join(workspaceRoot, "armsparam.bin"), paramType: "armsparam" as const },
        { path: await join(workspaceRoot, "characterparam.bin"), paramType: "characterparam" as const },
      ];
      const presentCandidates: Array<{ path: string; paramType: "armsparam" | "characterparam" }> = [];
      for (const candidate of candidateParams) {
        if (await exists(candidate.path)) {
          presentCandidates.push(candidate);
        }
      }
      const labelsByHash = await loadBestEffortParamLabels(presentCandidates);
      const enrichedEvidence = {
        ...evidence,
        weaponBindings: evidence.weaponBindings.map((binding) => ({
          ...binding,
          label: labelsByHash.get(binding.armsEntryHashHex)?.resourceLabel ?? binding.label,
        })),
      };

      const overlayPath = getMscResolvedOverlayPath(file.path);
      const markdown = renderResolvedOverlayMarkdown(enrichedEvidence);
      await writeTextFile(overlayPath, markdown);
      toast.success(`Resolved overlay written to ${overlayPath.replace(/^.*[\\/]/, "")}`);
      await fetchFiles();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `Error resolving overlay for ${file.name}`);
    } finally {
      setProcessingFile(null);
    }
  },
  [fetchFiles],
);

// 2.c actions
if (isMscPackScriptCFile(file.name)) {
  if (file.name.toLowerCase() === "2.c") {
    actions.push({
      key: "resolve-overlay",
      label: working ? "Resolving…" : "Resolve Overlay",
      onClick: () => handleResolveOverlay(file),
      variant: "secondary",
      disabled,
      icon: <Wand2 />,
    });
  }
}
```

- [ ] **Step 5: Run the workspace tests**

Run: `npm test -- src/page/TestEditor/components/msc-editor/mscPipeline.test.ts src/page/TestEditor/components/msc-editor/MscWorkspaceView.test.tsx`

Expected: PASS with the new `resolved` role and `Resolve Overlay` action covered.

- [ ] **Step 6: Run a manual smoke on the real drift sample**

Run this workflow in the app:

1. Open `TestEditor` -> `MSC Workspace`.
2. Pick `E:\XB\解包\com\file\040msc\0xFEEA714A`.
3. Click `Decompile All`.
4. Open `2.c` and verify it is raw `mscdec` output with no `ACTION_*` rewrite pass applied automatically.
5. Click `Resolve Overlay` on `2.c`.
6. Open the generated `2.resolved.md`.

Expected:
- `2.c` is not rewritten by the old rename pass;
- `2.resolved.md` appears as a sibling file in the workspace;
- the overlay contains `## Action Registry`, `## Slot Callback Registry`, and `## Weapon / Resource Bindings`;
- action hashes and slot evidence are visible even if no param labels are available nearby;
- if `armsparam.bin` or `characterparam.bin` exists beside the MSC folder or at the workspace root, the weapon-binding section shows resolved labels instead of only raw hashes.

- [ ] **Step 7: Commit the workspace wiring**

```bash
git add src/page/TestEditor/utils/mscWorkspaceUtils.ts src/page/TestEditor/components/msc-editor/mscPipeline.ts src/page/TestEditor/components/msc-editor/mscPipeline.test.ts src/page/TestEditor/components/msc-editor/MscWorkspaceView.tsx src/page/TestEditor/components/msc-editor/MscWorkspaceView.test.tsx
git commit -m "feat(msc): generate stable resolved overlay sidecars"
```

---

### Task 6: Patch The Core Docs To Use Stable Keys And Verify The Full Slice

**Files:**
- Modify: `docs/msc-research/msc-auto-rename-mapping.md`
- Modify: `docs/msc-research/0c-to-2c-input-action-boundary.md`
- Test: `src/page/TestEditor/utils/mscActionRename.test.ts`
- Test: `src/page/TestEditor/utils/mscStableEvidence.test.ts`
- Test: `src/page/TestEditor/utils/mscParamLabelResolver.test.ts`
- Test: `src/page/TestEditor/utils/mscResolvedOverlay.test.ts`
- Test: `src/page/TestEditor/components/msc-editor/mscPipeline.test.ts`
- Test: `src/page/TestEditor/components/msc-editor/MscWorkspaceView.test.tsx`

- [ ] **Step 1: Patch the auto-rename mapping doc to mark the old path as legacy and the new path as stable-evidence-first**

```md
## Legacy Path Versus Stable Path

- `func_143 -> func_95 -> ACTION_*` is now a **legacy alias path**.
- It may still provide familiar working names such as `ACTION_A_SHOT`, but it is no longer the primary identity layer.
- The primary identity layer is:
  - `action hash`
  - `func_241(actionHash, callback)`
  - `sys_1(0x10001, 0x2, slot, callback)`
  - `sys_4F(0xb, slot, armsEntryHash)` / `sys_1(0x10001, 0x3/0x4, slot, hash)`

When recording research:
- cite stable keys first;
- list `ACTION_*` only as a legacy alias;
- do not treat `func_N` or exact `if (...)` text as a cross-version key.
```

- [ ] **Step 2: Patch the `0.c -> 2.c` boundary doc so action hashes become the durable reference**

```md
## Stable Citation Rule

Every action example in this document must now carry both:

- stable key: `action hash`
- current symbol / working alias: `func_N` and `ACTION_*`

Example:

| Stable key | Current callback | Working alias | Meaning |
|---|---|---|---|
| `0xF48D2D49` | `func_912` | `ACTION_A_SHOT` | main shot (legacy alias only) |

`ACTION_A_SHOT` is kept as a working alias for readability. The durable identity is `0xF48D2D49`.
```

- [ ] **Step 3: Run the full targeted verification suite**

Run: `npm test -- src/page/TestEditor/utils/mscActionRename.test.ts src/page/TestEditor/utils/mscStableEvidence.test.ts src/page/TestEditor/utils/mscParamLabelResolver.test.ts src/page/TestEditor/utils/mscResolvedOverlay.test.ts src/page/TestEditor/components/msc-editor/mscPipeline.test.ts src/page/TestEditor/components/msc-editor/MscWorkspaceView.test.tsx`

Expected: PASS across all six test files.

- [ ] **Step 4: Run a second manual smoke on a non-legacy dispatch sample**

Run this workflow in the app:

1. Pick `E:\XB\解包\com\file\0x693F756D`.
2. Decompile the pack.
3. Generate `2.resolved.md`.

Expected:
- the overlay still shows action-hash-first sections even though the old `func_143` mask model does not fit this sample;
- no step depends on reconstructing the old `func_143 -> func_95` route;
- missing param labels degrade to hashes instead of crashing.

- [ ] **Step 5: Commit the doc migration slice**

```bash
git add docs/msc-research/msc-auto-rename-mapping.md docs/msc-research/0c-to-2c-input-action-boundary.md
git commit -m "docs(msc): switch overlay research to stable key citations"
```

---

## Plan Self-Review Checklist

- Spec coverage:
  - stable-evidence overlay: Tasks 2, 4, 5
  - legacy aliases demoted to secondary role: Task 1
  - param-label enrichment: Task 3
  - raw `2.c` preserved and sidecar overlay generated: Task 5
  - core doc migration rules: Task 6
- Placeholder scan:
  - no `TODO`, `TBD`, “appropriate handling”, or “similar to above” placeholders remain
- Type consistency:
  - stable evidence types live in `mscStableOverlayTypes.ts`
  - registry parsing lives in `mscStableEvidence.ts`
  - label decoding lives in `mscParamLabelResolver.ts`
  - rendering lives in `mscResolvedOverlay.ts`
  - workspace wiring lives in `MscWorkspaceView.tsx` / `mscPipeline.ts`

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-24-msc-stable-overlay-doc-migration.md`.

You already told me not to use subagents, so the next step is:

**Inline Execution** - execute this plan in this session task-by-task using the plan as the checklist.

If you want, I can start executing Task 1 immediately.
