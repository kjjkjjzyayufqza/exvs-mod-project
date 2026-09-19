import { useTranslation } from "react-i18next";
import { Check, PackageOpen, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getWorkspaceContentDescriptor } from "@/services/testEditorWorkspace/contentCatalog";
import {
  TRIAD_CONTENT_IDS,
  type ResolvedTriadPacks,
  type TriadContentId,
} from "./triadRouteWorkspace";

type MissingPacksNoticeProps = {
  packs: ResolvedTriadPacks;
  dplCacheDir: string;
  isInitialising: boolean;
  onInitialise: () => void;
  onReload: () => void;
};

/**
 * What the editor looked for and did not find.
 *
 * "Initialise scene-id-table first" on its own is a dead end: it does not say
 * which package that is, where the editor looked, or whether the source it
 * would unpack from is even configured. Each of those is one line, and each
 * one is the difference between fixing it and guessing.
 */
export function MissingPacksNotice({
  packs,
  dplCacheDir,
  isInitialising,
  onInitialise,
  onReload,
}: MissingPacksNoticeProps) {
  const { t } = useTranslation("test-triad-route");
  const hasSource = dplCacheDir.trim().length > 0;

  const rows = TRIAD_CONTENT_IDS.map((id: TriadContentId) => {
    const descriptor = getWorkspaceContentDescriptor(id);
    const location = packs.locations[id];
    const found = !packs.notUnpacked.includes(id);
    const folder = (location.existing ?? location.configured).folderPath;
    return {
      id,
      label: descriptor.label,
      hash: descriptor.hashHex,
      folder,
      found,
      required: packs.missing.includes(id) || found,
      blocking: packs.missing.includes(id),
    };
  });

  return (
    <div className="flex flex-col items-start gap-3 p-4">
      <div>
        <h3 className="text-sm font-semibold">{t("load.missingTitle")}</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          {t("load.missing", { packs: packs.missing.join(", ") })}
        </p>
      </div>

      <div className="w-full max-w-3xl overflow-x-auto rounded border">
        <table className="w-full text-xs">
          <thead className="bg-muted/60 text-left">
            <tr>
              <th className="px-2 py-1 font-medium">{t("load.columnPack")}</th>
              <th className="px-2 py-1 font-medium">{t("load.columnHash")}</th>
              <th className="px-2 py-1 font-medium">{t("load.columnFolder")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t">
                <td className="px-2 py-1">
                  <span className="flex items-center gap-1.5">
                    {row.found ? (
                      <Check className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                    ) : (
                      <X
                        className={cn(
                          "size-3.5",
                          row.blocking ? "text-destructive" : "text-muted-foreground",
                        )}
                      />
                    )}
                    {row.label}
                    {!row.blocking && !row.found ? (
                      <span className="text-[10px] text-muted-foreground">
                        {t("load.optional")}
                      </span>
                    ) : null}
                  </span>
                </td>
                <td className="px-2 py-1 font-mono text-muted-foreground">{row.hash}</td>
                <td className="px-2 py-1 font-mono text-[11px] text-muted-foreground">
                  {row.folder}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-muted-foreground">
        {hasSource
          ? t("load.sourceIs", { path: dplCacheDir })
          : t("load.sourceMissing")}
      </p>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          disabled={isInitialising || !hasSource}
          onClick={onInitialise}
        >
          <PackageOpen className={cn("mr-1 size-4", isInitialising && "animate-pulse")} />
          {isInitialising ? t("load.initialising") : t("load.initialise")}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={onReload}>
          <RefreshCw className="mr-1 size-4" />
          {t("load.reload")}
        </Button>
      </div>
    </div>
  );
}
