import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useState,
  type ComponentProps,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Rnd } from "react-rnd";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { getFloatingWindowLayer } from "@/components/floatingWindowLayer";
import { useFloatingWindowStore } from "@/store/floatingWindowStore";
import { useSceneModalViewportSuspendInteraction } from "../hooks/useSceneModalViewportSuspendInteraction";
import {
  SCENE_EDIT_RND_DRAG_HANDLE,
  clampRndSizeToConstraints,
  clampSceneEditModalPosition,
  getSceneEditCascadePosition,
  type SceneEditRndModalDimensions,
} from "./sceneEditRndModalUtils";
import {
  persistSceneEditRndSize,
  resolveSceneEditRndInitialSize,
} from "./sceneEditRndSizePersistence";

/**
 * Pluggable "pause the host 3D viewport during a modal pointer interaction"
 * contract. Defaults to the Scene Editor store-backed hook; other hosts (e.g.
 * the Unit Model Editor) inject a callback-backed implementation so the shell
 * stays decoupled from any single viewport store.
 */
export type ModalViewportSuspendInteraction = {
  startViewportSuspend: () => void;
  stopViewportSuspend: () => void;
  onDragHandlePointerDownCapture: (event: ReactPointerEvent) => void;
};

type SceneEditRndModalShellProps = {
  cascadeIndex: number;
  zIndex: number;
  /** Stable unique id for app-wide z-ordering. Defaults to titleId. */
  windowId?: string;
  titleId: string;
  title: string;
  subtitle: string;
  headerIcon: ReactNode;
  onActivate: () => void;
  onClose: () => void;
  closeDisabled?: boolean;
  getDimensions: () => SceneEditRndModalDimensions;
  getInitialPosition?: (size: { width: number; height: number }) => { x: number; y: number };
  sizeStorageKey?: string;
  skipActivate?: boolean;
  /** Inject a host-specific viewport-suspend interaction. Defaults to the Scene store hook. */
  viewportSuspend?: ModalViewportSuspendInteraction;
  children: ReactNode;
  footer?: ReactNode;
};

