import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type { CardIconItem } from "./cardIconStructure";

interface CardIconRemoveDialogProps {
  item: CardIconItem;
  onConfirm: () => void;
  disabled?: boolean;
}

export function CardIconRemoveDialog({ item, onConfirm, disabled = false }: CardIconRemoveDialogProps) {
  const label = item.name ?? "(empty)";
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant="outline" disabled={disabled}>
          Remove
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove Card Icon</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to remove "{label}" (index {item.itemIndex}) from the list? This does not delete files on disk.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} disabled={disabled} className="bg-red-600 hover:bg-red-700">
            Remove
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
