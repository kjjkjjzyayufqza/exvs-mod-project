import { DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileInfo, ImageFormat, useNutexbStore } from "../../../store/nutexbStore";
import { useEffect, useState } from "react";
import { readFile } from "@tauri-apps/plugin-fs";

interface NutexbDialogProps {
  file: FileInfo;
}

export function NutexbDialog({ file }: NutexbDialogProps) {
  const [imageData, setImageData] = useState<string | null>(null);
  const store = useNutexbStore();
  const {
    nutexbData,
    isConverting,
    error,
    previewImagePath,
    selectedFormat,
    hasMipmaps,
    setSelectedFormat,
    setHasMipmaps,
    replaceTexture
  } = store;

  // Reset format and mipmaps when data changes and load image
  useEffect(() => {
    if (nutexbData) {
      setSelectedFormat(nutexbData.imageFormat.replace(/"/g, '') as ImageFormat);
      setHasMipmaps((nutexbData.footer.mipmap_count || 0) > 1);

      // Load image data if preview path is available
      if (previewImagePath) {
        loadImageData(previewImagePath);
      }
    }
  }, [nutexbData, previewImagePath, setSelectedFormat, setHasMipmaps]);

  // Function to load image data using Tauri's filesystem API
  const loadImageData = async (imagePath: string) => {
    try {
      const imageBytes = await readFile(imagePath);
      const base64 = btoa(
        Array.from(new Uint8Array(imageBytes))
          .map(b => String.fromCharCode(b))
          .join('')
      );
      setImageData(`data:image/png;base64,${base64}`);
    } catch (error) {
      console.error("Failed to load image:", error);
    }
  };

  if (isConverting) {
    return (
      <div className="flex items-center justify-center p-8">
        <DialogHeader>
          <DialogTitle>Edit {file.name}</DialogTitle>
        </DialogHeader>
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
        <span className="ml-3">Converting file...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-8 space-y-4">
        <DialogHeader>
          <DialogTitle>Edit {file.name}</DialogTitle>
        </DialogHeader>
        <span className="text-red-600">{error}</span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => store.convertFile(file)}
        >
          Try Again
        </Button>
      </div>
    );
  }

  if (nutexbData && previewImagePath) {
    const { footer } = nutexbData;

    return (
      <>
        <DialogHeader>
          <DialogTitle>Edit {file.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-6">
          {/* Metadata section */}
          <Card className="p-4 grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Name</Label>
              <p className="font-medium">{footer.string}</p>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Dimensions</Label>
              <p className="font-medium">{footer.width}x{footer.height}x{footer.depth}</p>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Format</Label>
              <p className="font-medium">{footer.image_format}</p>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Image Format</Label>
              <p className="font-medium">{nutexbData.imageFormat}</p>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Mipmap Count</Label>
              <p className="font-medium">{footer.mipmap_count}</p>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Layer Count</Label>
              <p className="font-medium">{footer.layer_count}</p>
            </div>
            <div className="space-y-1 col-span-2">
              <Label className="text-xs text-gray-500">Data Size</Label>
              <p className="font-medium">{footer.data_size} bytes</p>
            </div>
          </Card>

          {/* Image preview with zoom/pan */}
          <div className="my-6">
            <Card className="overflow-hidden [transform-style:preserve-3d] min-h-[400px]" style={{ willChange: 'transform' }}>
              <AspectRatio ratio={1} className="bg-muted [backface-visibility:hidden] flex items-center justify-center">
                {imageData ? (
                  <TransformWrapper
                    initialScale={0.8}
                    minScale={0.5}
                    maxScale={4}
                    centerOnInit
                    smooth
                    doubleClick={{ disabled: false }}
                    limitToBounds={false}
                    wheel={{ step: 0.05 }}
                  >
                    {({ zoomIn, zoomOut, resetTransform }) => (
                      <>
                        <TransformComponent
                          wrapperClass="!w-full [transform-style:preserve-3d] flex items-center justify-center"
                          contentClass="!w-full [backface-visibility:hidden] flex items-center justify-center"
                          wrapperStyle={{ willChange: 'transform', height: '100%' }}
                        >
                          <img
                            src={imageData}
                            alt="Texture preview"
                            className="w-full h-full object-contain [image-rendering:optimizeSpeed] [transform:translateZ(0)] mx-auto"
                            style={{
                              imageRendering: '-webkit-optimize-contrast',
                              backfaceVisibility: 'hidden',
                              perspective: 1000,
                              transform: 'translate3d(0,0,0)',
                              display: 'block',
                              margin: 'auto'
                            }}
                          />
                        </TransformComponent>
                        <div className="absolute bottom-4 right-4 flex gap-2">
                          <Button
                            variant="secondary"
                            size="icon"
                            onClick={() => zoomIn()}
                            className="h-8 w-8 rounded-full bg-white/80 hover:bg-white/90"
                          >
                            +
                          </Button>
                          <Button
                            variant="secondary"
                            size="icon"
                            onClick={() => zoomOut()}
                            className="h-8 w-8 rounded-full bg-white/80 hover:bg-white/90"
                          >
                            -
                          </Button>
                          <Button
                            variant="secondary"
                            size="icon"
                            onClick={() => resetTransform()}
                            className="h-8 w-8 rounded-full bg-white/80 hover:bg-white/90"
                          >
                            ↺
                          </Button>
                        </div>
                      </>
                    )}
                  </TransformWrapper>
                ) : (
                  <div className="flex items-center justify-center h-full w-full bg-gray-50">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
                    <span className="ml-3">Loading image...</span>
                  </div>
                )}
              </AspectRatio>
            </Card>
          </div>

          {/* Format selection and options */}
          <div className="space-y-4">
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

          {/* Replace button */}
          <Button
            className="w-full"
            onClick={replaceTexture}
          >
            Replace Texture
          </Button>
        </div>
      </>
    );
  }

  return (
    <div>
      <DialogHeader>
        <DialogTitle>Edit {file.name}</DialogTitle>
      </DialogHeader>
      <div className="flex items-center justify-center h-32 text-gray-500">
        No data to display
      </div>
    </div>
  );
}
