import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Copy } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CAM_CMD } from "./cameraCommandHashes";
import { CameraShotChannelEditors } from "./CameraShotChannelEditors";
import {
  cameraFieldFloat,
  cameraFieldHex,
  cameraFieldUint,
  formatCameraHash,
  type CameraFieldSpec,
  type CameraTableEntry,
} from "./cameraTableDocument";
import { parseCameraHashValue } from "./cameraTableJson";
import type { CameraClipPack } from "./groupCameraPacks";

type CameraShotInspectorProps = {
  pack: CameraClipPack;
  shot: CameraTableEntry;
  packIndex: number;
  packTotal: number;
  shotIndex: number;
  duration: number;
  raw: number[] | undefined;
  specs: CameraFieldSpec[];
  writable: boolean;
  rawFieldsOpen: boolean;
  onRawFieldsOpenChange: (open: boolean) => void;
  onWriteFloat: (hash: number, value: number, overlay?: Partial<CameraTableEntry>) => void;
  onWriteUint: (hash: number, value: number) => void;
  onUpdateShot: (overlay: Partial<CameraTableEntry>) => void;
  onRenameEntryId: (entryId: number) => void;
  onApplyClipHash: (clipHash: number, wholePack: boolean) => void;
  onSelectShotIndex: (shotIndex: number) => void;
};

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px] text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function HashField({
  value,
  disabled,
  onCommit,
}: {
  value: number;
  disabled: boolean;
  onCommit: (next: number) => void;
}) {
  const formatted = formatCameraHash(value);
  const [text, setText] = useState(formatted);
  useEffect(() => {
    setText(formatted);
  }, [formatted]);

  const commit = () => {
    const parsed = parseCameraHashValue(text.trim());
    if (parsed == null || parsed === 0) {
      setText(formatted);
      return;
    }
    if ((parsed >>> 0) === (value >>> 0)) {
      setText(formatted);
      return;
    }
    onCommit(parsed >>> 0);
  };

  return (
    <Input
      value={text}
      disabled={disabled}
      spellCheck={false}
      className="h-9 font-mono text-xs tabular-nums"
      onChange={(event) => setText(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          commit();
        }
        if (event.key === "Escape") setText(formatted);
      }}
    />
  );
}

