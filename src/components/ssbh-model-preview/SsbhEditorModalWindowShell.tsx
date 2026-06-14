import { useCallback, type ReactNode } from "react";
import {
  SceneEditRndModalShell,
  type ModalViewportSuspendInteraction,
} from "@/page/SceneEdit/components/SceneEditRndModalShell";
import {
  SCENE_EDIT_RND_VIEWPORT_MARGIN,
  type SceneEditRndModalDimensions,
} from "@/page/SceneEdit/components/sceneEditRndModalUtils";

export type { ModalViewportSuspendInteraction };

type SsbhEditorModalKind = "numdlb" | "nuhlpb" | "numatb" | "jnttbl" | "effectProject";

const NOOP_VIEWPORT_SUSPEND: ModalViewportSuspendInteraction = {
  startViewportSuspend: () => {},
  stopViewportSuspend: () => {},
  onDragHandlePointerDownCapture: () => {},
};

type SizeConfig = {
  widthRatio: number;
  heightRatio: number;
  minWidth: number;
  minHeight: number;
  maxWidth: number;
  maxHeight: number;
};

const SIZE_CONFIGS: Record<SsbhEditorModalKind, SizeConfig> = {
  numdlb: {
    widthRatio: 0.58,
    heightRatio: 0.72,
    minWidth: 520,
    minHeight: 320,
    maxWidth: 900,
    maxHeight: 760,
  },
  nuhlpb: {
    widthRatio: 0.58,
    heightRatio: 0.72,
    minWidth: 520,
    minHeight: 320,
    maxWidth: 900,
    maxHeight: 760,
  },
  numatb: {
    widthRatio: 0.72,
    heightRatio: 0.82,
    minWidth: 640,
    minHeight: 420,
    maxWidth: 1080,
    maxHeight: 860,
  },
  jnttbl: {
    widthRatio: 0.58,
    heightRatio: 0.72,
    minWidth: 520,
    minHeight: 340,
    maxWidth: 920,
    maxHeight: 760,
  },
  effectProject: {
    widthRatio: 0.68,
    heightRatio: 0.82,
    minWidth: 600,
    minHeight: 420,
    maxWidth: 1040,
    maxHeight: 860,
  },
};

const SIZE_KEYS: Record<SsbhEditorModalKind, string> = {
  numdlb: "ssbh-file-editor.rnd-size.numdlb",
  nuhlpb: "ssbh-file-editor.rnd-size.nuhlpb",
  numatb: "ssbh-file-editor.rnd-size.numatb",
  jnttbl: "ssbh-file-editor.rnd-size.jnttbl",
  effectProject: "ssbh-file-editor.rnd-size.effect-project",
};

function getViewportSize() {
  if (typeof window === "undefined") {
    return { width: 1280, height: 800 };
  }
  return { width: window.innerWidth, height: window.innerHeight };
}

function getSsbhEditorModalDimensions(kind: SsbhEditorModalKind): SceneEditRndModalDimensions {
  const config = SIZE_CONFIGS[kind];
  const { width: vw, height: vh } = getViewportSize();
  const maxWidth = Math.max(320, vw - SCENE_EDIT_RND_VIEWPORT_MARGIN);
  const maxHeight = Math.max(280, vh - SCENE_EDIT_RND_VIEWPORT_MARGIN);
  const minWidth = Math.min(maxWidth, config.minWidth);
  const minHeight = Math.min(maxHeight, config.minHeight);
  const width = Math.min(maxWidth, config.maxWidth, Math.max(minWidth, Math.round(vw * config.widthRatio)));
  const height = Math.min(maxHeight, config.maxHeight, Math.max(minHeight, Math.round(vh * config.heightRatio)));

  return {
    width,
    height,
    minWidth,
    minHeight,
    maxWidth,
    maxHeight,
  };
}

export function isSsbhEditorDialogActive(titleId: string): boolean {
  const title = document.getElementById(titleId);
  const dialog = title?.closest<HTMLElement>('[role="dialog"]');
  const active = document.activeElement;
  return Boolean(dialog && active && dialog.contains(active));
}

type SsbhEditorModalWindowShellProps = {
  kind: SsbhEditorModalKind;
  cascadeIndex: number;
  zIndex: number;
  titleId: string;
  title: string;
  subtitle: string;
  headerIcon: ReactNode;
  onActivate: () => void;
  onClose: () => void;
  closeDisabled?: boolean;
  skipActivate?: boolean;
  viewportSuspend?: ModalViewportSuspendInteraction;
  children: ReactNode;
  footer?: ReactNode;
};

export function SsbhEditorModalWindowShell({
  kind,
  cascadeIndex,
  zIndex,
  titleId,
  title,
  subtitle,
  headerIcon,
  onActivate,
  onClose,
  closeDisabled,
  skipActivate,
  viewportSuspend,
  children,
  footer,
}: SsbhEditorModalWindowShellProps) {
  const getDimensions = useCallback(() => getSsbhEditorModalDimensions(kind), [kind]);

  return (
    <SceneEditRndModalShell
      cascadeIndex={cascadeIndex}
      zIndex={zIndex}
      titleId={titleId}
      title={title}
      subtitle={subtitle}
      headerIcon={headerIcon}
      onActivate={onActivate}
      onClose={onClose}
      closeDisabled={closeDisabled}
      getDimensions={getDimensions}
      sizeStorageKey={SIZE_KEYS[kind]}
      skipActivate={skipActivate}
      viewportSuspend={viewportSuspend ?? NOOP_VIEWPORT_SUSPEND}
      footer={footer}
    >
      {children}
    </SceneEditRndModalShell>
  );
}
