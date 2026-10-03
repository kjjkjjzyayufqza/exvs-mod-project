import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CAM_CMD } from "./cameraCommandHashes";
import {
  cameraSpecOffset,
  readCameraFloatHash,
  readCameraUintHash,
  type CameraFieldSpec,
} from "./cameraTableDocument";

type ChannelId = "pitch" | "yaw" | "distance" | "roll" | "fieldOfView";

const DEGREE_CHANNELS = new Set<ChannelId>(["pitch", "yaw", "roll", "fieldOfView"]);

type ChannelDef = {
  id: ChannelId;
  hashes: { mode: number; v0: number; v1: number; v2: number; v3: number };
};

const CHANNELS: ChannelDef[] = [
  {
    id: "pitch",
    hashes: {
      mode: CAM_CMD.pitchMode,
      v0: CAM_CMD.pitchV0,
      v1: CAM_CMD.pitchV1,
      v2: CAM_CMD.pitchV2,
      v3: CAM_CMD.pitchV3,
    },
  },
  {
    id: "yaw",
    hashes: {
      mode: CAM_CMD.yawMode,
      v0: CAM_CMD.yawV0,
      v1: CAM_CMD.yawV1,
      v2: CAM_CMD.yawV2,
      v3: CAM_CMD.yawV3,
    },
  },
  {
    id: "distance",
    hashes: {
      mode: CAM_CMD.fovMode,
      v0: CAM_CMD.fovV0,
      v1: CAM_CMD.fovV1,
      v2: CAM_CMD.fovV2,
      v3: CAM_CMD.fovV3,
    },
  },
  {
    id: "roll",
    hashes: {
      mode: CAM_CMD.ch3Mode,
      v0: CAM_CMD.ch3V0,
      v1: CAM_CMD.ch3V1,
      v2: CAM_CMD.ch3V2,
      v3: CAM_CMD.ch3V3,
    },
  },
  {
    id: "fieldOfView",
    hashes: {
      mode: CAM_CMD.ch4Mode,
      v0: CAM_CMD.ch4V0,
      v1: CAM_CMD.ch4V1,
      v2: CAM_CMD.ch4V2,
      v3: CAM_CMD.ch4V3,
    },
  },
];

type CameraShotChannelEditorsProps = {
  raw: number[] | undefined;
  specs: CameraFieldSpec[];
  disabled: boolean;
  onWriteFloat: (hash: number, value: number) => void;
  onWriteUint: (hash: number, value: number) => void;
};

/**
 * Commits on Enter or blur, so partial text such as "-" or "1." can be typed. Empty text writes
 * NaN (the authored inherit / hold marker); text that is not a number reverts.
 */
export function OptionalFloatInput({
  value,
  disabled,
  placeholder,
  onCommit,
}: {
  value: number;
  disabled: boolean;
  placeholder: string;
  onCommit: (next: number) => void;
}) {
  const formatted = Number.isFinite(value) ? String(value) : "";
  const [text, setText] = useState(formatted);
  useEffect(() => {
    setText(formatted);
  }, [formatted]);

  const commit = () => {
    const trimmed = text.trim();
    if (!trimmed) {
      if (Number.isFinite(value)) onCommit(Number.NaN);
      return;
    }
    const next = Number(trimmed);
    if (!Number.isFinite(next)) {
      setText(formatted);
      return;
    }
    if (next !== value) onCommit(next);
  };

  return (
    <Input
      value={text}
      placeholder={placeholder}
      disabled={disabled}
      spellCheck={false}
      onChange={(event) => setText(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          commit();
        }
        if (event.key === "Escape") setText(formatted);
      }}
      className="h-8 px-2 font-mono text-[11px] tabular-nums"
    />
  );
}

export function CameraShotChannelEditors({
  raw,
  specs,
  disabled,
  onWriteFloat,
  onWriteUint,
}: CameraShotChannelEditorsProps) {
  const { t } = useTranslation("test-lists");
  const nanLabel = t("cameraTable.inheritNan");

  return (
    <div className="space-y-1.5">
      <Label className="text-[11px] font-medium text-muted-foreground">{t("cameraTable.channels")}</Label>
      <div className="space-y-1.5">
        {CHANNELS.map((channel) => {
          const missing = cameraSpecOffset(specs, channel.hashes.v0) == null;
          const rowDisabled = disabled || missing;
          const unit = DEGREE_CHANNELS.has(channel.id) ? " deg" : "";
          return (
            <div key={channel.id} className="rounded-md border border-border/60 bg-muted/15 p-1.5">
              <div className="mb-1.5 flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-[11px] font-medium">
                  {t(`cameraTable.channel_${channel.id}`)}
                  {unit}
                </span>
                <span className="text-[10px] text-muted-foreground">{t("cameraTable.easeAuthored")}</span>
                <Input
                  type="number"
                  min={0}
                  max={6}
                  value={readCameraUintHash(raw, specs, channel.hashes.mode)}
                  disabled={rowDisabled}
                  onChange={(event) => {
                    const next = Number.parseInt(event.target.value, 10);
                    if (Number.isFinite(next)) onWriteUint(channel.hashes.mode, next >>> 0);
                  }}
                  className="h-8 w-14 px-2 font-mono text-[11px] tabular-nums"
                />
              </div>
              <div className="grid grid-cols-2 gap-1">
                {(["v0", "v1", "v2", "v3"] as const).map((key) => (
                  <div key={key} className="space-y-0.5">
                    <span className="block text-[9px] uppercase tracking-wide text-muted-foreground">{key}</span>
                    <OptionalFloatInput
                      value={readCameraFloatHash(raw, specs, channel.hashes[key])}
                      disabled={rowDisabled}
                      placeholder={nanLabel}
                      onCommit={(next) => onWriteFloat(channel.hashes[key], next)}
                    />
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-[11px] text-pretty text-muted-foreground">{t("cameraTable.channelHint")}</p>
    </div>
  );
}
