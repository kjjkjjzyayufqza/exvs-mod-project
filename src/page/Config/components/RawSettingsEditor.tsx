import { useCallback, useEffect, useMemo, useState } from "react";
import type { Store } from "@tauri-apps/plugin-store";
import { Check, Loader2, Plus, RotateCcw, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  filterRawEntries,
  formatSettingValue,
  isMultilineSettingValue,
  parseSettingValue,
  settingValueKind,
  toSortedRawEntries,
  validateSettingKey,
  type RawSettingEntry,
} from "../rawSettings";

type Props = {
  /** Read side only: the editor lists whatever `entries()` returns. */
  store: Store | null;
  /** Keys that also have a typed field above; shown as managed so edits are not a surprise. */
  managedKeys: readonly string[];
  /** Persists one key and resyncs anything derived from it (typed form, Zustand mirror). */
  onWriteSetting: (key: string, value: unknown) => Promise<void>;
  /** Removes one key and resyncs derived state. */
  onDeleteSetting: (key: string) => Promise<void>;
};

type LoadState = "idle" | "loading" | "ready" | "error";

const KIND_TONE: Record<ReturnType<typeof settingValueKind>, string> = {
  string: "text-emerald-700 dark:text-emerald-400",
  number: "text-sky-700 dark:text-sky-400",
  boolean: "text-violet-700 dark:text-violet-400",
  null: "text-muted-foreground",
  array: "text-amber-700 dark:text-amber-400",
  object: "text-amber-700 dark:text-amber-400",
};

