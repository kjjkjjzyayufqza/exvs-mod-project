import type { MscStableOverlayEvidence } from "./mscStableOverlayTypes";

const OVERLAY_START_MARKER = "/* MSC RESOLVED OVERLAY START";
const OVERLAY_END_MARKER = "MSC RESOLVED OVERLAY END */";

function bullet(lines: string[], value: string): void {
  lines.push(`- ${value}`);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function renderResolvedOverlayMarkdown(
  evidence: MscStableOverlayEvidence,
): string {
  const lines: string[] = [];
  lines.push("# MSC Resolved Overlay");
  lines.push("");
  lines.push("This block is generated from stable registry evidence. Existing `2.c` code stays below.");
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

export function applyResolvedOverlayToScript2(
  script2Content: string,
  overlayMarkdown: string,
): string {
  const normalizedSource = script2Content
    .replace(new RegExp(`${escapeRegex(OVERLAY_START_MARKER)}[\\s\\S]*?${escapeRegex(OVERLAY_END_MARKER)}\\s*`, "g"), "")
    .trimEnd();

  const commentBlock = `${OVERLAY_START_MARKER}
${overlayMarkdown}${OVERLAY_END_MARKER}
`;

  return `${normalizedSource}\n\n${commentBlock}`;
}