export function CameraShotInspector({
  pack,
  shot,
  packIndex,
  packTotal,
  shotIndex,
  duration,
  raw,
  specs,
  writable,
  rawFieldsOpen,
  onRawFieldsOpenChange,
  onWriteFloat,
  onWriteUint,
  onUpdateShot,
  onRenameEntryId,
  onApplyClipHash,
  onSelectShotIndex,
}: CameraShotInspectorProps) {
  const { t } = useTranslation("test-lists");
  const fieldClass = "h-9 font-mono text-xs tabular-nums";
  const canPrev = shotIndex > 0;
  const canNext = shotIndex + 1 < pack.shots.length;
  const clipTextDefault = formatCameraHash(shot.clipHash);
  const [clipText, setClipText] = useState(clipTextDefault);
  useEffect(() => {
    setClipText(clipTextDefault);
  }, [clipTextDefault, shot.entryIndex]);

  const commitClipHash = (wholePack: boolean) => {
    const parsed = parseCameraHashValue(clipText.trim());
    if (parsed == null || parsed === 0) {
      setClipText(clipTextDefault);
      return;
    }
    onApplyClipHash(parsed >>> 0, wholePack);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-8 shrink-0 items-center justify-between gap-2 border-b px-2">
        <span className="text-[11px] font-medium text-muted-foreground">{t("cameraTable.inspector")}</span>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            disabled={!canPrev}
            title={t("cameraTable.inspectorPrev")}
            aria-label={t("cameraTable.inspectorPrev")}
            onClick={() => onSelectShotIndex(shotIndex - 1)}
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            disabled={!canNext}
            title={t("cameraTable.inspectorNext")}
            aria-label={t("cameraTable.inspectorNext")}
            onClick={() => onSelectShotIndex(shotIndex + 1)}
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </Button>
          <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
            {t("cameraTable.entryListMeta", { index: packIndex, total: packTotal })}
          </span>
        </div>
      </div>
      <div className="custom-scrollbar-thin min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-2">
        <div className="space-y-1.5">
          <Label className="text-[11px] font-medium text-muted-foreground">{t("cameraTable.clipHash")}</Label>
          <div className="flex items-center gap-1">
            <Input
              value={clipText}
              disabled={!writable}
              spellCheck={false}
              className="h-9 font-mono text-xs tabular-nums"
              onChange={(event) => setClipText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  commitClipHash(pack.shots.length > 1);
                }
                if (event.key === "Escape") setClipText(clipTextDefault);
              }}
            />
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-10 w-10 shrink-0 transition-[background-color,transform] duration-150 ease-out active:scale-[0.96]"
              title={t("cameraTable.copyHash")}
              onClick={() => {
                void navigator.clipboard.writeText(formatCameraHash(shot.clipHash)).then(
                  () => toast.success(t("cameraTable.hashCopied")),
                  () => toast.error(t("cameraTable.hashCopyFailed")),
                );
              }}
            >
              <Copy className="h-3.5 w-3.5" />
            </Button>
          </div>
          {writable ? (
            <div className="flex flex-wrap gap-1">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 px-2 text-[10px]"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => commitClipHash(false)}
              >
                {t("cameraTable.applyClipHashToShot")}
              </Button>
              {pack.shots.length > 1 ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-[10px]"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => commitClipHash(true)}
                >
                  {t("cameraTable.applyClipHashToPack")}
                </Button>
              ) : null}
            </div>
          ) : null}
          <p className="text-[11px] text-pretty text-muted-foreground">{t("cameraTable.clipHashHint")}</p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Field label={t("cameraTable.sortKey")}>
            <Input value={String(shot.sortKey)} readOnly className={fieldClass} />
          </Field>
          <Field label={t("cameraTable.rowId")}>
            <HashField value={shot.entryId} disabled={!writable} onCommit={onRenameEntryId} />
          </Field>
          <Field label={t("cameraTable.duration")}>
            <Input
              type="number"
              value={Number.isFinite(duration) ? duration : 0}
              disabled={!writable}
              onChange={(event) => {
                const next = Number(event.target.value);
                if (Number.isFinite(next)) onWriteFloat(CAM_CMD.duration, next);
              }}
              className={fieldClass}
            />
          </Field>
          <Field label={t("cameraTable.fov")}>
            <Input
              value={shot.fov == null ? "" : String(shot.fov)}
              placeholder={t("cameraTable.fovInherit")}
              disabled={!writable}
              onChange={(event) => {
                const text = event.target.value.trim();
                if (!text) {
                  onUpdateShot({ fov: null });
                  return;
                }
                const next = Number(text);
                if (Number.isFinite(next)) onUpdateShot({ fov: next });
              }}
              className={fieldClass}
            />
          </Field>
          <Field label={t("cameraTable.offset")}>
            <Input
              type="number"
              value={Number.isFinite(shot.offset) ? shot.offset : 0}
              disabled={!writable}
              onChange={(event) => {
                const next = Number(event.target.value);
                if (Number.isFinite(next)) onUpdateShot({ offset: next });
              }}
              className={fieldClass}
            />
          </Field>
          <Field label={t("cameraTable.firstShot")}>
            <Input
              type="number"
              value={shot.firstShot}
              disabled={!writable}
              onChange={(event) => {
                const next = Number.parseInt(event.target.value, 10);
                if (Number.isFinite(next)) onUpdateShot({ firstShot: next >>> 0 });
              }}
              className={fieldClass}
            />
          </Field>
        </div>
        <p className="text-[11px] text-pretty text-muted-foreground">{t("cameraTable.rowIdHint")}</p>

        <p className="font-mono text-[10px] tabular-nums text-muted-foreground">
          {t("cameraTable.shotN", { n: shotIndex + 1, sort: shot.sortKey })}
        </p>

        <CameraShotChannelEditors
          raw={raw}
          specs={specs}
          disabled={!writable}
          onWriteFloat={onWriteFloat}
          onWriteUint={onWriteUint}
        />

        <details className="rounded-md border border-border/60 bg-muted/20 px-2 py-1.5">
          <summary className="cursor-pointer select-none text-[11px] text-muted-foreground">
            {t("cameraTable.clockNotes")}
          </summary>
          <p className="mt-1.5 text-[11px] text-pretty text-muted-foreground">{t("cameraTable.previewHint")}</p>
        </details>

        <Collapsible open={rawFieldsOpen} onOpenChange={onRawFieldsOpenChange}>
          <CollapsibleTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-9 px-2 text-[11px] transition-[background-color,transform] duration-150 ease-out active:scale-[0.96]"
            >
              {t("cameraTable.rawFields")}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="mt-1 max-h-48 overflow-auto rounded-md border bg-background/60 p-2 font-mono text-[10px]">
              {specs.map((spec) => (
                <div key={spec.hash} className="flex justify-between gap-2 py-0.5">
                  <span>
                    {formatCameraHash(spec.hash)} +0x{spec.entryOffset.toString(16)}
                  </span>
                  <span className="tabular-nums">
                    {spec.kind === 5
                      ? String(cameraFieldFloat(raw, spec.entryOffset))
                      : formatCameraHash(cameraFieldUint(raw, spec.entryOffset))}{" "}
                    {cameraFieldHex(raw, spec.entryOffset)}
                  </span>
                </div>
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>
    </div>
  );
}
