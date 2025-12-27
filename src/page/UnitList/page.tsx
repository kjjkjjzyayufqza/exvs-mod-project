import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Loader2 } from "lucide-react";
import { readFile, writeFile } from "@tauri-apps/plugin-fs";
import { resourceDir } from "@tauri-apps/api/path";
import { useConfigStore } from "../../store/configStore";
import { ExtractFHMData, ExtractType, Fhm2dData } from "../../models/fhm2d";
import { Buffer } from "buffer";
import { toast } from "sonner";

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
  const [units, setUnits] = useState<UnitData[]>([]);
  const [filteredUnits, setFilteredUnits] = useState<UnitData[]>([]);
  const [selectedUnit, setSelectedUnit] = useState<UnitData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const obDplCachePath = useConfigStore(state => state.obDplCachePath);
  const extractOutputPath = useConfigStore(state => state.extractOutputPath);

  // Load unit data from ob_unit.json
  useEffect(() => {
    const loadUnitData = async () => {
      try {
        setIsLoading(true);
        const resourcePath = await resourceDir();
        const fileData = await readFile(resourcePath + "/tools/ob_unit.json");
        const data = JSON.parse(new TextDecoder().decode(fileData as ArrayBuffer)) as UnitData[];
        setUnits(data);
        setFilteredUnits(data);
      } catch (error) {
        console.error("Error loading unit data:", error);
      } finally {
        setIsLoading(false);
      }
    };

    loadUnitData();
  }, []);

  // Filter units based on search query
  useEffect(() => {
    if (searchQuery.trim() === "") {
      setFilteredUnits(units);
    } else {
      const query = searchQuery.toLowerCase();
      const filtered = units.filter(unit => {
        // Search by Unit ID
        if (unit.unitId.toString().toLowerCase().includes(query)) {
          return true;
        }

        // Search by Model File Name
        if (unit.modelFileName.toLowerCase().includes(query)) {
          return true;
        }

        // Search by Aleo File Name
        if (unit.aleoFileName.toLowerCase().includes(query)) {
          return true;
        }

        // Search by Nu3bank File Name
        if (unit.nu3bankFileName.toLowerCase().includes(query)) {
          return true;
        }

        // Search by Ammo File Name
        if (unit.ammoFileName.toLowerCase().includes(query)) {
          return true;
        }

        // Search by MSC File Name
        if (unit.mscFileName.toLowerCase().includes(query)) {
          return true;
        }

        // Search by Anime File Name
        if (unit.animeFileName.toLowerCase().includes(query)) {
          return true;
        }

        return false;
      });
      setFilteredUnits(filtered);
    }
  }, [searchQuery, units]);

  // Handle unit selection
  const handleUnitSelect = (unit: UnitData) => {
    setSelectedUnit(unit);
  };

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
    const fhm = new Fhm2dData(Buffer.from(fileBuffer))
    void ExtractFHMData(fhm, outputPath, ExtractType.SingleFolder).catch((err) => {
      console.error("ExtractFHMData failed:", err);
    });
    console.log(fhm);
    toast.success(`Extracted ${fileType}`)
  };

  return (
    <div className="h-full flex flex-col p-6 bg-gray-50/30">
      <div className="mb-8">
        <h2 className="text-2xl font-bold tracking-tight mb-4">Unit List</h2>
        <div className="max-w-xl">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500 h-5 w-5" />
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
        <div className="bg-white rounded-lg shadow-sm border p-4">
          <h3 className="text-lg font-semibold mb-4 text-gray-700">Units</h3>
          {isLoading ? (
            <div className="flex items-center justify-center h-32 text-gray-500">
              <Loader2 className="h-6 w-6 animate-spin mr-2" />
              Loading units...
            </div>
          ) : (
            <div className="space-y-2 overflow-auto max-h-[60vh]">
              {filteredUnits.length === 0 ? (
                <div className="flex items-center justify-center h-32 text-gray-500">
                  No units found
                </div>
              ) : (
                filteredUnits.map((unit, index) => (
                  <div
                    key={index}
                    className={`flex justify-between items-center p-3 hover:bg-gray-50 rounded-md transition-colors border cursor-pointer ${selectedUnit?.unitId === unit.unitId ? "bg-blue-50 border-blue-200" : ""
                      }`}
                    onClick={() => handleUnitSelect(unit)}
                  >
                    <div className="flex items-center space-x-3">
                      <span className="font-medium">ID: {unit.unitId}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Right grid - Unit details */}
        <div className="bg-white rounded-lg shadow-sm border p-4">
          <h3 className="text-lg font-semibold mb-4 text-gray-700">Unit Details</h3>
          {selectedUnit ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2 col-span-2">
                  <div className="font-medium">Unit ID</div>
                  <div className="text-gray-700">{selectedUnit.unitId}</div>
                </div>

                <div className="space-y-2">
                  <div className="font-medium">Model File</div>
                  <div className="flex items-center justify-between">
                    <div className="text-gray-700 flex items-center">
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
                    <div className="text-gray-700 flex items-center">
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
                    <div className="text-gray-700 flex items-center">
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
                    <div className="text-gray-700 flex items-center">
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
                    <div className="text-gray-700 flex items-center">
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
                    <div className="text-gray-700 flex items-center">
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
            <div className="flex items-center justify-center h-32 text-gray-500">
              Select a unit to view details
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
