import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  getNumatbAttributeKind,
  type NumatbAttribute,
  type NumatbAttributeData,
  type NumatbAttributeDataKind,
} from "../daeSsbhTypes";
import type { MatlEntryJson } from "../types";
import { COMMON_NUMATB_PARAM_IDS, createDefaultAttributeData, isTexturePathParamId } from "../store/numatbTemplateStoreHelpers";
import { SceneTextureSelectPicker } from "@/page/SceneEdit/components/SceneTextureSelectPicker";
import { flattenEntryToAttributes } from "../store/matlEntryFlat";
import {
  ssbhEditorPortalThemeClass,
  useSsbhEditorTheme,
} from "./ssbhEditorTheme";

const ATTRIBUTE_ROW_ESTIMATE_SIZE = 72;

type NumatbMaterialEntryEditorProps = {
  entry: MatlEntryJson | null;
  onChangeMaterialLabel: (nextLabel: string) => void;
  onChangeShaderLabel: (nextShaderLabel: string) => void;
  onUpdateAttribute: (attributeIndex: number, data: NumatbAttributeData) => void;
  onAddAttribute: (paramId: string, kind?: NumatbAttributeDataKind) => void;
  onRemoveAttribute: (attributeIndex: number) => void;
};

function CommitInput({
  value,
  onCommit,
  type = "text",
  step,
  className,
}: {
  value: string | number;
  onCommit: (next: string) => void;
  type?: "text" | "number";
  step?: string;
  className?: string;
}) {
  const [draft, setDraft] = useState(String(value ?? ""));

  useEffect(() => {
    setDraft(String(value ?? ""));
  }, [value]);

  return (
    <Input
      type={type}
      step={step}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        const current = String(value ?? "");
        if (draft === current) {
          return;
        }
        onCommit(draft);
      }}
      className={className}
    />
  );
}

function JsonAttributeEditor({
  value,
  onChange,
}: {
  value: unknown;
  onChange: (nextValue: unknown) => void;
}) {
  const [raw, setRaw] = useState(() => JSON.stringify(value, null, 2));
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setRaw(JSON.stringify(value, null, 2));
    setError(null);
  }, [value]);

  return (
    <div className="min-w-0 space-y-1 overflow-hidden">
      <Textarea
        value={raw}
        onChange={(event) => setRaw(event.target.value)}
        onBlur={() => {
          try {
            const parsed = JSON.parse(raw) as unknown;
            const nextCanonical = JSON.stringify(parsed);
            const currentCanonical = JSON.stringify(value);
            if (nextCanonical !== currentCanonical) {
              onChange(parsed);
            }
            setError(null);
          } catch (parseError) {
            setError(parseError instanceof Error ? parseError.message : String(parseError));
          }
        }}
        className="min-h-28 resize-y overflow-auto font-mono text-[11px]"
      />
      {error ? <p className="text-[11px] text-destructive">{error}</p> : null}
    </div>
  );
}

