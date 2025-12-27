import { useState } from "react";
import { Button } from "@/components/ui/button";
import RepackModal from "./RepackModal";

export function TopNavBar() {
  const [isRepackModalOpen, setIsRepackModalOpen] = useState(false);

  const handleOptionsClick = () => {
    // Options button - no action for now
  };

  const handleRepackClick = () => {
    setIsRepackModalOpen((prev) => !prev);
  };

  return (
    <>
      <div className="fixed top-0 left-0 right-0 h-8 bg-gray-100 border-b border-border flex items-center px-3 gap-1.5 z-50">
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
      </div>
      
      <RepackModal 
        isOpen={isRepackModalOpen} 
        onClose={() => setIsRepackModalOpen(false)} 
      />
    </>
  );
}

