import { useState, useCallback, useEffect, useMemo } from "react";
import { AppRndModalShell } from "@/components/AppRndModalShell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, X, FolderOpen, Settings, ImagePlus, Loader2 } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { basename, join } from "@tauri-apps/api/path";
import { ImageFormat, useNutexbStore } from "../../../../store/nutexbStore";
import { useConfigStore } from "../../../../store/configStore";
import { toast } from "sonner";
import { VirtualizedSelectedFileList } from "../VirtualizedSelectedFileList";

const IMG_TO_NUTEXB_DIMENSIONS = {
  width: 860,
  height: 800,
  minWidth: 620,
  minHeight: 560,
};

interface ImgToNutexbToolProps {
  onClose?: () => void;
}

export function ImgToNutexbTool({ onClose }: ImgToNutexbToolProps) {
  const [selectedImagePaths, setSelectedImagePaths] = useState<string[]>([]);
  const [fileNames, setFileNames] = useState<{[key: string]: {baseName: string, displayName: string}}>({});
  const [isDragOver, setIsDragOver] = useState(false);
  const [outputPath, setOutputPath] = useState<string>("");
  const [isOpen, setIsOpen] = useState(false);
  const [conversionProgress, setConversionProgress] = useState<{ current: number; total: number; currentFile?: string; failedFiles: string[] } | null>(null);

  const {
    selectedFormat,
    hasMipmaps,
    isConverting,
    error,
    setSelectedFormat,
    setHasMipmaps,
    convertImageToNutexb,
    convertImageToNutexbInternal,
    resetConversion
  } = useNutexbStore();

  const { imgToNutexbOutputPath, store } = useConfigStore();

  // Load output path from config on mount
  useEffect(() => {
    setOutputPath(imgToNutexbOutputPath || "");
  }, [imgToNutexbOutputPath]);

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

  // Handle output directory selection
  const handleOutputPathSelect = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
      });

      if (selected && !Array.isArray(selected)) {
        setOutputPath(selected);
        // Save to config
        if (store) {
          await store.set("imgToNutexbOutputPath", selected);
          await store.save();
        }
      }
    } catch (error) {
      console.error("Error selecting output directory:", error);
      toast.error("Failed to select output directory");
    }
  };

  // Process selected image file metadata without copying image bytes into JS.
  const handleImageFiles = async (imagePaths: string[]) => {
    try {
      setSelectedImagePaths(imagePaths);

      const nameEntries = await Promise.all(
        imagePaths.map(async (imagePath) => {
          const fullFileName = await basename(imagePath);
          return [
            imagePath,
            { baseName: fullFileName.replace(/\.[^/.]+$/, ""), displayName: fullFileName },
          ] as const;
        }),
      );
      setFileNames(Object.fromEntries(nameEntries));
    } catch (error) {
      console.error("Error processing image files:", error);
      toast.error("Failed to process image files");
    }
  };

  // Handle batch conversion with concurrency control
  const handleConvert = async () => {
    if (selectedImagePaths.length === 0) {
      toast.error("Please select at least one image file");
      return;
    }

    if (!outputPath) {
      toast.error("Please select an output directory");
      return;
    }

    try {
      setConversionProgress({ current: 0, total: selectedImagePaths.length, failedFiles: [] });

      const convertedPaths: string[] = [];
      const failedFiles: string[] = [];
      const maxConcurrency = 3; // Limit concurrent conversions

      // Process files in batches
      for (let i = 0; i < selectedImagePaths.length; i += maxConcurrency) {
        const batch = selectedImagePaths.slice(i, i + maxConcurrency);
        const batchPromises = batch.map(async (imagePath, batchIndex) => {
          const globalIndex = i + batchIndex;
          const fileInfo = fileNames[imagePath];
          if (!fileInfo) return null;

          try {
            setConversionProgress(prev => prev ? {
              ...prev,
              currentFile: fileInfo.displayName
            } : null);

            // Use the base name as both nutexb name and output filename
            const outputFileName = `${fileInfo.baseName}.nutexb`;
            const outputPathFull = await join(outputPath, outputFileName);

            // Use baseName as the nutexb name - call the internal conversion without setting global state
            await convertImageToNutexbInternal(imagePath, outputPathFull, fileInfo.baseName);
            convertedPaths.push(outputPathFull);

            setConversionProgress(prev => prev ? {
              ...prev,
              current: globalIndex + 1
            } : null);

            return outputPathFull;
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error(`Failed to convert ${fileInfo.displayName}:`, error);
            failedFiles.push(`${fileInfo.displayName}: ${message}`);
            return null;
          }
        });

        await Promise.all(batchPromises);
      }

      setConversionProgress(null);

      const successCount = convertedPaths.length;
      const failureCount = failedFiles.length;

      if (successCount > 0) {
        toast.success(`Successfully converted ${successCount} image(s) to nutexb format${failureCount > 0 ? `. ${failureCount} failed.` : ''}`);
      }

      if (failureCount > 0) {
        toast.error(`Failed to convert ${failureCount} file(s): ${failedFiles.slice(0, 3).join(', ')}${failureCount > 3 ? '...' : ''}`);
      }

      // Only close modal if all files failed
      if (successCount === 0 && failureCount > 0) {
        setIsOpen(false);
        if (onClose) onClose();
      }

      // Reset form only if all conversions succeeded
      if (successCount > 0 && failureCount === 0) {
        handleReset();
      }
    } catch (error) {
      console.error("Batch conversion failed:", error);
      setConversionProgress(null);
      toast.error("Batch conversion failed");
    }
  };

  // Reset form
  const handleReset = () => {
    setSelectedImagePaths([]);
    setFileNames({});
    setConversionProgress(null);
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

  const selectedFileItems = useMemo(
    () =>
      selectedImagePaths.map((imagePath) => {
        const fileInfo = fileNames[imagePath];
        return {
          path: imagePath,
          title: fileInfo?.displayName || imagePath.split(/[/\\]/).pop() || imagePath,
          description: `${fileInfo?.baseName ?? ""} → ${fileInfo?.baseName ?? ""}.nutexb`,
        };
      }),
    [fileNames, selectedImagePaths],
  );

  const progressContent = isConverting || conversionProgress ? (
      <div className="flex flex-1 flex-col items-center justify-center space-y-4 p-8">
        <Loader2 className="h-8 w-8 animate-spin" />
        {conversionProgress ? (
          <div className="w-full max-w-md space-y-2">
            <div className="text-center">
              <span className="text-muted-foreground">
                Converting {conversionProgress.current} of {conversionProgress.total} images...
              </span>
            </div>
            {conversionProgress.currentFile && (
              <div className="text-center text-sm text-muted-foreground truncate">
                Current: {conversionProgress.currentFile}
              </div>
            )}
            <div className="w-full bg-secondary rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${(conversionProgress.current / conversionProgress.total) * 100}%` }}
              ></div>
            </div>
            {conversionProgress.failedFiles.length > 0 && (
              <div className="text-center text-sm text-red-600">
                Failed: {conversionProgress.failedFiles.length} files
              </div>
            )}
          </div>
        ) : (
          <span className="text-muted-foreground">Converting image to nutexb...</span>
        )}
      </div>
  ) : null;

  return (
    <>
      <Button variant="outline" className="w-full" onClick={() => setIsOpen(true)}>
        Open Image to Nutexb
      </Button>
      {isOpen ? (
        <AppRndModalShell
          titleId="image-to-nutexb-title"
          title="Image to Nutexb Converter"
          subtitle="Batch convert image files to nutexb"
          headerIcon={<ImagePlus className="h-5 w-5 text-primary" />}
          dimensions={IMG_TO_NUTEXB_DIMENSIONS}
          storageKey="app.rnd-size.image-to-nutexb"
          onClose={() => setIsOpen(false)}
          closeDisabled={isConverting || Boolean(conversionProgress)}
        >
          {progressContent ?? (
            <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-4">
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      {/* Output Directory Setting */}
      <Card className="p-4">
        <div className="space-y-2">
          <Label htmlFor="output-path" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Output Directory
          </Label>
          <div className="flex gap-2">
            <Input
              id="output-path"
              value={outputPath}
              onChange={(e) => setOutputPath(e.target.value)}
              placeholder="Select output directory for nutexb files"
              className="flex-1"
            />
            <Button variant="outline" onClick={handleOutputPathSelect}>
              <FolderOpen className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Select a directory where the converted nutexb files will be saved
          </p>
        </div>
      </Card>

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
          <VirtualizedSelectedFileList
            items={selectedFileItems}
            onRemove={(path) => handleRemoveImage(path)}
            showPreview
          />
        </Card>
      )}

      {selectedImagePaths.length > 0 && outputPath && (
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
              disabled={selectedImagePaths.length === 0 || !outputPath}
              className="flex-1"
            >
              Convert All to Nutexb
            </Button>
          </div>
        </>
      )}
            </div>
          )}
        </AppRndModalShell>
      ) : null}
    </>
  );
}

