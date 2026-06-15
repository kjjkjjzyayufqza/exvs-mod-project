import { useState } from "react";
import { TypedParamDataPanel } from "@/page/TestEditor/components/param-editor/TypedParamDataPanel";
import type { TypedParamFile } from "@/page/TestEditor/components/param-editor/typedParamTypes";
import { VERNIER_PARAM_TYPE } from "./vernierIoService";
import { cn } from "@/lib/utils";

type VernierEditorBodyProps = {
  data: TypedParamFile;
  onChange: (next: TypedParamFile) => void;
  disabled?: boolean;
};

/**
 * Reuses the generic typed-param table ({@link TypedParamDataPanel}) for the vernier_table control
 * bin, so the editing surface stays identical to the TestEditor param editor while living inside
 * the shared resizable SSBH editor shell.
 */
export function VernierEditorBody({ data, onChange, disabled = false }: VernierEditorBodyProps) {
  const [selectedEntryIndex, setSelectedEntryIndex] = useState(0);

  return (
    <div
      className={cn(
        "flex min-h-0 flex-1 flex-col p-3",
        disabled && "pointer-events-none opacity-70",
      )}
      aria-busy={disabled}
    >
      <TypedParamDataPanel
        fileType={VERNIER_PARAM_TYPE}
        data={data}
        selectedEntryIndex={selectedEntryIndex}
        onSelectEntry={setSelectedEntryIndex}
        onChange={onChange}
      />
    </div>
  );
}
