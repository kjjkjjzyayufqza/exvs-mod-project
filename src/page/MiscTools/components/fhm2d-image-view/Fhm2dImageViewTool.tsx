import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { FolderOpen, ImageIcon, Loader2, Search } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

import { AppRndModalShell } from "@/components/AppRndModalShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createFhm2dMemorySession,
  disposeFhm2dMemorySession,
} from "@/components/ssbh-model-preview/fhm2dMemoryPreviewService";
import type { Fhm2dMemorySessionSummary } from "@/components/ssbh-model-preview/fhm2dMemoryPreviewTypes";
import { Fhm2d_type_format } from "@/models/fhm2d";
import { cn } from "@/lib/utils";
import {
  DialogLastPathKey,
  getDialogDefaultPath,
  rememberDialogSelection,
} from "@/utils/dialogLastPath";
import { MemoryNutexbImage } from "./MemoryNutexbImage";
import {
  collectVirtualFiles,
  formatByteSize,
  isFhm2dImageFile,
  partitionFhm2dImageViewFiles,
  type Fhm2dImageViewFile,
} from "./fhm2dImageViewModel";

const MODAL_DIMENSIONS = {
  width: 1280,
  height: 820,
  minWidth: 880,
  minHeight: 560,
};

const THUMB_COLUMNS = 4;
const THUMB_ROW_HEIGHT = 168;

const FORMAT_OPTIONS: Array<{ value: string; text: string }> = [
  { value: Fhm2d_type_format.fhm2d_all_nutexb, text: "all_nutexb (GUI / icons)" },
  { value: Fhm2d_type_format.fhm2d_character, text: "character" },
  { value: Fhm2d_type_format.fhm2d_effect, text: "effect" },
  { value: Fhm2d_type_format.fhm2d_motion, text: "motion" },
];

function isNutexbFile(file: Fhm2dImageViewFile): boolean {
  return isFhm2dImageFile(file.fileType, file.name) && file.name.toLowerCase().endsWith(".nutexb");
}

