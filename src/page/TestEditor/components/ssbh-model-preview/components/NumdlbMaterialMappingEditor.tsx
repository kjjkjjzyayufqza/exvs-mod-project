import { useId, useMemo, useState } from "react";
import { Search, WandSparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import type { NumdlbMappingRow } from "../daeSsbhTypes";

type NumdlbMaterialMappingEditorProps = {
  rows: NumdlbMappingRow[];
  onChangeMaterialLabel: (rowIndex: number, nextLabel: string) => void;
  onReplaceAll: (nextLabel: string) => void;
};

export function NumdlbMaterialMappingEditor({
  rows,
  onChangeMaterialLabel,
  onReplaceAll,
}: NumdlbMaterialMappingEditorProps) {
  const [filter, setFilter] = useState("");
  const [replaceAllValue, setReplaceAllValue] = useState("");
  const datalistId = useId();

  const materialLabels = useMemo(() => {
    return Array.from(new Set(rows.map((row) => row.materialLabel.trim()).filter(Boolean))).sort((left, right) =>
      left.localeCompare(right),
    );
  }, [rows]);

  const filteredRows = useMemo(() => {
    const normalized = filter.trim().toLowerCase();
    if (!normalized) return rows;
    return rows.filter((row) => {
      return (
        row.meshObjectName.toLowerCase().includes(normalized) ||
        row.materialLabel.toLowerCase().includes(normalized)
      );
    });
  }, [filter, rows]);

  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">Filter mesh or material</Label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              className="h-8 pl-7 text-[11px]"
              placeholder="Search mesh or material"
            />
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">Replace all material labels</Label>
          <div className="flex gap-2">
            <Input
              value={replaceAllValue}
              onChange={(event) => setReplaceAllValue(event.target.value)}
              className="h-8 text-[11px]"
              placeholder="New material label"
              list={datalistId}
            />
            <Button
              type="button"
              size="sm"
              className="h-8 px-3 text-[10px] uppercase tracking-wide"
              onClick={() => onReplaceAll(replaceAllValue)}
              disabled={!replaceAllValue.trim() || rows.length === 0}
            >
              <WandSparkles className="mr-1 h-3.5 w-3.5" />
              Apply
            </Button>
          </div>
        </div>
      </div>

      <datalist id={datalistId}>
        {materialLabels.map((label) => (
          <option key={label} value={label} />
        ))}
      </datalist>

      <div className="flex flex-wrap gap-2">
        <Badge variant="secondary" className="text-[10px]">
          Meshes: {rows.length}
        </Badge>
        <Badge variant="secondary" className="text-[10px]">
          Materials: {materialLabels.length}
        </Badge>
      </div>

      <div className="rounded-md border">
        <div className="grid grid-cols-[minmax(0,1fr)_72px_minmax(0,1fr)] gap-2 border-b bg-muted/30 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          <span>Mesh Object</span>
          <span>Subindex</span>
          <span>Material Label</span>
        </div>
        <ScrollArea className="h-[280px]">
          <div className="divide-y">
            {filteredRows.map((row) => {
              const rowIndex = rows.findIndex(
                (candidate) =>
                  candidate.meshObjectName === row.meshObjectName &&
                  candidate.meshObjectSubindex === row.meshObjectSubindex,
              );
              return (
                <div
                  key={`${row.meshObjectName}:${row.meshObjectSubindex}`}
                  className="grid grid-cols-[minmax(0,1fr)_72px_minmax(0,1fr)] gap-2 px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="truncate font-mono text-[11px]" title={row.meshObjectName}>
                      {row.meshObjectName}
                    </div>
                  </div>
                  <div className="font-mono text-[11px] text-muted-foreground">{row.meshObjectSubindex}</div>
                  <Input
                    value={row.materialLabel}
                    onChange={(event) => onChangeMaterialLabel(rowIndex, event.target.value)}
                    className="h-8 text-[11px]"
                    list={datalistId}
                  />
                </div>
              );
            })}
            {filteredRows.length === 0 ? (
              <div className="px-3 py-8 text-center text-[11px] text-muted-foreground">No mapping rows match the current filter.</div>
            ) : null}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
