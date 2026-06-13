import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { SeedSuggestion } from "@/services/resourceRegistry/suggestUniqueSeed";

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
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Resource hash collision</DialogTitle>
          <DialogDescription>
            MOD or workspace already has assets for this CRC32. Confirm before applying the hash to
            the param field. This is a resource path hash (CRC32 of seed), not a param field-key hash.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
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

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {suggested && suggested.isClear && suggested.seed !== original.seed ? (
            <Button onClick={onApplySuggested}>Apply suggested</Button>
          ) : null}
          <Button variant={suggested?.isClear ? "secondary" : "default"} onClick={onApplyOriginal}>
            Apply current
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
