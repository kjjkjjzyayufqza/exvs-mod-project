import { useMemo } from "react";
import type { PlacementRow } from "../types/placement";
import { isHeaderFormatRow, listPlacementFields } from "../utils/placementFieldModel";
import { resolveTransformAxisBindings } from "../utils/placementTransformAxes";
import { TransformAxisGrid } from "./TransformAxisGrid";

export interface TransformData {
  posX: number;
  posY: number;
  posZ: number;
  rotX: number;
  rotY: number;
  rotZ: number;
  scaleX: number;
  scaleY: number;
  scaleZ: number;
}

interface StagePropertyEditorProps {
  transform: TransformData;
  onTransformChange: (field: keyof TransformData, value: number) => void;
  placementEntry?: PlacementRow | null;
  placementHeader?: string[];
  initialPlacementRawFields?: string[] | null;
  onPlacementFieldPreview?: (fieldIndex: number, value: string) => void;
  onPlacementFieldCommit?: (fieldIndex: number, value: string) => void;
  onAddPlacementField?: (key: string, value: string) => void;
  onRemovePlacementField?: (keyIndex: number) => void;
  onResetPlacementField?: (fieldIndex: number) => void;
}

export function StagePropertyEditor({
  transform,
  onTransformChange,
  placementEntry = null,
  placementHeader = [],
  initialPlacementRawFields = null,
  onPlacementFieldPreview,
  onPlacementFieldCommit,
  onAddPlacementField,
  onRemovePlacementField,
  onResetPlacementField,
}: StagePropertyEditorProps) {
  const placementMode =
    placementEntry !== null &&
    onPlacementFieldPreview !== undefined &&
    onPlacementFieldCommit !== undefined &&
    onAddPlacementField !== undefined &&
    onRemovePlacementField !== undefined;

  const bindings = useMemo(() => {
    if (placementMode && placementEntry) {
      return resolveTransformAxisBindings(
        listPlacementFields(placementEntry, placementHeader),
        transform,
      );
    }
    return resolveTransformAxisBindings([], transform, { virtualPresent: true });
  }, [placementEntry, placementHeader, placementMode, transform]);

  const headerFormat =
    placementEntry !== null && isHeaderFormatRow(placementEntry, placementHeader);

  return (
    <TransformAxisGrid
      bindings={bindings}
      headerFormat={headerFormat}
      initialRawFields={initialPlacementRawFields}
      onValuePreview={(binding, value) => {
        if (placementMode) {
          if (binding.present && binding.valueIndex !== null) {
            onPlacementFieldPreview!(binding.valueIndex, value);
          }
          return;
        }
        if (binding.def.parsedField) {
          const parsed = Number.parseFloat(value);
          if (Number.isFinite(parsed)) onTransformChange(binding.def.parsedField, parsed);
        }
      }}
      onValueCommit={(binding, value) => {
        if (placementMode) {
          if (binding.present && binding.valueIndex !== null) {
            onPlacementFieldCommit!(binding.valueIndex, value);
          } else if (binding.def.parsedField) {
            const parsed = Number.parseFloat(value);
            if (Number.isFinite(parsed)) onTransformChange(binding.def.parsedField, parsed);
          }
          return;
        }
        if (binding.def.parsedField) {
          const parsed = Number.parseFloat(value);
          if (Number.isFinite(parsed)) onTransformChange(binding.def.parsedField, parsed);
        }
      }}
      onAddAxis={(binding) => {
        onAddPlacementField?.(binding.def.key, binding.value || binding.def.defaultValue);
      }}
      onRemoveAxis={(binding) => {
        if (binding.keyIndex !== null) onRemovePlacementField?.(binding.keyIndex);
      }}
      onResetField={onResetPlacementField}
    />
  );
}
