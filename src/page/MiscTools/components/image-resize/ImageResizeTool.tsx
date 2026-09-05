import { useMemo, useState } from "react";
import { AppRndModalShell } from "@/components/AppRndModalShell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Upload, X, Loader2, Settings, FolderOpen, Scaling } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { basename, dirname, join, resourceDir } from "@tauri-apps/api/path";
import { Command } from "@tauri-apps/plugin-shell";
import { exists } from "@tauri-apps/plugin-fs";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { VirtualizedSelectedFileList } from "../VirtualizedSelectedFileList";

const IMAGE_RESIZE_DIMENSIONS = {
  width: 720,
  height: 760,
  minWidth: 560,
  minHeight: 520,
};

interface ImageResizeToolProps {
  onClose?: () => void;
}

export function ImageResizeTool({ onClose }: ImageResizeToolProps) {
  const { t } = useTranslation("misc-tools-a");
  const [selectedImagePaths, setSelectedImagePaths] = useState<string[]>([]);
  const [fileNames, setFileNames] = useState<{[key: string]: {baseName: string, displayName: string, extension: string}}>({});
  const [isOpen, setIsOpen] = useState(false);
  const [width, setWidth] = useState(1024);
  const [height, setHeight] = useState(1024);
  const [overwriteOriginal, setOverwriteOriginal] = useState(true);
  const [outputDirectory, setOutputDirectory] = useState<string | null>(null);
  const [isResizing, setIsResizing] = useState(false);
  const [resizeProgress, setResizeProgress] = useState<{ current: number; total: number; currentFile?: string; failedFiles: string[] } | null>(null);

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
      toast.error(t("common.selectFilesFailed"));
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
      toast.error(t("common.processImagesFailed"));
    }
  };

  const handleSelectOutputDirectory = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
      });
      if (selected && !Array.isArray(selected)) {
        const dirExists = await exists(selected);
        if (!dirExists) {
          throw new Error(`Output directory does not exist: ${selected}`);
        }
        setOutputDirectory(selected);
      }
    } catch (error) {
      console.error("Error selecting output directory:", error);
      toast.error(
        error instanceof Error ? error.message : t("common.selectOutputFailed")
      );
    }
  };

  const resolveOutputPath = async (
    imagePath: string,
    fileInfo: { baseName: string; displayName: string; extension: string }
  ): Promise<string> => {
    if (overwriteOriginal && !outputDirectory) {
      return imagePath;
    }
    const outDir = outputDirectory ?? (await dirname(imagePath));
    const fileName = overwriteOriginal
      ? fileInfo.displayName
      : `${fileInfo.baseName}_cov${fileInfo.extension}`;
    return join(outDir, fileName);
  };

  // Handle batch resize
  const handleResize = async () => {
    if (selectedImagePaths.length === 0) {
      toast.error(t("resize.selectImage"));
      return;
    }

    if (width <= 0 || height <= 0) {
      toast.error(t("resize.invalidSize"));
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

          const outputPath = await resolveOutputPath(imagePath, fileInfo);

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
        toast.success(
          failureCount > 0
            ? t("resize.successPartial", { count: successCount, failed: failureCount })
            : t("resize.success", { count: successCount }),
        );
      }

      if (failureCount > 0) {
        toast.error(
          t("resize.failedList", {
            count: failureCount,
            files: failedFiles.slice(0, 3).join(", "),
            extra: failureCount > 3 ? "..." : "",
          }),
        );
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
      toast.error(t("resize.batchFailed"));
    }
  };

  // Reset form
  const handleReset = () => {
    setSelectedImagePaths([]);
    setFileNames({});
    setOutputDirectory(null);
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

  const selectedFileItems = useMemo(
    () =>
      selectedImagePaths.map((imagePath) => {
        const fileInfo = fileNames[imagePath];
        const outputName = overwriteOriginal
          ? fileInfo?.displayName
          : `${fileInfo?.baseName}_cov${fileInfo?.extension}`;
        return {
          path: imagePath,
          title: fileInfo?.displayName || imagePath.split(/[/\\]/).pop() || imagePath,
          description: t(
            outputDirectory ? "resize.outputSelectedFolder" : "resize.outputNextToSource",
            { name: outputName ?? "" },
          ),
        };
      }),
    [fileNames, outputDirectory, overwriteOriginal, selectedImagePaths, t],
  );

  const progressContent = isResizing || resizeProgress ? (
      <div className="flex flex-1 flex-col items-center justify-center space-y-4 p-8">
        <Loader2 className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
        {resizeProgress ? (
          <div className="w-full max-w-md space-y-2">
            <div className="text-center">
              <span className="text-muted-foreground">
                {t("common.progressOf", {
                  action: t("resize.progressAction"),
                  current: resizeProgress.current,
                  total: resizeProgress.total,
                })}
              </span>
            </div>
            {resizeProgress.currentFile && (
              <div className="text-center text-sm text-muted-foreground truncate">
                {t("common.current", { name: resizeProgress.currentFile })}
              </div>
            )}
            <div className="w-full bg-secondary rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${(resizeProgress.current / resizeProgress.total) * 100}%` }}
              ></div>
            </div>
            {resizeProgress.failedFiles.length > 0 && (
              <div className="text-center text-sm text-red-600">
                {t("common.failedFiles", { count: resizeProgress.failedFiles.length })}
              </div>
            )}
          </div>
        ) : (
          <span className="text-muted-foreground">{t("resize.loading")}</span>
        )}
      </div>
  ) : null;

  return (
    <>
      <Button variant="outline" className="w-full" onClick={() => setIsOpen(true)}>
        {t("resize.open")}
      </Button>
      {isOpen ? (
        <AppRndModalShell
          titleId="image-resizer-title"
          title={t("resize.title")}
          subtitle={t("resize.subtitle")}
          headerIcon={<Scaling className="h-5 w-5 text-primary" />}
          dimensions={IMAGE_RESIZE_DIMENSIONS}
          storageKey="app.rnd-size.image-resizer"
          onClose={() => setIsOpen(false)}
          closeDisabled={isResizing || Boolean(resizeProgress)}
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
                  {t("resize.dropHint")}
                </h3>
                <p className="text-sm text-muted-foreground mb-4">
                  {t("resize.batchHint")}
                </p>
                <Button variant="outline" type="button">
                  {t("common.browse")}
                </Button>
              </div>
            </Card>
          ) : (
            /* Selected Images List */
            <Card className="p-4">
              <div className="flex items-center justify-between mb-3">
                <Label className="text-sm font-medium">
                  {t("resize.selected", { count: selectedImagePaths.length })}
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
              {/* Resize Settings */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Settings className="h-4 w-4" />
                    {t("resize.dimensions")}
                  </Label>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="width-input">{t("resize.width")}</Label>
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
                      <Label htmlFor="height-input">{t("resize.height")}</Label>
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
                    {t("resize.willResize", { width, height })}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <FolderOpen className="h-4 w-4" />
                    {t("resize.outputDirectory")}
                  </Label>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full sm:w-auto shrink-0"
                      onClick={handleSelectOutputDirectory}
                    >
                      {t("resize.chooseFolder")}
                    </Button>
                    {outputDirectory ? (
                      <div className="flex min-w-0 flex-1 items-center gap-2">
                        <p className="truncate text-xs text-muted-foreground" title={outputDirectory}>
                          {outputDirectory}
                        </p>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 shrink-0 px-2"
                          onClick={() => setOutputDirectory(null)}
                        >
                          {t("resize.clear")}
                        </Button>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        {t("resize.defaultOutput")}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="overwrite"
                    checked={overwriteOriginal}
                    onCheckedChange={(checked) => setOverwriteOriginal(checked === true)}
                  />
                <Label htmlFor="overwrite">{t("common.overwrite")}</Label>
                </div>
                <p className="text-xs text-muted-foreground">
                  {overwriteOriginal
                    ? outputDirectory
                      ? t("resize.overwriteToFolder")
                      : t("resize.overwriteInPlace")
                    : t("resize.saveAsCov")}
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 pt-4">
                <Button
                  variant="outline"
                  onClick={handleReset}
                  className="flex-1"
                >
                  {t("common.reset")}
                </Button>
                <Button
                  onClick={handleResize}
                  disabled={selectedImagePaths.length === 0}
                  className="flex-1"
                >
                  {t("resize.action")}
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