function AttributeValueEditor({
  attribute,
  paramId,
  onChange,
}: {
  attribute: NumatbAttribute;
  paramId: string;
  onChange: (nextData: NumatbAttributeData) => void;
}) {
  const kind = getNumatbAttributeKind(attribute.param.data);
  const data = attribute.param.data;

  switch (kind) {
    case "Boolean":
      return (
        <div className="flex items-center gap-2">
          <Checkbox checked={data.Boolean === 1} onCheckedChange={(checked) => onChange({ Boolean: checked ? 1 : 0 })} />
          <span className="text-[11px] text-muted-foreground">{data.Boolean === 1 ? "True" : "False"}</span>
        </div>
      );
    case "Float":
      return (
        <CommitInput
          type="number"
          step="0.01"
          value={data.Float ?? 0}
          onCommit={(nextValue) => onChange({ Float: Number(nextValue) })}
          className="h-8 text-[11px]"
        />
      );
    case "Float1":
      return (
        <CommitInput
          type="number"
          step="0.01"
          value={data.Float1 ?? 0}
          onCommit={(nextValue) => onChange({ Float1: Number(nextValue) })}
          className="h-8 text-[11px]"
        />
      );
    case "String":
      if (isTexturePathParamId(paramId)) {
        return (
          <SceneTextureSelectPicker
            value={data.String ?? ""}
            paramId={paramId}
            onChange={(basename) => onChange({ String: basename })}
          />
        );
      }
      return (
        <CommitInput
          value={data.String ?? ""}
          onCommit={(nextValue) => onChange({ String: nextValue })}
          className="h-8 font-mono text-[11px]"
        />
      );
    case "String1":
      if (isTexturePathParamId(paramId)) {
        return (
          <SceneTextureSelectPicker
            value={data.String1 ?? ""}
            paramId={paramId}
            onChange={(basename) => onChange({ String1: basename })}
          />
        );
      }
      return (
        <CommitInput
          value={data.String1 ?? ""}
          onCommit={(nextValue) => onChange({ String1: nextValue })}
          className="h-8 font-mono text-[11px]"
        />
      );
    case "Vector4":
      return (
        <JsonAttributeEditor
          value={data.Vector4 ?? createDefaultAttributeData("Vector4").Vector4}
          onChange={(nextValue) => onChange({ Vector4: nextValue as NonNullable<NumatbAttributeData["Vector4"]> })}
        />
      );
    case "Unk7":
      return (
        <JsonAttributeEditor
          value={data.Unk7 ?? createDefaultAttributeData("Unk7").Unk7}
          onChange={(nextValue) => onChange({ Unk7: nextValue as NonNullable<NumatbAttributeData["Unk7"]> })}
        />
      );
    case "Sampler":
      return (
        <JsonAttributeEditor
          value={data.Sampler ?? createDefaultAttributeData("Sampler").Sampler}
          onChange={(nextValue) => onChange({ Sampler: nextValue as NonNullable<NumatbAttributeData["Sampler"]> })}
        />
      );
    case "BlendState":
      return (
        <JsonAttributeEditor
          value={data.BlendState ?? createDefaultAttributeData("BlendState").BlendState}
          onChange={(nextValue) => onChange({ BlendState: nextValue as NonNullable<NumatbAttributeData["BlendState"]> })}
        />
      );
    case "RasterizerState":
      return (
        <JsonAttributeEditor
          value={data.RasterizerState ?? createDefaultAttributeData("RasterizerState").RasterizerState}
          onChange={(nextValue) => onChange({ RasterizerState: nextValue as NonNullable<NumatbAttributeData["RasterizerState"]> })}
        />
      );
    case "UvTransform":
      return (
        <JsonAttributeEditor
          value={data.UvTransform ?? createDefaultAttributeData("UvTransform").UvTransform}
          onChange={(nextValue) => onChange({ UvTransform: nextValue as NonNullable<NumatbAttributeData["UvTransform"]> })}
        />
      );
    case "Type4":
      return (
        <JsonAttributeEditor
          value={data.Type4 ?? createDefaultAttributeData("Type4").Type4}
          onChange={(nextValue) => onChange({ Type4: nextValue as number[] })}
        />
      );
  }
}

