import { useState, useCallback, useRef } from "react";
import { DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Upload, X, FileImage } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { readFile } from "@tauri-apps/plugin-fs";
import { basename, join, dirname } from "@tauri-apps/api/path";
import { ImageFormat, useNutexbStore } from "../../../store/nutexbStore";
import { toast } from "sonner";

interface NutexbImportDialogProps {
  currentDirectory?: string;
  onImportComplete?: (filePath: string) => void;
  onClose?: () => void;
}

export function NutexbImportDialog({ 
  currentDirectory, 
  onImportComplete, 
  onClose 
}: NutexbImportDialogProps) {
  const [selectedImagePath, setSelectedImagePath] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [nutexbName, setNutexbName] = useState<string>("");
  const [outputFileName, setOutputFileName] = useState<string>("");
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { 
    selectedFormat, 
    hasMipmaps, 
    isConverting, 
    error,
    setSelectedFormat, 
    setHasMipmaps, 
    convertImageToNutexb,
    resetConversion
  } = useNutexbStore();

  // Handle file drop
  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);

    const files = Array.from(e.dataTransfer.files);
    const imageFile = files.find(file => 
      file.type.startsWith('image/') || 
      /\.(png|jpg|jpeg|bmp|gif|webp|tiff|tif)$/i.test(file.name)
    );

    if (imageFile) {
      // For drag and drop, we'll use file selection dialog instead
      // since Web File API doesn't provide file paths
      toast.info("Please use the file selection button to choose your image");
      await handleFileSelect();
    } else {
      toast.error("Please drop an image file (PNG, JPG, BMP, etc.)");
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  // Handle file selection
  const handleFileSelect = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [
          {
            name: "Image Files",
            extensions: ["png", "jpg", "jpeg", "bmp", "gif", "webp", "tiff", "tif"],
          },
        ],
      });

      if (selected && typeof selected === "string") {
        await handleImageFile(selected);
      }
    } catch (error) {
      console.error("Error selecting file:", error);
      toast.error("Failed to select file");
    }
  };

  // Process selected image file
  const handleImageFile = async (imagePath: string) => {
    try {
      setSelectedImagePath(imagePath);
      
      // Generate default names
      const fileName = await basename(imagePath);
      const nameWithoutExt = fileName.replace(/\.[^/.]+$/, "");
      setNutexbName(nameWithoutExt);
      setOutputFileName(nameWithoutExt + ".nutexb");

      // Load image preview
      const imageBytes = await readFile(imagePath);
      const base64 = btoa(
        Array.from(new Uint8Array(imageBytes))
          .map(b => String.fromCharCode(b))
          .join('')
      );
      setImagePreview(`data:image/png;base64,${base64}`);
    } catch (error) {
      console.error("Error processing image file:", error);
      toast.error("Failed to process image file");
    }
  };

  // Handle conversion
  const handleConvert = async () => {
    if (!selectedImagePath || !outputFileName || !nutexbName) {
      toast.error("Please provide all required information");
      return;
    }

    try {
      const outputDir = currentDirectory || await dirname(selectedImagePath);
      const outputPath = await join(outputDir, outputFileName);
      
      await convertImageToNutexb(selectedImagePath, outputPath, nutexbName);
      
      toast.success(`Successfully converted to ${outputFileName}`);
      
      if (onImportComplete) {
        onImportComplete(outputPath);
      }
      
      // Reset and close
      handleReset();
      if (onClose) {
        onClose();
      }
    } catch (error) {
      console.error("Conversion failed:", error);
      // Error is already handled in the store
    }
  };

  // Reset form
  const handleReset = () => {
    setSelectedImagePath(null);
    setImagePreview(null);
    setNutexbName("");
    setOutputFileName("");
    resetConversion();
  };

  const handleRemoveImage = () => {
    setSelectedImagePath(null);
    setImagePreview(null);
    setNutexbName("");
    setOutputFileName("");
  };

  if (isConverting) {
    return (
      <div className="flex flex-col items-center justify-center p-8 space-y-4">
        <DialogHeader>
          <DialogTitle>Create Nutexb File</DialogTitle>
        </DialogHeader>
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
        <span className="text-gray-600">Converting image to nutexb...</span>
      </div>
    );
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Create Nutexb File</DialogTitle>
      </DialogHeader>
      
      <div className="space-y-6">
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {/* File Selection Area */}
        {!selectedImagePath ? (
          <Card
            className={`border-2 border-dashed transition-colors cursor-pointer ${
              isDragOver 
                ? 'border-blue-400 bg-blue-50' 
                : 'border-gray-300 hover:border-gray-400'
            }`}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={handleFileSelect}
          >
            <div className="flex flex-col items-center justify-center p-8 text-center">
              <Upload className="h-12 w-12 text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Select or drop an image file
              </h3>
              <p className="text-sm text-gray-500 mb-4">
                Supports PNG, JPG, BMP, GIF, WebP, TIFF formats
              </p>
              <Button variant="outline" type="button">
                Browse Files
              </Button>
            </div>
          </Card>
        ) : (
          /* Selected Image Preview */
          <Card className="p-4">
            <div className="flex items-start gap-4">
              <div className="flex-1">
                <div className="flex items-center justify-between mb-3">
                  <Label className="text-sm font-medium">Selected Image</Label>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={handleRemoveImage}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                {imagePreview && (
                  <AspectRatio ratio={16/9} className="bg-muted rounded-lg overflow-hidden">
                    <img
                      src={imagePreview}
                      alt="Preview"
                      className="w-full h-full object-contain"
                    />
                  </AspectRatio>
                )}
              </div>
            </div>
          </Card>
        )}

        {selectedImagePath && (
          <>
            {/* Configuration */}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="nutexb-name">Nutexb Name</Label>
                <Input
                  id="nutexb-name"
                  value={nutexbName}
                  onChange={(e) => setNutexbName(e.target.value)}
                  placeholder="Enter texture name"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="output-filename">Output File Name</Label>
                <Input
                  id="output-filename"
                  value={outputFileName}
                  onChange={(e) => setOutputFileName(e.target.value)}
                  placeholder="Enter output filename"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="format-select">Image Format</Label>
                <Select
                  value={selectedFormat}
                  onValueChange={(value) => setSelectedFormat(value as ImageFormat)}
                >
                  <SelectTrigger id="format-select">
                    <SelectValue placeholder="Select format" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="R8Unorm">R8Unorm</SelectItem>
                    <SelectItem value="Rgba8Unorm">Rgba8Unorm</SelectItem>
                    <SelectItem value="Rgba8UnormSrgb">Rgba8UnormSrgb</SelectItem>
                    <SelectItem value="Rgba32Float">Rgba32Float</SelectItem>
                    <SelectItem value="Bgra8Unorm">Bgra8Unorm</SelectItem>
                    <SelectItem value="Bgra8UnormSrgb">Bgra8UnormSrgb</SelectItem>
                    <SelectItem value="BC1RgbaUnorm">BC1RgbaUnorm</SelectItem>
                    <SelectItem value="BC1RgbaUnormSrgb">BC1RgbaUnormSrgb</SelectItem>
                    <SelectItem value="BC2RgbaUnorm">BC2RgbaUnorm</SelectItem>
                    <SelectItem value="BC2RgbaUnormSrgb">BC2RgbaUnormSrgb</SelectItem>
                    <SelectItem value="BC3RgbaUnorm">BC3RgbaUnorm</SelectItem>
                    <SelectItem value="BC3RgbaUnormSrgb">BC3RgbaUnormSrgb</SelectItem>
                    <SelectItem value="BC4RUnorm">BC4RUnorm</SelectItem>
                    <SelectItem value="BC4RSnorm">BC4RSnorm</SelectItem>
                    <SelectItem value="BC5RgUnorm">BC5RgUnorm</SelectItem>
                    <SelectItem value="BC5RgSnorm">BC5RgSnorm</SelectItem>
                    <SelectItem value="BC6hRgbUfloat">BC6hRgbUfloat</SelectItem>
                    <SelectItem value="BC6hRgbSfloat">BC6hRgbSfloat</SelectItem>
                    <SelectItem value="BC7RgbaUnorm">BC7RgbaUnorm</SelectItem>
                    <SelectItem value="BC7RgbaUnormSrgb">BC7RgbaUnormSrgb</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="mipmaps"
                  checked={hasMipmaps}
                  onCheckedChange={(checked) => setHasMipmaps(checked === true)}
                />
                <Label htmlFor="mipmaps">Generate Mipmaps</Label>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 pt-4">
              <Button 
                variant="outline" 
                onClick={handleReset}
                className="flex-1"
              >
                Reset
              </Button>
              <Button 
                onClick={handleConvert}
                disabled={!selectedImagePath || !outputFileName || !nutexbName}
                className="flex-1"
              >
                Convert to Nutexb
              </Button>
            </div>
          </>
        )}
      </div>
    </>
  );
} 