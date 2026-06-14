import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import { NumdlbEditorModalHost } from "./NumdlbEditorModalHost";
import { NuhlpbEditorModalHost } from "./NuhlpbEditorModalHost";
import { NumatbEditorModalHost } from "./NumatbEditorModalHost";
import { JnttblEditorModalHost } from "./JnttblEditorModalHost";
import type { SsbhFileEditorHostProps } from "./useSsbhFileEditorSessions";

type GuardDialogProps = {
  label: string;
  guard: { action: "close" | "reload" } | null;
  onGuardOpenChange: (open: boolean) => void;
  onGuardCancel: () => void;
  onGuardDiscard: () => void;
  onGuardSave: () => void | Promise<void>;
};

function GuardDialog({
  label,
  guard,
  onGuardOpenChange,
  onGuardCancel,
  onGuardDiscard,
  onGuardSave,
}: GuardDialogProps) {
  return (
    <AlertDialog open={guard !== null} onOpenChange={onGuardOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Unsaved {label} changes</AlertDialogTitle>
          <AlertDialogDescription>
            {guard?.action === "close"
              ? "Save before closing, discard edits, or cancel."
              : "Save before reloading from disk, discard edits, or cancel."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
          <AlertDialogCancel type="button" onClick={onGuardCancel}>
            Cancel
          </AlertDialogCancel>
          <Button type="button" variant="outline" onClick={onGuardDiscard}>
            Discard
          </Button>
          <Button type="button" onClick={() => void onGuardSave()}>
            {guard?.action === "close" ? "Save and close" : "Save and reload"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * Renders the four windowed SSBH file editors (numdlb / nuhlpb / numatb / jnttbl)
 * plus their dirty-guard dialogs, driven by `useSsbhFileEditorSessions().hostProps`.
 * Mount once per page that opens SSBH file editors.
 */
export function SsbhFileEditorHosts({ numdlb, nuhlpb, numatb, jnttbl }: SsbhFileEditorHostProps) {
  return (
    <>
      <NumdlbEditorModalHost
        sessions={numdlb.sessions}
        onActivateSession={numdlb.onActivateSession}
        onCloseRequest={numdlb.onCloseRequest}
        onReloadRequest={numdlb.onReloadRequest}
        onDraftChange={numdlb.onDraftChange}
        onSave={numdlb.onSave}
        onReset={numdlb.onReset}
      />
      <GuardDialog
        label="NUMDLB"
        guard={numdlb.guard}
        onGuardOpenChange={numdlb.onGuardOpenChange}
        onGuardCancel={numdlb.onGuardCancel}
        onGuardDiscard={numdlb.onGuardDiscard}
        onGuardSave={numdlb.onGuardSave}
      />

      <NuhlpbEditorModalHost
        sessions={nuhlpb.sessions}
        onActivateSession={nuhlpb.onActivateSession}
        onCloseRequest={nuhlpb.onCloseRequest}
        onReloadRequest={nuhlpb.onReloadRequest}
        onDraftChange={nuhlpb.onDraftChange}
        onSave={nuhlpb.onSave}
        onReset={nuhlpb.onReset}
      />
      <GuardDialog
        label="NUHLPB"
        guard={nuhlpb.guard}
        onGuardOpenChange={nuhlpb.onGuardOpenChange}
        onGuardCancel={nuhlpb.onGuardCancel}
        onGuardDiscard={nuhlpb.onGuardDiscard}
        onGuardSave={nuhlpb.onGuardSave}
      />

      <NumatbEditorModalHost
        sessions={numatb.sessions}
        onActivateSession={numatb.onActivateSession}
        onCloseRequest={numatb.onCloseRequest}
        onReloadRequest={numatb.onReloadRequest}
        onDraftChange={numatb.onDraftChange}
        onSave={numatb.onSave}
        onReset={numatb.onReset}
      />
      <GuardDialog
        label="NUMATB"
        guard={numatb.guard}
        onGuardOpenChange={numatb.onGuardOpenChange}
        onGuardCancel={numatb.onGuardCancel}
        onGuardDiscard={numatb.onGuardDiscard}
        onGuardSave={numatb.onGuardSave}
      />

      <JnttblEditorModalHost
        sessions={jnttbl.sessions}
        onRegisterZLayer={jnttbl.onRegisterZLayer}
        onActivateSession={jnttbl.onActivateSession}
        onCloseRequest={jnttbl.onCloseRequest}
        onReloadRequest={jnttbl.onReloadRequest}
        onDraftChange={jnttbl.onDraftChange}
        onSave={jnttbl.onSave}
        onReset={jnttbl.onReset}
      />
      <GuardDialog
        label="JNTT"
        guard={jnttbl.guard}
        onGuardOpenChange={jnttbl.onGuardOpenChange}
        onGuardCancel={jnttbl.onGuardCancel}
        onGuardDiscard={jnttbl.onGuardDiscard}
        onGuardSave={jnttbl.onGuardSave}
      />
    </>
  );
}
