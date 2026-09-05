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
import { useTranslation } from "react-i18next";

const GVS_NUMERIC_FIELD_NAMES = [
  "unk1",
  "fileName",
  "unk3",
  "unk4",
  "unk5",
  "unk6",
  "unk7",
  "stg_grd_1",
  "stg_full",
  "stg_vs_2",
  "stg_grd_2",
  "unk12",
] as const;

const GVS_INDEXED_NAME_FIELDS = [
  "fileName",
  "stg_grd_1",
  "stg_full",
  "stg_vs_2",
  "stg_grd_2",
] as const;

type GvsIndexedFieldName = (typeof GVS_INDEXED_NAME_FIELDS)[number];

interface StageGvsFormProps {
  stage: StageDataGVSEntry;
  index: number;
  searchDir?: string;
}

export function StageGvsForm({ stage, index, searchDir = "" }: StageGvsFormProps) {
  const { t } = useTranslation("test-stage-list-view");
  const [resolvedRefs, setResolvedRefs] = useState<Partial<Record<GvsIndexedFieldName, GvsIndexedNameRef>>>({});
  const [resolvedRefsLoading, setResolvedRefsLoading] = useState(false);
  const [resolvedRefsError, setResolvedRefsError] = useState<string | null>(null);

  const getNumericValue = (fieldName: (typeof GVS_NUMERIC_FIELD_NAMES)[number]): number => {
    const value = stage[fieldName];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    throw new Error(`Invalid numeric value for ${fieldName}`);
  };

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const indexedEntries = GVS_INDEXED_NAME_FIELDS
        .map((name) => ({ name, value: stage[name] }))
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
        setResolvedRefsError(error instanceof Error ? error.message : t("gvsForm.resolveFailed"));
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
    t,
  ]);

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <div className="text-sm font-medium text-muted-foreground">{t("gvsForm.stageNumber", { index })}</div>
        {searchDir ? (
          <div className="text-xs text-muted-foreground break-all">
            {t("gvsForm.searchDirectory", { path: searchDir })}
          </div>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`gvs-name-${index}`} className="text-xs">
          {t("gvsForm.name")}
        </Label>
        <Input id={`gvs-name-${index}`} type="text" value={stage.name?.Utf8String ?? ""} readOnly className="h-8" />
      </div>

      <div className="grid grid-cols-2 gap-2">
        {GVS_NUMERIC_FIELD_NAMES.map((name) => (
          <DualValueProperty
            key={name}
            label={t(`gvsForm.fields.${name}`)}
            labelExtra={
              GVS_INDEXED_NAME_FIELDS.some((indexedName) => indexedName === name) ? (
                <StageGvsFileNameStatus
                  resolvedRef={resolvedRefs[name as GvsIndexedFieldName] ?? null}
                  isLoading={resolvedRefsLoading}
                  error={resolvedRefsError}
                />
              ) : undefined
            }
            value={getNumericValue(name)}
            property={`${name}-${index}`}
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

      {GVS_INDEXED_NAME_FIELDS.filter((name) => stage[name] !== 0).map((name) => {
        const value = stage[name];
        const resolvedRef = resolvedRefs[name] ?? null;
        const hexDisplay = getGvsIndexedHexDisplay(value);
        const reversedName = getGvsIndexedReversedName(value);

        return (
          <div key={name} className="rounded-md border p-3 space-y-1.5">
            <div className="text-xs font-medium text-muted-foreground">
              {t("gvsForm.indexedPath", { field: t(`gvsForm.fields.${name}`) })}
            </div>
            <div className="text-xs font-mono break-all" data-i18n-ignore="">{value}</div>
            <div className="text-xs font-mono break-all" data-i18n-ignore="">({hexDisplay})</div>
            <div className="text-xs text-muted-foreground">{t("gvsForm.reversedName")}</div>
            <div className="text-xs font-mono break-all" data-i18n-ignore="">{reversedName}</div>
            <div className="text-xs text-muted-foreground">{t("gvsForm.resolvedPath")}</div>
            {resolvedRefsLoading ? (
              <div className="text-xs text-muted-foreground">{t("gvsForm.resolving")}</div>
            ) : resolvedRefsError ? (
              <div className="text-xs text-destructive break-all" data-i18n-ignore="">{resolvedRefsError}</div>
            ) : resolvedRef ? (
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">
                  {t("gvsForm.indexFolder", { path: resolvedRef.indexFolder })}
                </div>
                <div
                  className="max-h-28 overflow-auto rounded border bg-muted/20 px-2 py-1 text-[11px] font-mono whitespace-pre-wrap break-all"
                  data-i18n-ignore=""
                >
                  {resolvedRef.filePath}
                </div>
              </div>
            ) : (
              <div className="text-xs text-muted-foreground">{t("gvsForm.searchRequired")}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}
