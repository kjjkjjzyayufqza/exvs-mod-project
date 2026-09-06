import type { ReactNode } from "react";
import { FolderOpen, PackagePlus, RefreshCw, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useTranslation } from "react-i18next";

export type SoundTableWorkbenchStatus = "idle" | "loading" | "missing" | "ready" | "error";

export type SoundTableMetaLine = {
  label: string;
  value: string;
  onOpen?: () => void;
};

type SoundTableWorkbenchProps = {
  isActive: boolean;
  title: string;
  purpose?: string;
  status: SoundTableWorkbenchStatus;
  errorMessage?: string | null;
  unpackLabel?: string;
  unpacking?: boolean;
  unpackDisabled?: boolean;
  onUnpack?: () => void;
  onReload: () => void;
  onSave?: () => void;
  canSave?: boolean;
  writable?: boolean;
  metaLines?: SoundTableMetaLine[];
  loadedLabel?: string;
  notice?: ReactNode;
  toolbarExtra?: ReactNode;
  addPanel?: ReactNode;
  listPanel?: ReactNode;
  detailPanel?: ReactNode;
};

function MetaLine({ label, value, onOpen }: SoundTableMetaLine) {
  const { t } = useTranslation("test-lists");
  return (
    <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
      <span className="min-w-0 break-all">
        {label}: <span data-i18n-ignore="">{value || "-"}</span>
      </span>
      {value && onOpen ? (
        <button
          type="button"
          onClick={onOpen}
          className="shrink-0 rounded p-0.5 hover:bg-accent hover:text-accent-foreground"
          title={t("common.openFolder")}
        >
          <FolderOpen className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  );
}

export function SoundTableWorkbench({
  isActive,
  title,
  purpose,
  status,
  errorMessage,
  unpackLabel,
  unpacking = false,
  unpackDisabled = false,
  onUnpack,
  onReload,
  onSave,
  canSave = false,
  writable = true,
  metaLines,
  loadedLabel,
  notice,
  toolbarExtra,
  addPanel,
  listPanel,
  detailPanel,
}: SoundTableWorkbenchProps) {
  const { t } = useTranslation("test-lists");
  const resolvedUnpackLabel = unpackLabel ?? t("sound.unpack");
  if (!isActive) {
    return <div className="h-full w-full" />;
  }

  return (
    <div className="h-full w-full">
      <Card className="flex h-full flex-col rounded-none border-none bg-transparent shadow-none">
        <CardHeader className="p-0 pb-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <CardTitle className="text-balance">{title}</CardTitle>
              {purpose ? (
                <p className="mt-1 max-w-xl text-xs leading-5 text-muted-foreground text-pretty">{purpose}</p>
              ) : null}
              {(metaLines ?? []).map((line) => (
                <MetaLine key={line.label} {...line} />
              ))}
              {loadedLabel ? (
                <div className="mt-1 text-xs tabular-nums text-muted-foreground">{loadedLabel}</div>
              ) : null}
              {notice}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {toolbarExtra}
              <Button
                size="sm"
                variant="outline"
                onClick={onReload}
                className="inline-flex h-9 items-center gap-2 transition-[background-color,box-shadow,transform] duration-150 ease-out active:scale-[0.96]"
              >
                <RefreshCw className="h-4 w-4" />
                {t("common.reload")}
              </Button>
              {onSave ? (
                <Button
                  size="sm"
                  onClick={onSave}
                  disabled={!writable || !canSave}
                  className="inline-flex h-9 items-center gap-2 transition-[background-color,box-shadow,transform] duration-150 ease-out active:scale-[0.96]"
                >
                  <Save className="h-4 w-4" />
                  {t("common.saveFile")}
                </Button>
              ) : null}
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col p-0">
          {status === "loading" ? (
            <div className="text-sm text-muted-foreground">{t("common.loadingEllipsis")}</div>
          ) : null}

          {status === "missing" || status === "idle" || status === "error" ? (
            <div className="space-y-3">
              {status === "error" && errorMessage ? (
                <div className="text-sm text-destructive">{errorMessage}</div>
              ) : (
                <div className="text-sm text-muted-foreground">{t("sound.tableMissing")}</div>
              )}
              <div className="flex items-center gap-2">
                {onUnpack ? (
                  <Button size="sm" onClick={onUnpack} disabled={unpackDisabled || unpacking} className="inline-flex items-center gap-2">
                    <PackagePlus className="h-4 w-4" />
                    {unpacking ? t("sound.unpacking") : resolvedUnpackLabel}
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}

          {status === "ready" ? (
            <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[minmax(16rem,0.95fr)_minmax(0,1.05fr)]">
              <aside className="flex min-h-0 flex-col gap-3">
                {addPanel}
                <div className="min-h-0 flex-1">{listPanel}</div>
              </aside>
              <section className="min-h-0 overflow-auto">{detailPanel}</section>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

export function soundTableMissingMessage(message: string): boolean {
  return /No raw_path_id JSON|No pilotvoiceresourcetable|No bgm_table|No bgm_list|No BGM bank|Extract pack|nus3bank|raw_path_id|Camera table not found|EXVS common|0xCB665375|02winlose/i.test(
    message,
  );
}

export function displayVoiceStem(value: string): string {
  return value.replace(/^STREAMPATH_ST_/i, "");
}
