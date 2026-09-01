import { useCallback } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { toast } from "sonner";
import { ExternalLink } from "lucide-react";

import { Button } from "@/components/ui/button";

export function AboutLinkButton({
  href,
  label,
}: {
  href: string;
  label: string;
}) {
  const onOpen = useCallback(async () => {
    try {
      await openUrl(href);
    } catch {
      try {
        await navigator.clipboard.writeText(href);
        toast.success("URL copied");
      } catch {
        toast.error("Could not open or copy the URL");
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
