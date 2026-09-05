import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { open } from "@tauri-apps/plugin-dialog";
import { FolderOpen, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { TextureFormatSelect, type DdsFormat } from "./TextureFormatSelect";
import { convertPngToNutexb } from "../utils/sceneTextureConvert";
import { recommendDdsFormat, textureBasename as basename, isNutexbFile as isNutexb } from "../utils/texturePathPickerUtils";

interface TexturePathPickerProps {
  value: string;
  paramId: string;
  onChange: (basename: string) => void;
  onConvertComplete?: (result: { nutexbName: string; nutexbPath: string }) => void;
  outputDir?: string;
  disabled?: boolean;
  className?: string;
}

export function TexturePathPicker({
  value,
  paramId,
  onChange,
  onConvertComplete,
  outputDir,
  disabled,
  className,
}: TexturePathPickerProps) {
  const { t } = useTranslation("scene-context");
  const [dragOver, setDragOver] = useState(false);
  const [converting, setConverting] = useState(false);
  const [ddsFormat, setDdsFormat] = useState<DdsFormat>(() => recommendDdsFormat(paramId));
  const [showFormat, setShowFormat] = useState(false);

  const handleFile = useCallback(
    async (filePath: string) => {
      const name = basename(filePath);
      onChange(name);

      if (isNutexb(name)) {
        setShowFormat(false);
        return;
      }

      setShowFormat(true);
      if (!outputDir) return;

      const format = recommendDdsFormat(paramId);
      setDdsFormat(format);
      setConverting(true);
      try {
        const nutexbName = name.replace(/\.[^.]+$/, ".nutexb");
        const result = await convertPngToNutexb({
          pngPath: filePath,
          outputNutexbPath: `${outputDir}/${nutexbName}`,
          ddsFormat: format,
        });
        onConvertComplete?.({ nutexbName: result.nutexbName, nutexbPath: result.outputNutexbPath });
      } finally {
        setConverting(false);
      }
    },
    [onChange, onConvertComplete, outputDir, paramId],
  );

  const handleBrowse = async () => {
    const selected = await open({
      title: t("texture.selectFile"),
      multiple: false,
      filters: [{ name: "Textures", extensions: ["png", "dds", "nutexb"] }],
    });
    if (typeof selected === "string" && selected.trim()) {
      handleFile(selected.trim());
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (!file) return;
    // Webview exposes full path on File; fall back to name for HTML5 drag
    const filePath = (file as File & { path?: string }).path;
    if (filePath) {
      handleFile(filePath);
    } else {
      onChange(file.name);
    }
  };

  return (
    <div
      className={cn("flex flex-col gap-1", className)}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      <div
        className={cn(
          "flex items-center gap-1 rounded border border-transparent p-0.5 transition-colors",
          dragOver && "border-primary bg-primary/5",
        )}
      >
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled || converting}
          className="h-7 text-xs flex-1 min-w-0"
          placeholder={t("texture.placeholder")}
          aria-label={t("texture.inputLabel")}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0"
          disabled={disabled || converting}
          onClick={handleBrowse}
          title={t("texture.browse")}
          aria-label={t("texture.browse")}
        >
          {converting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FolderOpen className="h-3.5 w-3.5" />}
        </Button>
      </div>
      {showFormat && !isNutexb(value) && (
        <TextureFormatSelect
          value={ddsFormat}
          onChange={setDdsFormat}
          disabled={disabled || converting}
          triggerClassName="h-6 text-xs w-full"
        />
      )}
    </div>
  );
}
