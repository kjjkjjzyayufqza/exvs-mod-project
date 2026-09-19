import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { issueTitle } from "@/services/triadRoute/issueLocation";
import type { ValidationIssue } from "@/services/triadRoute/types";
import { SEVERITY_STYLE } from "./severity";

/** Border and focus ring for a control the checks have something to say about. */
export function fieldRing(issues: ValidationIssue[] | undefined): string | undefined {
  if (!issues || issues.length === 0) return undefined;
  const worst = issues.some((issue) => issue.severity === "error")
    ? "error"
    : issues.some((issue) => issue.severity === "warning")
      ? "warning"
      : "info";
  return worst === "info" ? undefined : SEVERITY_STYLE[worst].field;
}

/** A labelled control, with whatever the checks said about it underneath. */
export function Field({
  label,
  issues,
  className,
  hint,
  children,
}: {
  label: string;
  issues?: ValidationIssue[];
  className?: string;
  hint?: string;
  children: ReactNode;
}) {
  const { t } = useTranslation("test-triad-route");

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label className="text-xs font-medium">{label}</Label>
      {children}
      {issues?.map((issue, index) => (
        <p
          key={`${issue.code}-${index}`}
          className={cn("text-[11px] leading-snug", SEVERITY_STYLE[issue.severity].text)}
          style={{ textWrap: "pretty" }}
        >
          {issueTitle((key, options) => t(key, options as Record<string, string>), issue)}
        </p>
      ))}
      {hint && (!issues || issues.length === 0) ? (
        <p className="text-[11px] leading-snug text-muted-foreground" style={{ textWrap: "pretty" }}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}
