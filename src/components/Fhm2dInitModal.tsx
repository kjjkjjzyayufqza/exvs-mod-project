import { useRef, useState } from "react";
import Draggable from "react-draggable";
import { X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Buffer } from "buffer";
import { exists } from "@tauri-apps/plugin-fs";

import { Button } from "@/components/ui/button";
import { FilePathInput } from "@/components/ui/filePathInput";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { useConfigStore } from "@/store/configStore";
import { IOReadFile } from "@/IO/fileSystem";
import { ExtractFHMData, ExtractType, Fhm2dData, Fhm2d_type_format, PS4FhmData } from "@/models/fhm2d";

interface Fhm2dInitModalProps {
    isOpen: boolean;
    onClose: () => void;
}

type InitListItem = {
    id: string;
    name: string;
    hash: string;
    format?: Fhm2d_type_format;
    formatLabel: string;
};

const FHM2D_ITEMS: InitListItem[] = [
    {
        id: "series_list",
        name: "Series List",
        hash: "0xb7367090",
        formatLabel: "list",
    },
    {
        id: "series_image_list",
        name: "Series Image List",
        hash: "0xA0253AA0",
        format: Fhm2d_type_format.fhm2d_all_nutexb,
        formatLabel: "all_nutexb",
    },
];

function buildHashFileName(hash: string): string {
    const trimmed = hash.trim();
    if (!trimmed) return "";
    return trimmed.toLowerCase().startsWith("0x") ? trimmed : `0x${trimmed}`;
}

function getFhm2dFullPath(sourceFolder: string, hash: string): string {
    const base = (sourceFolder || "").trim().replace(/[\\/]+$/g, "");
    if (!base) return "";
    const fileName = `${buildHashFileName(hash)}.fhm2d`;
    return `${base}\\${fileName}`;
}

async function readFhm2dFromPath(filePath: string): Promise<Fhm2dData | PS4FhmData> {
    const buf = Buffer.from(await IOReadFile(filePath));
    const magic = buf.slice(0, 0x4).toString("hex").toUpperCase();
    if (magic === "B9B7B2CD") return new Fhm2dData(buf);
    if (magic === "9992CD90") return new PS4FhmData(buf);
    throw new Error("File magic not match with FHM2D or PS4FHM");
}

export default function Fhm2dInitModal({ isOpen, onClose }: Fhm2dInitModalProps) {
    const nodeRef = useRef(null);
    const [isExtracting, setIsExtracting] = useState(false);

    const obDplCachePath = useConfigStore((s) => s.obDplCachePath);
    const extractOutputPath = useConfigStore((s) => s.extractOutputPath);

    const handleExtract = async (item: InitListItem) => {
        if (isExtracting) return;
        try {
            const outBase = (extractOutputPath ?? "").trim();
            if (!outBase) {
                toast.error("Please set export folder first");
                return;
            }

            const sourceBase = (obDplCachePath ?? "").trim();
            if (!sourceBase) {
                toast.error("Please set source folder first");
                return;
            }

            const inputPath = getFhm2dFullPath(sourceBase, item.hash);
            if (!inputPath) {
                toast.error("Invalid source folder");
                return;
            }
            const fileExists = await exists(inputPath);
            if (!fileExists) {
                toast.error(`Source file not found: ${inputPath}`);
                return;
            }

            setIsExtracting(true);

            const fhm = await readFhm2dFromPath(inputPath);
            const outDir = `${outBase}\\${buildHashFileName(item.hash)}`;
            await ExtractFHMData(fhm, outDir, ExtractType.SingleFolder, item.format);
            toast.success(`Extract completed: ${outDir}`);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            toast.error(`Extract failed: ${message}`);
        } finally {
            setIsExtracting(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed left-0 right-0 bottom-0 top-8 z-10 pointer-events-none flex items-center justify-center">
            <Draggable nodeRef={nodeRef} handle=".drag-handle" bounds="parent" defaultPosition={{ x: 0, y: 0 }}>
                <div ref={nodeRef} className="pointer-events-auto" style={{ width: "560px" }}>
                    <div className="bg-background border border-border rounded-lg shadow-2xl">
                        <div className="drag-handle flex items-center justify-between px-4 py-3 border-b border-border cursor-move bg-muted/50">
                            <h2 className="text-lg font-semibold">FHM2D Init</h2>
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
                                <X className="h-4 w-4" />
                            </Button>
                        </div>

                        <div className="p-6 space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="fhm2d-init-source">Source Folder</Label>
                                <FilePathInput
                                    id="fhm2d-init-source"
                                    placeholder="Click to select source folder..."
                                    value={obDplCachePath ?? ""}
                                    readOnly
                                    storeKey="obDplCachePath"
                                    picker={{ kind: "folder", multiple: false }}
                                    className="cursor-pointer"
                                />
                                <p className="text-xs text-muted-foreground">Select the folder containing fhm2d files</p>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="fhm2d-init-export">Export Folder</Label>
                                <FilePathInput
                                    id="fhm2d-init-export"
                                    placeholder="Click to select export folder..."
                                    value={extractOutputPath}
                                    readOnly
                                    storeKey="extractOutputPath"
                                    picker={{ kind: "folder", multiple: false }}
                                    className="cursor-pointer"
                                />
                                <p className="text-xs text-muted-foreground">Select the output folder for extracted files</p>
                            </div>

                            <Separator />

                            <div className="space-y-2">
                                <div className="text-sm font-medium">FHM2D List</div>
                                <ScrollArea className="h-[240px] rounded-md border border-border">
                                    <div className="p-2">
                                        {FHM2D_ITEMS.map((item, idx) => (
                                            <div key={item.id}>
                                                <div className="flex items-center justify-between px-3 py-2 rounded-md hover:bg-muted/50 transition-colors">
                                                    <div className="min-w-0">
                                                        <div className="truncate font-medium flex items-center gap-2">
                                                            <span className="truncate">{item.name}</span>
                                                            <span className="text-muted-foreground text-sm font-normal">({item.hash})</span>
                                                            <Badge variant="secondary" className="h-6 px-2.5 text-xs font-medium">
                                                                {item.formatLabel}
                                                            </Badge>
                                                        </div>
                                                        <div className="truncate text-xs text-muted-foreground">
                                                            {getFhm2dFullPath(obDplCachePath ?? "", item.hash) || "-"}
                                                        </div>
                                                    </div>
                                                    <Button size="sm" onClick={() => handleExtract(item)} disabled={isExtracting}>
                                                        {isExtracting ? (
                                                            <>
                                                                <Loader2 className="h-4 w-4 animate-spin" />
                                                                Extracting...
                                                            </>
                                                        ) : (
                                                            "Extract"
                                                        )}
                                                    </Button>
                                                </div>
                                                {idx !== FHM2D_ITEMS.length - 1 ? <Separator className="my-1" /> : null}
                                            </div>
                                        ))}
                                    </div>
                                </ScrollArea>
                            </div>

                            <div className="flex justify-end gap-2 pt-2">
                                <Button variant="outline" onClick={onClose}>
                                    Close
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            </Draggable>
        </div>
    );
}


