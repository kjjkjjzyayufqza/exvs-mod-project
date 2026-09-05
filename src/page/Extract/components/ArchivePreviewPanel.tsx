import JsonView from "@uiw/react-json-view";
import { vscodeTheme } from "@uiw/react-json-view/vscode";
import { Loader2, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";

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
  const { t } = useTranslation("extract-page");
  return (
    <SectionPanel>
      <SectionBlock
        title={t("archivePreview.title")}
        description={t("archivePreview.description")}
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
            {t("archivePreview.reload")}
          </Button>
        }
      >
        {preview.status === "idle" && (
          <p className="rounded-md border border-dashed p-6 text-center text-xs text-muted-foreground">
            {t("archivePreview.idle")}
          </p>
        )}

        {preview.status === "loading" && (
          <p className="flex items-center gap-2 rounded-md border border-dashed p-6 text-xs text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("archivePreview.loading")}
          </p>
        )}

        {preview.status === "error" && (
          <p className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
            {preview.message}
          </p>
        )}

        {preview.status === "ready" && (
          <div className="space-y-2">
            <p className="font-mono text-[11px] text-muted-foreground" data-i18n-ignore="">
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
