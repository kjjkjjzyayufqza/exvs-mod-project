import { openPath } from "@tauri-apps/plugin-opener";
import { AlertTriangle, FolderOpen, Layers } from "lucide-react";
import { useTranslation } from "react-i18next";
import type {
  EffectFolderHash,
  EffectFolderInventory,
} from "@/services/effectFolder/effectFolderService";
import {
  EFFECT_FOLDER_COMMON_PACK_NAME,
  isEffectFolderCommonPackRoot,
} from "@/services/effectFolder/effectFolderCommonPack";
import { partitionEffectFolderWarnings } from "@/services/effectFolder/effectFolderWarnings";

type EffectFolderResolutionPanelProps = {
  inventory: EffectFolderInventory;
};

type SharedResource = { hash: EffectFolderHash; name: string | null };

function SharedResourceList({ title, resources }: { title: string; resources: SharedResource[] }) {
  if (resources.length === 0) return null;
  return (
    <div className="mt-2">
      <span className="text-[10px] uppercase tracking-wide text-sky-800 dark:text-sky-200">
        {title}
      </span>
      <ul className="custom-scrollbar-thin mt-1 max-h-28 space-y-0.5 overflow-y-auto" data-i18n-ignore="">
        {resources.map((resource) => (
          <li
            key={resource.hash.signed}
            className="truncate font-mono text-[10px] text-sky-900 dark:text-sky-100"
            title={resource.hash.hex}
          >
            {resource.name ?? resource.hash.hex}
          </li>
        ))}
      </ul>
    </div>
  );
}

function HashList({ hashes }: { hashes: readonly EffectFolderHash[] }) {
  return (
    <div className="mt-1 flex flex-wrap gap-1" data-i18n-ignore="">
      {hashes.map((hash) => (
        <code
          key={hash.signed}
          className="rounded bg-background/60 px-1 py-0.5 font-mono text-[10px] text-amber-900 dark:text-amber-100"
        >
          {hash.hex}
        </code>
      ))}
    </div>
  );
}

/**
 * Where each `.efxbn` reference resolved, and what is still missing.
 *
 * Blocks bind models and colour maps by CRC32, and most of those IDs only exist in the shared
 * `000common_001` pack — so "not in this folder" is the normal case, not a fault. Grouping the
 * two apart keeps the handful of genuinely missing resources readable instead of buried under
 * hundreds of expected cross-pack hits.
 */
export function EffectFolderResolutionPanel({ inventory }: EffectFolderResolutionPanelProps) {
  const { t } = useTranslation("test-effect-folder");
  const { summary, commonPack } = inventory;
  const isCommonPack = isEffectFolderCommonPackRoot(inventory.effectRoot);
  const sharedCount = summary.commonModelIds.length + summary.commonTextureIds.length;
  const missingCount = summary.unresolvedModelIds.length + summary.unresolvedTextureIds.length;
  const warnings = partitionEffectFolderWarnings(inventory.warnings);
  const sharedModels: SharedResource[] = summary.commonModelIds.map((hash) => ({
    hash,
    name: commonPack?.models.find((model) => model.hash.signed === hash.signed)?.name ?? null,
  }));
  const sharedTextures: SharedResource[] = summary.commonTextureIds.map((hash) => ({
    hash,
    name:
      commonPack?.textures.find((texture) => texture.hash?.signed === hash.signed)?.name ?? null,
  }));

  return (
    <div className="space-y-2">
      <div className="rounded-md border p-3">
        <div className="mb-2 flex items-center gap-2">
          <Layers className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <h4 className="text-xs font-medium">{t("resolution.sharedPack")}</h4>
        </div>

        {commonPack ? (
          <>
            <div className="flex items-start gap-1">
              <span className="min-w-0 break-all font-mono text-[11px] text-muted-foreground">
                {commonPack.effectRoot}
              </span>
              <button
                type="button"
                onClick={() => void openPath(commonPack.effectRoot)}
                className="shrink-0 rounded p-0.5 hover:bg-accent hover:text-accent-foreground"
                title={t("resolution.openShared")}
                aria-label={t("resolution.openShared")}
              >
                <FolderOpen className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
              <span>{t("resolution.indexedModels", { count: commonPack.models.length })}</span>
              <span>{t("resolution.indexedTextures", { count: commonPack.textures.length })}</span>
            </div>
          </>
        ) : (
          <p className="text-[11px] text-muted-foreground">
            {isCommonPack
              ? t("resolution.isSharedPack", { pack: EFFECT_FOLDER_COMMON_PACK_NAME })
              : t("resolution.missingShared", { pack: EFFECT_FOLDER_COMMON_PACK_NAME })}
          </p>
        )}

        {sharedCount > 0 ? (
          <div className="mt-2 rounded border border-sky-500/30 bg-sky-500/10 p-2">
            <p className="text-[11px] text-sky-900 dark:text-sky-100">
              {t("resolution.resolvedFromShared", {
                models: t("resolution.modelReference", { count: summary.commonModelIds.length }),
                textures: t("resolution.textureReference", { count: summary.commonTextureIds.length }),
              })}
            </p>
            <SharedResourceList title={t("resolution.models")} resources={sharedModels} />
            <SharedResourceList title={t("resolution.textures")} resources={sharedTextures} />
          </div>
        ) : null}
      </div>

      {missingCount > 0 ? (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3">
          <div className="mb-2 flex items-center gap-2">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-700 dark:text-amber-300" aria-hidden />
            <h4 className="text-xs font-medium text-amber-800 dark:text-amber-200">
              {t("resolution.unresolved")}
            </h4>
          </div>
          <p className="text-[11px] text-amber-900 dark:text-amber-100">
            {t("resolution.neitherPack", { pack: EFFECT_FOLDER_COMMON_PACK_NAME })}
          </p>
          {summary.unresolvedModelIds.length > 0 ? (
            <div className="mt-2">
              <span className="text-[10px] uppercase tracking-wide text-amber-800 dark:text-amber-200">
                {t("resolution.models")}
              </span>
              <HashList hashes={summary.unresolvedModelIds} />
            </div>
          ) : null}
          {summary.unresolvedTextureIds.length > 0 ? (
            <div className="mt-2">
              <span className="text-[10px] uppercase tracking-wide text-amber-800 dark:text-amber-200">
                {t("resolution.textures")}
              </span>
              <HashList hashes={summary.unresolvedTextureIds} />
            </div>
          ) : null}
        </div>
      ) : null}

      {warnings.unresolved.length > 0 || warnings.other.length > 0 ? (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3">
          <h4 className="mb-2 text-xs font-medium text-amber-800 dark:text-amber-200">
            {t("resolution.inventoryWarnings")}
          </h4>
          <ul className="list-disc space-y-1 pl-4 text-[11px] text-amber-900 dark:text-amber-100">
            {[...warnings.unresolved, ...warnings.other].map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
