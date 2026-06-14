import { useState, useCallback, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, X, FileImage } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { basename, join, dirname } from "@tauri-apps/api/path";
import { ImageFormat, useNutexbStore } from "../../../store/nutexbStore";
import { toast } from "sonner";

interface NutexbImportPanelProps {
  currentDirectory?: string;
  onImportComplete?: (filePath: string) => void;
  onClose?: () => void;
}

export function NutexbImportPanel({
  currentDirectory,
  onImportComplete,
  onClose
}: NutexbImportPanelProps) {
  const [selectedImagePaths, setSelectedImagePaths] = useState<string[]>([]);
  const [fileNames, setFileNames] = useState<{[key: string]: {baseName: string, displayName: string}}>({});
  const [isDragOver, setIsDragOver] = useState(false);
  const imageListRef = useRef<HTMLDivElement>(null);

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
  const imageListVirtualizer = useVirtualizer({
    count: selectedImagePaths.length,
    getScrollElement: () => imageListRef.current,
    estimateSize: () => 72,
    getItemKey: (index) => selectedImagePaths[index] ?? index,
    overscan: 4,
  });

  // Handle file drop
  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);

    const files = Array.from(e.dataTransfer.files);
    const imageFiles = files.filter(file =>
      file.type.startsWith('image/') ||
      /\.(png|jpg|jpeg|bmp|gif|webp|tiff|tif)$/i.test(file.name)
    );

    if (imageFiles.length > 0) {
      // For drag and drop, we'll use file selection dialog instead
      // since Web File API doesn't provide file paths
      toast.info(`Found ${imageFiles.length} image file(s). Please use the file selection button to choose your images`);
      await handleFileSelect();
    } else {
      toast.error("Please drop image files (PNG, JPG, BMP, etc.)");
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
        multiple: true,
        filters: [
          {
            name: "Image Files",
            extensions: ["png", "jpg", "jpeg", "bmp", "gif", "webp", "tiff", "tif"],
          },
        ],
      });

      if (selected) {
        const filePaths = Array.isArray(selected) ? selected : [selected];
        await handleImageFiles(filePaths);
      }
    } catch (error) {
      console.error("Error selecting files:", error);
      toast.error("Failed to select files");
    }
  };

  // Process selected image files
  const handleImageFiles = async (imagePaths: string[]) => {
    try {
      setSelectedImagePaths(imagePaths);

      const nameEntries = await Promise.all(
        imagePaths.map(async (imagePath) => {
          const fullFileName = await basename(imagePath);
          return [
            imagePath,
            {
              baseName: fullFileName.replace(/\.[^/.]+$/, ""),
              displayName: fullFileName,
            },
          ] as const;
        }),
      );
      const names = Object.fromEntries(nameEntries);
      setFileNames(names);
    } catch (error) {
      console.error("Error processing image files:", error);
      toast.error("Failed to process image files");
    }
  };

  // Handle batch conversion
  const handleConvert = async () => {
    if (selectedImagePaths.length === 0) {
      toast.error("Please select at least one image file");
      return;
    }

    try {
      const outputDir = currentDirectory || await dirname(selectedImagePaths[0]);
      const convertedPaths: string[] = [];

      for (const imagePath of selectedImagePaths) {
        const fileInfo = fileNames[imagePath];
        if (!fileInfo) continue;

        // Use the base name as both nutexb name and output filename
        const outputFileName = `${fileInfo.baseName}.nutexb`;
        const outputPath = await join(outputDir, outputFileName);

        // Use baseName as the nutexb name
        await convertImageToNutexb(imagePath, outputPath, fileInfo.baseName);
        convertedPaths.push(outputPath);
      }

      toast.success(`Successfully converted ${selectedImagePaths.length} image(s)`);

      // Call onImportComplete for each converted file
      if (onImportComplete) {
        convertedPaths.forEach(path => onImportComplete(path));
      }

      // Reset and close
      handleReset();
      if (onClose) {
        onClose();
      }
    } catch (error) {
      console.error("Batch conversion failed:", error);
      // Error is already handled in the store
    }
  };

  // Reset form
  const handleReset = () => {
    setSelectedImagePaths([]);
    setFileNames({});
    resetConversion();
  };

  const handleRemoveImage = (imagePath?: string) => {
    if (imagePath) {
      // Remove specific image
      setSelectedImagePaths(prev => prev.filter(path => path !== imagePath));
      setFileNames(prev => {
        const newNames = {...prev};
        delete newNames[imagePath];
        return newNames;
      });
    } else {
      // Remove all images
      setSelectedImagePaths([]);
      setFileNames({});
    }
  };

  if (isConverting) {
    return (
      <div className="flex flex-col items-center justify-center p-8 space-y-4">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
        <span className="text-muted-foreground">Converting image to nutexb...</span>
      </div>
    );
  }

  return (
    <div>

      <div className="space-y-6">
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {/* File Selection Area */}
        {selectedImagePaths.length === 0 ? (
          <Card
            className={`border-2 border-dashed transition-colors cursor-pointer ${
              isDragOver 
                ? 'border-blue-400 bg-primary/10' 
                : 'border-gray-300 hover:border-gray-400'
            }`}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={handleFileSelect}
          >
            <div className="flex flex-col items-center justify-center p-8 text-center">
              <Upload className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">
                Select or drop image files
              </h3>
              <p className="text-sm text-muted-foreground mb-4">
                Supports PNG, JPG, BMP, GIF, WebP, TIFF formats (batch selection supported)
              </p>
              <Button variant="outline" type="button">
                Browse Files
              </Button>
            </div>
          </Card>
        ) : (
          /* Selected Images List */
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <Label className="text-sm font-medium">
                Selected Images ({selectedImagePaths.length})
              </Label>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleRemoveImage()}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div ref={imageListRef} className="h-60 overflow-y-auto overscroll-contain">
              <div
                className="relative w-full"
                style={{ height: `${imageListVirtualizer.getTotalSize()}px` }}
              >
                {imageListVirtualizer.getVirtualItems().map((virtualRow) => {
                  const imagePath = selectedImagePaths[virtualRow.index];
                  const fileInfo = fileNames[imagePath];
                  return (
                    <div
                      key={virtualRow.key}
                      className="absolute left-0 top-0 w-full pb-2"
                      style={{
                        height: `${virtualRow.size}px`,
                        transform: `translateY(${virtualRow.start}px)`,
                      }}
                    >
                      <div className="flex h-16 items-center gap-3 rounded-md border p-2">
                        <div className="h-12 w-12 shrink-0 overflow-hidden rounded bg-muted">
                          <img
                            src={convertFileSrc(imagePath)}
                            alt=""
                            loading="lazy"
                            decoding="async"
                            className="h-full w-full object-cover"
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">
                            {fileInfo?.displayName || imagePath.split(/[/\\]/).pop()}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {fileInfo?.baseName} → {fileInfo?.baseName}.nutexb
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {virtualRow.index + 1} of {selectedImagePaths.length}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0"
                          aria-label="Remove image"
                          onClick={() => handleRemoveImage(imagePath)}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </Card>
        )}

        {selectedImagePaths.length > 0 && (
          <>
            {/* Configuration */}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="format-select">Image Format (applied to all files)</Label>
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
                disabled={selectedImagePaths.length === 0}
                className="flex-1"
              >
                Convert All to Nutexb
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
