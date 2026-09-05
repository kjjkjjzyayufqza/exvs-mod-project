import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";
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
import { ShlEditorModalHost } from "./ShlEditorModalHost";
import { VernierEditorModalHost } from "./VernierEditorModalHost";
import type { SsbhFileEditorHostProps } from "./useSsbhFileEditorSessions";
import type { ModalViewportSuspendInteraction } from "./SsbhEditorModalWindowShell";

type SsbhFileEditorHostsProps = SsbhFileEditorHostProps & {
  viewportSuspend?: ModalViewportSuspendInteraction;
  /** Structure-JSON model folder names in order; index = folder_index. Enables SHL model resolution. */
  shlModelFolderNames?: string[];
  shlBodySlotRequired?: boolean;
};

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
  const { t } = useTranslation("ssbh-modals");
  return (
    <AlertDialog open={guard !== null} onOpenChange={onGuardOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("common.unsavedTitle", { label })}</AlertDialogTitle>
          <AlertDialogDescription>
            {guard?.action === "close" ? t("common.unsavedClose") : t("common.unsavedReload")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
          <AlertDialogCancel type="button" onClick={onGuardCancel}>
            {t("common.cancel")}
          </AlertDialogCancel>
          <Button type="button" variant="outline" onClick={onGuardDiscard}>
            {t("common.discard")}
          </Button>
          <Button type="button" onClick={() => void onGuardSave()}>
            {guard?.action === "close" ? t("common.saveAndClose") : t("common.saveAndReload")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * Renders the windowed SSBH/control-bin file editors (numdlb / nuhlpb / numatb / jnttbl / shl /
 * vernier) plus their dirty-guard dialogs, driven by `useSsbhFileEditorSessions().hostProps`.
 * Mount once per page that opens these file editors.
 */
export function SsbhFileEditorHosts({
  numdlb,
  nuhlpb,
  numatb,
  jnttbl,
  shl,
  vernier,
  viewportSuspend,
  shlModelFolderNames,
  shlBodySlotRequired = true,
}: SsbhFileEditorHostsProps) {
  const { t } = useTranslation("ssbh-modals");
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
        viewportSuspend={viewportSuspend}
      />
      <GuardDialog
        label={t("formats.numdlb")}
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
        viewportSuspend={viewportSuspend}
      />
      <GuardDialog
        label={t("formats.nuhlpb")}
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
        viewportSuspend={viewportSuspend}
      />
      <GuardDialog
        label={t("formats.numatb")}
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
        viewportSuspend={viewportSuspend}
      />
      <GuardDialog
        label={t("formats.jntt")}
        guard={jnttbl.guard}
        onGuardOpenChange={jnttbl.onGuardOpenChange}
        onGuardCancel={jnttbl.onGuardCancel}
        onGuardDiscard={jnttbl.onGuardDiscard}
        onGuardSave={jnttbl.onGuardSave}
      />

      <ShlEditorModalHost
        sessions={shl.sessions}
        onActivateSession={shl.onActivateSession}
        onCloseRequest={shl.onCloseRequest}
        onReloadRequest={shl.onReloadRequest}
        onDraftChange={shl.onDraftChange}
        onSave={shl.onSave}
        onReset={shl.onReset}
        viewportSuspend={viewportSuspend}
        modelFolderNames={shlModelFolderNames}
        bodySlotRequired={shlBodySlotRequired}
      />
      <GuardDialog
        label={t("formats.shl")}
        guard={shl.guard}
        onGuardOpenChange={shl.onGuardOpenChange}
        onGuardCancel={shl.onGuardCancel}
        onGuardDiscard={shl.onGuardDiscard}
        onGuardSave={shl.onGuardSave}
      />

      <VernierEditorModalHost
        sessions={vernier.sessions}
        onActivateSession={vernier.onActivateSession}
        onCloseRequest={vernier.onCloseRequest}
        onReloadRequest={vernier.onReloadRequest}
        onDraftChange={vernier.onDraftChange}
        onSave={vernier.onSave}
        onReset={vernier.onReset}
        viewportSuspend={viewportSuspend}
      />
      <GuardDialog
        label={t("formats.vernier")}
        guard={vernier.guard}
        onGuardOpenChange={vernier.onGuardOpenChange}
        onGuardCancel={vernier.onGuardCancel}
        onGuardDiscard={vernier.onGuardDiscard}
        onGuardSave={vernier.onGuardSave}
      />
    </>
  );
}
