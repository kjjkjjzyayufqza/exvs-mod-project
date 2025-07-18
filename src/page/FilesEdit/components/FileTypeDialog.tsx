import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FileImage, Plus } from "lucide-react";
import { NutexbImportDialog } from "../../Repack/components/NutexbImportDialog";

interface FileTypeDialogProps {
  onFileTypeSelect: (fileType: string) => void;
  children: React.ReactNode;
  currentDirectory?: string;
}

export function FileTypeDialog({ onFileTypeSelect, children, currentDirectory }: FileTypeDialogProps) {
  const [open, setOpen] = useState(false);
  const [selectedFileType, setSelectedFileType] = useState<string | null>(null);

  const handleFileTypeSelect = (fileType: string) => {
    setSelectedFileType(fileType);
    // Don't close the dialog, show the import dialog instead
  };

  const handleImportComplete = (filePath: string) => {
    onFileTypeSelect(selectedFileType!);
    setSelectedFileType(null);
    setOpen(false);
  };

  const handleClose = () => {
    setSelectedFileType(null);
    setOpen(false);
  };

  const fileTypes = [
    {
      id: "nutexb",
      name: "Nutexb Texture",
      description: "Convert image files to nutexb texture format",
      icon: FileImage,
      supported: true,
    },
  ];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[800px]">
        {!selectedFileType ? (
          <>
            <DialogHeader>
              <DialogTitle>Select File Type</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Choose the type of file you want to create:
              </p>
              <div className="grid gap-3">
                {fileTypes.map((fileType) => (
                  <Card
                    key={fileType.id}
                    className={`cursor-pointer transition-all hover:shadow-md ${
                      fileType.supported ? 'hover:border-blue-300' : 'opacity-50 cursor-not-allowed'
                    }`}
                    onClick={() => fileType.supported && handleFileTypeSelect(fileType.id)}
                  >
                    <CardHeader className="pb-3">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-blue-50">
                          <fileType.icon className="h-5 w-5 text-blue-600" />
                        </div>
                        <div className="flex-1">
                          <CardTitle className="text-base">{fileType.name}</CardTitle>
                          <CardDescription className="text-sm">
                            {fileType.description}
                          </CardDescription>
                        </div>
                        {fileType.supported && (
                          <Button size="sm" variant="outline">
                            Select
                          </Button>
                        )}
                        {!fileType.supported && (
                          <span className="text-xs text-gray-400 px-2 py-1 bg-gray-100 rounded">
                            Coming Soon
                          </span>
                        )}
                      </div>
                    </CardHeader>
                  </Card>
                ))}
              </div>
            </div>
          </>
        ) : selectedFileType === "nutexb" ? (
          <NutexbImportDialog
            currentDirectory={currentDirectory}
            onImportComplete={handleImportComplete}
            onClose={handleClose}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
} 