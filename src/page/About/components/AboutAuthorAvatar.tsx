import { useEffect, useState } from "react";

import {
  AUTHOR_GITHUB_AVATAR_PNG,
  AUTHOR_GITHUB_USER_API,
  AUTHOR_HANDLE,
} from "@/lib/authorIdentity";
import { cn } from "@/lib/utils";

function withCacheBust(url: string, token: number): string {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}t=${token}`;
}

export function AboutAuthorAvatar({ className }: { className?: string }) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const fetchedAt = Date.now();
    const fallback = withCacheBust(`${AUTHOR_GITHUB_AVATAR_PNG}?size=160`, fetchedAt);

    void (async () => {
      try {
        const response = await fetch(AUTHOR_GITHUB_USER_API, {
          cache: "no-store",
          signal: controller.signal,
          headers: { Accept: "application/vnd.github+json" },
        });
        if (!response.ok) {
          throw new Error(`GitHub user ${response.status}`);
        }
        const body = (await response.json()) as { avatar_url?: string };
        if (!body.avatar_url) {
          throw new Error("GitHub avatar_url missing");
        }
        if (!controller.signal.aborted) {
          setSrc(withCacheBust(body.avatar_url, fetchedAt));
        }
      } catch {
        if (!controller.signal.aborted) {
          setSrc(fallback);
        }
      }
    })();

    return () => controller.abort();
  }, []);

  if (!src) {
    return (
      <div
        className={cn(
          "size-16 shrink-0 animate-pulse rounded-2xl border border-border/70 bg-muted lg:size-16",
          className,
        )}
        aria-hidden="true"
      />
    );
  }

  return (
    <img
      src={src}
      alt={AUTHOR_HANDLE}
      width={128}
      height={128}
      decoding="async"
      referrerPolicy="no-referrer"
      className={cn(
        "size-16 shrink-0 rounded-2xl border border-border/70 bg-white object-cover lg:size-16",
        className,
      )}
    />
  );
}
