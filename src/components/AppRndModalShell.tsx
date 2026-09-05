import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type ComponentProps,
  type MouseEvent,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import { createPortal } from "react-dom";
import { Rnd } from "react-rnd";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { getFloatingWindowLayer } from "@/components/floatingWindowLayer";
import { useFloatingWindowStore } from "@/store/floatingWindowStore";

const APP_RND_MODAL_HANDLE = "app-rnd-modal-handle";
const VIEWPORT_MARGIN = 24;

type ModalSize = {
  width: number;
  height: number;
};

type ModalDimensions = ModalSize & {
  minWidth: number;
  minHeight: number;
  maxWidth?: number;
  maxHeight?: number;
};

interface AppRndModalShellProps {
  title: string;
  subtitle?: string;
  titleId: string;
  headerIcon?: ReactNode;
  headerActions?: ReactNode;
  dimensions: ModalDimensions;
  storageKey?: string;
  onClose: () => void;
  closeDisabled?: boolean;
  resizable?: boolean;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}

function readPersistedSize(storageKey: string | undefined): ModalSize | null {
  if (!storageKey || typeof localStorage === "undefined") return null;
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey) ?? "null") as unknown;
    if (typeof parsed !== "object" || parsed === null) return null;
    const size = parsed as Partial<ModalSize>;
    if (
      typeof size.width !== "number" ||
      typeof size.height !== "number" ||
      !Number.isFinite(size.width) ||
      !Number.isFinite(size.height)
    ) {
      return null;
    }
    return { width: size.width, height: size.height };
  } catch {
    return null;
  }
}

function persistSize(storageKey: string | undefined, size: ModalSize): void {
  if (!storageKey || typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(
      storageKey,
      JSON.stringify({ width: Math.round(size.width), height: Math.round(size.height) }),
    );
  } catch {
    // Ignore storage quota failures.
  }
}

