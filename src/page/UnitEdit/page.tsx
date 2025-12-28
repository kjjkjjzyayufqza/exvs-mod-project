import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { readFile } from "@tauri-apps/plugin-fs";
import { Buffer } from "buffer";
import { Button } from "../../components/ui/button";
import { CharacterListOB, CharacterListOBOutPut } from "../../models/characterListOB";
import { CharacterEditor } from "./components/CharacterEditor";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { FileText, Download } from "lucide-react";

export default function UnitEdit() {
  const [characterListData, setCharacterListData] = useState<CharacterListOB>();
  const [isLoading, setIsLoading] = useState(false);

  const handleFile = async () => {
    try {
      setIsLoading(true);
      const file = await open({
        filters: [
          {
            name: "Binary Files",
            extensions: ["bin"]
          }
        ]
      });
      
      if (file) {
        const fileData = await readFile(file as string);
        const data = new CharacterListOB(Buffer.from(fileData));
        setCharacterListData(data);
        console.log("Loaded character list:", data);
      }
    } catch (error) {
      console.error("Error loading file:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOutputFile = async () => {
    try {
      const path = (await open({
        directory: true,
      })) as string;
      
      if (characterListData && path) {
        CharacterListOBOutPut(characterListData, path);
        console.log("File exported successfully");
      }
    } catch (error) {
      console.error("Error exporting file:", error);
    }
  };

  const handleCharacterListChange = (updatedData: CharacterListOB) => {
    setCharacterListData(updatedData);
  };

  return (
    <div className="h-full">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Unit Editor
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <Button 
              onClick={handleFile} 
              disabled={isLoading}
              className="flex items-center gap-2"
            >
              <FileText className="w-4 h-4" />
              {isLoading ? "Loading..." : "Open File"}
            </Button>
            
            <Button 
              onClick={handleOutputFile} 
              disabled={!characterListData}
              variant="outline"
              className="flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              Export File
            </Button>
          </div>
          
          {characterListData && (
            <div className="mt-4 text-sm text-muted-foreground">
              Loaded: {characterListData.CharacterCount} characters, {characterListData.CommandsCount} commands
            </div>
          )}
        </CardContent>
      </Card>

      <CharacterEditor
        characterListData={characterListData}
        onChange={handleCharacterListChange}
      />
    </div>
  );
}


