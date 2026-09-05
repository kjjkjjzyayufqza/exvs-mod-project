import { Loader2, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { SceneEditRndModalShell } from "../SceneEditRndModalShell";
import { getEffectDetailViewModalDimensions } from "../sceneEditRndModalUtils";
import { SCENE_EDIT_RND_SIZE_KEYS } from "../sceneEditRndSizePersistence";
import { EffectProjectEditorBody } from "@/components/ssbh-model-preview/EffectProjectEditorBody";
import type { DetailViewSession } from "./sceneDetailViewTypes";

type EffectDetailViewWindowProps = {
  session: DetailViewSession;
  cascadeIndex: number;
  skipActivate?: boolean;
  onActivate: () => void;
  onClose: () => void;
};

export function EffectDetailViewWindow({
  session,
  cascadeIndex,
  skipActivate,
  onActivate,
  onClose,
}: EffectDetailViewWindowProps) {
  const { t } = useTranslation("scene-page");
  const data = session.effectData;
  if (!data) return null;

  return (
    <SceneEditRndModalShell
      cascadeIndex={cascadeIndex}
      zIndex={session.zIndex}
      titleId={`effect-detail-title-${session.id}`}
      title={t("detailView.propertiesTitle", { name: session.nodeLabel })}
      subtitle={t("detailView.effectSubtitle")}
      headerIcon={<Sparkles className="h-4 w-4 text-purple-500" />}
      skipActivate={skipActivate}
      onActivate={onActivate}
      onClose={onClose}
      getDimensions={getEffectDetailViewModalDimensions}
      sizeStorageKey={SCENE_EDIT_RND_SIZE_KEYS.effectDetailView}
    >
      <div className="min-h-0 flex-1 overflow-auto p-3">
        {data.loading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">{t("detailView.loadingEffect")}</span>
          </div>
        ) : data.error ? (
          <div className="rounded border border-destructive/30 bg-destructive/5 p-3">
            <p className="text-xs text-destructive" data-i18n-ignore="">
              {data.error}
            </p>
          </div>
        ) : data.document ? (
          <EffectProjectEditorBody
            data={data.document}
            draftSyncGeneration={0}
            onChange={() => {}}
            disabled={true}
            auxiliary={data.auxiliary}
          />
        ) : (
          <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
            {t("detailView.emptyEffect")}
          </div>
        )}
      </div>
    </SceneEditRndModalShell>
  );
}
