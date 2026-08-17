import { useMemo } from "react";
import type { TypedParamEntry, TypedParamFile } from "../../param-editor/typedParamTypes";
import { GameAccuratePropertyPanel } from "../shared/GameAccuratePropertyPanel";
import {
  buildArmsComputedSections,
  buildArmsPropertyGroups,
  resolveArmsLabels,
} from "./armsFieldModel";

interface ArmsPropertyPanelProps {
  entry: TypedParamEntry;
  fieldSpecs?: TypedParamFile["fieldSpecs"];
  fileBytes?: Uint8Array | null;
  onFieldChange: (key: string, value: number | string) => void;
}

const ARMS_GROUPS = buildArmsPropertyGroups();

/**
 * Merge decoded kind-7 labels into the entry so the property panel always
 * shows editable `actionLabel` / `resourceLabel` strings (never raw offsets).
 */
function entryWithLabelStrings(
  entry: TypedParamEntry,
  fileBytes?: Uint8Array | null,
): TypedParamEntry {
  const labels = resolveArmsLabels(entry, fileBytes);
  return {
    ...entry,
    actionLabel:
      typeof entry.actionLabel === "string"
        ? entry.actionLabel
        : (labels.actionLabel ?? ""),
    resourceLabel:
      typeof entry.resourceLabel === "string"
        ? entry.resourceLabel
        : (labels.resourceLabel ?? ""),
  };
}

export function ArmsPropertyPanel({
  entry,
  fieldSpecs,
  fileBytes,
  onFieldChange,
}: ArmsPropertyPanelProps) {
  const displayEntry = useMemo(
    () => entryWithLabelStrings(entry, fileBytes),
    [entry, fileBytes],
  );
  const computedSections = useMemo(
    () => buildArmsComputedSections(displayEntry),
    [displayEntry],
  );

  return (
    <GameAccuratePropertyPanel
      entry={displayEntry}
      fieldSpecs={fieldSpecs}
      onFieldChange={onFieldChange}
      groups={ARMS_GROUPS}
      computedSections={computedSections}
    />
  );
}
