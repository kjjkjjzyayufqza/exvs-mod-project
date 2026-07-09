import { canonicalMscHashHex } from "./mscHash";

interface ActionSemantic {
  maskHex: string;
  nameStem: string;
  comment: string;
}

interface ActionDescriptor {
  hashHex: string;
  functionName: string;
  comment: string;
}

export interface MscLegacyActionAlias {
  hashHex: string;
  workingName: string;
  comment: string;
}

const ACTION_BY_MASK: Record<string, ActionSemantic> = {
  "0x1": { maskHex: "0x1", nameStem: "A_SHOT", comment: "射击" },
  "0x2": { maskHex: "0x2", nameStem: "B_MELEE", comment: "近战" },
  "0x4": { maskHex: "0x4", nameStem: "B_MELEE_DIR_1", comment: "方向近战" },
  "0x8": { maskHex: "0x8", nameStem: "B_MELEE_DIR_2", comment: "方向近战" },
  "0x10": { maskHex: "0x10", nameStem: "B_MELEE_DIR_3", comment: "方向近战" },
  "0x20": { maskHex: "0x20", nameStem: "B_MELEE_DIR_4", comment: "方向近战" },
  "0x40": { maskHex: "0x40", nameStem: "B_MELEE_VARIANT", comment: "近战派生" },
  "0x80": { maskHex: "0x80", nameStem: "AB_SUB", comment: "副射" },
  "0x100": { maskHex: "0x100", nameStem: "AC_SPECIAL_SHOT", comment: "特射" },
  "0x200": { maskHex: "0x200", nameStem: "BC_SPECIAL_MELEE", comment: "特格" },
  "0x400": { maskHex: "0x400", nameStem: "ABC_FINAL_ATTACK", comment: "觉醒技" },
  "0x800": { maskHex: "0x800", nameStem: "CHARGE_SHOT", comment: "蓄力射击" },
};

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function readFunctionBody(source: string, signatureRegex: RegExp): string {
  const signatureMatch = signatureRegex.exec(source);
  if (!signatureMatch) {
    throw new Error("MSC action rename: cannot find func_143 in 0.c");
  }

  const braceStart = source.indexOf("{", signatureMatch.index);
  if (braceStart < 0) {
    throw new Error("MSC action rename: malformed func_143 body");
  }

  let depth = 0;
  for (let index = braceStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(braceStart + 1, index);
      }
    }
  }

  throw new Error("MSC action rename: unterminated func_143 body");
}

