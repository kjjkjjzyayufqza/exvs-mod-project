import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
import { FileBox } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SsbhDaeExchangePanel } from "@/components/ssbh-model-preview/SsbhDaeExchangePanel";
import { SceneEditRndModalShell } from "@/page/SceneEdit/components/SceneEditRndModalShell";
import {
  SCENE_EDIT_RND_DRAG_HANDLE,
  SCENE_EDIT_RND_VIEWPORT_MARGIN,
  SSBH_MAX_WIDTH,
  type SceneEditRndModalDimensions,
} from "@/page/SceneEdit/components/sceneEditRndModalUtils";
import { UNIT_MODEL_EDIT_RND_SIZE_KEYS } from "../utils/unitModelEditorSettings";

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
  const activeSuspendRef = useRef(false);
  const viewportSuspend = useMemo(
    () => ({
      startViewportSuspend: () => {
        if (activeSuspendRef.current) return;
        activeSuspendRef.current = true;
        onViewportSuspendChange?.(true);
      },
      stopViewportSuspend: () => {
        if (!activeSuspendRef.current) return;
        activeSuspendRef.current = false;
        onViewportSuspendChange?.(false);
      },
      onDragHandlePointerDownCapture: (event: ReactPointerEvent) => {
        if (event.button !== 0) return;
        if (
          event.target instanceof HTMLElement &&
          (event.target.closest("button") ||
            event.target.closest(`.${SCENE_EDIT_RND_DRAG_HANDLE}`) === null)
        ) {
          return;
        }
        if (activeSuspendRef.current) return;
        activeSuspendRef.current = true;
        onViewportSuspendChange?.(true);
      },
    }),
    [onViewportSuspendChange],
  );

  useEffect(() => {
    return () => {
      if (!activeSuspendRef.current) return;
      activeSuspendRef.current = false;
      onViewportSuspendChange?.(false);
    };
  }, [onViewportSuspendChange]);

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
    <SceneEditRndModalShell
      cascadeIndex={0}
      zIndex={1}
      titleId={titleId}
      title="DAE / FBX to SSBH"
      subtitle="Import static mesh, configure materials, export SSBH bundle"
      headerIcon={<FileBox className="h-4 w-4 text-primary" />}
      onActivate={() => {}}
      onClose={onClose}
      getDimensions={getDimensions}
      sizeStorageKey={UNIT_MODEL_EDIT_RND_SIZE_KEYS.daeExchange}
      skipActivate
      viewportSuspend={viewportSuspend}
    >
      <ScrollArea className="h-full min-h-0">
        <div className="p-4">
          <SsbhDaeExchangePanel />
        </div>
      </ScrollArea>
    </SceneEditRndModalShell>,
    modalLayer,
  );
}
