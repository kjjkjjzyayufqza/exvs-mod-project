import { useMemo } from "react";
import { formatHash } from "@/models/commandTable";
import { PropertyGroup } from "./PropertyGroup";
import { PropertyField } from "./PropertyField";
import type { PropertyFieldDef } from "./types";
import type {
  TypedParamEntry,
  TypedFieldValue,
} from "../../param-editor/typedParamTypes";

interface AutoPropertyPanelProps {
  entry: TypedParamEntry;
  fieldSpecs?: Array<Record<string, number>>;
  onFieldChange: (key: string, value: number) => void;
  groupOverrides?: Record<string, string[]>;
}

const EXCLUDED_KEYS = new Set(["entryId", "extraCommands"]);

function camelToLabel(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/^./, (c) => c.toUpperCase());
}

function inferFieldType(
  _key: string,
  value: TypedFieldValue,
  kind?: number,
): PropertyFieldDef["type"] {
  if (kind === 5) return "f32";
  if (kind === 2) return "i32";
  if (kind === 1) {
    if (typeof value === "number" && value > 0x1000000) return "hash";
    return "u32";
  }
  if (typeof value === "number") {
    if (Number.isInteger(value)) return value > 0x1000000 ? "hash" : "u32";
    return "f32";
  }
  return "u32";
}

function buildKindMap(
  fieldSpecs: Array<Record<string, number>> | undefined,
  entry: TypedParamEntry,
): Map<string, number> {
  const map = new Map<string, number>();
  if (!fieldSpecs || fieldSpecs.length === 0) return map;

  const entryKeys = Object.keys(entry).filter((k) => !EXCLUDED_KEYS.has(k));
  for (let i = 0; i < entryKeys.length && i < fieldSpecs.length; i++) {
    const spec = fieldSpecs[i];
    if (spec && typeof spec.kind === "number") {
      map.set(entryKeys[i]!, spec.kind);
    }
  }
  return map;
}

function buildFieldDef(
  key: string,
  value: TypedFieldValue,
  kind?: number,
): PropertyFieldDef {
  const fieldType = inferFieldType(key, value, kind);
  return {
    key,
    label: camelToLabel(key),
    type: fieldType,
    step: fieldType === "f32" ? 0.01 : 1,
  };
}

export function AutoPropertyPanel({
  entry,
  fieldSpecs,
  onFieldChange,
  groupOverrides,
}: AutoPropertyPanelProps) {
  const entryId =
    typeof entry.entryId === "number" ? (entry.entryId as number) : 0;

  const kindMap = useMemo(
    () => buildKindMap(fieldSpecs, entry),
    [fieldSpecs, entry],
  );

  const allKeys = useMemo(
    () => Object.keys(entry).filter((k) => !EXCLUDED_KEYS.has(k)),
    [entry],
  );

  const stringKeys = useMemo(() => {
    const set = new Set<string>();
    for (const key of allKeys) {
      const kind = kindMap.get(key);
      if (kind === 7 || typeof entry[key] === "string") {
        set.add(key);
      }
    }
    return set;
  }, [allKeys, kindMap, entry]);

  const groups = useMemo(() => {
    if (!groupOverrides) {
      const defs: PropertyFieldDef[] = [];
      const strings: { key: string; value: string }[] = [];
      for (const key of allKeys) {
        if (stringKeys.has(key)) {
          strings.push({
            key,
            value: String(entry[key] ?? ""),
          });
          continue;
        }
        defs.push(buildFieldDef(key, entry[key] ?? 0, kindMap.get(key)));
      }
      return [
        { label: `All Fields (${defs.length})`, fields: defs, strings },
      ];
    }

    const assigned = new Set<string>();
    const result: {
      label: string;
      fields: PropertyFieldDef[];
      strings: { key: string; value: string }[];
    }[] = [];

    for (const [label, keys] of Object.entries(groupOverrides)) {
      const fields: PropertyFieldDef[] = [];
      const strings: { key: string; value: string }[] = [];
      for (const key of keys) {
        if (!(key in entry)) continue;
        assigned.add(key);
        if (stringKeys.has(key)) {
          strings.push({ key, value: String(entry[key] ?? "") });
          continue;
        }
        fields.push(buildFieldDef(key, entry[key] ?? 0, kindMap.get(key)));
      }
      if (fields.length > 0 || strings.length > 0) {
        result.push({ label, fields, strings });
      }
    }

    const remaining: PropertyFieldDef[] = [];
    const remainingStrings: { key: string; value: string }[] = [];
    for (const key of allKeys) {
      if (assigned.has(key)) continue;
      if (stringKeys.has(key)) {
        remainingStrings.push({ key, value: String(entry[key] ?? "") });
        continue;
      }
      remaining.push(buildFieldDef(key, entry[key] ?? 0, kindMap.get(key)));
    }
    if (remaining.length > 0 || remainingStrings.length > 0) {
      result.push({
        label: `Other (${remaining.length})`,
        fields: remaining,
        strings: remainingStrings,
      });
    }

    return result;
  }, [allKeys, groupOverrides, entry, kindMap, stringKeys]);

  return (
    <div className="space-y-3 overflow-y-auto p-3">
      <div className="flex items-center justify-between rounded-md border bg-muted/20 px-3 py-1.5">
        <span className="text-[10px] text-muted-foreground">Entry ID</span>
        <span className="font-mono text-[11px]">{formatHash(entryId)}</span>
      </div>

      {groups.map((group) => (
        <PropertyGroup key={group.label} label={group.label}>
          {group.strings.map((s) => (
            <div
              key={s.key}
              className="flex items-center justify-between gap-2"
            >
              <label className="min-w-0 shrink-0 text-[11px] text-muted-foreground">
                {camelToLabel(s.key)}
              </label>
              <span className="truncate font-mono text-[11px] text-blue-400">
                {s.value || "(empty)"}
              </span>
            </div>
          ))}
          {group.fields.map((def) => (
            <PropertyField
              key={def.key}
              def={def}
              value={entry[def.key] ?? 0}
              onChange={onFieldChange}
            />
          ))}
        </PropertyGroup>
      ))}
    </div>
  );
}
