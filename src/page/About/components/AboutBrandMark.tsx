import appIcon from "@/assets/app-icon.png";

import { PRODUCT_NAME } from "@/lib/authorIdentity";
import { cn } from "@/lib/utils";

export function AboutBrandMark({ className }: { className?: string }) {
  return (
    <img
      src={appIcon}
      alt={PRODUCT_NAME}
      width={128}
      height={128}
      decoding="async"
      className={cn(
        "size-24 shrink-0 rounded-2xl border border-border/70 bg-white object-contain lg:size-28",
        className,
      )}
    />
  );
}
