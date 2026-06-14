import { useCallback, useId } from "react";
import { createPortal } from "react-dom";
import { FileBox } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SsbhDaeExchangePanel } from "@/components/ssbh-model-preview/SsbhDaeExchangePanel";
import {
  SCENE_EDIT_RND_VIEWPORT_MARGIN,
  SSBH_MAX_WIDTH,
  type SceneEditRndModalDimensions,
} from "@/page/SceneEdit/components/sceneEditRndModalUtils";
import { UNIT_MODEL_EDIT_RND_SIZE_KEYS } from "../utils/unitModelEditorSettings";
import { UnitModelFloatingModalShell } from "./UnitModelFloatingModalShell";

const UNIT_MODEL_DAE_MODAL_LAYER_ID = "unit-model-dae-exchange-modal-layer";

function getDaeExchangeModalDimensions(): SceneEditRndModalDimensions {
  const vw = typeof window === "undefined" ? 1280 : window.innerWidth;
  const vh = typeof window === "undefined" ? 800 : window.innerHeight;
  const maxWidth = Math.max(320, vw - SCENE_EDIT_RND_VIEWPORT_MARGIN);
  const maxHeight = Math.max(280, vh - SCENE_EDIT_RND_VIEWPORT_MARGIN);
  const width = Math.min(maxWidth, SSBH_MAX_WIDTH, Math.max(560, Math.round(vw * 0.68)));
  const height = Math.min(maxHeight, 720, Math.max(400, Math.round(vh * 0.78)));

  return {
    width,
    height,
    minWidth: Math.min(maxWidth, 480),
    minHeight: 320,
    maxWidth,
    maxHeight,
  };
}

type UnitModelDaeExchangeModalProps = {
  open: boolean;
  onClose: () => void;
  onViewportSuspendChange?: (suspended: boolean) => void;
};

export function UnitModelDaeExchangeModal({
  open,
  onClose,
  onViewportSuspendChange,
}: UnitModelDaeExchangeModalProps) {
  const titleId = useId();
  const getDimensions = useCallback(() => getDaeExchangeModalDimensions(), []);

  if (!open || typeof document === "undefined") {
    return null;
  }

  let modalLayer = document.getElementById(UNIT_MODEL_DAE_MODAL_LAYER_ID);
  if (!modalLayer) {
    modalLayer = document.createElement("div");
    modalLayer.id = UNIT_MODEL_DAE_MODAL_LAYER_ID;
    modalLayer.className = "pointer-events-none fixed inset-0 z-[var(--z-modal)]";
    document.body.appendChild(modalLayer);
  }

  return createPortal(
    <UnitModelFloatingModalShell
      cascadeIndex={0}
      zIndex={1}
      titleId={titleId}
      title="DAE / FBX to SSBH"
      subtitle="Import static mesh, configure materials, export SSBH bundle"
      headerIcon={<FileBox className="h-4 w-4 text-primary" />}
      onClose={onClose}
      getDimensions={getDimensions}
      sizeStorageKey={UNIT_MODEL_EDIT_RND_SIZE_KEYS.daeExchange}
      onViewportSuspendChange={onViewportSuspendChange}
    >
      <ScrollArea className="h-full min-h-0">
        <div className="p-4">
          <SsbhDaeExchangePanel />
        </div>
      </ScrollArea>
    </UnitModelFloatingModalShell>,
    modalLayer,
  );
}
