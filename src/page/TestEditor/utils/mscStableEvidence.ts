import type { MscLegacyActionAlias } from "./mscActionRename";
import { canonicalMscHashHex } from "./mscHash";
import type {
  MscOrphanActionFunctionEvidence,
  MscStableActionEvidence,
  MscStableOverlayEvidence,
  MscStableResourceBindingEvidence,
  MscStableSlotCallbackEvidence,
  MscStableWeaponBindingEvidence,
} from "./mscStableOverlayTypes";

function toHexLiteral(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith("0x") || trimmed.startsWith("0X")) {
    return `0x${trimmed.replace(/^0x/i, "").toLowerCase()}`;
  }
  return `0x${Number.parseInt(trimmed, 10).toString(16)}`;
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
      if (source[i] === "{") {
        depth += 1;
      } else if (source[i] === "}") {
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

function readRequestedSlots(body: string): string[] {
  return Array.from(
    body.matchAll(/func_69\(\s*(0x[0-9a-fA-F]+|\d+)\s*(?:,\s*[^)]*)?\)/g),
    (slotMatch) => toHexLiteral(slotMatch[1]),
  );
}

function readReferencedFunctionNames(body: string): Set<string> {
  const names = new Set<string>();
  for (const match of body.matchAll(/\b(func_\d+)\b/g)) {
    names.add(match[1]);
  }
  return names;
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
    actionIndexByHash.set(canonicalMscHashHex(actionIndexMatch[2]), toHexLiteral(actionIndexMatch[1]));
  }

  const actions: MscStableActionEvidence[] = [];
  const actionBindingRegex = /func_241\(\s*(0x[0-9a-fA-F]+|\d+)\s*,\s*([A-Za-z_][A-Za-z0-9_]*|0)\s*\);/g;
  let actionBindingMatch: RegExpExecArray | null;
  while ((actionBindingMatch = actionBindingRegex.exec(script2Content)) !== null) {
    const actionHashHex = canonicalMscHashHex(actionBindingMatch[1]);
    const callbackName = actionBindingMatch[2];
    const body = callbackBodies.get(callbackName) ?? "";
    const requestedSlots = readRequestedSlots(body);
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
  const slotRegistryCallbackBySlot = new Map<string, string>();
  const slotRegistryRegex =
    /sys_1\(\s*0x10001\s*,\s*0x2\s*,\s*(0x[0-9a-fA-F]+|\d+)\s*,\s*([A-Za-z_][A-Za-z0-9_]*|0)\s*\);/g;
  let slotRegistryMatch: RegExpExecArray | null;
  while ((slotRegistryMatch = slotRegistryRegex.exec(script2Content)) !== null) {
    const slotHex = toHexLiteral(slotRegistryMatch[1]);
    const callbackName = slotRegistryMatch[2];
    slotRegistryCallbackBySlot.set(slotHex, callbackName);
    if (callbackName === "0") {
      continue;
    }
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
        armsEntryHashHex: canonicalMscHashHex(match[2]),
        ownerCallbackName: callbackName,
      });
    }
  }

  const resourceBindings: MscStableResourceBindingEvidence[] = [];
  const resourceRegistryRegex =
    /sys_1\(\s*0x10001\s*,\s*(0x3|0x4|\d+)\s*,\s*(0x[0-9a-fA-F]+|\d+)\s*,\s*(0x[0-9a-fA-F]+|\d+)\s*\);/g;
  let resourceRegistryMatch: RegExpExecArray | null;
  while ((resourceRegistryMatch = resourceRegistryRegex.exec(script2Content)) !== null) {
    resourceBindings.push({
      registryKindHex: toHexLiteral(resourceRegistryMatch[1]),
      slotHex: toHexLiteral(resourceRegistryMatch[2]),
      resourceValueHex: toHexLiteral(resourceRegistryMatch[3]),
    });
  }

  const calledFunctions = new Set<string>();
  for (const [functionName, body] of callbackBodies.entries()) {
    for (const referencedName of readReferencedFunctionNames(body)) {
      if (referencedName !== functionName) {
        calledFunctions.add(referencedName);
      }
    }
  }

  const resourceValuesBySlot = new Map<string, string[]>();
  for (const binding of resourceBindings) {
    const values = resourceValuesBySlot.get(binding.slotHex) ?? [];
    values.push(binding.resourceValueHex);
    resourceValuesBySlot.set(binding.slotHex, values);
  }

  const directActionCallbacks = new Set(
    actions.filter((action) => action.callbackName !== "0").map((action) => action.callbackName),
  );
  const directSlotCallbacks = new Set(slotCallbacks.map((slot) => slot.callbackName));
  const orphanActionFunctions: MscOrphanActionFunctionEvidence[] = [];
  for (const [functionName, body] of callbackBodies.entries()) {
    if (directActionCallbacks.has(functionName) || directSlotCallbacks.has(functionName) || calledFunctions.has(functionName)) {
      continue;
    }
    const requestedSlots = readRequestedSlots(body).filter((slotHex) => slotRegistryCallbackBySlot.get(slotHex) === "0");
    if (requestedSlots.length === 0) {
      continue;
    }
    orphanActionFunctions.push({
      functionName,
      requestedSlots,
      resourceValues: requestedSlots.flatMap((slotHex) => resourceValuesBySlot.get(slotHex) ?? []),
      notes: "Direct action registry callback is 0; slot registry callback is 0.",
    });
  }

  return {
    actions,
    slotCallbacks,
    weaponBindings,
    resourceBindings,
    orphanActionFunctions,
  };
}
