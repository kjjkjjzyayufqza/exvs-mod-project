import { DiskNutexbImage } from "@/page/MiscTools/components/nutexb-view/DiskNutexbImage";
import { cn } from "@/lib/utils";

export function GuiPackPreviewThumb({
  nutexbPath,
  previewSrc,
  alt,
  className,
  maxDimension,
}: {
  nutexbPath?: string | null;
  previewSrc?: string;
  alt: string;
  className?: string;
  maxDimension?: number;
}) {
  return (
    <div className={cn("relative shrink-0 overflow-hidden rounded bg-black", className)}>
      {nutexbPath ? (
        <DiskNutexbImage
          path={nutexbPath}
          mode="thumb"
          maxDimension={maxDimension}
          className="absolute inset-0"
        />
      ) : (
        <img
          src={previewSrc || "/tauri.svg"}
          alt={alt}
          className="absolute inset-0 h-full w-full object-contain"
          loading="lazy"
          onError={(event) => {
            event.currentTarget.src = "/tauri.svg";
          }}
        />
      )}
    </div>
  );
}
