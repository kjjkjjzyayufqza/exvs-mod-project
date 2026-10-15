import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { createPortal } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import { Loader2, Replace } from "lucide-react";
import { AppRndModalShell } from "@/components/AppRndModalShell";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { TextureFormatSelect, type DdsFormat } from "./TextureFormatSelect";
import {
  DEFAULT_DDS_FORMAT,
  normalizeDdsFormat,
  resolveDetectedDdsFormat,
} from "../utils/sceneTextureDdsFormat";
import type { TextureManagerEntry } from "../store/sceneTextureManagerStore";

const TEXTURE_REPLACE_MODAL_DIMENSIONS = {
  width: 400,
  height: 280,
  minWidth: 320,
  minHeight: 240,
};

const REPLACE_ACTION_BUTTON_CLASS =
  "h-10 flex-1 text-xs transition-[transform,background-color,box-shadow,color] duration-150 ease-out active:scale-[0.96] motion-reduce:active:scale-100 motion-reduce:transition-none";

const REPLACE_PROGRESS_CSS = `
@keyframes scene-texture-replace-enter {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes scene-texture-replace-slide {
  0% { transform: translateX(-120%); }
  100% { transform: translateX(280%); }
}
.scene-texture-replace-enter {
  animation: scene-texture-replace-enter 180ms ease-out both;
}
.scene-texture-replace-bar {
  animation: scene-texture-replace-slide 1.15s ease-in-out infinite;
}
@media (prefers-reduced-motion: reduce) {
  .scene-texture-replace-enter,
  .scene-texture-replace-bar {
    animation: none;
  }
  .scene-texture-replace-bar {
    width: 100% !important;
    transform: none;
    opacity: 0.72;
  }
}
`;

interface TextureReplaceModalProps {
  entry: TextureManagerEntry;
  onClose: () => void;
  onConfirm: (ddsFormat: DdsFormat) => void;
  /** True while the chosen file is being written. */
  working?: boolean;
  /** True from confirm until the job ends, including the file picker. */
  locked?: boolean;
}

export function TextureReplaceModal({
  entry,
  onClose,
  onConfirm,
  working = false,
  locked = false,
}: TextureReplaceModalProps) {
  const { t } = useTranslation("scene-texture-dialogs");
  const initialFromEntry = normalizeDdsFormat(entry.format);
  const [ddsFormat, setDdsFormat] = useState<DdsFormat>(initialFromEntry || DEFAULT_DDS_FORMAT);
  const [formatLoading, setFormatLoading] = useState(Boolean(entry.nutexbPath));

  useEffect(() => {
    const nutexbPath = entry.nutexbPath?.trim();
    if (!nutexbPath) {
      setDdsFormat(normalizeDdsFormat(entry.format));
      setFormatLoading(false);
      return;
    }

    let cancelled = false;
    setFormatLoading(true);

    invoke<string>("card_icon_detect_dds_format", { nutexbPath })
      .then((rustFormat) => {
        if (cancelled) return;
        const fromRust = resolveDetectedDdsFormat(rustFormat);
        setDdsFormat(fromRust ?? normalizeDdsFormat(entry.format));
      })
      .catch(() => {
        if (cancelled) return;
        setDdsFormat(normalizeDdsFormat(entry.format));
      })
      .finally(() => {
        if (!cancelled) {
          setFormatLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [entry.nutexbPath, entry.format]);

  const content = (
    <AppRndModalShell
      titleId="texture-replace-modal-title"
      title={t("textureReplace.title", { filename: entry.filename })}
      subtitle={working ? t("textureReplace.replacing") : t("textureReplace.subtitle")}
      headerIcon={<ReplaceHeaderIcon working={working} />}
      dimensions={TEXTURE_REPLACE_MODAL_DIMENSIONS}
      onClose={onClose}
      closeDisabled={locked}
      resizable={false}
    >
          <div className="flex flex-1 flex-col gap-3 p-4" aria-busy={working}>
            <style>{REPLACE_PROGRESS_CSS}</style>
            {working ? (
              <TextureReplaceProgress filename={entry.filename} />
            ) : (
              <div className="flex flex-col gap-1">
                <label className="text-xs text-pretty text-muted-foreground">
                  {t("textureReplace.ddsFormat")}
                  {formatLoading ? (
                    <span className="ml-1.5 inline-flex items-center gap-1 text-[10px] text-muted-foreground/80">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      {t("textureReplace.detecting")}
                    </span>
                  ) : null}
                </label>
                <TextureFormatSelect
                  value={ddsFormat}
                  onChange={setDdsFormat}
                  disabled={formatLoading || locked}
                  triggerClassName="h-10 text-xs w-full"
                />
              </div>
            )}

            <div className="mt-auto flex items-center gap-2">
              <Button
                variant="outline"
                className={REPLACE_ACTION_BUTTON_CLASS}
                onClick={onClose}
                disabled={locked}
              >
                {t("common.cancel")}
              </Button>
              <Button
                className={cn(
                  REPLACE_ACTION_BUTTON_CLASS,
                  working && "disabled:opacity-100",
                )}
                disabled={formatLoading || locked}
                onClick={() => onConfirm(ddsFormat)}
              >
                {working ? (
                  <>
                    <Loader2 className="animate-spin motion-reduce:animate-none" />
                    {t("textureReplace.replacing")}
                  </>
                ) : (
                  t("textureReplace.selectAndReplace")
                )}
              </Button>
            </div>
          </div>
    </AppRndModalShell>
  );

  return createPortal(content, document.body);
}

function ReplaceHeaderIcon({ working }: { working: boolean }) {
  const iconClass =
    "col-start-1 row-start-1 h-4 w-4 text-primary transition-[opacity,transform,filter] duration-150 ease-out motion-reduce:transition-none motion-reduce:blur-none";
  return (
    <span className="grid h-4 w-4 place-items-center" aria-hidden>
      <Replace
        className={cn(
          iconClass,
          working ? "scale-90 opacity-0 blur-[2px]" : "scale-100 opacity-100 blur-0",
        )}
      />
      <Loader2
        className={cn(
          iconClass,
          "animate-spin motion-reduce:animate-none",
          working ? "scale-100 opacity-100 blur-0" : "pointer-events-none scale-90 opacity-0 blur-[2px]",
        )}
      />
    </span>
  );
}

function TextureReplaceProgress({ filename }: { filename: string }) {
  const { t } = useTranslation("scene-texture-dialogs");
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const started = Date.now();
    const id = window.setInterval(() => {
      setSeconds(Math.floor((Date.now() - started) / 1000));
    }, 200);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="scene-texture-replace-enter flex flex-col gap-2">
      <div role="status" className="flex flex-col gap-2">
        <p className="text-xs font-medium text-balance text-foreground">
          {t("textureReplace.replacing")}
        </p>
        <p className="text-[11px] leading-relaxed text-pretty wrap-break-word text-muted-foreground">
          {t("textureReplace.replacingDetail", { filename })}
        </p>
      </div>
      <div
        className="relative h-2 overflow-hidden rounded-full bg-primary/15"
        role="progressbar"
        aria-label={t("textureReplace.replacing")}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className="scene-texture-replace-bar absolute inset-y-0 left-0 w-[38%] rounded-full bg-primary" />
      </div>
      <p className="text-[11px] leading-relaxed text-pretty text-muted-foreground">
        {t("textureReplace.replacingHint")}
      </p>
      <p className="text-[11px] tabular-nums text-muted-foreground" aria-hidden>
        {t("textureReplace.elapsed", { seconds })}
      </p>
    </div>
  );
}
