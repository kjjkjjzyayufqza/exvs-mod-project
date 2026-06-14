import { useState, type ReactElement } from "react";
import { Slot } from "@radix-ui/react-slot";
import { FileImage } from "lucide-react";
import { AppRndModalShell } from "@/components/AppRndModalShell";
import { cn } from "@/lib/utils";
import { NutexbImportPanel } from "./NutexbImportPanel";

interface FileTypeDialogProps {
  onFileTypeSelect: (fileType: string) => void;
  children: ReactElement;
  currentDirectory?: string;
}

const FILE_TYPE_DIMENSIONS = {
  width: 1000,
  height: 700,
  minWidth: 720,
  minHeight: 520,
};

const FILE_TYPES = [
  {
    id: "nutexb",
    name: "Nutexb Texture",
    description: "Convert image files to nutexb texture format",
    icon: FileImage,
    supported: true,
  },
] as const;

export function FileTypeDialog({ onFileTypeSelect, children, currentDirectory }: FileTypeDialogProps) {
  const [open, setOpen] = useState(false);
  const [selectedFileType, setSelectedFileType] = useState<string | null>(null);

  const handleClose = () => {
    setSelectedFileType(null);
    setOpen(false);
  };

  const handleImportComplete = () => {
    if (selectedFileType) onFileTypeSelect(selectedFileType);
    handleClose();
  };

  return (
    <>
      <Slot onClick={() => setOpen(true)}>{children}</Slot>

      {open ? (
        <AppRndModalShell
          titleId="file-type-dialog-title"
          title="Add New File"
          subtitle={selectedFileType ? "Configure and create the selected file" : "Choose a file type"}
          headerIcon={<FileImage className="h-5 w-5 text-primary" />}
          dimensions={FILE_TYPE_DIMENSIONS}
          storageKey="app.rnd-size.file-type-dialog"
          onClose={handleClose}
        >
          <div className="grid min-h-0 flex-1 grid-cols-[240px_minmax(0,1fr)]">
            <aside className="min-h-0 overflow-y-auto border-r p-3">
              <div className="space-y-1">
                {FILE_TYPES.map((fileType) => (
                  <button
                    key={fileType.id}
                    type="button"
                    disabled={!fileType.supported}
                    className={cn(
                      "flex w-full cursor-pointer items-start gap-3 rounded-md border p-3 text-left transition-colors hover:bg-accent",
                      selectedFileType === fileType.id && "border-primary bg-primary/10",
                      !fileType.supported && "cursor-not-allowed opacity-50",
                    )}
                    onClick={() => setSelectedFileType(fileType.id)}
                  >
                    <fileType.icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{fileType.name}</span>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {fileType.description}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </aside>

            <main className="min-h-0 overflow-y-auto p-4">
              {selectedFileType === "nutexb" ? (
                <NutexbImportPanel
                  currentDirectory={currentDirectory}
                  onImportComplete={handleImportComplete}
                  onClose={handleClose}
                />
              ) : (
                <div className="flex h-full items-center justify-center text-muted-foreground">
                  <FileImage className="h-10 w-10 opacity-40" />
                </div>
              )}
            </main>
          </div>
        </AppRndModalShell>
      ) : null}
    </>
  );
}
