import { useEffect, useMemo, useState } from "react";
import { ImageIcon, Loader2, TriangleAlert } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { stat } from "@tauri-apps/plugin-fs";
import { cn } from "@/lib/utils";

type PreviewSize = "thumbnail" | "preview";

const PREVIEW_CACHE_LIMIT = 32;
const cache = new Map<string, string>();
const inflight = new Map<string, Promise<string | null>>();

type PreviewCacheIdentity = {
  key: string;
  cacheable: boolean;
};

async function cacheKey(path: string, size: PreviewSize): Promise<PreviewCacheIdentity> {
  const normalized = path.trim().replace(/\\/g, "/").toLowerCase();
  try {
    const info = await stat(path);
    const modified = info.mtime instanceof Date ? info.mtime.getTime() : Number.NaN;
    if (!Number.isFinite(modified)) {
      return {
        key: `${normalized}::${size}::unversioned`,
        cacheable: false,
      };
    }
    return {
      key: `${normalized}::${size}::${info.size}:${modified}`,
      cacheable: true,
    };
  } catch {
    return {
      key: `${normalized}::${size}::unversioned`,
      cacheable: false,
    };
  }
}

function rememberPreview(key: string, value: string): void {
  cache.delete(key);
  cache.set(key, value);
  while (cache.size > PREVIEW_CACHE_LIMIT) {
    const oldest = cache.keys().next().value as string | undefined;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

export async function loadNutexbPreview(path: string, size: PreviewSize): Promise<string | null> {
  const { key, cacheable } = await cacheKey(path, size);
  if (cacheable) {
    const cached = cache.get(key);
    if (cached) {
      rememberPreview(key, cached);
      return cached;
    }
  }
  const pending = inflight.get(key);
  if (pending) return pending;

  const task = (async () => {
    try {
      const command = size === "thumbnail" ? "nutexb_thumbnail_base64" : "nutexb_preview_base64";
      const base64 = await invoke<string>(command, { inputPath: path });
      const dataUrl = `data:image/png;base64,${base64}`;
      if (cacheable) rememberPreview(key, dataUrl);
      return dataUrl;
    } catch {
      return null;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, task);
  return task;
}

export function EffectNutexbThumbnail({
  path,
  label,
  selected,
  className,
}: {
  path: string;
  label: string;
  selected?: boolean;
  className?: string;
}) {
  const [state, setState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    void loadNutexbPreview(path, "thumbnail").then((result) => {
      if (cancelled) return;
      setSrc(result);
      setState(result ? "ready" : "error");
    });
    return () => {
      cancelled = true;
    };
  }, [path]);

  return (
    <div
      className={cn(
        "flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted/45",
        selected && "border-primary/60 bg-primary/10",
        className,
      )}
    >
      {state === "ready" && src ? (
        <img src={src} alt={label} className="h-full w-full object-cover" />
      ) : state === "loading" ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground/70" />
      ) : state === "error" ? (
        <TriangleAlert className="h-4 w-4 text-amber-500" />
      ) : (
        <ImageIcon className="h-4 w-4 text-muted-foreground/60" />
      )}
    </div>
  );
}

export function EffectNutexbPreview({
  path,
  label,
  className,
}: {
  path: string;
  label: string;
  className?: string;
}) {
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [src, setSrc] = useState<string | null>(null);
  const normalizedLabel = useMemo(() => label || "nutexb preview", [label]);

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    void loadNutexbPreview(path, "preview").then((result) => {
      if (cancelled) return;
      setSrc(result);
      setState(result ? "ready" : "error");
    });
    return () => {
      cancelled = true;
    };
  }, [path]);

  return (
    <div
      className={cn(
        "flex min-h-56 items-center justify-center overflow-hidden rounded-md border bg-[linear-gradient(45deg,hsl(var(--muted))_25%,transparent_25%),linear-gradient(-45deg,hsl(var(--muted))_25%,transparent_25%),linear-gradient(45deg,transparent_75%,hsl(var(--muted))_75%),linear-gradient(-45deg,transparent_75%,hsl(var(--muted))_75%)] bg-[length:18px_18px] bg-[position:0_0,0_9px,9px_-9px,-9px_0px]",
        className,
      )}
    >
      {state === "ready" && src ? (
        <img src={src} alt={normalizedLabel} className="max-h-[340px] max-w-full object-contain" />
      ) : state === "loading" ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading texture preview
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2 text-xs text-amber-700 dark:text-amber-300">
          <TriangleAlert className="h-5 w-5" />
          Preview unavailable
        </div>
      )}
    </div>
  );
}