function resolveTopbarHeight(): number {
  if (typeof window === "undefined" || typeof document === "undefined") return 0;
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue("--layout-topbar-height")
    .trim();
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

function resolveMaxDimensions(dimensions: ModalDimensions): Required<Pick<ModalDimensions, "maxWidth" | "maxHeight">> {
  if (typeof window === "undefined") {
    return {
      maxWidth: dimensions.maxWidth ?? dimensions.width,
      maxHeight: dimensions.maxHeight ?? dimensions.height,
    };
  }
  return {
    maxWidth: dimensions.maxWidth ?? Math.max(dimensions.minWidth, window.innerWidth - VIEWPORT_MARGIN * 2),
    maxHeight:
      dimensions.maxHeight ??
      Math.max(dimensions.minHeight, window.innerHeight - resolveTopbarHeight() - VIEWPORT_MARGIN * 2),
  };
}

function clampSize(size: ModalSize, dimensions: ModalDimensions): ModalSize {
  const { maxWidth, maxHeight } = resolveMaxDimensions(dimensions);
  return {
    width: Math.min(maxWidth, Math.max(dimensions.minWidth, size.width)),
    height: Math.min(maxHeight, Math.max(dimensions.minHeight, size.height)),
  };
}

function centerPosition(size: ModalSize) {
  if (typeof window === "undefined") return { x: 80, y: 60 };
  const topbarHeight = resolveTopbarHeight();
  return {
    x: Math.max(VIEWPORT_MARGIN, Math.round((window.innerWidth - size.width) / 2)),
    y: Math.max(VIEWPORT_MARGIN, Math.round((window.innerHeight - topbarHeight - size.height) / 2)),
  };
}

function clampPosition(position: { x: number; y: number }, size: ModalSize) {
  if (typeof window === "undefined") return position;
  const topbarHeight = resolveTopbarHeight();
  const maxX = Math.max(VIEWPORT_MARGIN, window.innerWidth - size.width - VIEWPORT_MARGIN);
  const maxY = Math.max(VIEWPORT_MARGIN, window.innerHeight - topbarHeight - size.height - VIEWPORT_MARGIN);
  return {
    x: Math.min(maxX, Math.max(VIEWPORT_MARGIN, position.x)),
    y: Math.min(maxY, Math.max(VIEWPORT_MARGIN, position.y)),
  };
}

export function AppRndModalShell({
  title,
  subtitle,
  titleId,
  headerIcon,
  headerActions,
  dimensions,
  storageKey,
  onClose,
  closeDisabled = false,
  resizable = true,
  children,
  footer,
  className,
}: AppRndModalShellProps) {
  const { t } = useTranslation("shared");
  const stableDimensions = useMemo(
    () => ({
      width: dimensions.width,
      height: dimensions.height,
      minWidth: dimensions.minWidth,
      minHeight: dimensions.minHeight,
      maxWidth: dimensions.maxWidth,
      maxHeight: dimensions.maxHeight,
    }),
    [
      dimensions.height,
      dimensions.maxHeight,
      dimensions.maxWidth,
      dimensions.minHeight,
      dimensions.minWidth,
      dimensions.width,
    ],
  );
  const initialSize = useMemo(
    () => clampSize(readPersistedSize(storageKey) ?? stableDimensions, stableDimensions),
    [stableDimensions, storageKey],
  );
  const [size, setSize] = useState(initialSize);
  const [position, setPosition] = useState(() => centerPosition(initialSize));

  useEffect(() => {
    const nextSize = clampSize(
      readPersistedSize(storageKey) ?? stableDimensions,
      stableDimensions,
    );
    setSize(nextSize);
    setPosition((prev) => clampPosition(prev, nextSize));
  }, [stableDimensions, storageKey]);

  useEffect(() => {
    const onResize = () => {
      setSize((prev) => {
        const next = clampSize(prev, stableDimensions);
        setPosition((pos) => clampPosition(pos, next));
        return next;
      });
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [stableDimensions]);

  const handleDragStop = useCallback(
    (...args: Parameters<NonNullable<ComponentProps<typeof Rnd>["onDragStop"]>>) => {
      const data = args[1];
      setPosition(clampPosition({ x: data.x, y: data.y }, size));
    },
    [size],
  );

  const handleResizeStop = useCallback(
    (...args: Parameters<NonNullable<ComponentProps<typeof Rnd>["onResizeStop"]>>) => {
      const ref = args[2];
      const nextPosition = args[4];
      const nextSize = clampSize(
        { width: ref.offsetWidth, height: ref.offsetHeight },
        stableDimensions,
      );
      persistSize(storageKey, nextSize);
      setSize(nextSize);
      setPosition(clampPosition(nextPosition, nextSize));
    },
    [stableDimensions, storageKey],
  );

  const { maxWidth, maxHeight } = resolveMaxDimensions(stableDimensions);

  // Participate in the app-wide floating-window z-order (shared with the SSBH editor windows),
  // so clicking any window raises it above the rest.
  const bringToFront = useFloatingWindowStore((state) => state.bringToFront);
  const release = useFloatingWindowStore((state) => state.release);
  const storedZ = useFloatingWindowStore((state) => state.zById[titleId]);
  const isActive = useFloatingWindowStore((state) => state.topId === titleId);

  useLayoutEffect(() => {
    bringToFront(titleId);
    // Page-level Radix popovers use --z-popover (below this layer). Dismiss any that remain
    // open so they cannot paint above a newly mounted floating window.
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true }),
    );
    return () => release(titleId);
  }, [titleId, bringToFront, release]);

  const raise = useCallback(() => {
    bringToFront(titleId);
  }, [bringToFront, titleId]);

  return createPortal(
    <div
      className="pointer-events-none absolute inset-0"
      style={{ zIndex: storedZ ?? 0 }}
      onPointerDownCapture={raise}
    >
      <Rnd
        size={size}
        position={position}
        bounds="parent"
        minWidth={stableDimensions.minWidth}
        minHeight={stableDimensions.minHeight}
        maxWidth={maxWidth}
        maxHeight={maxHeight}
        dragHandleClassName={APP_RND_MODAL_HANDLE}
        cancel="button, input, textarea, select, label, a, [data-no-drag]"
        enableResizing={
          resizable
            ? {
                top: false,
                right: true,
                bottom: true,
                left: false,
                topRight: false,
                bottomRight: true,
                bottomLeft: false,
                topLeft: false,
              }
            : false
        }
        resizeHandleStyles={{
          right: { width: 8, right: 0 },
          bottom: { height: 8, bottom: 0 },
          bottomRight: { width: 12, height: 12, right: 0, bottom: 0 },
        }}
        className="pointer-events-auto"
        onClick={(event: MouseEvent) => event.stopPropagation()}
        onDragStop={handleDragStop}
        onResizeStop={handleResizeStop}
      >
        <Card
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          tabIndex={-1}
          data-active={isActive ? "true" : "false"}
          className={cn(
            "flex h-full min-h-0 flex-col overflow-hidden border transition-shadow duration-200 motion-reduce:transition-none",
            isActive
              ? "border-primary/40 shadow-2xl ring-1 ring-primary/20"
              : "border-border/60 opacity-[0.97] shadow-lg",
            className,
          )}
        >
          <div
            className={cn(
              "flex shrink-0 cursor-grab select-none items-center justify-between border-b bg-linear-to-r px-4 py-3 transition-colors duration-200 active:cursor-grabbing motion-reduce:transition-none",
              isActive ? "from-muted/80 to-muted/40" : "from-muted/40 to-muted/15",
              APP_RND_MODAL_HANDLE,
            )}
          >
            <div className="flex min-w-0 flex-1 items-center gap-3">
              {headerIcon ? (
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  {headerIcon}
                </div>
              ) : null}
              <div className="min-w-0">
                <h2 id={titleId} className="truncate text-sm font-semibold">
                  {title}
                </h2>
                {subtitle ? <p className="text-xs text-muted-foreground">{subtitle}</p> : null}
              </div>
            </div>
            {headerActions ? (
              <div className="flex shrink-0 items-center gap-1.5" data-no-drag>
                {headerActions}
              </div>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0 rounded-full hover:bg-destructive/10 hover:text-destructive"
              data-no-drag
              onClick={onClose}
              disabled={closeDisabled}
              aria-label={t("common.close")}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>

          {footer ? <div className="shrink-0 border-t">{footer}</div> : null}
        </Card>
      </Rnd>
    </div>,
    getFloatingWindowLayer(),
  );
}
