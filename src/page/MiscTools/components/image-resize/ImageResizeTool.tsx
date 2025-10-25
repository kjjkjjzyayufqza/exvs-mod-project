import { useState, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Upload, X, FileImage, Loader2, Settings } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { open } from "@tauri-apps/plugin-dialog";
import { basename, join, resourceDir } from "@tauri-apps/api/path";
import { Command } from "@tauri-apps/plugin-shell";
import { exists } from "@tauri-apps/plugin-fs";
import { toast } from "sonner";

interface ImageResizeToolProps {
  onClose?: () => void;
}

export function ImageResizeTool({ onClose }: ImageResizeToolProps) {
  const [selectedImagePaths, setSelectedImagePaths] = useState<string[]>([]);
  const [fileNames, setFileNames] = useState<{[key: string]: {baseName: string, displayName: string, extension: string}}>({});
  const [isOpen, setIsOpen] = useState(false);
  const [width, setWidth] = useState(1024);
  const [height, setHeight] = useState(1024);
  const [overwriteOriginal, setOverwriteOriginal] = useState(true);
  const [isResizing, setIsResizing] = useState(false);
  const [resizeProgress, setResizeProgress] = useState<{ current: number; total: number; currentFile?: string; failedFiles: string[] } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

      // Generate file names for all files
      const names: {[key: string]: {baseName: string, displayName: string, extension: string}} = {};

      for (const imagePath of imagePaths) {
        try {
          const fullFileName = await basename(imagePath);
          const extension = fullFileName.substring(fullFileName.lastIndexOf('.'));
          const baseName = fullFileName.replace(extension, "");

          names[imagePath] = {
            baseName: baseName,
            displayName: fullFileName,
            extension: extension
          };
        } catch (error) {
          console.error(`Error processing filename for ${imagePath}:`, error);
        }
      }

      setFileNames(names);
    } catch (error) {
      console.error("Error processing image files:", error);
      toast.error("Failed to process image files");
    }
  };

  // Handle batch resize
  const handleResize = async () => {
    if (selectedImagePaths.length === 0) {
      toast.error("Please select at least one image file");
      return;
    }

    if (width <= 0 || height <= 0) {
      toast.error("Width and height must be greater than 0");
      return;
    }

    try {
      setIsResizing(true);
      setResizeProgress({ current: 0, total: selectedImagePaths.length, failedFiles: [] });

      const resourcePath = await resourceDir();
      const magickPath = await join(resourcePath, "tools/magick.exe");

      // Check if magick exists
      const magickExists = await exists(magickPath);
      if (!magickExists) {
        throw new Error(`magick not found: ${magickPath}`);
      }

      const resizedPaths: string[] = [];
      const failedFiles: string[] = [];

      // Process each file
      for (let i = 0; i < selectedImagePaths.length; i++) {
        const imagePath = selectedImagePaths[i];
        const fileInfo = fileNames[imagePath];

        if (!fileInfo) continue;

        try {
          setResizeProgress(prev => prev ? {
            ...prev,
            currentFile: fileInfo.displayName
          } : null);

          let outputPath: string;

          if (overwriteOriginal) {
            // Overwrite original file
            outputPath = imagePath;
          } else {
            // Create new file with _cov suffix
            const dir = imagePath.substring(0, imagePath.lastIndexOf('/') + 1 || imagePath.lastIndexOf('\\') + 1);
            const newFileName = `${fileInfo.baseName}_cov${fileInfo.extension}`;
            outputPath = dir + newFileName;
          }

          // Build magick command for resizing
          const magickCommand = Command.create('exec-cmd', [
            "/c",
            magickPath,
            imagePath,
            "-resize",
            `${width}x${height}`,
            outputPath
          ], { encoding: 'utf-8' });

          console.log(`Resizing ${fileInfo.displayName} to ${width}x${height}...`);

          const result = await magickCommand.execute();

          if (result.code === 0) {
            resizedPaths.push(outputPath);
            console.log(`Successfully resized ${fileInfo.displayName}`);
          } else {
            console.error(`Failed to resize ${fileInfo.displayName}:`, result.stderr);
            failedFiles.push(fileInfo.displayName);
          }

        } catch (error) {
          console.error(`Error resizing ${fileInfo.displayName}:`, error);
          failedFiles.push(fileInfo.displayName);
        }

        setResizeProgress(prev => prev ? {
          ...prev,
          current: i + 1,
          failedFiles: failedFiles
        } : null);
      }

      setResizeProgress(null);
      setIsResizing(false);

      const successCount = resizedPaths.length;
      const failureCount = failedFiles.length;

      if (successCount > 0) {
        toast.success(`Successfully resized ${successCount} image(s)${failureCount > 0 ? `. ${failureCount} failed.` : ''}`);
      }

      if (failureCount > 0) {
        toast.error(`Failed to resize ${failureCount} file(s): ${failedFiles.slice(0, 3).join(', ')}${failureCount > 3 ? '...' : ''}`);
      }

      // Only close modal if all files failed
      if (successCount === 0 && failureCount > 0) {
        setIsOpen(false);
        if (onClose) onClose();
      }

      // Reset form only if all resizes succeeded
      if (successCount > 0 && failureCount === 0) {
        handleReset();
      }

    } catch (error) {
      console.error("Batch resize failed:", error);
      setResizeProgress(null);
      setIsResizing(false);
      toast.error("Batch resize failed");
    }
  };

  // Reset form
  const handleReset = () => {
    setSelectedImagePaths([]);
    setFileNames({});
    setResizeProgress(null);
  };

  // Remove specific image
  const handleRemoveImage = (imagePath?: string) => {
    if (imagePath) {
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

  if (isResizing || resizeProgress) {
    return (
      <div className="flex flex-col items-center justify-center p-8 space-y-4">
        <Loader2 className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
        {resizeProgress ? (
          <div className="w-full max-w-md space-y-2">
            <div className="text-center">
              <span className="text-gray-600">
                Resizing {resizeProgress.current} of {resizeProgress.total} images...
              </span>
            </div>
            {resizeProgress.currentFile && (
              <div className="text-center text-sm text-gray-500 truncate">
                Current: {resizeProgress.currentFile}
              </div>
            )}
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${(resizeProgress.current / resizeProgress.total) * 100}%` }}
              ></div>
            </div>
            {resizeProgress.failedFiles.length > 0 && (
              <div className="text-center text-sm text-red-600">
                Failed: {resizeProgress.failedFiles.length} files
              </div>
            )}
          </div>
        ) : (
          <span className="text-gray-600">Resizing images...</span>
        )}
      </div>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full">
          Open Image Resizer
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>PNG Image Resizer</DialogTitle>
          <DialogDescription>
            Resize image files to specified dimensions using ImageMagick.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-6">

          {/* File Selection Area */}
          {selectedImagePaths.length === 0 ? (
            <Card
              className="border-2 border-dashed border-gray-300 hover:border-gray-400 cursor-pointer transition-colors"
              onClick={handleFileSelect}
            >
              <div className="flex flex-col items-center justify-center p-8 text-center">
                <Upload className="h-12 w-12 text-gray-400 mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  Select image files to resize
                </h3>
                <p className="text-sm text-gray-500 mb-4">
                  Batch resizing supported (PNG, JPG, BMP, GIF, WebP, TIFF)
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
                  Selected Image Files ({selectedImagePaths.length})
                </Label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRemoveImage()}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <div className="grid grid-cols-1 gap-3 max-h-40 overflow-y-auto">
                {selectedImagePaths.map((imagePath, index) => {
                  const fileInfo = fileNames[imagePath];

                  return (
                    <div key={imagePath} className="flex items-center gap-3 p-2 border rounded-lg">
                      <div className="w-8 h-8 bg-muted rounded overflow-hidden flex-shrink-0 flex items-center justify-center">
                        <FileImage className="w-4 h-4 text-gray-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{fileInfo?.displayName || imagePath.split(/[/\\]/).pop()}</p>
                        <p className="text-xs text-muted-foreground">
                          Output: {overwriteOriginal ? fileInfo?.displayName : `${fileInfo?.baseName}_cov${fileInfo?.extension}`}
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

          {selectedImagePaths.length > 0 && (
            <>
              {/* Resize Settings */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Settings className="h-4 w-4" />
                    Resize Dimensions
                  </Label>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="width-input">Width</Label>
                      <Input
                        id="width-input"
                        type="number"
                        min={1}
                        value={width}
                        onChange={(e) => {
                          const value = parseInt(e.target.value);
                          if (!isNaN(value) && value > 0) {
                            setWidth(value);
                          }
                        }}
                        className="w-full"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="height-input">Height</Label>
                      <Input
                        id="height-input"
                        type="number"
                        min={1}
                        value={height}
                        onChange={(e) => {
                          const value = parseInt(e.target.value);
                          if (!isNaN(value) && value > 0) {
                            setHeight(value);
                          }
                        }}
                        className="w-full"
                      />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    All selected images will be resized to {width}x{height} pixels
                  </p>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="overwrite"
                    checked={overwriteOriginal}
                    onCheckedChange={(checked) => setOverwriteOriginal(checked === true)}
                  />
                  <Label htmlFor="overwrite">Overwrite original files</Label>
                </div>
                <p className="text-xs text-muted-foreground">
                  {!overwriteOriginal && "If unchecked, resized files will be saved as <name>_cov.<ext>"}
                </p>
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
                  onClick={handleResize}
                  disabled={selectedImagePaths.length === 0}
                  className="flex-1"
                >
                  Resize All
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
