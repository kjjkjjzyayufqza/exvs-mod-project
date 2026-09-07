import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { CatchErrorBoundary } from "./CatchErrorBoundary";

function PageErrorFallback({ error, onRetry }: { error: Error; onRetry: () => void }) {
  const { t } = useTranslation("shared");
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
      <p className="text-sm font-medium text-foreground">{t("layout.pageError")}</p>
      <p className="max-w-lg truncate font-mono text-xs text-muted-foreground" title={error.message}>
        {error.message}
      </p>
      <Button type="button" size="sm" onClick={onRetry}>
        {t("layout.pageErrorRetry")}
      </Button>
    </div>
  );
}

export function PageErrorBoundary({
  children,
  resetKey,
}: {
  children: ReactNode;
  resetKey: string;
}) {
  const [retryNonce, setRetryNonce] = useState(0);
  return (
    <CatchErrorBoundary
      resetKeys={[resetKey, retryNonce]}
      fallback={(error, reset) => (
        <PageErrorFallback
          error={error}
          onRetry={() => {
            setRetryNonce((value) => value + 1);
            reset();
          }}
        />
      )}
    >
      {children}
    </CatchErrorBoundary>
  );
}