function inferActionMaskGlobal(script0Content: string, body: string): string | null {
  const candidates = new Map<string, { masks: Set<string>; occurrenceCount: number }>();
  const maskConditionRegex = /\b(global\d+)\s*&\s*(0x[0-9a-fA-F]+)/g;
  let match: RegExpExecArray | null;

  while ((match = maskConditionRegex.exec(body)) !== null) {
    const globalName = match[1];
    const maskHex = match[2].toLowerCase();
    if (!ACTION_BY_MASK[maskHex]) {
      continue;
    }

    const candidate = candidates.get(globalName) ?? {
      masks: new Set<string>(),
      occurrenceCount: 0,
    };
    candidate.masks.add(maskHex);
    candidate.occurrenceCount += 1;
    candidates.set(globalName, candidate);
  }

  const inputMaskGlobals = new Set<string>();
  const inputAssignmentRegex = /\b(global\d+)\s*=\s*func_81\s*\(/g;
  while ((match = inputAssignmentRegex.exec(script0Content)) !== null) {
    inputMaskGlobals.add(match[1]);
  }

  const candidatesWithInputDataFlow = [...candidates.entries()].filter(([globalName]) =>
    inputMaskGlobals.has(globalName),
  );
  const candidatesToRank =
    candidatesWithInputDataFlow.length > 0 ? candidatesWithInputDataFlow : [...candidates.entries()];
  const rankedCandidates = candidatesToRank.sort((left, right) => {
    const maskCoverageDifference = right[1].masks.size - left[1].masks.size;
    if (maskCoverageDifference !== 0) {
      return maskCoverageDifference;
    }
    return right[1].occurrenceCount - left[1].occurrenceCount;
  });

  return rankedCandidates[0]?.[0] ?? null;
}

function extractMaskFromConditions(
  conditions: string[],
  actionMaskGlobal: string | null,
): string | null {
  if (!actionMaskGlobal) {
    return null;
  }

  const maskRegex = new RegExp(`\\b${escapeRegex(actionMaskGlobal)}\\s*&\\s*(0x[0-9a-fA-F]+)`);
  for (let index = conditions.length - 1; index >= 0; index -= 1) {
    const match = conditions[index].match(maskRegex);
    if (match) {
      return match[1].toLowerCase();
    }
  }
  return null;
}

function hasCondition(conditions: string[], pattern: RegExp): boolean {
  return conditions.some((value) => pattern.test(value));
}

function buildActionDescriptor(
  hashHex: string,
  conditions: string[],
  actionMaskGlobal: string | null,
  duplicateCountByStem: Map<string, number>,
): ActionDescriptor {
  const maskHex = extractMaskFromConditions(conditions, actionMaskGlobal);
  const semantic = maskHex ? ACTION_BY_MASK[maskHex] : undefined;
  const maskStem = semantic ? semantic.nameStem : `MASK_${maskHex ? maskHex.slice(2).toUpperCase() : "UNKNOWN"}`;
  const maskComment = semantic ? semantic.comment : `动作掩码${maskHex ?? "未知"}`;

  const inLockSwitchBranch = hasCondition(conditions, /global20\s*&\s*0x4000/);
  const directionalBranch = hasCondition(conditions, /global2\s*&\s*0x3c/);
  const state0Branch = hasCondition(conditions, /sys_0\(0x90000,\s*0\)\s*==\s*0/);
  const state1Branch = hasCondition(conditions, /!\(sys_0\(0x90000,\s*0\)\s*==\s*0\)/);

  const suffixParts: string[] = [];
  const commentParts: string[] = [maskComment];

  if (inLockSwitchBranch) {
    suffixParts.push("LOCK_SWITCH");
    commentParts.push("换锁分支");
  }
  if (directionalBranch && !maskStem.includes("DIR")) {
    suffixParts.push("DIRECTIONAL");
    commentParts.push("方向分支");
  }
  if (state0Branch) {
    suffixParts.push("STATE_0");
    commentParts.push("状态0");
  } else if (state1Branch) {
    suffixParts.push("STATE_1");
    commentParts.push("状态1");
  }

  const baseStem = suffixParts.length > 0 ? `${maskStem}_${suffixParts.join("_")}` : maskStem;
  const duplicateCount = (duplicateCountByStem.get(baseStem) ?? 0) + 1;
  duplicateCountByStem.set(baseStem, duplicateCount);
  const uniqueStem = duplicateCount > 1 ? `${baseStem}_ALT_${duplicateCount}` : baseStem;

  return {
    hashHex,
    functionName: `ACTION_${uniqueStem}`,
    comment: commentParts.join(" "),
  };
}

function extractActionDescriptorsFrom0(script0Content: string): Map<string, ActionDescriptor> {
  const body = readFunctionBody(script0Content, /void\s+func_143\s*\(\s*\)\s*/);
  const lines = body.split(/\r?\n/);
  const conditionStack: string[] = [];
  let pendingCondition: string | null = null;
  const descriptors = new Map<string, ActionDescriptor>();
  const duplicateCountByStem = new Map<string, number>();
  const actionMaskGlobal = inferActionMaskGlobal(script0Content, body);

  for (const line of lines) {
    const trimmed = line.trim();
    const conditionMatch = trimmed.match(/^(?:if|else\s+if)\s*\((.*)\)\s*$/);
    if (conditionMatch) {
      pendingCondition = conditionMatch[1];
    }

    const func95Match = line.match(/func_95\(\s*(0x[0-9a-fA-F]+)\s*,/);
    if (func95Match) {
      const hashHex = canonicalMscHashHex(func95Match[1]);
      if (!descriptors.has(hashHex)) {
        descriptors.set(
          hashHex,
          buildActionDescriptor(hashHex, conditionStack, actionMaskGlobal, duplicateCountByStem),
        );
      }
    }

    const openBraceCount = (line.match(/\{/g) ?? []).length;
    for (let index = 0; index < openBraceCount; index += 1) {
      conditionStack.push(pendingCondition ?? "");
      pendingCondition = null;
    }

    const closeBraceCount = (line.match(/\}/g) ?? []).length;
    for (let index = 0; index < closeBraceCount; index += 1) {
      conditionStack.pop();
    }
  }

  return descriptors;
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
    const hashHex = canonicalMscHashHex(bindingMatch[1]);
    const descriptor = descriptorsByHash.get(hashHex);
    if (!descriptor) {
      continue;
    }

    aliases.set(hashHex, {
      hashHex,
      workingName: descriptor.functionName,
      comment: descriptor.comment,
    });
  }

  return aliases;
}
