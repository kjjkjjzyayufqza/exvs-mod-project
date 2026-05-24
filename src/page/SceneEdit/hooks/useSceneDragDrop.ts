import { useEffect, useState } from "react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";

export interface SceneDragDropCallbacks {
  onImportDae: (paths: string[]) => void;
  onAddTexture: (paths: string[]) => void;
  onAddNutexb: (paths: string[]) => void;
}

export function useSceneDragDrop(callbacks: SceneDragDropCallbacks) {
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    const webview = getCurrentWebviewWindow();
    let unlisten: (() => void) | null = null;

    const setup = async () => {
      unlisten = await webview.onDragDropEvent((event) => {
        const { type } = event.payload;
        if (type === "enter" || type === "over") {
          setIsDragging(true);
        } else if (type === "leave") {
          setIsDragging(false);
        } else if (type === "drop") {
          setIsDragging(false);
          const paths = event.payload.paths;
          if (!paths || paths.length === 0) return;

          const daeFiles: string[] = [];
          const imageFiles: string[] = [];
          const nutexbFiles: string[] = [];

          for (const p of paths) {
            const ext = p.split(".").pop()?.toLowerCase() ?? "";
            if (ext === "dae") daeFiles.push(p);
            else if (["png", "tga", "dds", "jpg", "jpeg", "bmp", "tiff"].includes(ext))
              imageFiles.push(p);
            else if (ext === "nutexb") nutexbFiles.push(p);
          }

          if (daeFiles.length > 0) callbacks.onImportDae(daeFiles);
          if (imageFiles.length > 0) callbacks.onAddTexture(imageFiles);
          if (nutexbFiles.length > 0) callbacks.onAddNutexb(nutexbFiles);
        }
      });
    };

    setup();
    return () => {
      unlisten?.();
    };
  }, [callbacks]);

  return { isDragging };
}