export function Fhm2dImageViewTool() {
  const { t } = useTranslation("misc-tools-a");
  const [isOpen, setIsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [format, setFormat] = useState<string>(Fhm2d_type_format.fhm2d_all_nutexb);
  const [sourcePath, setSourcePath] = useState<string | null>(null);
  const [session, setSession] = useState<Fhm2dMemorySessionSummary | null>(null);
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const imageGridRef = useRef<HTMLDivElement | null>(null);
  const otherListRef = useRef<HTMLDivElement | null>(null);

  const files = useMemo(
    () => (session ? collectVirtualFiles(session.virtualTree) : []),
    [session],
  );
  const partitioned = useMemo(() => partitionFhm2dImageViewFiles(files), [files]);
  const query = search.trim().toLowerCase();
  const images = useMemo(
    () =>
      query
        ? partitioned.images.filter(
            (file) =>
              file.name.toLowerCase().includes(query) ||
              file.relativePath.toLowerCase().includes(query),
          )
        : partitioned.images,
    [partitioned.images, query],
  );
  const others = useMemo(
    () =>
      query
        ? partitioned.others.filter(
            (file) =>
              file.name.toLowerCase().includes(query) ||
              file.relativePath.toLowerCase().includes(query),
          )
        : partitioned.others,
    [partitioned.others, query],
  );
  const selectedImage = images.find((file) => file.id === selectedImageId) ?? images[0] ?? null;
  const imageRowCount = Math.ceil(images.length / THUMB_COLUMNS);

  const imageVirtualizer = useVirtualizer({
    count: imageRowCount,
    getScrollElement: () => imageGridRef.current,
    estimateSize: () => THUMB_ROW_HEIGHT,
    overscan: 2,
  });
  const otherVirtualizer = useVirtualizer({
    count: others.length,
    getScrollElement: () => otherListRef.current,
    estimateSize: () => 28,
    overscan: 8,
  });

  const disposeSession = useCallback(async (sessionId: string | undefined) => {
    if (!sessionId) return;
    try {
      await disposeFhm2dMemorySession(sessionId);
    } catch {
      // Session may already be gone.
    }
  }, []);

  const closeModal = useCallback(async () => {
    const sessionId = session?.sessionId;
    setIsOpen(false);
    setSession(null);
    setSourcePath(null);
    setSelectedImageId(null);
    setSearch("");
    await disposeSession(sessionId);
  }, [disposeSession, session?.sessionId]);

  const loadFhm2d = useCallback(
    async (path: string, nextFormat: string) => {
      setBusy(true);
      const previousId = session?.sessionId;
      try {
        const created = await createFhm2dMemorySession({
          sourcePath: path,
          format: nextFormat as Fhm2d_type_format,
        });
        setSourcePath(path);
        setSession(created);
        const nextFiles = collectVirtualFiles(created.virtualTree);
        const nextImages = partitionFhm2dImageViewFiles(nextFiles).images;
        setSelectedImageId(nextImages[0]?.id ?? null);
        rememberDialogSelection(DialogLastPathKey.miscFhm2dImageView, path, "file");
        if (created.namingWarning) {
          toast.error(t("fhm2dImage.namingWarning"), { description: created.namingWarning });
        } else {
          toast.success(t("fhm2dImage.loaded", { name: created.sourceName }));
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : String(error));
      } finally {
        await disposeSession(previousId);
        setBusy(false);
      }
    },
    [disposeSession, session?.sessionId, t],
  );

  const pickFhm2d = useCallback(async () => {
    try {
      const selected = await open({
        multiple: false,
        defaultPath: getDialogDefaultPath(DialogLastPathKey.miscFhm2dImageView) ?? undefined,
        filters: [{ name: "FHM2D", extensions: ["fhm2d"] }],
      });
      const path = Array.isArray(selected) ? selected[0] : selected;
      if (!path) return;
      await loadFhm2d(path, format);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  }, [format, loadFhm2d]);

  useEffect(() => {
    return () => {
      if (session?.sessionId) {
        void disposeFhm2dMemorySession(session.sessionId);
      }
    };
  }, [session?.sessionId]);

  return (
    <>
      <Button variant="outline" className="w-full" onClick={() => setIsOpen(true)}>
        {t("fhm2dImage.open")}
      </Button>
      {isOpen ? (
        <AppRndModalShell
          titleId="misc-tools-fhm2d-image-view-title"
          title={t("fhm2dImage.title")}
          subtitle={t("fhm2dImage.subtitle")}
          headerIcon={<ImageIcon className="h-5 w-5" />}
          dimensions={MODAL_DIMENSIONS}
          storageKey="misc-tools-fhm2d-image-view-size"
          closeDisabled={busy}
          onClose={() => void closeModal()}
        >
          <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-[220px] space-y-1">
                <Label>{t("common.format")}</Label>
                <Select
                  value={format}
                  onValueChange={(value) => {
                    setFormat(value);
                    if (sourcePath) void loadFhm2d(sourcePath, value);
                  }}
                  disabled={busy}
                >
                  <SelectTrigger className="h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent data-i18n-ignore="">
                    {FORMAT_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.text}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button size="sm" onClick={() => void pickFhm2d()} disabled={busy}>
                {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <FolderOpen className="mr-1.5 h-4 w-4" />}
                {t("fhm2dImage.choose")}
              </Button>
              {sourcePath ? (
                <div className="min-w-0 flex-1 truncate text-xs text-muted-foreground" title={sourcePath}>
                  {sourcePath}
                </div>
              ) : null}
            </div>

            {!session ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
                <ImageIcon className="h-10 w-10 opacity-50" />
                <div>{t("fhm2dImage.empty")}</div>
                <Button onClick={() => void pickFhm2d()} disabled={busy}>
                  {t("fhm2dImage.choose")}
                </Button>
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder={t("fhm2dImage.filterPlaceholder")}
                    className="h-8 pl-9"
                  />
                </div>
                <div className="text-xs text-muted-foreground">
                  {t("fhm2dImage.imageCount", { count: images.length })}
                  {" · "}
                  {t("fhm2dImage.otherFileCount", { count: others.length })}
                  {" · "}
                  {t("fhm2dImage.session", { id: session.sessionId })}
                </div>
                <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_320px] gap-3">
                  <div className="flex min-h-0 flex-col gap-2">
                    <div className="text-sm font-medium">{t("fhm2dImage.images")}</div>
                    <div ref={imageGridRef} className="min-h-0 flex-1 overflow-auto rounded-md border">
                      <div
                        style={{
                          height: `${imageVirtualizer.getTotalSize()}px`,
                          position: "relative",
                          width: "100%",
                        }}
                      >
                        {imageVirtualizer.getVirtualItems().map((row) => {
                          const start = row.index * THUMB_COLUMNS;
                          const rowFiles = images.slice(start, start + THUMB_COLUMNS);
                          return (
                            <div
                              key={row.key}
                              className="absolute left-0 grid w-full grid-cols-4 gap-2 p-2"
                              style={{
                                height: `${row.size}px`,
                                transform: `translateY(${row.start}px)`,
                              }}
                            >
                              {rowFiles.map((file) => {
                                const active = selectedImage?.id === file.id;
                                return (
                                  <button
                                    key={file.id}
                                    type="button"
                                    className={cn(
                                      "flex flex-col overflow-hidden rounded-md border bg-background text-left",
                                      active && "ring-2 ring-primary",
                                    )}
                                    onClick={() => setSelectedImageId(file.id)}
                                  >
                                    <div className="h-[112px] w-full">
                                      {isNutexbFile(file) && session ? (
                                        <MemoryNutexbImage
                                          sessionId={session.sessionId}
                                          virtualPath={file.virtualPath}
                                          mode="thumb"
                                        />
                                      ) : (
                                        <div className="flex h-full items-center justify-center text-[10px] text-muted-foreground">
                                          {t("fhm2dImage.noPreview")}
                                        </div>
                                      )}
                                    </div>
                                    <div className="truncate px-1.5 py-1 text-[10px]" title={file.relativePath} data-i18n-ignore="">
                                      {file.name}
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                          );
                        })}
                      </div>
                      {images.length === 0 ? (
                        <div className="p-6 text-center text-sm text-muted-foreground">{t("fhm2dImage.noImages")}</div>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex min-h-0 flex-col gap-2">
                    <div className="text-sm font-medium">{t("common.preview")}</div>
                    <div className="h-[280px] overflow-hidden rounded-md border">
                      {selectedImage && isNutexbFile(selectedImage) && session ? (
                        <MemoryNutexbImage
                          sessionId={session.sessionId}
                          virtualPath={selectedImage.virtualPath}
                          mode="full"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                          {t("fhm2dImage.selectImage")}
                        </div>
                      )}
                    </div>
                    {selectedImage ? (
                      <div className="space-y-0.5 break-all text-[11px] text-muted-foreground" data-i18n-ignore="">
                        <div>{selectedImage.name}</div>
                        <div>{selectedImage.relativePath}</div>
                        <div>{formatByteSize(selectedImage.size)}</div>
                      </div>
                    ) : null}
                    <div className="text-sm font-medium">{t("fhm2dImage.otherFiles")}</div>
                    <div ref={otherListRef} className="min-h-0 flex-1 overflow-auto rounded-md border">
                      <div
                        style={{
                          height: `${otherVirtualizer.getTotalSize()}px`,
                          position: "relative",
                          width: "100%",
                        }}
                      >
                        {otherVirtualizer.getVirtualItems().map((row) => {
                          const file = others[row.index];
                          if (!file) return null;
                          return (
                            <div
                              key={row.key}
                              className="absolute left-0 flex w-full items-center justify-between gap-2 px-2 text-[11px]"
                              style={{
                                height: `${row.size}px`,
                                transform: `translateY(${row.start}px)`,
                              }}
                              title={file.relativePath}
                            >
                              <span className="truncate" data-i18n-ignore="">{file.relativePath || file.name}</span>
                              <span className="shrink-0 text-muted-foreground" data-i18n-ignore="">
                                {file.fileType || "file"} · {formatByteSize(file.size)}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                      {others.length === 0 ? (
                        <div className="p-3 text-center text-xs text-muted-foreground">{t("fhm2dImage.noOtherFiles")}</div>
                      ) : null}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </AppRndModalShell>
      ) : null}
    </>
  );
}
