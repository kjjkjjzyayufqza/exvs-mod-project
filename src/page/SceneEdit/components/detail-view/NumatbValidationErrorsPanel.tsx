import { useVirtualizer } from "@tanstack/react-virtual";
import { useCallback, useRef, useState } from "react";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { AlertTriangle, Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { NumatbEmptyTexturePathError } from "@/components/ssbh-model-preview/store/numatbTemplateStoreHelpers";

const ERROR_ROW_HEIGHT = 28;

type NumatbValidationErrorsPanelProps = {
  errors: NumatbEmptyTexturePathError[];
};

/**
 * Live numatb pre-flight errors for the Material tab. Mirrors the save/repack gate
 * (empty texture paths) and offers a one-click copy of every message for AI-assisted fixing.
 */
export function NumatbValidationErrorsPanel({ errors }: NumatbValidationErrorsPanelProps) {
  const [copied, setCopied] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);
  const getListScrollElement = useCallback(() => listRef.current, []);
  const errorVirtualizer = useVirtualizer({
    count: errors.length,
    getScrollElement: getListScrollElement,
    estimateSize: () => ERROR_ROW_HEIGHT,
    getItemKey: (index) => {
      const error = errors[index];
      return error ? `${error.profile}:${error.materialLabel}:${error.paramId}:${index}` : index;
    },
    overscan: 8,
  });

  if (errors.length === 0) {
    return null;
  }

  const handleCopy = async () => {
    try {
      await writeText(errors.map((error) => error.message).join("\n"));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
      toast.success(`Copied ${errors.length} material error(s)`);
    } catch {
      toast.error("Failed to copy errors to clipboard");
    }
  };

  return (
    <div className="rounded border border-destructive/30 bg-destructive/5">
      <div className="flex items-center justify-between gap-2 border-b border-destructive/20 px-3 py-1.5">
        <div className="flex min-w-0 items-center gap-1.5 text-destructive">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate text-xs font-medium">
            {errors.length} empty texture path{errors.length === 1 ? "" : "s"} — blocks save & repack
          </span>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0"
          title="Copy all errors"
          aria-label="Copy all material errors"
          onClick={() => void handleCopy()}
        >
          {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
        </Button>
      </div>
      <div ref={listRef} className="max-h-32 overflow-auto px-3 py-2">
        <div className="relative w-full" style={{ height: errorVirtualizer.getTotalSize() }}>
          {errorVirtualizer.getVirtualItems().map((virtualRow) => {
            const error = errors[virtualRow.index];
            if (!error) return null;
            return (
              <div
                key={virtualRow.key}
                className="absolute left-0 top-0 w-full pr-1 font-mono text-[10px] leading-snug text-destructive"
                style={{
                  height: virtualRow.size,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                {error.message}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
