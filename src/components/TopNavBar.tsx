import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { SettingsDialog } from "./SettingsDialog";
import RepackModal from "./RepackModal";
import Fhm2dInitModal from "./Fhm2dInitModal";

export function TopNavBar() {
  const [isRepackModalOpen, setIsRepackModalOpen] = useState(false);
  const [isFhm2dInitModalOpen, setIsFhm2dInitModalOpen] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const handleRepackClick = () => {
    setIsRepackModalOpen((prev) => !prev);
  };

  const handleFhm2dInitClick = () => {
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

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />

      <RepackModal
        isOpen={isRepackModalOpen}
        onClose={() => setIsRepackModalOpen(false)}
      />

      <Fhm2dInitModal
        isOpen={isFhm2dInitModalOpen}
        onClose={() => setIsFhm2dInitModalOpen(false)}
      />
    </>
  );
}
