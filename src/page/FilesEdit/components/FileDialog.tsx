import { DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileInfo, useNumatbStore } from "../../../store/numatbStore";

interface FileDialogProps {
  file: FileInfo;
}

export function FileDialog({ file }: FileDialogProps) {
  const store = useNumatbStore();
  const { numatbData, isConverting, error } = store;

  if (isConverting) {
    return (
      <div className="flex items-center justify-center p-8">
        <DialogHeader>
          <DialogTitle>Edit {file.name}</DialogTitle>
        </DialogHeader >
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
        </DialogHeader >
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
  if (numatbData) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Edit {file.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-6">
          <div className="flex space-x-4">
            <div className="space-y-2">
              <Label>Major Version</Label>
              <Input value={numatbData.major_version} readOnly />
            </div>
            <div className="space-y-2">
              <Label>Minor Version</Label>
              <Input value={numatbData.minor_version} readOnly />
            </div>
          </div>
          <div className="space-y-4">
            <Label>Materials</Label>
            {numatbData.entries.map((entry, index) => (
              <Card key={index} className="p-4">
                <h4 className="font-medium mb-3">{entry.material_label || 'Unnamed Material'}</h4>
                <div className="space-y-2">
                  {entry.textures.map((texture, tIndex) => (
                    <div key={tIndex} className="flex space-x-2">
                      <Input value={texture.param_id} readOnly className="flex-1" />
                      <Input value={texture.data} readOnly className="flex-1" />
                    </div>
                  ))}
                </div>
              </Card>
            ))}
          </div>
        </div>
      </>
    );
  }

  return <div>
    <DialogHeader>
      <DialogTitle>Edit {file.name}</DialogTitle>
    </DialogHeader >
    <div className="flex items-center justify-center h-32 text-gray-500">
      No data to display
    </div>
  </div >
}