export function NumatbMaterialEntryEditor({
  entry,
  onChangeMaterialLabel,
  onChangeShaderLabel,
  onUpdateAttribute,
  onAddAttribute,
  onRemoveAttribute,
}: NumatbMaterialEntryEditorProps) {
  const themeVariant = useSsbhEditorTheme();
  const selectContentClass = ssbhEditorPortalThemeClass(themeVariant);
  const attributeListScrollRef = useRef<HTMLDivElement | null>(null);
  const [newParamId, setNewParamId] = useState("");
  const [newParamKind, setNewParamKind] = useState<NumatbAttributeDataKind>("String");

  const flatAttributes = useMemo(
    () => (entry ? flattenEntryToAttributes(entry) : []),
    [entry],
  );

  const availableParamIds = useMemo(() => {
    const existing = new Set(flatAttributes.map((attribute) => attribute.param_id));
    return COMMON_NUMATB_PARAM_IDS.filter((paramId) => !existing.has(paramId));
  }, [flatAttributes]);

  const getAttributeListScrollElement = useCallback(() => attributeListScrollRef.current, []);
  const attributeRowVirtualizer = useVirtualizer({
    count: flatAttributes.length,
    getScrollElement: getAttributeListScrollElement,
    estimateSize: () => ATTRIBUTE_ROW_ESTIMATE_SIZE,
    overscan: 10,
  });

  if (!entry) {
    return <div className="flex items-center justify-center py-8 text-[11px] text-muted-foreground">Select a material entry to edit.</div>;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">Material label</Label>
          <Input value={entry.material_label} onChange={(event) => onChangeMaterialLabel(event.target.value)} className="h-8 text-[11px]" />
        </div>
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">Shader label</Label>
          <Input value={entry.shader_label} onChange={(event) => onChangeShaderLabel(event.target.value)} className="h-8 text-[11px]" />
        </div>
      </div>

      <div className="rounded-md border p-3">
        <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_180px_100px]">
          <Input
            value={newParamId}
            onChange={(event) => setNewParamId(event.target.value)}
            list="numatb-common-param-ids"
            className="h-8 text-[11px]"
            placeholder="Param ID"
          />
          <Select value={newParamKind} onValueChange={(value) => setNewParamKind(value as NumatbAttributeDataKind)}>
            <SelectTrigger className="h-8 text-[11px]">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent className={selectContentClass}>
              {[
                "Boolean",
                "Float",
                "Float1",
                "String",
                "String1",
                "Vector4",
                "Unk7",
                "Sampler",
                "BlendState",
                "RasterizerState",
                "UvTransform",
                "Type4",
              ].map((kind) => (
                <SelectItem key={kind} value={kind} className="text-[11px]">
                  {kind}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            size="sm"
            className="h-8 text-[10px] uppercase tracking-wide"
            disabled={!newParamId.trim()}
            onClick={() => {
              onAddAttribute(newParamId.trim(), newParamKind);
              setNewParamId("");
            }}
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            Add
          </Button>
        </div>
        <datalist id="numatb-common-param-ids">
          {availableParamIds.map((paramId) => (
            <option key={paramId} value={paramId} />
          ))}
        </datalist>
      </div>

      <div className="rounded-md border">
        <div className="grid grid-cols-[minmax(0,180px)_minmax(0,7rem)_minmax(0,1fr)_auto] items-start gap-2 border-b bg-muted/30 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          <span className="min-w-0">Param</span>
          <span className="min-w-0">Type</span>
          <span className="min-w-0">Value</span>
          <span className="w-8 shrink-0" aria-hidden />
        </div>
        {flatAttributes.length === 0 ? (
          <div className="px-3 py-8 text-center text-[11px] text-muted-foreground">This material has no attributes yet.</div>
        ) : (
          <div ref={attributeListScrollRef} className="max-h-[min(52vh,520px)] overflow-auto overscroll-contain">
            <div className="relative w-full" style={{ height: attributeRowVirtualizer.getTotalSize() }}>
              {attributeRowVirtualizer.getVirtualItems().map((virtualRow) => {
                const attribute = flatAttributes[virtualRow.index];
                if (!attribute) return null;
                const attributeIndex = virtualRow.index;
                const kind = getNumatbAttributeKind(attribute.param.data);
                return (
                  <div
                    key={`${attribute.param_id}:${attributeIndex}`}
                    ref={attributeRowVirtualizer.measureElement}
                    data-index={virtualRow.index}
                    className="absolute left-0 top-0 grid w-full grid-cols-[minmax(0,180px)_minmax(0,7rem)_minmax(0,1fr)_auto] items-start gap-2 border-b px-3 py-3"
                    style={{ transform: `translateY(${virtualRow.start}px)` }}
                  >
                    <div className="min-w-0">
                      <div className="wrap-break-word font-mono text-[11px]" title={attribute.param_id}>
                        {attribute.param_id}
                      </div>
                    </div>
                    <div className="min-w-0 wrap-break-word text-[11px] text-muted-foreground">{kind}</div>
                    <div className="min-w-0">
                      <AttributeValueEditor
                        attribute={attribute}
                        paramId={attribute.param_id}
                        onChange={(nextData) => onUpdateAttribute(attributeIndex, nextData)}
                      />
                    </div>
                    <div className="flex w-8 shrink-0 justify-end">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 px-0 text-destructive"
                        onClick={() => onRemoveAttribute(attributeIndex)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
