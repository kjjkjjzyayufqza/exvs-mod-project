import { useCallback } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { toast } from "sonner";
import { ExternalLink } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";

export function AboutLinkButton({
  href,
  label,
}: {
  href: string;
  label: string;
}) {
  const { t } = useTranslation("small-pages");
  const onOpen = useCallback(async () => {
    try {
      await openUrl(href);
    } catch {
      try {
        await navigator.clipboard.writeText(href);
        toast.success(t("about.urlCopied"));
      } catch {
        toast.error(t("about.urlError"));
      }
    }
  }, [href]);

  return (
    <Button type="button" variant="outline" onClick={() => void onOpen()}>
      <ExternalLink className="h-4 w-4" />
      {label}
    </Button>
  );
}
