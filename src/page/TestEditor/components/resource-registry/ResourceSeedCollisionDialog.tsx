import { AlertTriangle } from "lucide-react";
import { AppRndModalShell } from "@/components/AppRndModalShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { SeedSuggestion } from "@/services/resourceRegistry/suggestUniqueSeed";
import { useTranslation } from "react-i18next";

const RESOURCE_SEED_COLLISION_MODAL_DIMENSIONS = {
  width: 560,
  height: 500,
  minWidth: 460,
  minHeight: 380,
};

interface ResourceSeedCollisionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  original: SeedSuggestion;
  suggested?: SeedSuggestion;
  exhausted?: boolean;
  onApplyOriginal: () => void;
  onApplySuggested: () => void;
}

function PathBadges({ row }: { row: SeedSuggestion }) {
  const { t } = useTranslation("test-resource-registry");
  return (
    <div className="flex flex-wrap gap-1">
      {row.obExists && <Badge variant="secondary">OB</Badge>}
      {row.modExists && <Badge variant="destructive">MOD</Badge>}
      {row.workspaceExists && <Badge variant="destructive">WS</Badge>}
      {row.isClear && <Badge variant="outline">{t("collision.clear")}</Badge>}
    </div>
  );
}

export function ResourceSeedCollisionDialog({
  open,
  onOpenChange,
  original,
  suggested,
  exhausted,
  onApplyOriginal,
  onApplySuggested,
}: ResourceSeedCollisionDialogProps) {
  const { t } = useTranslation("test-resource-registry");
  if (!open) return null;

  return (
    <AppRndModalShell
      titleId="resource-seed-collision-title"
      title={t("collision.title")}
      subtitle={t("collision.subtitle")}
      headerIcon={<AlertTriangle className="h-5 w-5 text-amber-600" />}
      dimensions={RESOURCE_SEED_COLLISION_MODAL_DIMENSIONS}
      storageKey="app.rnd-size.resource-seed-collision"
      onClose={() => onOpenChange(false)}
      footer={
        <div className="flex flex-wrap justify-end gap-2 bg-background px-6 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("action.cancel")}
          </Button>
          {suggested && suggested.isClear && suggested.seed !== original.seed ? (
            <Button onClick={onApplySuggested}>{t("collision.applySuggested")}</Button>
          ) : null}
          <Button variant={suggested?.isClear ? "secondary" : "default"} onClick={onApplyOriginal}>
            {t("collision.applyCurrent")}
          </Button>
        </div>
      }
    >
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-6 text-sm">
        <p className="text-xs leading-relaxed text-muted-foreground">
          {t("collision.body")}
        </p>
          <div className="rounded-md border p-3 space-y-2">
            <div className="font-medium">{t("collision.currentSeed")}</div>
            <div className="font-mono text-xs break-all" data-i18n-ignore="">{original.seed}</div>
            <div className="font-mono text-xs text-muted-foreground">
              <span data-i18n-ignore="">{original.hashHex}</span> ({t("seedField.int32", { value: original.hashInt32 })})
            </div>
            <PathBadges row={original} />
          </div>

          {suggested && suggested.seed !== original.seed ? (
            <div className="rounded-md border border-primary/40 bg-primary/5 p-3 space-y-2">
              <div className="font-medium">{t("collision.suggestedSeed")}</div>
              <div className="font-mono text-xs break-all" data-i18n-ignore="">{suggested.seed}</div>
              <div className="font-mono text-xs text-muted-foreground">
                <span data-i18n-ignore="">{suggested.hashHex}</span> ({t("seedField.int32", { value: suggested.hashInt32 })})
              </div>
              <PathBadges row={suggested} />
            </div>
          ) : null}

          {exhausted ? (
            <p className="text-destructive text-xs">
              {t("collision.exhausted")}
            </p>
          ) : null}
        </div>
    </AppRndModalShell>
  );
}