export function SceneEditRndModalShell({
  cascadeIndex,
  zIndex,
  windowId,
  titleId,
  title,
  subtitle,
  headerIcon,
  onActivate,
  onClose,
  closeDisabled = false,
  getDimensions,
  getInitialPosition,
  sizeStorageKey,
  skipActivate = false,
  viewportSuspend,
  children,
  footer,
}: SceneEditRndModalShellProps) {
  const sceneViewportSuspend = useSceneModalViewportSuspendInteraction();
  const { startViewportSuspend, stopViewportSuspend, onDragHandlePointerDownCapture } =
    viewportSuspend ?? sceneViewportSuspend;

  // App-wide z-order. Every floating window shares one monotonic counter and one DOM layer, so
  // clicking any window (regardless of editor kind) raises it above all others (Windows-style).
  const resolvedWindowId = windowId ?? titleId;
  const bringToFront = useFloatingWindowStore((state) => state.bringToFront);
  const release = useFloatingWindowStore((state) => state.release);
  const storedZ = useFloatingWindowStore((state) => state.zById[resolvedWindowId]);
  const isActive = useFloatingWindowStore((state) => state.topId === resolvedWindowId);

  useLayoutEffect(() => {
    bringToFront(resolvedWindowId);
    return () => release(resolvedWindowId);
  }, [resolvedWindowId, bringToFront, release]);

  const raise = useCallback(() => {
    bringToFront(resolvedWindowId);
  }, [bringToFront, resolvedWindowId]);

  // Fall back to the caller-provided z only for the first paint before registration lands.
  const effectiveZ = storedZ ?? zIndex;
  const [constraints, setConstraints] = useState(getDimensions);
  const [size, setSize] = useState(() => {
    const dims = getDimensions();
    return resolveSceneEditRndInitialSize(sizeStorageKey, dims);
  });
  const [position, setPosition] = useState(() => {
    const dims = getDimensions();
    const initialSize = resolveSceneEditRndInitialSize(sizeStorageKey, dims);
    return getInitialPosition?.(initialSize) ?? getSceneEditCascadePosition(initialSize, cascadeIndex);
  });

  useEffect(() => {
    const dims = getDimensions();
    setConstraints(dims);
    setSize((prev) => {
      const next = sizeStorageKey
        ? resolveSceneEditRndInitialSize(sizeStorageKey, dims)
        : clampRndSizeToConstraints(prev, dims);
      setPosition(getInitialPosition?.(next) ?? getSceneEditCascadePosition(next, cascadeIndex));
      return next;
    });
  }, [cascadeIndex, getDimensions, getInitialPosition, sizeStorageKey]);

  useEffect(() => {
    const onResize = () => {
      const dims = getDimensions();
      setConstraints(dims);
      setSize((prev) => {
        const next = clampRndSizeToConstraints(prev, dims);
        setPosition((pos) => clampSceneEditModalPosition(pos, next));
        return next;
      });
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [getDimensions]);

  const deferActivate = useCallback(() => {
    if (skipActivate) return;
    requestAnimationFrame(onActivate);
  }, [onActivate, skipActivate]);

  const isDragHandleTarget = useCallback((target: EventTarget | null) => {
    return (
      target instanceof HTMLElement &&
      target.closest(`.${SCENE_EDIT_RND_DRAG_HANDLE}`) !== null
    );
  }, []);

  const handleDragStart = useCallback(() => {
    startViewportSuspend();
    deferActivate();
  }, [deferActivate, startViewportSuspend]);

  const handleDragStop = useCallback(
    (...args: Parameters<NonNullable<ComponentProps<typeof Rnd>["onDragStop"]>>) => {
      stopViewportSuspend();
      const data = args[1];
      setPosition({ x: data.x, y: data.y });
    },
    [stopViewportSuspend],
  );

  const handleResizeStart = useCallback(() => {
    startViewportSuspend();
  }, [startViewportSuspend]);

  const handleResizeStop = useCallback(
    (...args: Parameters<NonNullable<ComponentProps<typeof Rnd>["onResizeStop"]>>) => {
      stopViewportSuspend();
      const ref = args[2];
      const nextPosition = args[4];
      const dims = getDimensions();
      const nextSize = persistSceneEditRndSize(
        sizeStorageKey,
        { width: ref.offsetWidth, height: ref.offsetHeight },
        dims,
      );
      setSize(nextSize);
      setPosition(nextPosition);
    },
    [getDimensions, sizeStorageKey, stopViewportSuspend],
  );

  return createPortal(
    <div
      className="pointer-events-none absolute inset-0"
      style={{ zIndex: effectiveZ }}
      onPointerDownCapture={raise}
    >
      <Rnd
        size={size}
        position={position}
        bounds="parent"
        minWidth={constraints.minWidth}
        minHeight={constraints.minHeight}
        maxWidth={constraints.maxWidth}
        maxHeight={constraints.maxHeight}
        dragHandleClassName={SCENE_EDIT_RND_DRAG_HANDLE}
        cancel="button, input, textarea, select, label, a, [data-no-drag]"
        enableResizing={{
          top: false,
          right: true,
          bottom: true,
          left: false,
          topRight: false,
          bottomRight: true,
          bottomLeft: false,
          topLeft: false,
        }}
        resizeHandleStyles={{
          right: { width: 8, right: 0 },
          bottom: { height: 8, bottom: 0 },
          bottomRight: { width: 12, height: 12, right: 0, bottom: 0 },
        }}
        className="pointer-events-auto"
        onClick={(event: MouseEvent) => event.stopPropagation()}
        onDragStart={handleDragStart}
        onDragStop={handleDragStop}
        onResizeStart={handleResizeStart}
        onResizeStop={handleResizeStop}
      >
        <Card
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          tabIndex={-1}
          data-active={isActive ? "true" : "false"}
          className={cn(
            "flex h-full min-h-0 flex-col overflow-hidden border transition-shadow duration-200",
            isActive
              ? "border-primary/40 shadow-2xl ring-1 ring-primary/20"
              : "border-border/60 opacity-[0.97] shadow-lg",
          )}
        >
          <div
            className={cn(
              "flex shrink-0 items-center justify-between border-b px-4 py-3 select-none bg-linear-to-r transition-colors duration-200",
              isActive ? "from-muted/80 to-muted/40" : "from-muted/40 to-muted/15",
              SCENE_EDIT_RND_DRAG_HANDLE,
              "cursor-grab active:cursor-grabbing",
            )}
            onPointerDownCapture={onDragHandlePointerDownCapture}
          >
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                {headerIcon}
              </div>
              <div className="min-w-0">
                <h2 id={titleId} className="truncate text-sm font-semibold">
                  {title}
                </h2>
                <p className="text-xs text-muted-foreground">{subtitle}</p>
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0 rounded-full hover:bg-destructive/10 hover:text-destructive"
              data-no-drag
              onClick={onClose}
              disabled={closeDisabled}
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div
            className="flex min-h-0 flex-1 flex-col overflow-hidden"
            onClick={(event) => {
              if (isDragHandleTarget(event.target)) return;
              deferActivate();
            }}
          >
            {children}
          </div>

          {footer ? <div className="shrink-0 border-t">{footer}</div> : null}
        </Card>
      </Rnd>
    </div>,
    getFloatingWindowLayer(),
  );
}
