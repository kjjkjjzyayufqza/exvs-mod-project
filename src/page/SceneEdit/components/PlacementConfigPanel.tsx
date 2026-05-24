import { useMemo } from "react";
import type { PlacementRow } from "../types/placement";
import { PlacementFieldEditor } from "./PlacementFieldEditor";
import { PROP_PANEL } from "./propertyPanelStyles";

interface PlacementConfigPanelProps {
  entry: PlacementRow;
  initialEntry?: PlacementRow | null;
  placementHeader: string[];
  onFieldPreview?: (fieldIndex: number, value: string) => void;
  onFieldCommit?: (fieldIndex: number, value: string) => void;
  onAddField?: (key: string, value: string) => void;
  onRemoveField?: (keyIndex: number) => void;
  onResetField?: (fieldIndex: number) => void;
}

export function PlacementConfigPanel({
  entry,
  initialEntry = null,
  placementHeader,
  onFieldPreview,
  onFieldCommit,
  onAddField,
  onRemoveField,
  onResetField,
}: PlacementConfigPanelProps) {
  const readOnly = !onFieldPreview || !onFieldCommit;

  const noopPreview = useMemo(() => () => {}, []);
  const noopCommit = useMemo(() => () => {}, []);
  const noopAdd = useMemo(() => () => {}, []);
  const noopRemove = useMemo(() => () => {}, []);
  const noopReset = useMemo(() => () => {}, []);

  if (readOnly) {
    return (
      <div className={`${PROP_PANEL} pointer-events-none opacity-90`}>
        <PlacementFieldEditor
          entry={entry}
          initialEntry={initialEntry}
          placementHeader={placementHeader}
          onFieldPreview={noopPreview}
          onFieldCommit={noopCommit}
          onAddField={noopAdd}
          onRemoveField={noopRemove}
          onResetField={noopReset}
        />
      </div>
    );
  }

  return (
    <PlacementFieldEditor
      entry={entry}
      initialEntry={initialEntry}
      placementHeader={placementHeader}
      onFieldPreview={onFieldPreview}
      onFieldCommit={onFieldCommit}
      onAddField={onAddField ?? noopAdd}
      onRemoveField={onRemoveField ?? noopRemove}
      onResetField={onResetField ?? noopReset}
    />
  );
}
