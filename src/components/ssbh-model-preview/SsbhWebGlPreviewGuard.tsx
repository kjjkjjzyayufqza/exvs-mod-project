import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { CatchErrorBoundary } from "@/layout/CatchErrorBoundary";

export function SsbhWebGlPreviewGuard({ children }: { children: ReactNode }) {
  const { t } = useTranslation("ssbh-root-c");
  const [retryNonce, setRetryNonce] = useState(0);
  return (
    <CatchErrorBoundary
      resetKeys={[retryNonce]}
      fallback={(error, reset) => (
        <div className="flex h-full min-h-[420px] flex-col items-center justify-center gap-3 bg-black/40 p-6 text-center">
          <p className="text-sm font-medium text-foreground">{t("viewport.webglFailed")}</p>
          <p className="max-w-md text-xs text-muted-foreground">{t("viewport.webglFailedHelp")}</p>
          <p className="max-w-md truncate font-mono text-[11px] text-destructive" title={error.message}>
            {error.message}
          </p>
          <Button
            type="button"
            size="sm"
            onClick={() => {
              setRetryNonce((value) => value + 1);
              reset();
            }}
          >
            {t("viewport.webglRetry")}
          </Button>
        </div>
      )}
    >
      {children}
    </CatchErrorBoundary>
  );
}
