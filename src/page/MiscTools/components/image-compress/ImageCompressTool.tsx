import { useMemo, useState } from "react";
import { AppRndModalShell } from "@/components/AppRndModalShell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Upload, X, Loader2, Minimize2 } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { basename, join, resourceDir } from "@tauri-apps/api/path";
import { Command } from "@tauri-apps/plugin-shell";
import { exists } from "@tauri-apps/plugin-fs";
import { toast } from "sonner";
import { VirtualizedSelectedFileList } from "../VirtualizedSelectedFileList";

const IMAGE_COMPRESS_DIMENSIONS = {
  width: 680,
  height: 680,
  minWidth: 540,
  minHeight: 500,
};

interface ImageCompressToolProps {
  onClose?: () => void;
}

export function ImageCompressTool({ onClose }: ImageCompressToolProps) {
  const [selectedImagePaths, setSelectedImagePaths] = useState<string[]>([]);
  const [fileNames, setFileNames] = useState<{[key: string]: {baseName: string, displayName: string, extension: string}}>({});
  const [isOpen, setIsOpen] = useState(false);
  const [compressionQuality, setCompressionQuality] = useState(65); // Default 65%
  const [overwriteOriginal, setOverwriteOriginal] = useState(true); // Default to overwrite
  const [isCompressing, setIsCompressing] = useState(false);
  const [compressionProgress, setCompressionProgress] = useState<{ current: number; total: number; currentFile?: string; failedFiles: string[] } | null>(null);

  // Handle file selection
  const handleFileSelect = async () => {
    try {
      const selected = await open({
        multiple: true,
        filters: [
          {
            name: "PNG Files",
            extensions: ["png"],
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
          const extension = fullFileName.substring(fullFileName.lastIndexOf('.'));
          const baseName = fullFileName.replace(extension, "");
          return [imagePath, { baseName, displayName: fullFileName, extension }] as const;
        }),
      );
      setFileNames(Object.fromEntries(nameEntries));
    } catch (error) {
      console.error("Error processing image files:", error);
      toast.error("Failed to process image files");
    }
  };

  // Handle batch compression
  const handleCompress = async () => {
    if (selectedImagePaths.length === 0) {
      toast.error("Please select at least one PNG file");
      return;
    }

    try {
      setIsCompressing(true);
      setCompressionProgress({ current: 0, total: selectedImagePaths.length, failedFiles: [] });

      const resourcePath = await resourceDir();
      const pngquantPath = await join(resourcePath, "tools/pngquant.exe");

      // Check if pngquant exists
      const pngquantExists = await exists(pngquantPath);
      if (!pngquantExists) {
        throw new Error(`pngquant not found: ${pngquantPath}`);
      }

      const compressedPaths: string[] = [];
      const failedFiles: string[] = [];

      const quality = compressionQuality;

      // Process each file
      for (let i = 0; i < selectedImagePaths.length; i++) {
        const imagePath = selectedImagePaths[i];
        const fileInfo = fileNames[imagePath];

        if (!fileInfo) continue;

        try {
          setCompressionProgress(prev => prev ? {
            ...prev,
            currentFile: fileInfo.displayName
          } : null);

          let outputPath: string;

          if (overwriteOriginal) {
            // Overwrite original file
            outputPath = imagePath;
          } else {
            // Create new file with _low suffix
            const dir = imagePath.substring(0, imagePath.lastIndexOf('/') + 1 || imagePath.lastIndexOf('\\') + 1);
            const newFileName = `${fileInfo.baseName}_low${fileInfo.extension}`;
            outputPath = dir + newFileName;
          }

          // Build pngquant command
          const pngquantCommand = Command.create('exec-cmd', [
            "/c",
            pngquantPath,
            `--quality=${quality}-${quality}`, // Set quality range (e.g., "65-65")
            '--output', outputPath,
            imagePath,
            "--speed=1", // Best quality/slowest speed
            "--force" // Overwrite output file
          ], { encoding: 'utf-8' });

          console.log(`Compressing ${fileInfo.displayName} with quality ${quality}%...`);

          const result = await pngquantCommand.execute();

          if (result.code === 0) {
            compressedPaths.push(outputPath);
            console.log(`Successfully compressed ${fileInfo.displayName}`);
          } else {
            console.error(`Failed to compress ${fileInfo.displayName}:`, result.stderr);
            failedFiles.push(fileInfo.displayName);
          }

        } catch (error) {
          console.error(`Error compressing ${fileInfo.displayName}:`, error);
          failedFiles.push(fileInfo.displayName);
        }

        setCompressionProgress(prev => prev ? {
          ...prev,
          current: i + 1,
          failedFiles: failedFiles
        } : null);
      }

      setCompressionProgress(null);
      setIsCompressing(false);

      const successCount = compressedPaths.length;
      const failureCount = failedFiles.length;

      if (successCount > 0) {
        toast.success(`Successfully compressed ${successCount} image(s)${failureCount > 0 ? `. ${failureCount} failed.` : ''}`);
      }

      if (failureCount > 0) {
        toast.error(`Failed to compress ${failureCount} file(s): ${failedFiles.slice(0, 3).join(', ')}${failureCount > 3 ? '...' : ''}`);
      }

      // Only close modal if all files failed
      if (successCount === 0 && failureCount > 0) {
        setIsOpen(false);
        if (onClose) onClose();
      }

      // Reset form only if all compressions succeeded
      if (successCount > 0 && failureCount === 0) {
        handleReset();
      }

    } catch (error) {
      console.error("Batch compression failed:", error);
      setCompressionProgress(null);
      setIsCompressing(false);
      toast.error("Batch compression failed");
    }
  };

  // Reset form
  const handleReset = () => {
    setSelectedImagePaths([]);
    setFileNames({});
    setCompressionProgress(null);
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

  const selectedFileItems = useMemo(
    () =>
      selectedImagePaths.map((imagePath) => {
        const fileInfo = fileNames[imagePath];
        return {
          path: imagePath,
          title: fileInfo?.displayName || imagePath.split(/[/\\]/).pop() || imagePath,
          description: `Output: ${
            overwriteOriginal
              ? fileInfo?.displayName ?? ""
              : `${fileInfo?.baseName}_low${fileInfo?.extension}`
          }`,
        };
      }),
    [fileNames, overwriteOriginal, selectedImagePaths],
  );

  const progressContent = isCompressing || compressionProgress ? (
      <div className="flex flex-1 flex-col items-center justify-center space-y-4 p-8">
        <Loader2 className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
        {compressionProgress ? (
          <div className="w-full max-w-md space-y-2">
            <div className="text-center">
              <span className="text-muted-foreground">
                Compressing {compressionProgress.current} of {compressionProgress.total} images...
              </span>
            </div>
            {compressionProgress.currentFile && (
              <div className="text-center text-sm text-muted-foreground truncate">
                Current: {compressionProgress.currentFile}
              </div>
            )}
            <div className="w-full bg-secondary rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${(compressionProgress.current / compressionProgress.total) * 100}%` }}
              ></div>
            </div>
            {compressionProgress.failedFiles.length > 0 && (
              <div className="text-center text-sm text-red-600">
                Failed: {compressionProgress.failedFiles.length} files
              </div>
            )}
          </div>
        ) : (
          <span className="text-muted-foreground">Compressing images...</span>
        )}
      </div>
  ) : null;

  return (
    <>
      <Button variant="outline" className="w-full" onClick={() => setIsOpen(true)}>
        Open Image Compressor
      </Button>
      {isOpen ? (
        <AppRndModalShell
          titleId="image-compressor-title"
          title="PNG Image Compressor"
          subtitle="Compress PNG files with pngquant"
          headerIcon={<Minimize2 className="h-5 w-5 text-primary" />}
          dimensions={IMAGE_COMPRESS_DIMENSIONS}
          storageKey="app.rnd-size.image-compressor"
          onClose={() => setIsOpen(false)}
          closeDisabled={isCompressing || Boolean(compressionProgress)}
        >
          {progressContent ?? (
            <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-4">

          {/* File Selection Area */}
          {selectedImagePaths.length === 0 ? (
            <Card
              className="border-2 border-dashed border-gray-300 hover:border-gray-400 cursor-pointer transition-colors"
              onClick={handleFileSelect}
            >
              <div className="flex flex-col items-center justify-center p-8 text-center">
                <Upload className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium text-foreground mb-2">
                  Select PNG files to compress
                </h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Batch compression supported
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
                  Selected PNG Files ({selectedImagePaths.length})
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
                height={176}
              />
            </Card>
          )}

          {selectedImagePaths.length > 0 && (
            <>
              {/* Compression Settings */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="quality-input">Compression Quality (%)</Label>
                  <Input
                    id="quality-input"
                    type="number"
                    min={0}
                    max={100}
                    value={compressionQuality}
                    onChange={(e) => {
                      const value = parseInt(e.target.value);
                      if (!isNaN(value) && value >= 0 && value <= 100) {
                        setCompressionQuality(value);
                      }
                    }}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>0% (maximum compression)</span>
                    <span>100% (lossless)</span>
                  </div>
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
                  {!overwriteOriginal && "If unchecked, compressed files will be saved as <name>_low.png"}
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
                  onClick={handleCompress}
                  disabled={selectedImagePaths.length === 0}
                  className="flex-1"
                >
                  Compress All
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