export function RawSettingsEditor({
  store,
  managedKeys,
  onWriteSetting,
  onDeleteSetting,
}: Props) {
  const [entries, setEntries] = useState<RawSettingEntry[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [loadError, setLoadError] = useState("");
  const [query, setQuery] = useState("");
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState('""');

  const reload = useCallback(async () => {
    if (!store) return;
    setLoadState("loading");
    try {
      const raw = await store.entries<unknown>();
      setEntries(toSortedRawEntries(raw));
      setDrafts({});
      setRowErrors({});
      setLoadError("");
      setLoadState("ready");
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : String(error));
      setLoadState("error");
    }
  }, [store]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const visibleEntries = useMemo(() => filterRawEntries(entries, query), [entries, query]);
  const existingKeys = useMemo(() => entries.map((entry) => entry.key), [entries]);
  const dirtyCount = useMemo(
    () => entries.filter((entry) => drafts[entry.key] !== undefined).length,
    [entries, drafts],
  );

  const setDraft = useCallback((key: string, text: string) => {
    setDrafts((prev) => ({ ...prev, [key]: text }));
    setRowErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  const clearDraft = useCallback((key: string) => {
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setRowErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  const saveRow = useCallback(
    async (entry: RawSettingEntry) => {
      if (!store) return;
      const text = drafts[entry.key];
      if (text === undefined) return;

      let parsed: unknown;
      try {
        parsed = parseSettingValue(text);
      } catch (error) {
        setRowErrors((prev) => ({
          ...prev,
          [entry.key]: error instanceof Error ? error.message : String(error),
        }));
        return;
      }

      setSavingKey(entry.key);
      try {
        await onWriteSetting(entry.key, parsed);
        setEntries((prev) =>
          prev.map((row) =>
            row.key === entry.key
              ? { key: row.key, value: parsed, text: formatSettingValue(parsed) }
              : row,
          ),
        );
        clearDraft(entry.key);
        toast.success(`Saved ${entry.key}`);
      } catch (error) {
        toast.error(`Failed to save ${entry.key}`, {
          description: error instanceof Error ? error.message : String(error),
        });
      } finally {
        setSavingKey(null);
      }
    },
    [store, drafts, clearDraft, onWriteSetting],
  );

  const deleteRow = useCallback(
    async (key: string) => {
      if (!store) return;
      setSavingKey(key);
      try {
        await onDeleteSetting(key);
        setEntries((prev) => prev.filter((row) => row.key !== key));
        clearDraft(key);
        toast.success(`Deleted ${key}`);
      } catch (error) {
        toast.error(`Failed to delete ${key}`, {
          description: error instanceof Error ? error.message : String(error),
        });
      } finally {
        setSavingKey(null);
      }
    },
    [store, clearDraft, onDeleteSetting],
  );

  const addRow = useCallback(async () => {
    if (!store) return;
    let key: string;
    let parsed: unknown;
    try {
      key = validateSettingKey(newKey, existingKeys);
      parsed = parseSettingValue(newValue);
    } catch (error) {
      toast.error("Cannot add key", {
        description: error instanceof Error ? error.message : String(error),
      });
      return;
    }

    setSavingKey(key);
    try {
      await onWriteSetting(key, parsed);
      setEntries((prev) =>
        toSortedRawEntries([
          ...prev.map((row) => [row.key, row.value] as [string, unknown]),
          [key, parsed],
        ]),
      );
      setNewKey("");
      setNewValue('""');
      setIsAdding(false);
      toast.success(`Added ${key}`);
    } catch (error) {
      toast.error(`Failed to add ${key}`, {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setSavingKey(null);
    }
  }, [store, newKey, newValue, existingKeys, onWriteSetting]);

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-base font-semibold tracking-tight">Raw settings</h2>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Every key in <code className="font-mono text-xs">settings.json</code>, edited as JSON.
            Strings must be quoted. Saving writes to disk immediately.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter keys..."
              className="h-8 w-52 pl-8 text-xs"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8"
            onClick={() => void reload()}
            disabled={!store || loadState === "loading"}
          >
            <RotateCcw className={cn("h-3.5 w-3.5", loadState === "loading" && "animate-spin")} />
            Reload
          </Button>
          <Button
            type="button"
            size="sm"
            className="h-8"
            onClick={() => setIsAdding((prev) => !prev)}
            disabled={!store}
          >
            <Plus className="h-3.5 w-3.5" />
            Add key
          </Button>
        </div>
      </div>

      {isAdding && (
        <div className="grid gap-3 rounded-md border bg-muted/30 p-3 sm:grid-cols-[minmax(0,18rem)_minmax(0,1fr)_auto] sm:items-end">
          <div className="space-y-1.5">
            <Label htmlFor="raw-new-key" className="text-xs">
              Key
            </Label>
            <Input
              id="raw-new-key"
              value={newKey}
              onChange={(event) => setNewKey(event.target.value)}
              placeholder="mySettingKey"
              className="h-8 font-mono text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="raw-new-value" className="text-xs">
              Value (JSON)
            </Label>
            <Input
              id="raw-new-value"
              value={newValue}
              onChange={(event) => setNewValue(event.target.value)}
              placeholder='"E:\\XB\\mod"'
              className="h-8 font-mono text-xs"
            />
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              className="h-8"
              onClick={() => void addRow()}
              disabled={savingKey !== null}
            >
              <Check className="h-3.5 w-3.5" />
              Add
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-8"
              onClick={() => setIsAdding(false)}
            >
              <X className="h-3.5 w-3.5" />
              Cancel
            </Button>
          </div>
        </div>
      )}

      {!store && (
        <p className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
          Settings store is still initializing.
        </p>
      )}

      {store && loadState === "loading" && entries.length === 0 && (
        <p className="flex items-center gap-2 rounded-md border border-dashed p-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Reading settings.json...
        </p>
      )}

      {store && loadState === "error" && (
        <p className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          Failed to read settings.json: {loadError}
        </p>
      )}

      {store && loadState === "ready" && entries.length === 0 && (
        <p className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
          The settings store is empty. Use Add key to create the first entry.
        </p>
      )}

      {store && entries.length > 0 && visibleEntries.length === 0 && (
        <p className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
          No key matches "{query}".
        </p>
      )}

      {visibleEntries.length > 0 && (
        <div className="divide-y rounded-md border">
          {visibleEntries.map((entry) => {
            const draft = drafts[entry.key];
            const isDirty = draft !== undefined;
            const value = isDirty ? draft : entry.text;
            const kind = settingValueKind(entry.value);
            const isManaged = managedKeys.includes(entry.key);
            const error = rowErrors[entry.key];
            const isBusy = savingKey === entry.key;

            return (
              <div
                key={entry.key}
                className={cn(
                  "grid gap-2 p-3 md:grid-cols-[minmax(0,16rem)_minmax(0,1fr)] md:items-start md:gap-4",
                  isDirty && "bg-amber-50/60 dark:bg-amber-950/20",
                )}
              >
                <div className="min-w-0 space-y-1 pt-1.5">
                  <p className="truncate font-mono text-xs font-medium" title={entry.key}>
                    {entry.key}
                  </p>
                  <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <span className={cn("font-mono", KIND_TONE[kind])}>{kind}</span>
                    {isManaged && <span>· has a field above</span>}
                  </p>
                </div>

                <div className="min-w-0 space-y-2">
                  <div className="flex items-start gap-2">
                    {isMultilineSettingValue(entry.value) ? (
                      <Textarea
                        value={value}
                        onChange={(event) => setDraft(entry.key, event.target.value)}
                        spellCheck={false}
                        rows={Math.min(14, value.split("\n").length + 1)}
                        className={cn(
                          "min-h-16 flex-1 font-mono text-xs",
                          error && "border-destructive focus-visible:ring-destructive",
                        )}
                      />
                    ) : (
                      <Input
                        value={value}
                        onChange={(event) => setDraft(entry.key, event.target.value)}
                        spellCheck={false}
                        className={cn(
                          "h-8 flex-1 font-mono text-xs",
                          error && "border-destructive focus-visible:ring-destructive",
                        )}
                      />
                    )}
                    <div className="flex shrink-0 gap-1">
                      <Button
                        type="button"
                        size="icon"
                        variant="outline"
                        className="h-8 w-8"
                        title="Save this key"
                        aria-label={`Save ${entry.key}`}
                        onClick={() => void saveRow(entry)}
                        disabled={!isDirty || isBusy}
                      >
                        {isBusy ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Check className="h-3.5 w-3.5" />
                        )}
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        title="Revert to stored value"
                        aria-label={`Revert ${entry.key}`}
                        onClick={() => clearDraft(entry.key)}
                        disabled={!isDirty || isBusy}
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                        title="Delete this key"
                        aria-label={`Delete ${entry.key}`}
                        onClick={() => void deleteRow(entry.key)}
                        disabled={isBusy}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  {error && <p className="text-xs text-destructive">{error}</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {dirtyCount > 0 && (
        <p className="text-xs text-muted-foreground">
          {dirtyCount} unsaved {dirtyCount === 1 ? "key" : "keys"}. Each key is saved on its own.
        </p>
      )}
    </section>
  );
}
