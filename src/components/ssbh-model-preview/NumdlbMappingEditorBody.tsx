import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { NumdlbReadResult } from "./ssbhDaeIoService";
import { NumdlbMaterialMappingEditor } from "./components/NumdlbMaterialMappingEditor";

type NumdlbMappingEditorBodyProps = {
  data: NumdlbReadResult;
  onChange: (next: NumdlbReadResult) => void;
  disabled?: boolean;
  /** When true, mapping table does not use its own fixed-height scroll; use with a parent scroll container. */
  embedTableWithoutInnerScroll?: boolean;
};

export function NumdlbMappingEditorBody({
  data,
  onChange,
  disabled = false,
  embedTableWithoutInnerScroll = false,
}: NumdlbMappingEditorBodyProps) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">Model name</Label>
          <Input
            value={data.modelName}
            onChange={(event) => onChange({ ...data, modelName: event.target.value })}
            className="h-8 text-[11px]"
            disabled={disabled}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">Mesh file name</Label>
          <Input
            value={data.meshFileName}
            onChange={(event) => onChange({ ...data, meshFileName: event.target.value })}
            className="h-8 text-[11px]"
            disabled={disabled}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">Skeleton file name</Label>
          <Input
            value={data.skeletonFileName}
            onChange={(event) => onChange({ ...data, skeletonFileName: event.target.value })}
            className="h-8 text-[11px]"
            disabled={disabled}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">Animation file name</Label>
          <Input
            value={data.animationFileName ?? ""}
            onChange={(event) => onChange({ ...data, animationFileName: event.target.value || null })}
            className="h-8 text-[11px]"
            disabled={disabled}
          />
        </div>
      </div>

      <div className="space-y-1">
        <Label className="text-[11px] text-muted-foreground">Material file names</Label>
        <Input
          value={data.materialFileNames.join(", ")}
          onChange={(event) =>
            onChange({
              ...data,
              materialFileNames: event.target.value
                .split(",")
                .map((item) => item.trim())
                .filter(Boolean),
            })
          }
          className="h-8 text-[11px]"
          disabled={disabled}
        />
      </div>

      <NumdlbMaterialMappingEditor
        embedTableWithoutInnerScroll={embedTableWithoutInnerScroll}
        rows={data.entries}
        onChangeMaterialLabel={(rowIndex, nextLabel) =>
          onChange({
            ...data,
            entries: data.entries.map((row, index) =>
              index === rowIndex ? { ...row, materialLabel: nextLabel } : row,
            ),
          })
        }
        onReplaceAll={(nextLabel, rowIndices) => {
          const trimmed = nextLabel.trim();
          if (!trimmed) {
            throw new Error("replaceAllMaterialLabels: nextLabel must be non-empty");
          }
          if (rowIndices.length === 0) {
            throw new Error("replaceAllMaterialLabels: rowIndices must not be empty");
          }
          const indexSet = new Set(rowIndices);
          onChange({
            ...data,
            entries: data.entries.map((row, index) =>
              indexSet.has(index) ? { ...row, materialLabel: trimmed } : row,
            ),
          });
        }}
      />
    </div>
  );
}
