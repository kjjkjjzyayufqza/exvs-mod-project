import { collectLegacyActionAliases } from "./mscActionRename";
import { buildStableMscEvidence } from "./mscStableEvidence";
import type {
  MscStableActionEvidence,
  MscStableOverlayEvidence,
} from "./mscStableOverlayTypes";

function bullet(lines: string[], value: string): void {
  lines.push(`- ${value}`);
}

export type MscResolvedOverlayStatus = "resolved" | "partial" | "skipped";

export interface MscResolvedOverlayBuildResult {
  status: MscResolvedOverlayStatus;
  evidence: MscStableOverlayEvidence;
  legacyAliasCount: number;
  markdown: string | null;
}

export interface MscResolvedScript2ApplyResult {
  status: MscResolvedOverlayStatus;
  evidence: MscStableOverlayEvidence;
  legacyAliasCount: number;
  updatedScript2Content: string | null;
  renamedCallbackCount: number;
}

interface MscResolvedEvidenceResult {
  status: MscResolvedOverlayStatus;
  evidence: MscStableOverlayEvidence;
  legacyAliasCount: number;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function safeIdentifier(value: string, fallback: string): string {
  const normalized = value.replace(/[^A-Za-z0-9_]/g, "_").replace(/^_+|_+$/g, "");
  const candidate = normalized.length > 0 ? normalized : fallback;
  return /^[A-Za-z_]/.test(candidate) ? candidate : `_${candidate}`;
}

function isGeneratedOrRawCallbackName(value: string): boolean {
  return /^func_\d+$/.test(value) || /^ACTION_(?:INDEX_[0-9A-F]+_)?HASH_[0-9A-F]+$/i.test(value);
}

function addCallbackRename(
  renameMap: Map<string, string>,
  usedNames: Set<string>,
  oldName: string,
  desiredName: string,
): void {
  if (oldName === "0") return;
  if (!isGeneratedOrRawCallbackName(oldName)) return;
  if (renameMap.has(oldName)) return;

  const baseName = safeIdentifier(desiredName, "RESOLVED_CALLBACK");
  let nextName = baseName;
  let suffix = 2;
  while (usedNames.has(nextName)) {
    nextName = `${baseName}_${suffix}`;
    suffix += 1;
  }

  renameMap.set(oldName, nextName);
  usedNames.add(nextName);
}

function buildCallbackRenameMap(actions: MscStableActionEvidence[]): Map<string, string> {
  const renameMap = new Map<string, string>();
  const usedNames = new Set<string>();

  for (const action of actions) {
    if (!action.legacyWorkingName) {
      continue;
    }
    addCallbackRename(renameMap, usedNames, action.callbackName, action.legacyWorkingName);
  }

  return renameMap;
}

function applyCallbackRenames(script2Content: string, renameMap: Map<string, string>): string {
  let updated = script2Content;
  for (const [oldName, newName] of renameMap.entries()) {
    updated = updated.replace(new RegExp(`\\b${escapeRegex(oldName)}\\b`, "g"), newName);
  }
  return updated;
}

function applyLegacyFunc241Comments(script2Content: string, actions: MscStableActionEvidence[]): string {
  let updated = script2Content;
  for (const action of actions) {
    if (!action.legacyComment) {
      continue;
    }

    const bindingRegex = new RegExp(
      `(func_241\\(\\s*${escapeRegex(action.actionHashHex)}\\s*,\\s*(?:[A-Za-z_][A-Za-z0-9_]*|0)\\s*\\);)(?:\\s*//.*)?`,
      "gi",
    );
    updated = updated.replace(bindingRegex, (_match, binding: string) => `${binding} //  ${action.legacyComment}`);
  }
  return updated;
}

function buildResolvedEvidence(params: {
  script0Content: string;
  script2Content: string;
}): MscResolvedEvidenceResult {
  const { script0Content, script2Content } = params;
  let legacyAliases: ReturnType<typeof collectLegacyActionAliases>;
  try {
    legacyAliases = collectLegacyActionAliases(script0Content, script2Content);
  } catch {
    legacyAliases = new Map();
  }

  const evidence = buildStableMscEvidence({
    script0Content,
    script2Content,
    legacyAliases,
  });
  const nonActionEvidenceCount =
    evidence.slotCallbacks.length +
    evidence.weaponBindings.length +
    evidence.resourceBindings.length +
    evidence.orphanActionFunctions.length;
  const status: MscResolvedOverlayStatus =
    evidence.actions.length > 0
      ? "resolved"
      : nonActionEvidenceCount > 0
        ? "partial"
        : "skipped";

  return {
    status,
    evidence,
    legacyAliasCount: legacyAliases.size,
  };
}

export function buildMscResolvedOverlay(params: {
  script0Content: string;
  script2Content: string;
}): MscResolvedOverlayBuildResult {
  const result = buildResolvedEvidence(params);
  return {
    ...result,
    markdown: result.status === "skipped" ? null : renderResolvedOverlayMarkdown(result.evidence),
  };
}

export function applyMscResolvedOverlayToScript2(params: {
  script0Content: string;
  script2Content: string;
}): MscResolvedScript2ApplyResult {
  const result = buildResolvedEvidence(params);
  if (result.status === "skipped") {
    return {
      status: result.status,
      evidence: result.evidence,
      legacyAliasCount: result.legacyAliasCount,
      updatedScript2Content: null,
      renamedCallbackCount: 0,
    };
  }

  const renameMap = buildCallbackRenameMap(result.evidence.actions);
  const renamedScript2Content =
    renameMap.size === 0 ? params.script2Content : applyCallbackRenames(params.script2Content, renameMap);
  const updatedScript2Content = applyLegacyFunc241Comments(renamedScript2Content, result.evidence.actions);

  if (updatedScript2Content === params.script2Content) {
    return {
      status: result.status,
      evidence: result.evidence,
      legacyAliasCount: result.legacyAliasCount,
      updatedScript2Content: null,
      renamedCallbackCount: 0,
    };
  }

  return {
    status: result.status,
    evidence: result.evidence,
    legacyAliasCount: result.legacyAliasCount,
    updatedScript2Content,
    renamedCallbackCount: renameMap.size,
  };
}

export function renderResolvedOverlayMarkdown(
  evidence: MscStableOverlayEvidence,
): string {
  const lines: string[] = [];
  lines.push("# MSC Resolved Overlay");
  lines.push("");
  lines.push("This sidecar is generated from stable registry evidence. Raw `2.c` remains unchanged.");
  lines.push("");
  lines.push("## Action Registry");

  if (evidence.actions.length === 0) {
    bullet(lines, "No action bindings found.");
  } else {
    for (const action of evidence.actions) {
      bullet(lines, `Stable key: \`${action.actionHashHex}\``);
      bullet(lines, `Current callback: \`${action.callbackName}\``);
      bullet(lines, `Action index: ${action.actionIndexHex ? `\`${action.actionIndexHex}\`` : "`unknown`"}`);
      bullet(
        lines,
        `Requested slots: ${
          action.requestedSlots.length > 0
            ? action.requestedSlots.map((slot) => `\`${slot}\``).join(", ")
            : "`none`"
        }`,
      );
      bullet(
        lines,
        `Legacy alias: ${action.legacyWorkingName ? `\`${action.legacyWorkingName}\`` : "`none`"}`,
      );
      bullet(
        lines,
        `Legacy comment: ${action.legacyComment ? `\`${action.legacyComment}\`` : "`none`"}`,
      );
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
      bullet(
        lines,
        `Referenced by: ${
          slotCallback.referencedByActionHashes.length > 0
            ? slotCallback.referencedByActionHashes.map((hash) => `\`${hash}\``).join(", ")
            : "`none`"
        }`,
      );
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

  lines.push("## Resource Registry");
  if (evidence.resourceBindings.length === 0) {
    bullet(lines, "No resource registry bindings found.");
  } else {
    for (const binding of evidence.resourceBindings) {
      bullet(lines, `Registry kind: \`${binding.registryKindHex}\``);
      bullet(lines, `Slot: \`${binding.slotHex}\``);
      bullet(lines, `Resource value: \`${binding.resourceValueHex}\``);
      lines.push("");
    }
  }

  lines.push("## Orphan Action-like Functions");
  if (evidence.orphanActionFunctions.length === 0) {
    bullet(lines, "No orphan action-like functions found.");
  } else {
    for (const orphan of evidence.orphanActionFunctions) {
      bullet(lines, `Function: \`${orphan.functionName}\``);
      bullet(
        lines,
        `Requested slots: ${
          orphan.requestedSlots.length > 0
            ? orphan.requestedSlots.map((slot) => `\`${slot}\``).join(", ")
            : "`none`"
        }`,
      );
      bullet(
        lines,
        `Resource values: ${
          orphan.resourceValues.length > 0
            ? orphan.resourceValues.map((value) => `\`${value}\``).join(", ")
            : "`none`"
        }`,
      );
      bullet(lines, `Notes: ${orphan.notes}`);
      lines.push("");
    }
  }

  return `${lines.join("\n").trim()}\n`;
}
