import { AlertTriangle } from "lucide-react";
import { AppRndModalShell } from "@/components/AppRndModalShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { SeedSuggestion } from "@/services/resourceRegistry/suggestUniqueSeed";

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
  return (
    <div className="flex flex-wrap gap-1">
      {row.obExists && <Badge variant="secondary">OB</Badge>}
      {row.modExists && <Badge variant="destructive">MOD</Badge>}
      {row.workspaceExists && <Badge variant="destructive">WS</Badge>}
      {row.isClear && <Badge variant="outline">Clear</Badge>}
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
  if (!open) return null;

  return (
    <AppRndModalShell
      titleId="resource-seed-collision-title"
      title="Resource hash collision"
      subtitle="Confirm this CRC32 before applying it to the param field."
      headerIcon={<AlertTriangle className="h-5 w-5 text-amber-600" />}
      dimensions={RESOURCE_SEED_COLLISION_MODAL_DIMENSIONS}
      storageKey="app.rnd-size.resource-seed-collision"
      onClose={() => onOpenChange(false)}
      footer={
        <div className="flex flex-wrap justify-end gap-2 bg-background px-6 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {suggested && suggested.isClear && suggested.seed !== original.seed ? (
            <Button onClick={onApplySuggested}>Apply suggested</Button>
          ) : null}
          <Button variant={suggested?.isClear ? "secondary" : "default"} onClick={onApplyOriginal}>
            Apply current
          </Button>
        </div>
      }
    >
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-6 text-sm">
        <p className="text-xs leading-relaxed text-muted-foreground">
          MOD or workspace already has assets for this CRC32. This is a resource path hash (CRC32 of seed), not a
          param field-key hash.
        </p>
          <div className="rounded-md border p-3 space-y-2">
            <div className="font-medium">Current seed</div>
            <div className="font-mono text-xs break-all">{original.seed}</div>
            <div className="font-mono text-xs text-muted-foreground">
              {original.hashHex} (int32: {original.hashInt32})
            </div>
            <PathBadges row={original} />
          </div>

          {suggested && suggested.seed !== original.seed ? (
            <div className="rounded-md border border-primary/40 bg-primary/5 p-3 space-y-2">
              <div className="font-medium">Suggested seed</div>
              <div className="font-mono text-xs break-all">{suggested.seed}</div>
              <div className="font-mono text-xs text-muted-foreground">
                {suggested.hashHex} (int32: {suggested.hashInt32})
              </div>
              <PathBadges row={suggested} />
            </div>
          ) : null}

          {exhausted ? (
            <p className="text-destructive text-xs">
              No free seed suffix found within 99 attempts. Choose a different base name.
            </p>
          ) : null}
        </div>
    </AppRndModalShell>
  );
}
