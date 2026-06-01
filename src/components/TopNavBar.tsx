import { lazy, Suspense, useState } from "react";
import { Button } from "@/components/ui/button";
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

  return (
    <>
      <div className="sticky top-0 w-full h-8 bg-muted/80 border-b border-border flex items-center px-3 gap-1.5 z-50 shrink-0 backdrop-blur-sm">
        <Popover open={optionsOpen} onOpenChange={setOptionsOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs hover:bg-accent"
            >
              Options
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-44 p-1" align="start">
            <Button
              variant="ghost"
              className="w-full justify-start h-8 px-2 text-xs font-normal"
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
          className="h-6 px-2 text-xs hover:bg-accent"
        >
          Repack
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleFhm2dInitClick}
          className="h-6 px-2 text-xs hover:bg-accent"
        >
          FHM2D Init
        </Button>
      </div>

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
