import { useCallback, useEffect, useMemo, useState } from "react";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { BookOpen, Copy, Loader2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { crc32Ieee } from "@/utils/crc32Ieee";
import {
  evaluateSeed,
  suggestUniqueSeed,
  type SeedSuggestion,
} from "@/services/resourceRegistry/suggestUniqueSeed";
import type { ResourceRegistryCategory } from "@/services/resourceRegistry/types";
import type { UseResourceRegistryResult } from "@/hooks/useResourceRegistry";
import { ResourceSeedCollisionDialog } from "./ResourceSeedCollisionDialog";
import type { TestEditorWorkspaceDocument } from "@/services/testEditorWorkspace/types";

interface ResourceSeedFieldProps {
  category: ResourceRegistryCategory;
  slot: string;
  label?: string;
  currentHashInt32: number;
  obDplCachePath: string;
  obModPath: string;
  workspacePath: string;
  workspaceDocument?: TestEditorWorkspaceDocument;
  registry: UseResourceRegistryResult;
  onApplyHash: (hashInt32: number) => void;
  onSeedChange?: (seed: string) => void;
  initialSeed?: string;
  compact?: boolean;
}

export function ResourceSeedField({
  category,
  slot,
  label,
  currentHashInt32,
  obDplCachePath,
  obModPath,
  workspacePath,
  workspaceDocument,
  registry,
  onApplyHash,
  onSeedChange,
  initialSeed = "",
  compact = false,
}: ResourceSeedFieldProps) {
  const [seed, setSeed] = useState("");
  const [saveToRegistry, setSaveToRegistry] = useState(true);
  const [busy, setBusy] = useState(false);
  const [collisionOpen, setCollisionOpen] = useState(false);
  const [collisionOriginal, setCollisionOriginal] = useState<SeedSuggestion | null>(null);
  const [collisionSuggested, setCollisionSuggested] = useState<SeedSuggestion | undefined>();
  const [collisionExhausted, setCollisionExhausted] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const preview = useMemo(() => {
    const trimmed = seed.trim();
    if (!trimmed) return null;
    return crc32Ieee(trimmed);
  }, [seed]);

  const knownEntry = useMemo(() => {
    if (!currentHashInt32) return undefined;
    return registry.lookupMergedByHash(category, slot, currentHashInt32);
  }, [registry, category, slot, currentHashInt32]);

  useEffect(() => {
    if (knownEntry?.seed) {
      if (!seed) {
        setSeed(knownEntry.seed);
        onSeedChange?.(knownEntry.seed);
      }
      return;
    }
    const fallback = initialSeed.trim();
    if (fallback && !seed.trim()) {
      setSeed(fallback);
      onSeedChange?.(fallback);
    }
  }, [initialSeed, knownEntry, onSeedChange, seed]);

  const pathParams = useMemo(
    () => ({
      category,
      slot,
      obDplCachePath,
      obModPath,
      workspacePath,
      workspaceDocument,
      maxAttempts: 99,
    }),
    [category, slot, obDplCachePath, obModPath, workspacePath, workspaceDocument],
  );

  const applySuggestion = useCallback(
    async (row: SeedSuggestion) => {
      onApplyHash(row.hashInt32);
      if (saveToRegistry) {
        const result = await registry.registerWorkspace({
          category,
          slot,
          seed: row.seed,
        });
        if (!result.ok && result.reason === "duplicate_hash") {
          toast.warning("Hash already registered under a different seed");
        }
      }
      setSeed(row.seed);
      onSeedChange?.(row.seed);
      toast.success("Applied resource hash", {
        description: `${row.hashHex} from seed "${row.seed}"`,
      });
    },
    [category, onApplyHash, onSeedChange, registry, saveToRegistry, slot],
  );

  const handleApply = useCallback(async () => {
    const trimmed = seed.trim();
    if (!trimmed) {
      toast.error("Enter a seed string first");
      return;
    }
    setBusy(true);
    try {
      const current = await evaluateSeed({ ...pathParams, baseSeed: trimmed, seed: trimmed });
      if (current.isClear) {
        await applySuggestion(current);
        return;
      }
      const suggestion = await suggestUniqueSeed({ ...pathParams, baseSeed: trimmed });
      setCollisionOriginal(current);
      setCollisionSuggested(suggestion.firstClear ?? suggestion.suggestions[1]);
      setCollisionExhausted(suggestion.exhausted);
      setCollisionOpen(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast.error(message || "Failed to evaluate seed");
    } finally {
      setBusy(false);
    }
  }, [applySuggestion, pathParams, seed]);

  const registryMatches = useMemo(() => {
    const q = seed.trim().toLowerCase();
    return registry.mergedEntries
      .filter((entry) => entry.category === category && entry.slot === slot)
      .filter((entry) => {
        if (!q) return true;
        return (
          entry.seed.toLowerCase().includes(q) ||
          entry.hashHex.toLowerCase().includes(q) ||
          (entry.displayName?.toLowerCase().includes(q) ?? false)
        );
      })
      .slice(0, 40);
  }, [registry.mergedEntries, category, slot, seed]);

  const copyValue = async (value: string, labelText: string) => {
    await writeText(value);
    toast.success(`${labelText} copied`);
  };

  return (
    <div className={compact ? "space-y-1.5" : "space-y-2 rounded-md border p-2.5 bg-muted/20"}>
      {!compact ? (
        <div className="flex items-center justify-between gap-2">
          <Label className="text-xs font-medium">
            {label ?? `Seed (${category}/${slot})`}
          </Label>
          {knownEntry ? (
            <span className="text-[10px] text-muted-foreground font-mono truncate max-w-[50%]">
              linked: {knownEntry.seed}
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="flex items-center gap-1">
        <Input
          value={seed}
          onChange={(e) => {
            setSeed(e.target.value);
            onSeedChange?.(e.target.value);
          }}
          placeholder="resource seed string"
          className="h-7 text-xs font-mono"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void handleApply();
            }
          }}
        />
        <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" size="icon" className="h-7 w-7 shrink-0" title="Pick from registry">
              <BookOpen className="h-3.5 w-3.5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80 p-0" align="end">
            <ScrollArea className="max-h-64">
              <div className="p-2 space-y-1">
                {registryMatches.length === 0 ? (
                  <p className="text-xs text-muted-foreground p-2">No registry entries for this slot.</p>
                ) : (
                  registryMatches.map((entry) => (
                    <button
                      key={entry.id}
                      type="button"
                      className="w-full text-left rounded px-2 py-1.5 hover:bg-muted text-xs"
                      onClick={() => {
                        setSeed(entry.seed);
                        onSeedChange?.(entry.seed);
                        setPickerOpen(false);
                      }}
                    >
                      <div className="font-mono truncate">{entry.seed}</div>
                      <div className="text-muted-foreground font-mono">{entry.hashHex}</div>
                    </button>
                  ))
                )}
              </div>
            </ScrollArea>
          </PopoverContent>
        </Popover>
        <Button
          type="button"
          size="icon"
          className="h-7 w-7 shrink-0"
          disabled={busy}
          onClick={() => void handleApply()}
          title="Apply seed to hash field"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
        </Button>
      </div>

      {preview ? (
        <div className="flex flex-wrap items-center gap-2 text-[10px] font-mono text-muted-foreground">
          <span>{preview.hashHex}</span>
          <span>int32: {preview.hashInt32}</span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-5 w-5"
            onClick={() => void copyValue(preview.hashHex, "Hash hex")}
          >
            <Copy className="h-3 w-3" />
          </Button>
        </div>
      ) : null}

      <div className="flex items-center gap-2">
        <Checkbox
          id={`save-registry-${category}-${slot}`}
          checked={saveToRegistry}
          onCheckedChange={(v) => setSaveToRegistry(v === true)}
        />
        <Label htmlFor={`save-registry-${category}-${slot}`} className="text-[10px] text-muted-foreground">
          Save to workspace registry after apply
        </Label>
      </div>

      {collisionOriginal ? (
        <ResourceSeedCollisionDialog
          open={collisionOpen}
          onOpenChange={setCollisionOpen}
          original={collisionOriginal}
          suggested={collisionSuggested}
          exhausted={collisionExhausted}
          onApplyOriginal={() => {
            setCollisionOpen(false);
            void applySuggestion(collisionOriginal);
          }}
          onApplySuggested={() => {
            if (!collisionSuggested) return;
            setCollisionOpen(false);
            void applySuggestion(collisionSuggested);
          }}
        />
      ) : null}
    </div>
  );
}
