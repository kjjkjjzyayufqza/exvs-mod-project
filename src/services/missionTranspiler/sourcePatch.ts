import { cTokens, cTokenSpans, generateC, modelFromC } from "./transpile";
import type { MissionModel } from "./types";

const contentFunctions = ["func_32", "func_34", "func_35"];
const marker = "Mission Node Editor content edit";
const semanticKey = (value: unknown) => JSON.stringify(value, (_key, entry) =>
  entry && typeof entry === "object" && !Array.isArray(entry)
    ? Object.fromEntries(Object.entries(entry).sort(([a], [b]) => a.localeCompare(b))) : entry);

function bodyRanges(source: string) {
  const tokens = cTokenSpans(source);
  const ranges = new Map<string, { start: number; end: number }>();
  let depth = 0;
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].value === "{") depth++;
    if (tokens[i].value === "}") depth--;
    if (depth !== 0 || tokens[i].value !== "void" || !contentFunctions.includes(tokens[i + 1]?.value)) continue;
    const open = i + 4;
    let end = open + 1;
    let inner = 1;
    while (inner && end < tokens.length) {
      if (tokens[end].value === "{") inner++;
      if (tokens[end].value === "}") inner--;
      end++;
    }
    ranges.set(tokens[i + 1].value, { start: tokens[open].end, end: tokens[end - 1].start });
    i = end - 1;
  }
  return ranges;
}

/** Only recognized content bodies can change. The supplied source owns runtime. */
export function patchMissionSource(source: string, model: MissionModel): string {
  const originalModel = modelFromC(source);
  const generated = generateC(model);
  const oldRanges = bodyRanges(source);
  const newRanges = bodyRanges(generated);
  const newline = source.includes("\r\n") ? "\r\n" : "\n";
  let result = source;
  const edits: { start: number; end: number; text: string }[] = [];
  for (const name of contentFunctions) {
    const content = (value: MissionModel) => name === "func_32" ? [value.battle, value.slots]
      : name === "func_34" ? value.opening : value.phases;
    if (semanticKey(content(originalModel)) === semanticKey(content(model))) continue;
    const oldRange = oldRanges.get(name)!;
    const newRange = newRanges.get(name)!;
    const before = source.slice(oldRange.start, oldRange.end);
    const after = generated.slice(newRange.start, newRange.end);
    const oldTokens = cTokenSpans(before);
    const newTokens = cTokenSpans(after);
    if (oldTokens.map((t) => t.value).join(" ") === newTokens.map((t) => t.value).join(" ")) continue;

    let body: string;
    const literalOnly = oldTokens.length === newTokens.length && oldTokens.every((t, i) =>
      t.value === newTokens[i].value || /^\d+$/.test(t.value) && /^\d+$/.test(newTokens[i].value));
    if (literalOnly) {
      body = before;
      for (let i = oldTokens.length - 1; i >= 0; i--) {
        const oldToken = oldTokens[i];
        const nextToken = newTokens[i];
        if (oldToken.value !== nextToken.value) {
          body = body.slice(0, oldToken.start) + after.slice(nextToken.start, nextToken.end) + body.slice(oldToken.end);
        }
      }
    } else {
      // Preserve author comments even when a changed phase/slot list needs a new body.
      const comments = [...before.matchAll(/\/\/[^\r\n]*|\/\*[\s\S]*?\*\//g)]
        .map((m) => m[0]).filter((comment) => !comment.includes(marker));
      body = newline + comments.map((c) => `    ${c}${newline}`).join("") + after.trimStart().replaceAll("\n", newline);
    }
    const prefix = source.slice(0, oldRange.start);
    const enclosed = prefix.lastIndexOf("// AI decision") > prefix.lastIndexOf("// End, origin is");
    if (!body.includes(marker) && !enclosed) {
      const ownership = name === "func_32" ? "sys_0(0x400) retains every slot word; global16/17 retain rule masks."
        : name === "func_34" ? "global0 still hands over to func_35 after func_9 and opening deployment."
        : "global20 advances once; global24 resets per phase; false predicates keep waiting.";
      body = `${newline}    // AI decision (${new Date().toISOString().slice(0, 10)}): ${marker}; source structure only (E1).${newline}`
        + `    // Origin: loaded ${name}; ${marker}.${newline}`
        + `    // ${marker}: ${ownership}${newline}` + body.replace(/^(?:\r?\n)+/, "")
        + `    // End, origin is loaded ${name}; ${marker}.${newline}`;
    }
    edits.push({ ...oldRange, text: body });
  }
  for (const edit of edits.sort((a, b) => b.start - a.start)) {
    result = result.slice(0, edit.start) + edit.text + result.slice(edit.end);
  }
  // A readback check catches patch boundaries or a future generator/parser mismatch.
  const reopened = modelFromC(result);
  if (cTokens(generateC(reopened)).join(" ") !== cTokens(generated).join(" ")) {
    throw new Error("Saved mission source does not match the edited configuration");
  }
  return result;
}
