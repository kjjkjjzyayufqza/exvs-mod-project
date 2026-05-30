import { useState } from "react";
import { createPortal } from "react-dom";
import { Rnd } from "react-rnd";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TextureFormatSelect, type DdsFormat } from "./TextureFormatSelect";
import { DEFAULT_DDS_FORMAT } from "../utils/sceneTextureDdsFormat";
import type { TextureManagerEntry } from "../store/sceneTextureManagerStore";

const VIEWPORT_MARGIN = 32;

function getViewportSize() {
  if (typeof window === "undefined") return { width: 1280, height: 800 };
  return { width: window.innerWidth, height: window.innerHeight };
}

interface TextureReplaceModalProps {
  entry: TextureManagerEntry;
  onClose: () => void;
  onConfirm: (ddsFormat: DdsFormat) => void;
}

export function TextureReplaceModal({ entry, onClose, onConfirm }: TextureReplaceModalProps) {
  const [ddsFormat, setDdsFormat] = useState<DdsFormat>(DEFAULT_DDS_FORMAT);

  const { width: vw, height: vh } = getViewportSize();
  const modalWidth = Math.min(380, vw - VIEWPORT_MARGIN * 2);
  const modalHeight = 200;

  const content = (
    <div className="fixed inset-0 z-50 pointer-events-none">
      <Rnd
        default={{
          x: Math.round((vw - modalWidth) / 2),
          y: Math.round((vh - modalHeight) / 2),
          width: modalWidth,
          height: modalHeight,
        }}
        minWidth={300}
        minHeight={180}
        maxWidth={vw - VIEWPORT_MARGIN}
        maxHeight={vh - VIEWPORT_MARGIN}
        dragHandleClassName="texture-replace-drag-handle"
        cancel="button, input, textarea, select, label, a, [data-no-drag]"
        bounds="window"
        className="pointer-events-auto"
        enableResizing={false}
        style={{ zIndex: 60 }}
      >
        <div className="flex flex-col h-full bg-background border border-border rounded-lg shadow-xl overflow-hidden">
          <div className="texture-replace-drag-handle flex items-center justify-between px-3 py-1.5 bg-muted/40 border-b cursor-move select-none shrink-0">
            <span className="text-xs font-medium truncate mr-2">
              Replace: {entry.filename}
            </span>
            <Button variant="ghost" size="icon" className="h-5 w-5" data-no-drag onClick={onClose}>
              <X className="h-3 w-3" />
            </Button>
          </div>

          <div className="flex flex-col gap-3 p-4 flex-1">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">DDS Format for conversion</label>
              <TextureFormatSelect
                value={ddsFormat}
                onChange={setDdsFormat}
                triggerClassName="h-8 text-xs w-full"
              />
            </div>

            <div className="flex items-center gap-2 mt-auto">
              <Button variant="outline" size="sm" className="flex-1 text-xs" onClick={onClose}>
                Cancel
              </Button>
              <Button size="sm" className="flex-1 text-xs" onClick={() => onConfirm(ddsFormat)}>
                Select File & Replace
              </Button>
            </div>
          </div>
        </div>
      </Rnd>
    </div>
  );

  return createPortal(content, document.body);
}
