import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { findMatchedRouteUrl, pathMatchesRoute } from "@/router/pathMatch";
import { RouterItems } from "@/router/router";
import { KeepAliveProvider } from "./KeepAliveContext";
import { cn } from "@/lib/utils";

/**
 * Renders matched sidebar pages in a stacked layout: visited routes stay mounted
 * and are hidden with CSS so local state, context, and WebGL survive navigation.
 */
export function KeepAliveOutlet() {
  const { pathname } = useLocation();
  const matchedUrl = findMatchedRouteUrl(pathname);

  const [visited, setVisited] = useState<Set<string>>(() => {
    const initial = findMatchedRouteUrl(pathname);
    return initial ? new Set([initial]) : new Set();
  });

  useEffect(() => {
    if (!matchedUrl) return;
    setVisited((prev) => {
      if (prev.has(matchedUrl)) return prev;
      const next = new Set(prev);
      next.add(matchedUrl);
      return next;
    });
  }, [matchedUrl]);

  return (
    <KeepAliveProvider activeMatchedUrl={matchedUrl}>
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
      {RouterItems.map((item) => {
        if (!visited.has(item.url)) return null;
        const active = matchedUrl !== null && pathMatchesRoute(pathname, item.url);
        const activeOverflow =
          item.url === "/SceneEdit" ? "overflow-hidden" : "overflow-auto";
        return (
          <div
            key={item.url}
            className={
              active
                ? cn(
                    "relative z-10 flex min-h-0 min-w-0 flex-1 flex-col outline-none",
                    activeOverflow,
                  )
                : "pointer-events-none invisible absolute inset-0 z-0 flex min-h-0 flex-col overflow-hidden outline-none"
            }
            aria-hidden={!active}
            {...(!active ? { inert: true } : {})}
          >
            {item.element}
          </div>
        );
      })}
      {matchedUrl === null ? (
        <div className="bg-background/80 absolute inset-0 z-20 flex flex-1 items-center justify-center text-sm text-muted-foreground backdrop-blur-[1px]">
          Unknown route: <span className="text-foreground ml-1 font-mono">{pathname || "/"}</span>
        </div>
      ) : null}
      </div>
    </KeepAliveProvider>
  );
}
