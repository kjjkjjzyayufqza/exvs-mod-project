import { useShallow } from "zustand/react/shallow";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { useDaeSsbhSessionStore } from "./store/daeSsbhSessionStore";
import { DaeSsbhSourcePicker } from "./components/DaeSsbhSourcePicker";
import { DaeSsbhSessionLayout } from "./components/DaeSsbhSessionLayout";

export function SsbhDaeExchangePanel() {
  const { t } = useTranslation("ssbh-motion");
  const { analysis, sourcePath, resetSession } = useDaeSsbhSessionStore(
    useShallow((state) => ({
      analysis: state.analysis,
      sourcePath: state.sourcePath,
      resetSession: state.resetSession,
    })),
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 rounded-md border bg-muted/10 px-3 py-2">
        <div className="space-y-0.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{t("daeExchange.title")}</p>
          <p className="text-[11px] text-muted-foreground">
            {analysis && sourcePath
              ? t("daeExchange.hintActive")
              : t("daeExchange.hintIdle")}
          </p>
        </div>
        {analysis ? (
          <Button type="button" variant="outline" size="sm" className="h-8 text-[10px] uppercase tracking-wide" onClick={resetSession}>
            {t("daeExchange.newSession")}
          </Button>
        ) : null}
      </div>

      {analysis && sourcePath ? <DaeSsbhSessionLayout /> : <DaeSsbhSourcePicker />}
    </div>
  );
}
