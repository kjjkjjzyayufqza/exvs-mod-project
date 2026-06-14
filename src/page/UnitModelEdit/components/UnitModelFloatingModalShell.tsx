import {
  useCallback,
  useEffect,
  useState,
  type ComponentProps,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { Rnd } from "react-rnd";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  SCENE_EDIT_RND_DRAG_HANDLE,
  clampRndSizeToConstraints,
  clampSceneEditModalPosition,
  getSceneEditCascadePosition,
  type SceneEditRndModalDimensions,
} from "@/page/SceneEdit/components/sceneEditRndModalUtils";
import {
  readPersistedRndSize,
  writePersistedRndSize,
} from "@/page/SceneEdit/components/sceneEditRndSizePersistence";

type UnitModelFloatingModalShellProps = {
  cascadeIndex: number;
  zIndex: number;
  titleId: string;
  title: string;
  subtitle: string;
  headerIcon: ReactNode;
  onClose: () => void;
  getDimensions: () => SceneEditRndModalDimensions;
  sizeStorageKey?: string;
  onViewportSuspendChange?: (suspended: boolean) => void;
  children: ReactNode;
  footer?: ReactNode;
};

function resolveInitialRndSize(
  storageKey: string | undefined,
  dims: SceneEditRndModalDimensions,
): { width: number; height: number } {
  const persisted = storageKey ? readPersistedRndSize(storageKey) : null;
  if (persisted) {
    return clampRndSizeToConstraints(persisted, dims);
  }
  return { width: dims.width, height: dims.height };
}

function persistRndSize(
  storageKey: string | undefined,
  size: { width: number; height: number },
  dims: SceneEditRndModalDimensions,
): { width: number; height: number } {
  const next = clampRndSizeToConstraints(size, dims);
  if (storageKey) {
    writePersistedRndSize(storageKey, next);
  }
  return next;
}

export function UnitModelFloatingModalShell({
  cascadeIndex,
  zIndex,
  titleId,
  title,
  subtitle,
  headerIcon,
  onClose,
  getDimensions,
  sizeStorageKey,
  onViewportSuspendChange,
  children,
  footer,
}: UnitModelFloatingModalShellProps) {
  const activeSuspendRef = { current: false };

  const startViewportSuspend = useCallback(() => {
    if (activeSuspendRef.current) return;
    activeSuspendRef.current = true;
    onViewportSuspendChange?.(true);
  }, [onViewportSuspendChange]);

  const stopViewportSuspend = useCallback(() => {
    if (!activeSuspendRef.current) return;
    activeSuspendRef.current = false;
    onViewportSuspendChange?.(false);
  }, [onViewportSuspendChange]);

  const [constraints, setConstraints] = useState(getDimensions);
  const [size, setSize] = useState(() => {
    const dims = getDimensions();
    return resolveInitialRndSize(sizeStorageKey, dims);
  });
  const [position, setPosition] = useState(() => {
    const dims = getDimensions();
    const initialSize = resolveInitialRndSize(sizeStorageKey, dims);
    return getSceneEditCascadePosition(initialSize, cascadeIndex);
  });

  useEffect(() => {
    const dims = getDimensions();
    setConstraints(dims);
    setSize((prev) => {
      const next = sizeStorageKey
        ? resolveInitialRndSize(sizeStorageKey, dims)
        : clampRndSizeToConstraints(prev, dims);
      setPosition(getSceneEditCascadePosition(next, cascadeIndex));
      return next;
    });
  }, [cascadeIndex, getDimensions, sizeStorageKey]);

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

  useEffect(() => {
    const onPointerEnd = () => {
      stopViewportSuspend();
    };
    window.addEventListener("pointerup", onPointerEnd);
    window.addEventListener("pointercancel", onPointerEnd);
    return () => {
      window.removeEventListener("pointerup", onPointerEnd);
      window.removeEventListener("pointercancel", onPointerEnd);
      stopViewportSuspend();
    };
  }, [stopViewportSuspend]);

  const onDragHandlePointerDownCapture = useCallback(
    (event: ReactPointerEvent) => {
      if (event.button !== 0) return;
      if (event.target instanceof HTMLElement && event.target.closest("button")) return;
      startViewportSuspend();
    },
    [startViewportSuspend],
  );

  const handleDragStart = useCallback(() => {
    startViewportSuspend();
  }, [startViewportSuspend]);

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
      const nextSize = persistRndSize(
        sizeStorageKey,
        { width: ref.offsetWidth, height: ref.offsetHeight },
        dims,
      );
      setSize(nextSize);
      setPosition(nextPosition);
    },
    [getDimensions, sizeStorageKey, stopViewportSuspend],
  );

  return (
    <div className="pointer-events-none absolute inset-0" style={{ zIndex }}>
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
          className="flex h-full min-h-0 flex-col overflow-hidden border shadow-2xl"
        >
          <div
            className={cn(
              "flex shrink-0 items-center justify-between border-b bg-linear-to-r from-muted/80 to-muted/40 px-4 py-3 select-none",
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
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>

          {footer ? <div className="shrink-0 border-t">{footer}</div> : null}
        </Card>
      </Rnd>
    </div>
  );
}
