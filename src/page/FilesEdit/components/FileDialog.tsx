import { useState } from "react";
import { DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Save, RotateCcw } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { FileInfo, useNumatbStore } from "../../../store/numatbStore";

interface FileDialogProps {
  file: FileInfo;
}

export function FileDialog({ file }: FileDialogProps) {
  const store = useNumatbStore();
  const { numatbData, isConverting, isSaving, error, updateTextureAttribute, saveFile, convertFile } = store;
  const [hasChanges, setHasChanges] = useState(false);

  const handleTexturePathChange = (materialIndex: number, attributeIndex: number, newValue: string) => {
    updateTextureAttribute(materialIndex, attributeIndex, newValue);
    setHasChanges(true);
  };

  const handleSave = async () => {
    await saveFile();
    setHasChanges(false);
  };

  const handleReset = () => {
    convertFile(file);
    setHasChanges(false);
  };

  if (isConverting) {
    return (
      <div className="flex items-center justify-center p-8">
        <DialogHeader>
          <DialogTitle>Edit {file.name}</DialogTitle>
        </DialogHeader>
        <div className="flex items-center space-x-3">
          <Loader2 className="animate-spin h-5 w-5" />
          <span>Converting file...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-8 space-y-4">
        <DialogHeader>
          <DialogTitle>Edit {file.name}</DialogTitle>
        </DialogHeader>
        <span className="text-red-600">{error}</span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => convertFile(file)}
        >
          Try Again
        </Button>
      </div>
    );
  }

  if (numatbData) {
    const materials = numatbData.Matl?.V16?.entries || [];

    return (
      <>
        <DialogHeader>
          <DialogTitle>Edit {file.name}</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* Action buttons */}
          <div className="flex justify-between items-center">
            <div className="flex space-x-2">
              <Button
                onClick={handleSave}
                disabled={!hasChanges || isSaving}
                size="sm"
                className="flex items-center space-x-2"
              >
                {isSaving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                <span>{isSaving ? "Saving..." : "Save"}</span>
              </Button>
              
              <Button
                onClick={handleReset}
                disabled={isConverting || isSaving}
                variant="outline"
                size="sm"
                className="flex items-center space-x-2"
              >
                <RotateCcw className="h-4 w-4" />
                <span>Reset</span>
              </Button>
            </div>
            
            {hasChanges && (
              <span className="text-sm text-orange-600">Unsaved changes</span>
            )}
          </div>

          <Separator />

          {/* Materials list */}
          <div className="space-y-6 max-h-[60vh] overflow-y-auto">
            {materials.map((material, materialIndex) => (
              <Card key={materialIndex} className="p-4">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold text-lg">{material.material_label}</h4>
                    <span className="text-sm text-gray-500">{material.shader_label}</span>
                  </div>
                  
                  <div className="space-y-3">
                    <Label className="text-sm font-medium">Texture Paths</Label>
                    {material.attributes
                      .filter(attr => attr.param.data.String1 !== undefined)
                      .map((attribute, index) => {
                        const attributeIndex = material.attributes.findIndex(attr => attr === attribute);
                        return (
                          <div key={index} className="space-y-2">
                            <Label className="text-xs text-gray-600">{attribute.param_id}</Label>
                            <Input
                              value={attribute.param.data.String1 || ""}
                              onChange={(e) => handleTexturePathChange(materialIndex, attributeIndex, e.target.value)}
                              placeholder="Texture path..."
                              className="font-mono text-sm"
                            />
                          </div>
                        );
                      })}
                  </div>
                  
                  {/* Show other attributes as read-only */}
                  <div className="pt-2 border-t">
                    <Label className="text-xs text-gray-500 mb-2 block">Other Attributes (Read-only)</Label>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      {material.attributes
                        .filter(attr => attr.param.data.String1 === undefined)
                        .slice(0, 8) // Show only first 8 to avoid clutter
                        .map((attribute, index) => (
                          <div key={index} className="text-gray-500">
                            <span className="font-medium">{attribute.param_id}:</span>{" "}
                            <span>
                              {attribute.param.data.Boolean !== undefined ? `Boolean(${attribute.param.data.Boolean})` :
                               attribute.param.data.Float !== undefined ? `Float(${attribute.param.data.Float})` :
                               attribute.param.data.Float1 !== undefined ? `Float1(${attribute.param.data.Float1})` :
                               attribute.param.data.Vector4 ? `Vector4(${attribute.param.data.Vector4.x}, ${attribute.param.data.Vector4.y}, ${attribute.param.data.Vector4.z}, ${attribute.param.data.Vector4.w})` :
                               attribute.param.data.Unk7 ? `Color(${attribute.param.data.Unk7.r}, ${attribute.param.data.Unk7.g}, ${attribute.param.data.Unk7.b}, ${attribute.param.data.Unk7.a})` :
                               attribute.param.data.Sampler ? "Sampler" : "Unknown"}
                            </span>
                          </div>
                        ))}
                      {material.attributes.filter(attr => attr.param.data.String1 === undefined).length > 8 && (
                        <div className="text-gray-400 text-xs">
                          +{material.attributes.filter(attr => attr.param.data.String1 === undefined).length - 8} more...
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </>
    );
  }

  return (
    <div>
      <DialogHeader>
        <DialogTitle>Edit {file.name}</DialogTitle>
      </DialogHeader>
      <div className="flex items-center justify-center h-32 text-gray-500">
        No data to display
      </div>
    </div>
  );
}
