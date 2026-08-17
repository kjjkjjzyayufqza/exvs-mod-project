import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import { Loader2, Replace } from "lucide-react";
import { AppRndModalShell } from "@/components/AppRndModalShell";
import { Button } from "@/components/ui/button";
import { TextureFormatSelect, type DdsFormat } from "./TextureFormatSelect";
import {
  DEFAULT_DDS_FORMAT,
  normalizeDdsFormat,
  resolveDetectedDdsFormat,
} from "../utils/sceneTextureDdsFormat";
import type { TextureManagerEntry } from "../store/sceneTextureManagerStore";

const TEXTURE_REPLACE_MODAL_DIMENSIONS = {
  width: 380,
  height: 220,
  minWidth: 300,
  minHeight: 200,
};

interface TextureReplaceModalProps {
  entry: TextureManagerEntry;
  onClose: () => void;
  onConfirm: (ddsFormat: DdsFormat) => void;
}

export function TextureReplaceModal({ entry, onClose, onConfirm }: TextureReplaceModalProps) {
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
      title={`Replace: ${entry.filename}`}
      subtitle="Choose the conversion format before selecting a source file"
      headerIcon={<Replace className="h-4 w-4 text-primary" />}
      dimensions={TEXTURE_REPLACE_MODAL_DIMENSIONS}
      onClose={onClose}
      resizable={false}
    >
          <div className="flex flex-col gap-3 p-4 flex-1">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">
                DDS Format for conversion
                {formatLoading ? (
                  <span className="ml-1.5 inline-flex items-center gap-1 text-[10px] text-muted-foreground/80">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    detecting original…
                  </span>
                ) : null}
              </label>
              <TextureFormatSelect
                value={ddsFormat}
                onChange={setDdsFormat}
                disabled={formatLoading}
                triggerClassName="h-8 text-xs w-full"
              />
            </div>

            <div className="flex items-center gap-2 mt-auto">
              <Button variant="outline" size="sm" className="flex-1 text-xs" onClick={onClose}>
                Cancel
              </Button>
              <Button
                size="sm"
                className="flex-1 text-xs"
                disabled={formatLoading}
                onClick={() => onConfirm(ddsFormat)}
              >
                Select File & Replace
              </Button>
            </div>
          </div>
    </AppRndModalShell>
  );

  return createPortal(content, document.body);
}
