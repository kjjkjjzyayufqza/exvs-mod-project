import { useCallback, useRef, useState } from "react";

import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { Check, ClipboardCopy, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface CopyInfoToAiPayload {
  /** Stable discriminator so a downstream AI knows what it received. */
  kind: string;
  /** What slice of the editor this payload describes (e.g. "structure-tree", "model:body_normal"). */
  scope: string;
  /** The actual structured context. */
  data: unknown;
  /** Optional one-line human header prepended above the JSON. */
  note?: string;
}

interface CopyInfoToAiButtonProps {
  /** Lazily build the payload at click time so hosts only serialize on demand. */
  buildPayload: () => CopyInfoToAiPayload;
  label?: string;
  size?: "sm" | "default" | "icon";
  variant?: "outline" | "ghost" | "secondary";
  className?: string;
}

const COPIED_FEEDBACK_MS = 1600;

function serialize(payload: CopyInfoToAiPayload): string {
  const header = [
    `# ${payload.kind}`,
    `scope: ${payload.scope}`,
    payload.note ? `note: ${payload.note}` : null,
    "",
  ]
    .filter((line) => line !== null)
    .join("\n");
  const body = JSON.stringify(payload.data, null, 2);
  return `${header}\n${body}\n`;
}

/**
 * Reusable "Copy info to AI" button. Serializes a host-supplied payload to a structured,
 * LLM-friendly string (prose header + JSON) and writes it to the clipboard, with copied / error
 * feedback. Used across the Unit Model Editor (structure tree, model rows, texture rows,
 * validation, repack result).
 */
export function CopyInfoToAiButton({
  buildPayload,
  label = "Copy info to AI",
  size = "sm",
  variant = "outline",
  className,
}: CopyInfoToAiButtonProps) {
  const [state, setState] = useState<"idle" | "busy" | "copied" | "error">("idle");
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleCopy = useCallback(async () => {
    if (resetTimer.current) clearTimeout(resetTimer.current);
    setState("busy");
    try {
      const text = serialize(buildPayload());
      await writeText(text);
      setState("copied");
    } catch (error) {
      console.error("CopyInfoToAiButton failed", error);
      setState("error");
    }
    resetTimer.current = setTimeout(() => setState("idle"), COPIED_FEEDBACK_MS);
  }, [buildPayload]);

  const isIcon = size === "icon";
  const Icon = state === "busy" ? Loader2 : state === "copied" ? Check : ClipboardCopy;

  return (
    <Button
      type="button"
      size={size}
      variant={variant}
      onClick={handleCopy}
      disabled={state === "busy"}
      title={label}
      aria-label={label}
      className={cn(
        "gap-1.5 transition-colors active:translate-y-px",
        state === "copied" && "border-emerald-500/60 text-emerald-600 dark:text-emerald-400",
        state === "error" && "border-red-500/60 text-red-600 dark:text-red-400",
        className,
      )}
    >
      <Icon className={cn("h-3.5 w-3.5", state === "busy" && "animate-spin")} aria-hidden />
      {!isIcon && (
        <span className="text-xs font-medium">
          {state === "copied" ? "Copied" : state === "error" ? "Copy failed" : label}
        </span>
      )}
    </Button>
  );
}
