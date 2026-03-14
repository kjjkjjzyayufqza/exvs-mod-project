import { useEffect, useState } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DualValueProperty } from "@/components/ui/dual-value-property";
import type { StageDataGVSEntry } from "@/models/stageList";
import { StageGvsFileNameStatus } from "./StageGvsFileNameStatus";
import {
  getGvsIndexedHexDisplay,
  getGvsIndexedReversedName,
  resolveGvsIndexedNameRef,
  type GvsIndexedNameRef,
} from "./gvsFileNameSearch";

const GVS_NUMERIC_FIELDS = [
  { name: "unk1" as const, label: "unk1" },
  { name: "fileName" as const, label: "fileName" },
  { name: "unk3" as const, label: "unk3" },
  { name: "unk4" as const, label: "unk4" },
  { name: "unk5" as const, label: "unk5" },
  { name: "unk6" as const, label: "unk6" },
  { name: "unk7" as const, label: "unk7" },
  { name: "stg_grd_1" as const, label: "stg_grd_1" },
  { name: "stg_full" as const, label: "stg_full" },
  { name: "stg_vs_2" as const, label: "stg_vs_2" },
  { name: "stg_grd_2" as const, label: "stg_grd_2" },
  { name: "unk12" as const, label: "unk12" },
];

const GVS_INDEXED_NAME_FIELDS = [
  { name: "fileName" as const, label: "fileName" },
  { name: "stg_grd_1" as const, label: "stg_grd_1" },
  { name: "stg_full" as const, label: "stg_full" },
  { name: "stg_vs_2" as const, label: "stg_vs_2" },
  { name: "stg_grd_2" as const, label: "stg_grd_2" },
];

type GvsIndexedFieldName = (typeof GVS_INDEXED_NAME_FIELDS)[number]["name"];

interface StageGvsFormProps {
  stage: StageDataGVSEntry;
  index: number;
  searchDir?: string;
}

export function StageGvsForm({ stage, index, searchDir = "" }: StageGvsFormProps) {
  const [resolvedRefs, setResolvedRefs] = useState<Partial<Record<GvsIndexedFieldName, GvsIndexedNameRef>>>({});
  const [resolvedRefsLoading, setResolvedRefsLoading] = useState(false);
  const [resolvedRefsError, setResolvedRefsError] = useState<string | null>(null);

  const getNumericValue = (fieldName: (typeof GVS_NUMERIC_FIELDS)[number]["name"]): number => {
    const value = stage[fieldName];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    throw new Error(`Invalid numeric value for ${fieldName}`);
  };

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const indexedEntries = GVS_INDEXED_NAME_FIELDS
        .map((field) => ({ name: field.name, value: stage[field.name] }))
        .filter((entry) => entry.value !== 0);

      if (!searchDir.trim() || indexedEntries.length === 0) {
        setResolvedRefs({});
        setResolvedRefsLoading(false);
        setResolvedRefsError(null);
        return;
      }

      setResolvedRefsLoading(true);
      setResolvedRefsError(null);
      try {
        const resolvedList = await Promise.all(
          indexedEntries.map(async (entry) => ({
            name: entry.name,
            resolved: await resolveGvsIndexedNameRef(searchDir, entry.value),
          }))
        );
        if (cancelled) return;
        setResolvedRefs(
          resolvedList.reduce<Partial<Record<GvsIndexedFieldName, GvsIndexedNameRef>>>((acc, entry) => {
            acc[entry.name] = entry.resolved;
            return acc;
          }, {})
        );
      } catch (error) {
        if (cancelled) return;
        setResolvedRefs({});
        setResolvedRefsError(error instanceof Error ? error.message : "Failed to resolve indexed file path");
      } finally {
        if (!cancelled) {
          setResolvedRefsLoading(false);
        }
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [
    searchDir,
    stage.fileName,
    stage.stg_grd_1,
    stage.stg_full,
    stage.stg_vs_2,
    stage.stg_grd_2,
  ]);

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <div className="text-sm font-medium text-muted-foreground">GVS Stage #{index}</div>
        {searchDir ? <div className="text-xs text-muted-foreground break-all">Search Directory: {searchDir}</div> : null}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`gvs-name-${index}`} className="text-xs">
          name
        </Label>
        <Input id={`gvs-name-${index}`} type="text" value={stage.name?.Utf8String ?? ""} readOnly className="h-8" />
      </div>

      <div className="grid grid-cols-2 gap-2">
        {GVS_NUMERIC_FIELDS.map((field) => (
          <DualValueProperty
            key={field.name}
            label={field.label}
            labelExtra={
              GVS_INDEXED_NAME_FIELDS.some((indexedField) => indexedField.name === field.name) ? (
                <StageGvsFileNameStatus
                  resolvedRef={resolvedRefs[field.name as GvsIndexedFieldName] ?? null}
                  isLoading={resolvedRefsLoading}
                  error={resolvedRefsError}
                />
              ) : undefined
            }
            value={getNumericValue(field.name)}
            property={`${field.name}-${index}`}
            editable={false}
            editingProperty={null}
            editValue=""
            validationError=""
            onStartEdit={() => {}}
            onSaveEdit={() => {}}
            onCancelEdit={() => {}}
            onValueChange={() => {}}
            variant="compact"
            showHex
          />
        ))}
      </div>

      {GVS_INDEXED_NAME_FIELDS.filter((field) => stage[field.name] !== 0).map((field) => {
        const value = stage[field.name];
        const resolvedRef = resolvedRefs[field.name] ?? null;
        const hexDisplay = getGvsIndexedHexDisplay(value);
        const reversedName = getGvsIndexedReversedName(value);

        return (
          <div key={field.name} className="rounded-md border p-3 space-y-1.5">
            <div className="text-xs font-medium text-muted-foreground">{field.label} Indexed Path</div>
            <div className="text-xs font-mono break-all">{value}</div>
            <div className="text-xs font-mono break-all">({hexDisplay})</div>
            <div className="text-xs text-muted-foreground">Reversed Name</div>
            <div className="text-xs font-mono break-all">{reversedName}</div>
            <div className="text-xs text-muted-foreground">Resolved Path</div>
            {resolvedRefsLoading ? (
              <div className="text-xs text-muted-foreground">Resolving indexed path from Search Directory...</div>
            ) : resolvedRefsError ? (
              <div className="text-xs text-destructive break-all">{resolvedRefsError}</div>
            ) : resolvedRef ? (
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">Index Folder: {resolvedRef.indexFolder}</div>
                <div className="max-h-28 overflow-auto rounded border bg-muted/20 px-2 py-1 text-[11px] font-mono whitespace-pre-wrap break-all">
                  {resolvedRef.filePath}
                </div>
              </div>
            ) : (
              <div className="text-xs text-muted-foreground">Search Directory is required to resolve the indexed path</div>
            )}
          </div>
        );
      })}
    </div>
  );
}
