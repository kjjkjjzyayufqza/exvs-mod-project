import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Loader2 } from "lucide-react";
import { readFile, writeFile } from "@tauri-apps/plugin-fs";
import { resourceDir } from "@tauri-apps/api/path";
import { useConfigStore } from "../../store/configStore";
import { ExtractFHMData, ExtractType, Fhm2d_type_format } from "../../models/fhm2d";
import { toast } from "sonner";
import { useVirtualizer } from "@tanstack/react-virtual";
import { cn } from "@/lib/utils";

// Define the UnitData interface based on the sample provided
interface UnitData {
  unitId: number;
  modelFileName: string;
  constModelExists: boolean;
  aleoFileName: string;
  constAleoExists: boolean;
  nu3bankFileName: string;
  constNu3bankExists: boolean;
  ammoFileName: string;
  constAmmoExists: boolean;
  mscFileName: string;
  constMscExists: boolean;
  animeFileName: string;
  constAnimeExists: boolean;
}

export default function UnitList() {
  const [searchQuery, setSearchQuery] = useState("");
  const deferredSearchQuery = useDeferredValue(searchQuery.trim().toLowerCase());
  const [units, setUnits] = useState<UnitData[]>([]);
  const [selectedUnit, setSelectedUnit] = useState<UnitData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const listRef = useRef<HTMLDivElement | null>(null);
  const obDplCachePath = useConfigStore(state => state.obDplCachePath);
  const extractOutputPath = useConfigStore(state => state.extractOutputPath);

  // Load unit data from ob_unit.json
  useEffect(() => {
    const loadUnitData = async () => {
      try {
        setIsLoading(true);
        const resourcePath = await resourceDir();
        const fileData = await readFile(resourcePath + "/tools/ob_unit.json");
        const data = JSON.parse(new TextDecoder().decode(fileData)) as UnitData[];
        setUnits(data);
      } catch (error) {
        console.error("Error loading unit data:", error);
      } finally {
        setIsLoading(false);
      }
    };

    loadUnitData();
  }, []);

  const filteredUnits = useMemo(() => {
    if (!deferredSearchQuery) return units;
    return units.filter(unit => {
      return (
        unit.unitId.toString().includes(deferredSearchQuery) ||
        unit.modelFileName.toLowerCase().includes(deferredSearchQuery) ||
        unit.aleoFileName.toLowerCase().includes(deferredSearchQuery) ||
        unit.nu3bankFileName.toLowerCase().includes(deferredSearchQuery) ||
        unit.ammoFileName.toLowerCase().includes(deferredSearchQuery) ||
        unit.mscFileName.toLowerCase().includes(deferredSearchQuery) ||
        unit.animeFileName.toLowerCase().includes(deferredSearchQuery)
      );
    });
  }, [deferredSearchQuery, units]);

  const getScrollElement = useCallback(() => listRef.current, []);
  const rowVirtualizer = useVirtualizer({
    count: filteredUnits.length,
    getScrollElement,
    estimateSize: () => 48,
    overscan: 12,
  });

  // Handle unit selection
  const handleUnitSelect = useCallback((unit: UnitData) => {
    setSelectedUnit(unit);
  }, []);

  // Handle extract button click for specific file type
  const handleExtract = async (fileType: string, fileName: string) => {
    const filePath = `${obDplCachePath}\\${fileName}.fhm2d`;
    console.log(filePath);
    
    // Create backup file
    const backupFilePath = `${obDplCachePath}\\${fileName}_bak.fhm2d`;
    const fileBuffer = await readFile(filePath);
    await writeFile(backupFilePath, fileBuffer);
    
    const upperCaseHashName = fileName.split('0x')[1].toUpperCase();
    const outputPath = `${extractOutputPath}\\0x${upperCaseHashName}`;
    void (async () => {
      try {
        const extractResult = await ExtractFHMData(
          filePath,
          outputPath,
          ExtractType.SingleFolder,
          Fhm2d_type_format.fhm2d_character
        );
        if (extractResult.namingError) {
          toast.error("FHM naming step failed (raw files were still extracted)", {
            description: extractResult.namingError,
            duration: 20_000,
          });
        } else {
          toast.success(`Extracted ${fileType}`);
        }
      } catch (err) {
        console.error("ExtractFHMData failed:", err);
        const message = err instanceof Error ? err.message : String(err);
        toast.error(`Extract failed: ${message}`);
      }
    })();
  };

  return (
    <div className="h-full">
      <div className="mb-8">
        <h2 className="text-2xl font-bold tracking-tight mb-4">Unit List</h2>
        <div className="max-w-xl">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-5 w-5" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by Unit ID, Model File, or Hash (e.g., 0xe2e0021f)"
              className="pl-10"
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6 flex-1">
        {/* Left grid - Unit list */}
        <div className="bg-card rounded-lg shadow-sm border p-4">
          <h3 className="text-lg font-semibold mb-4 text-foreground">Units</h3>
          {isLoading ? (
            <div className="flex items-center justify-center h-32 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin mr-2" />
              Loading units...
            </div>
          ) : (
            <div ref={listRef} className="h-[60vh] overflow-auto pr-1">
              {filteredUnits.length === 0 ? (
                <div className="flex items-center justify-center h-32 text-muted-foreground">
                  No units found
                </div>
              ) : (
                <div
                  className="relative w-full"
                  style={{ height: rowVirtualizer.getTotalSize() }}
                >
                  {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                    const unit = filteredUnits[virtualRow.index];
                    if (!unit) return null;
                    const selected = selectedUnit?.unitId === unit.unitId;
                    return (
                      <div
                        key={unit.unitId}
                        className="absolute left-0 top-0 w-full pr-1"
                        style={{
                          height: virtualRow.size,
                          transform: `translateY(${virtualRow.start}px)`,
                        }}
                      >
                        <button
                          type="button"
                          className={cn(
                            "flex h-10 w-full cursor-pointer items-center justify-between rounded-md border p-3 text-left transition-colors hover:bg-muted/80",
                            selected && "border-primary/30 bg-primary/10",
                          )}
                          onClick={() => handleUnitSelect(unit)}
                        >
                          <span className="font-medium">ID: {unit.unitId}</span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right grid - Unit details */}
        <div className="bg-card rounded-lg shadow-sm border p-4">
          <h3 className="text-lg font-semibold mb-4 text-foreground">Unit Details</h3>
          {selectedUnit ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2 col-span-2">
                  <div className="font-medium">Unit ID</div>
                  <div className="text-foreground">{selectedUnit.unitId}</div>
                </div>

                <div className="space-y-2">
                  <div className="font-medium">Model File</div>
                  <div className="flex items-center justify-between">
                    <div className="text-foreground flex items-center">
                      <span className="mr-2">{selectedUnit.modelFileName}</span>
                      <span className={`h-2 w-2 rounded-full ${selectedUnit.constModelExists ? "bg-green-500" : "bg-red-500"}`}></span>
                    </div>
                    <Button
                      size="sm"
                      disabled={!selectedUnit.constModelExists}
                      onClick={() => handleExtract('Model', selectedUnit.modelFileName)}
                    >
                      Extract
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="font-medium">Aleo File</div>
                  <div className="flex items-center justify-between">
                    <div className="text-foreground flex items-center">
                      <span className="mr-2">{selectedUnit.aleoFileName}</span>
                      <span className={`h-2 w-2 rounded-full ${selectedUnit.constAleoExists ? "bg-green-500" : "bg-red-500"}`}></span>
                    </div>
                    <Button
                      size="sm"
                      disabled={!selectedUnit.constAleoExists}
                      onClick={() => handleExtract('Aleo', selectedUnit.aleoFileName)}
                    >
                      Extract
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="font-medium">Nu3bank File</div>
                  <div className="flex items-center justify-between">
                    <div className="text-foreground flex items-center">
                      <span className="mr-2">{selectedUnit.nu3bankFileName}</span>
                      <span className={`h-2 w-2 rounded-full ${selectedUnit.constNu3bankExists ? "bg-green-500" : "bg-red-500"}`}></span>
                    </div>
                    <Button
                      size="sm"
                      disabled={!selectedUnit.constNu3bankExists}
                      onClick={() => handleExtract('Nu3bank', selectedUnit.nu3bankFileName)}
                    >
                      Extract
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="font-medium">Ammo File</div>
                  <div className="flex items-center justify-between">
                    <div className="text-foreground flex items-center">
                      <span className="mr-2">{selectedUnit.ammoFileName}</span>
                      <span className={`h-2 w-2 rounded-full ${selectedUnit.constAmmoExists ? "bg-green-500" : "bg-red-500"}`}></span>
                    </div>
                    <Button
                      size="sm"
                      disabled={!selectedUnit.constAmmoExists}
                      onClick={() => handleExtract('Ammo', selectedUnit.ammoFileName)}
                    >
                      Extract
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="font-medium">MSC File</div>
                  <div className="flex items-center justify-between">
                    <div className="text-foreground flex items-center">
                      <span className="mr-2">{selectedUnit.mscFileName}</span>
                      <span className={`h-2 w-2 rounded-full ${selectedUnit.constMscExists ? "bg-green-500" : "bg-red-500"}`}></span>
                    </div>
                    <Button
                      size="sm"
                      disabled={!selectedUnit.constMscExists}
                      onClick={() => handleExtract('MSC', selectedUnit.mscFileName)}
                    >
                      Extract
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="font-medium">Anime File</div>
                  <div className="flex items-center justify-between">
                    <div className="text-foreground flex items-center">
                      <span className="mr-2">{selectedUnit.animeFileName}</span>
                      <span className={`h-2 w-2 rounded-full ${selectedUnit.constAnimeExists ? "bg-green-500" : "bg-red-500"}`}></span>
                    </div>
                    <Button
                      size="sm"
                      disabled={!selectedUnit.constAnimeExists}
                      onClick={() => handleExtract('Anime', selectedUnit.animeFileName)}
                    >
                      Extract
                    </Button>
                  </div>
                </div>
              </div>

            </div>
          ) : (
            <div className="flex items-center justify-center h-32 text-muted-foreground">
              Select a unit to view details
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
