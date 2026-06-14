import { useState } from "react";
import { createPortal } from "react-dom";
import { Replace } from "lucide-react";
import { AppRndModalShell } from "@/components/AppRndModalShell";
import { Button } from "@/components/ui/button";
import { TextureFormatSelect, type DdsFormat } from "./TextureFormatSelect";
import { DEFAULT_DDS_FORMAT } from "../utils/sceneTextureDdsFormat";
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
  const [ddsFormat, setDdsFormat] = useState<DdsFormat>(DEFAULT_DDS_FORMAT);

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
    </AppRndModalShell>
  );

  return createPortal(content, document.body);
}
