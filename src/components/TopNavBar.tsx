import { lazy, Suspense, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

// These modals carry heavy logic (repack pipeline, fhm2d extraction) and are
// only needed after the user interacts with the top bar. Lazy-load them so
// they (and their transitive deps) stay out of the initial startup bundle.
// Once first opened, each stays mounted for the session so its internal
// open/close state and exit animations behave exactly as before.
const SettingsDialog = lazy(() =>
  import("./SettingsDialog").then((m) => ({ default: m.SettingsDialog })),
);
const RepackModal = lazy(() => import("./RepackModal"));
const Fhm2dInitModal = lazy(() => import("./Fhm2dInitModal"));

export function TopNavBar() {
  const [isRepackModalOpen, setIsRepackModalOpen] = useState(false);
  const [isFhm2dInitModalOpen, setIsFhm2dInitModalOpen] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Track first open so the lazy chunk is fetched on demand and the modal then
  // remains mounted (keeps prior always-mounted behavior after first use).
  const [settingsMounted, setSettingsMounted] = useState(false);
  const [repackMounted, setRepackMounted] = useState(false);
  const [fhm2dMounted, setFhm2dMounted] = useState(false);

  const handleRepackClick = () => {
    setRepackMounted(true);
    setIsRepackModalOpen((prev) => !prev);
  };

  const handleFhm2dInitClick = () => {
    setFhm2dMounted(true);
    setIsFhm2dInitModalOpen((prev) => !prev);
  };

  // The bar is portaled to <body> so it shares a stacking context with the
  // Radix/portal-based modals. Combined with the top --z-topbar token, this
  // keeps the top bar above every floating layer (the in-tree #root overlays
  // are z:auto relative to body and can never outrank it).
  const bar = (
    <div className="fixed inset-x-0 top-0 z-[var(--z-topbar)] flex h-[var(--layout-topbar-height)] shrink-0 items-center gap-1 border-b border-border bg-muted/80 px-2 backdrop-blur-sm">
      <SidebarTrigger
        className="h-6 w-6 text-muted-foreground hover:text-foreground"
        title="Toggle Sidebar (Ctrl/Cmd+B)"
      />
      <div className="mx-1 h-4 w-px shrink-0 bg-border" aria-hidden />
      <Popover open={optionsOpen} onOpenChange={setOptionsOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs hover:bg-accent active:translate-y-px"
          >
            Options
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-44 p-1" align="start">
          <Button
            variant="ghost"
            className="h-8 w-full justify-start px-2 text-xs font-normal"
            onClick={() => {
              setOptionsOpen(false);
              setSettingsMounted(true);
              setSettingsOpen(true);
            }}
          >
            Settings
          </Button>
        </PopoverContent>
      </Popover>
      <Button
        variant="ghost"
        size="sm"
        onClick={handleRepackClick}
        className="h-6 px-2 text-xs hover:bg-accent active:translate-y-px"
      >
        Repack
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={handleFhm2dInitClick}
        className="h-6 px-2 text-xs hover:bg-accent active:translate-y-px"
      >
        FHM2D Init
      </Button>
    </div>
  );

  return (
    <>
      {createPortal(bar, document.body)}

      {settingsMounted && (
        <Suspense fallback={null}>
          <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
        </Suspense>
      )}

      {repackMounted && (
        <Suspense fallback={null}>
          <RepackModal
            isOpen={isRepackModalOpen}
            onClose={() => setIsRepackModalOpen(false)}
          />
        </Suspense>
      )}

      {fhm2dMounted && (
        <Suspense fallback={null}>
          <Fhm2dInitModal
            isOpen={isFhm2dInitModalOpen}
            onClose={() => setIsFhm2dInitModalOpen(false)}
          />
        </Suspense>
      )}
    </>
  );
}
