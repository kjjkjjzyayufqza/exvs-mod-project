import { useState, useCallback, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, X, FileImage, FolderOpen, Settings } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { open } from "@tauri-apps/plugin-dialog";
import { readFile } from "@tauri-apps/plugin-fs";
import { basename, join } from "@tauri-apps/api/path";
import { ImageFormat, useNutexbStore } from "../../../../store/nutexbStore";
import { useConfigStore } from "../../../../store/configStore";
import { toast } from "sonner";

interface ImgToNutexbToolProps {
  onClose?: () => void;
}

export function ImgToNutexbTool({ onClose }: ImgToNutexbToolProps) {
  const [selectedImagePaths, setSelectedImagePaths] = useState<string[]>([]);
  const [imagePreviews, setImagePreviews] = useState<{[key: string]: string}>({});
  const [fileNames, setFileNames] = useState<{[key: string]: {baseName: string, displayName: string}}>({});
  const [isDragOver, setIsDragOver] = useState(false);
  const [outputPath, setOutputPath] = useState<string>("");
  const [isOpen, setIsOpen] = useState(false);
  const [conversionProgress, setConversionProgress] = useState<{ current: number; total: number; currentFile?: string; failedFiles: string[] } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  // Process selected image files with optimized preview loading
  const handleImageFiles = async (imagePaths: string[]) => {
    try {
      setSelectedImagePaths(imagePaths);

      // Generate file names and load previews for all files
      const names: {[key: string]: {baseName: string, displayName: string}} = {};

      // First pass: generate file names (fast)
      for (const imagePath of imagePaths) {
        try {
          const fullFileName = await basename(imagePath);
          const baseName = fullFileName.replace(/\.[^/.]+$/, ""); // Remove extension

          names[imagePath] = {
            baseName: baseName,
            displayName: fullFileName
          };
        } catch (error) {
          console.error(`Error processing filename for ${imagePath}:`, error);
        }
      }

      setFileNames(names);

      // Second pass: load previews in batches to avoid overwhelming the system
      const batchSize = 10; // Process 10 previews at a time
      const previews: {[key: string]: string} = {};

      for (let i = 0; i < imagePaths.length; i += batchSize) {
        const batch = imagePaths.slice(i, i + batchSize);
        const batchPromises = batch.map(async (imagePath) => {
          try {
            // Load compressed preview (limit size for performance)
            const imageBytes = await readFile(imagePath);

            // For previews, limit the size and use a more efficient encoding
            // Only create preview for the first 50KB to keep it lightweight
            const maxPreviewSize = 50 * 1024; // 50KB limit
            const previewBytes = imageBytes.length > maxPreviewSize
              ? imageBytes.slice(0, maxPreviewSize)
              : imageBytes;

            const base64 = btoa(
              Array.from(new Uint8Array(previewBytes))
                .map(b => String.fromCharCode(b))
                .join('')
            );
            previews[imagePath] = `data:image/png;base64,${base64}`;
          } catch (error) {
            console.error(`Error loading preview for ${imagePath}:`, error);
            // Use a placeholder for failed previews
            previews[imagePath] = '';
          }
        });

        await Promise.all(batchPromises);

        // Update previews incrementally to show progress
        setImagePreviews(prev => ({ ...prev, ...previews }));

        // Small delay to prevent UI blocking
        if (i + batchSize < imagePaths.length) {
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      }
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
            console.error(`Failed to convert ${fileInfo.displayName}:`, error);
            failedFiles.push(fileInfo.displayName);
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
    setImagePreviews({});
    setFileNames({});
    setConversionProgress(null);
    resetConversion();
  };

  const handleRemoveImage = (imagePath?: string) => {
    if (imagePath) {
      // Remove specific image
      setSelectedImagePaths(prev => prev.filter(path => path !== imagePath));
      setImagePreviews(prev => {
        const newPreviews = {...prev};
        delete newPreviews[imagePath];
        return newPreviews;
      });
      setFileNames(prev => {
        const newNames = {...prev};
        delete newNames[imagePath];
        return newNames;
      });
    } else {
      // Remove all images
      setSelectedImagePaths([]);
      setImagePreviews({});
      setFileNames({});
    }
  };

  if (isConverting || conversionProgress) {
    return (
      <div className="flex flex-col items-center justify-center p-8 space-y-4">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
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
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full">
          Open Image to Nutexb
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[800px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Image to Nutexb Converter</DialogTitle>
          <DialogDescription>
            Convert image files to nutexb format with custom output directory. Select images and configure conversion options.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-6">
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
          <div className="grid grid-cols-1 gap-3 max-h-60 overflow-y-auto">
            {selectedImagePaths.map((imagePath, index) => {
              const fileInfo = fileNames[imagePath];
              const hasPreview = imagePreviews[imagePath] !== undefined;
              const previewLoaded = imagePreviews[imagePath] !== '';

              return (
                <div key={imagePath} className="flex items-center gap-3 p-2 border rounded-lg">
                  <div className="w-12 h-12 bg-muted rounded overflow-hidden flex-shrink-0 flex items-center justify-center">
                    {hasPreview ? (
                      previewLoaded ? (
                        <img
                          src={imagePreviews[imagePath]}
                          alt={`Preview ${index + 1}`}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-4 h-4 border border-gray-300 rounded-full border-t-transparent animate-spin"></div>
                      )
                    ) : (
                      <FileImage className="w-6 h-6 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{fileInfo?.displayName || imagePath.split(/[/\\]/).pop()}</p>
                    <p className="text-xs text-muted-foreground">
                      Base name: {fileInfo?.baseName} → {fileInfo?.baseName}.nutexb
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {index + 1} of {selectedImagePaths.length}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemoveImage(imagePath)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              );
            })}
          </div>
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
      </DialogContent>
    </Dialog>
  );
}

