import { useCallback, useState } from "react";
import { ChevronDown, ChevronRight, Trash2, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { NuhlpbReadResult } from "./ssbhDaeIoService";

type NuhlpbEditorBodyProps = {
  data: NuhlpbReadResult;
  onChange: (next: NuhlpbReadResult) => void;
  disabled?: boolean;
};

function FieldRow({
  label,
  value,
  onChange,
  disabled,
  type = "text",
}: {
  label: string;
  value: string | number;
  onChange: (v: string) => void;
  disabled?: boolean;
  type?: "text" | "number";
}) {
  return (
    <div className="flex items-center gap-2">
      <Label className="w-40 shrink-0 text-[10px] text-muted-foreground">{label}</Label>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-7 flex-1 text-[10px] font-mono"
        disabled={disabled}
        type={type}
      />
    </div>
  );
}

function Vec3Fields({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: { x: number; y: number; z: number };
  onChange: (v: { x: number; y: number; z: number }) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <Label className="w-40 shrink-0 text-[10px] text-muted-foreground">{label}</Label>
      <div className="flex flex-1 gap-1">
        {(["x", "y", "z"] as const).map((axis) => (
          <Input
            key={axis}
            value={value[axis]}
            onChange={(e) => onChange({ ...value, [axis]: parseFloat(e.target.value) || 0 })}
            className="h-7 flex-1 text-[10px] font-mono"
            disabled={disabled}
            type="number"
            step="any"
          />
        ))}
      </div>
    </div>
  );
}

function Vec4Fields({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: { x: number; y: number; z: number; w: number };
  onChange: (v: { x: number; y: number; z: number; w: number }) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <Label className="w-40 shrink-0 text-[10px] text-muted-foreground">{label}</Label>
      <div className="flex flex-1 gap-1">
        {(["x", "y", "z", "w"] as const).map((axis) => (
          <Input
            key={axis}
            value={value[axis]}
            onChange={(e) => onChange({ ...value, [axis]: parseFloat(e.target.value) || 0 })}
            className="h-7 flex-1 text-[10px] font-mono"
            disabled={disabled}
            type="number"
            step="any"
          />
        ))}
      </div>
    </div>
  );
}

function ConstraintSection<T extends Record<string, unknown>>({
  title,
  items,
  onUpdate,
  onRemove,
  onAdd,
  renderFields,
  disabled,
  createDefault,
}: {
  title: string;
  items: T[];
  onUpdate: (index: number, next: T) => void;
  onRemove: (index: number) => void;
  onAdd: () => void;
  renderFields: (item: T, index: number, update: (next: T) => void) => React.ReactNode;
  disabled?: boolean;
  createDefault: () => T;
}) {
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());

  const toggle = (i: number) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {title} ({items.length})
        </h3>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-6 px-2 text-[10px]"
          disabled={disabled}
          onClick={onAdd}
        >
          <Plus className="mr-1 h-3 w-3" />
          Add
        </Button>
      </div>
      {items.length === 0 ? (
        <p className="text-[10px] italic text-muted-foreground">No entries</p>
      ) : (
        <div className="space-y-1">
          {items.map((item, index) => {
            const isOpen = !collapsed.has(index);
            const name = (item as Record<string, unknown>).name as string | undefined;
            return (
              <div key={index} className="rounded border bg-card/50">
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left"
                  onClick={() => toggle(index)}
                >
                  {isOpen ? (
                    <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                  )}
                  <span className="flex-1 truncate text-[11px] font-medium">
                    [{index}] {name || "(unnamed)"}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-5 w-5 p-0 text-destructive/60 hover:text-destructive"
                    disabled={disabled}
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemove(index);
                    }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </button>
                {isOpen && (
                  <div className="space-y-1.5 px-3 pb-3 pt-1">
                    {renderFields(item, index, (next) => onUpdate(index, next))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function NuhlpbEditorBody({ data, onChange, disabled = false }: NuhlpbEditorBodyProps) {
  const updateAimConstraint = useCallback(
    (index: number, next: Record<string, unknown>) => {
      const nextAim = [...data.aimConstraints];
      nextAim[index] = next;
      onChange({ ...data, aimConstraints: nextAim });
    },
    [data, onChange],
  );

  const removeAimConstraint = useCallback(
    (index: number) => {
      onChange({ ...data, aimConstraints: data.aimConstraints.filter((_, i) => i !== index) });
    },
    [data, onChange],
  );

  const addAimConstraint = useCallback(() => {
    const def: Record<string, unknown> = {
      name: "",
      aim_bone_name1: "",
      aim_bone_name2: "",
      aim_type1: "DEFAULT",
      aim_type2: "DEFAULT",
      target_bone_name1: "",
      target_bone_name2: "",
      unk1: 0,
      unk2: 0,
      aim: { x: 1, y: 0, z: 0 },
      up: { x: 0, y: 1, z: 0 },
      quat1: { x: 0, y: 0, z: 0, w: 1 },
      quat2: { x: 0, y: 0, z: 0, w: 1 },
    };
    onChange({ ...data, aimConstraints: [...data.aimConstraints, def] });
  }, [data, onChange]);

  const updateOrientConstraint = useCallback(
    (index: number, next: Record<string, unknown>) => {
      const nextOrient = [...data.orientConstraints];
      nextOrient[index] = next;
      onChange({ ...data, orientConstraints: nextOrient });
    },
    [data, onChange],
  );

  const removeOrientConstraint = useCallback(
    (index: number) => {
      onChange({ ...data, orientConstraints: data.orientConstraints.filter((_, i) => i !== index) });
    },
    [data, onChange],
  );

  const addOrientConstraint = useCallback(() => {
    const def: Record<string, unknown> = {
      name: "",
      parent_bone_name1: "",
      parent_bone_name2: "",
      source_bone_name: "",
      target_bone_name: "",
      unk_type: 2,
      constraint_axes: { x: 0.5, y: 0.5, z: 0.5 },
      quat1: { x: 0, y: 0, z: 0, w: 1 },
      quat2: { x: 0, y: 0, z: 0, w: 1 },
      range_min: { x: -180, y: -180, z: -180 },
      range_max: { x: 180, y: 180, z: 180 },
    };
    onChange({ ...data, orientConstraints: [...data.orientConstraints, def] });
  }, [data, onChange]);

  const renderAimFields = useCallback(
    (item: Record<string, unknown>, _index: number, update: (next: Record<string, unknown>) => void) => {
      const s = (key: string) => (item[key] as string) ?? "";
      const n = (key: string) => (item[key] as number) ?? 0;
      const v3 = (key: string) => (item[key] as { x: number; y: number; z: number }) ?? { x: 0, y: 0, z: 0 };
      const v4 = (key: string) =>
        (item[key] as { x: number; y: number; z: number; w: number }) ?? { x: 0, y: 0, z: 0, w: 1 };

      return (
        <>
          <FieldRow label="name" value={s("name")} onChange={(v) => update({ ...item, name: v })} disabled={disabled} />
          <FieldRow label="aim_bone_name1" value={s("aim_bone_name1")} onChange={(v) => update({ ...item, aim_bone_name1: v })} disabled={disabled} />
          <FieldRow label="aim_bone_name2" value={s("aim_bone_name2")} onChange={(v) => update({ ...item, aim_bone_name2: v })} disabled={disabled} />
          <FieldRow label="aim_type1" value={s("aim_type1")} onChange={(v) => update({ ...item, aim_type1: v })} disabled={disabled} />
          <FieldRow label="aim_type2" value={s("aim_type2")} onChange={(v) => update({ ...item, aim_type2: v })} disabled={disabled} />
          <FieldRow label="target_bone_name1" value={s("target_bone_name1")} onChange={(v) => update({ ...item, target_bone_name1: v })} disabled={disabled} />
          <FieldRow label="target_bone_name2" value={s("target_bone_name2")} onChange={(v) => update({ ...item, target_bone_name2: v })} disabled={disabled} />
          <FieldRow label="unk1" value={n("unk1")} onChange={(v) => update({ ...item, unk1: parseInt(v) || 0 })} disabled={disabled} type="number" />
          <FieldRow label="unk2" value={n("unk2")} onChange={(v) => update({ ...item, unk2: parseInt(v) || 0 })} disabled={disabled} type="number" />
          <Vec3Fields label="aim" value={v3("aim")} onChange={(v) => update({ ...item, aim: v })} disabled={disabled} />
          <Vec3Fields label="up" value={v3("up")} onChange={(v) => update({ ...item, up: v })} disabled={disabled} />
          <Vec4Fields label="quat1" value={v4("quat1")} onChange={(v) => update({ ...item, quat1: v })} disabled={disabled} />
          <Vec4Fields label="quat2" value={v4("quat2")} onChange={(v) => update({ ...item, quat2: v })} disabled={disabled} />
        </>
      );
    },
    [disabled],
  );

  const renderOrientFields = useCallback(
    (item: Record<string, unknown>, _index: number, update: (next: Record<string, unknown>) => void) => {
      const s = (key: string) => (item[key] as string) ?? "";
      const n = (key: string) => (item[key] as number) ?? 0;
      const v3 = (key: string) => (item[key] as { x: number; y: number; z: number }) ?? { x: 0, y: 0, z: 0 };
      const v4 = (key: string) =>
        (item[key] as { x: number; y: number; z: number; w: number }) ?? { x: 0, y: 0, z: 0, w: 1 };

      return (
        <>
          <FieldRow label="name" value={s("name")} onChange={(v) => update({ ...item, name: v })} disabled={disabled} />
          <FieldRow label="parent_bone_name1" value={s("parent_bone_name1")} onChange={(v) => update({ ...item, parent_bone_name1: v })} disabled={disabled} />
          <FieldRow label="parent_bone_name2" value={s("parent_bone_name2")} onChange={(v) => update({ ...item, parent_bone_name2: v })} disabled={disabled} />
          <FieldRow label="source_bone_name" value={s("source_bone_name")} onChange={(v) => update({ ...item, source_bone_name: v })} disabled={disabled} />
          <FieldRow label="target_bone_name" value={s("target_bone_name")} onChange={(v) => update({ ...item, target_bone_name: v })} disabled={disabled} />
          <FieldRow label="unk_type" value={n("unk_type")} onChange={(v) => update({ ...item, unk_type: parseInt(v) || 0 })} disabled={disabled} type="number" />
          <Vec3Fields label="constraint_axes" value={v3("constraint_axes")} onChange={(v) => update({ ...item, constraint_axes: v })} disabled={disabled} />
          <Vec4Fields label="quat1" value={v4("quat1")} onChange={(v) => update({ ...item, quat1: v })} disabled={disabled} />
          <Vec4Fields label="quat2" value={v4("quat2")} onChange={(v) => update({ ...item, quat2: v })} disabled={disabled} />
          <Vec3Fields label="range_min" value={v3("range_min")} onChange={(v) => update({ ...item, range_min: v })} disabled={disabled} />
          <Vec3Fields label="range_max" value={v3("range_max")} onChange={(v) => update({ ...item, range_max: v })} disabled={disabled} />
        </>
      );
    },
    [disabled],
  );

  return (
    <div className="space-y-5">
      <ConstraintSection
        title="Aim Constraints"
        items={data.aimConstraints}
        onUpdate={updateAimConstraint}
        onRemove={removeAimConstraint}
        onAdd={addAimConstraint}
        renderFields={renderAimFields}
        disabled={disabled}
        createDefault={() => ({})}
      />
      <ConstraintSection
        title="Orient Constraints"
        items={data.orientConstraints}
        onUpdate={updateOrientConstraint}
        onRemove={removeOrientConstraint}
        onAdd={addOrientConstraint}
        renderFields={renderOrientFields}
        disabled={disabled}
        createDefault={() => ({})}
      />
    </div>
  );
}
