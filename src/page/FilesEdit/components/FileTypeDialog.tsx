import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FileImage, Plus } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { NutexbImportPanel } from "./NutexbImportPanel";

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

  const renderContent = () => {
    if (!selectedFileType) {
      return (
        <div className="flex items-center justify-center h-full">
          <div className="text-center text-muted-foreground">
            <FileImage className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p className="text-lg font-medium">Select a file type</p>
            <p className="text-sm">Choose from the list on the left to get started</p>
          </div>
        </div>
      );
    }

    switch (selectedFileType) {
      case "nutexb":
        return (
          <div className="h-full">
            <NutexbImportPanel
              currentDirectory={currentDirectory}
              onImportComplete={handleImportComplete}
              onClose={handleClose}
            />
          </div>
        );
      default:
        return (
          <div className="flex items-center justify-center h-full">
            <div className="text-center text-muted-foreground">
              <Plus className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium">Coming Soon</p>
              <p className="text-sm">This file type is not yet supported</p>
            </div>
          </div>
        );
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[1000px] max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Add New File</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-12 gap-4 h-[600px]">
          {/* Left sidebar - File types */}
          <div className="col-span-4 border-r pr-4">
            <div className="mb-4">
              <p className="text-sm font-medium text-foreground">Choose file type</p>
              <p className="text-xs text-muted-foreground mt-1">Select the type of file you want to create</p>
            </div>
            <ScrollArea className="h-[500px]">
              <div className="space-y-2">
                {fileTypes.map((fileType) => (
                  <Card
                    key={fileType.id}
                    className={`cursor-pointer transition-all ${selectedFileType === fileType.id
                        ? 'border-blue-500 bg-primary/10 shadow-sm'
                        : 'hover:shadow-sm hover:border-gray-300'
                      } ${fileType.supported ? '' : 'opacity-50 cursor-not-allowed'}`}
                    onClick={() => fileType.supported && handleFileTypeSelect(fileType.id)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <div className={`p-2 rounded-lg ${selectedFileType === fileType.id ? 'bg-blue-100' : 'bg-muted/50'
                          }`}>
                          <fileType.icon className={`h-4 w-4 ${selectedFileType === fileType.id ? 'text-blue-600' : 'text-muted-foreground'
                            }`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm">{fileType.name}</p>
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                            {fileType.description}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </ScrollArea>
          </div>

          {/* Right content area */}
          <div className="col-span-8">
            <ScrollArea className="h-[550px]">
              {renderContent()}
            </ScrollArea>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
} 