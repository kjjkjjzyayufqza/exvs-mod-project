import { useState } from "react";
import { Button } from "@/components/ui/button";
import RepackModal from "./RepackModal";
import Fhm2dInitModal from "./Fhm2dInitModal";

export function TopNavBar() {
  const [isRepackModalOpen, setIsRepackModalOpen] = useState(false);
  const [isFhm2dInitModalOpen, setIsFhm2dInitModalOpen] = useState(false);

  const handleOptionsClick = () => {
    // Options button - no action for now
  };

  const handleRepackClick = () => {
    setIsRepackModalOpen((prev) => !prev);
  };

  const handleFhm2dInitClick = () => {
    setIsFhm2dInitModalOpen((prev) => !prev);
  };

  return (
    <>
      <div className="sticky top-0 w-full h-8 bg-gray-100 border-b border-border flex items-center px-3 gap-1.5 z-50 flex-shrink-0">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleOptionsClick}
          className="h-6 px-2 text-xs hover:bg-gray-200"
        >
          Options
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleRepackClick}
          className="h-6 px-2 text-xs hover:bg-gray-200"
        >
          Repack
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleFhm2dInitClick}
          className="h-6 px-2 text-xs hover:bg-gray-200"
        >
          FHM2D Init
        </Button>
      </div>
      
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

