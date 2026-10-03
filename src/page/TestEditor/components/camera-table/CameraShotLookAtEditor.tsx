import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CAM_CMD } from "./cameraCommandHashes";
import { OptionalFloatInput } from "./CameraShotChannelEditors";
import {
  cameraSpecOffset,
  readCameraFloatHash,
  readCameraUintHash,
  type CameraFieldSpec,
} from "./cameraTableDocument";

const TARGET_FIELDS = [
  { id: "positionTarget", hash: CAM_CMD.positionTarget },
  { id: "orientationTarget", hash: CAM_CMD.orientationTarget },
  { id: "distanceScale", hash: CAM_CMD.distanceScale },
  { id: "offsetEase", hash: CAM_CMD.offsetEase },
] as const;

const OFFSET_AXES = [
  { id: "x", start: CAM_CMD.offsetX, end: CAM_CMD.offsetXEnd },
  { id: "y", start: CAM_CMD.offset, end: CAM_CMD.offsetYEnd },
  { id: "z", start: CAM_CMD.offsetZ, end: CAM_CMD.offsetZEnd },
] as const;

type CameraShotLookAtEditorProps = {
  raw: number[] | undefined;
  specs: CameraFieldSpec[];
  disabled: boolean;
  onWriteFloat: (hash: number, value: number) => void;
  onWriteUint: (hash: number, value: number) => void;
};

/** Look-at origin, frame and offset of one shot (sub_140643640 / sub_1406441B0 / sub_140644930). */
export function CameraShotLookAtEditor({
  raw,
  specs,
  disabled,
  onWriteFloat,
  onWriteUint,
}: CameraShotLookAtEditorProps) {
  const { t } = useTranslation("test-lists");
  const missing = (hash: number) => cameraSpecOffset(specs, hash) == null;

  return (
    <div className="space-y-1.5">
      <Label className="text-[11px] font-medium text-muted-foreground">{t("cameraTable.lookAt.title")}</Label>
      <div className="rounded-md border border-border/60 bg-muted/15 p-1.5">
        <div className="grid grid-cols-2 gap-1">
          {TARGET_FIELDS.map((field) => (
            <div key={field.id} className="space-y-0.5">
              <span className="block text-[9px] uppercase tracking-wide text-muted-foreground">
                {t(`cameraTable.lookAt.${field.id}`)}
              </span>
              <Input
                type="number"
                min={0}
                value={readCameraUintHash(raw, specs, field.hash)}
                disabled={disabled || missing(field.hash)}
                onChange={(event) => {
                  const next = Number.parseInt(event.target.value, 10);
                  if (Number.isFinite(next)) onWriteUint(field.hash, next >>> 0);
                }}
                className="h-8 px-2 font-mono text-[11px] tabular-nums"
              />
            </div>
          ))}
        </div>
        <div className="mt-1.5 grid grid-cols-[auto_1fr_1fr] items-center gap-1">
          <span />
          <span className="text-[9px] uppercase tracking-wide text-muted-foreground">{t("cameraTable.lookAt.start")}</span>
          <span className="text-[9px] uppercase tracking-wide text-muted-foreground">{t("cameraTable.lookAt.end")}</span>
          {OFFSET_AXES.map((axis) => (
            <div key={axis.id} className="contents">
              <span className="pr-1 text-[11px] font-medium">{t(`cameraTable.lookAt.axis_${axis.id}`)}</span>
              <OptionalFloatInput
                value={readCameraFloatHash(raw, specs, axis.start)}
                disabled={disabled || missing(axis.start)}
                placeholder="0"
                onCommit={(next) => onWriteFloat(axis.start, next)}
              />
              <OptionalFloatInput
                value={readCameraFloatHash(raw, specs, axis.end)}
                disabled={disabled || missing(axis.end)}
                placeholder={t("cameraTable.lookAt.endHold")}
                onCommit={(next) => onWriteFloat(axis.end, next)}
              />
            </div>
          ))}
        </div>
      </div>
      <p className="text-[11px] text-pretty text-muted-foreground">{t("cameraTable.lookAt.hint")}</p>
    </div>
  );
}
