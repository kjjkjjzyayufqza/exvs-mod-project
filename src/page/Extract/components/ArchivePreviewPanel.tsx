import JsonView from "@uiw/react-json-view";
import { vscodeTheme } from "@uiw/react-json-view/vscode";
import { Loader2, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { SectionBlock, SectionPanel } from "./SectionPanel";

export type ArchivePreviewState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; data: Record<string, unknown>; typeLabel: string }
  | { status: "error"; message: string };

type Props = {
  preview: ArchivePreviewState;
  canReload: boolean;
  onReload: () => void;
};

/** Read-only header/structure dump of the selected archive (JS parse, inspection only). */
export function ArchivePreviewPanel({ preview, canReload, onReload }: Props) {
  return (
    <SectionPanel>
      <SectionBlock
        title="Archive preview"
        description="Header and sub-file structure parsed in the UI. Never used for extraction."
        action={
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 shrink-0 px-2 text-xs"
            disabled={!canReload || preview.status === "loading"}
            onClick={onReload}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Reload
          </Button>
        }
      >
        {preview.status === "idle" && (
          <p className="rounded-md border border-dashed p-6 text-center text-xs text-muted-foreground">
            Pick a .fhm2d file to read its header.
          </p>
        )}

        {preview.status === "loading" && (
          <p className="flex items-center gap-2 rounded-md border border-dashed p-6 text-xs text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Reading archive...
          </p>
        )}

        {preview.status === "error" && (
          <p className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
            {preview.message}
          </p>
        )}

        {preview.status === "ready" && (
          <div className="space-y-2">
            <p className="font-mono text-[11px] text-muted-foreground">
              container: {preview.typeLabel}
            </p>
            <div className="max-h-[min(420px,45vh)] overflow-auto rounded-md border bg-muted/20 p-2">
              <JsonView
                style={vscodeTheme}
                value={preview.data}
                displayDataTypes={false}
                collapsed={1}
              />
            </div>
          </div>
        )}
      </SectionBlock>
    </SectionPanel>
  );
}
