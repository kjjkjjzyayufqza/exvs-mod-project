import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";

export const unrealPanelClass =
  "bg-[#151515] border border-[#2b2b2b] shadow-[0_8px_32px_rgba(0,0,0,0.65)] text-[#e0e0e0]";

export const unrealMutedTextClass = "text-[#b8b8b8]";

export const unrealSubtleTextClass = "text-[#9a9a9a]";

export const unrealSectionTitleClass =
  "text-[10px] font-semibold uppercase tracking-wide text-[#d4d4d4]";

export const unrealFieldLabelClass = "text-[10px] text-[#cfcfcf]";

export const unrealSectionBoxClass =
  "space-y-2 rounded border border-[#454545] bg-[#1e1e1e] p-2";

export const unrealCheckboxClass =
  "h-4 w-4 shrink-0 rounded-[3px] border-2 border-[#9a9a9a] bg-[#383838] shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] transition-colors hover:border-[#bdbdbd] hover:bg-[#454545] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/60 focus-visible:ring-offset-0 disabled:opacity-50 data-[state=checked]:border-orange-400 data-[state=checked]:bg-orange-500 data-[state=checked]:text-white [&_svg]:size-3";

export const unrealTitleBarClass =
  "flex items-center justify-between border-b border-[#0f0f0f] bg-[#2a2a2a] px-2.5 py-1.5 select-none cursor-grab active:cursor-grabbing";

export const unrealFooterClass =
  "flex justify-end gap-1.5 border-t border-[#0f0f0f] bg-[#1c1c1c] px-2.5 py-2";

export const unrealInputClass =
  "h-[22px] rounded-none border-[#555] bg-[#282828] px-1.5 text-[11px] text-[#eee] shadow-none focus-visible:border-orange-500/70 focus-visible:ring-0 focus-visible:ring-offset-0";

export const unrealSelectTriggerClass =
  "h-[22px] rounded-none border-[#555] bg-[#282828] px-1.5 text-[11px] text-[#eee] shadow-none focus:ring-0 focus:ring-offset-0";

export const unrealPrimaryButtonClass =
  "h-7 rounded-none bg-[#e67e22] px-3 text-[11px] font-medium text-[#101010] hover:bg-[#f08840] disabled:bg-[#4a4a4a] disabled:text-[#888]";

export const unrealSecondaryButtonClass =
  "h-7 rounded-none border-[#3a3a3a] bg-[#252525] px-3 text-[11px] text-[#d4d4d4] hover:bg-[#303030] hover:text-white";

interface UnrealDetailsSectionProps {
  title: string;
  children: ReactNode;
  className?: string;
}

export function UnrealDetailsSection({
  title,
  children,
  className,
}: UnrealDetailsSectionProps) {
  return (
    <section className={cn("border-b border-[#1f1f1f] last:border-b-0", className)}>
      <div className="border-b border-[#3a3a3a] bg-[#2e2e2e] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#d8d8d8]">
        {title}
      </div>
      <div className="bg-[#1a1a1a]">{children}</div>
    </section>
  );
}

interface UnrealPropertyRowProps {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}

export function UnrealPropertyRow({
  label,
  hint,
  children,
  className,
}: UnrealPropertyRowProps) {
  return (
    <div
      className={cn(
        "grid min-h-[26px] grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] items-center gap-2 border-b border-[#2a2a2a] px-2 py-0.5 last:border-b-0 hover:bg-[#242424]",
        className,
      )}
    >
      <div className="min-w-0">
        <span className="block truncate text-[11px] text-[#e0e0e0]">{label}</span>
        {hint ? (
          <span className={cn("block truncate text-[9px] leading-tight", unrealSubtleTextClass)}>
            {hint}
          </span>
        ) : null}
      </div>
      <div className="min-w-0 justify-self-stretch">{children}</div>
    </div>
  );
}

export function UnrealCheckbox({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof Checkbox>) {
  return <Checkbox className={cn(unrealCheckboxClass, className)} {...props} />;
}

interface UnrealPropertyBoolProps {
  label: string;
  hint?: string;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (checked: boolean) => void;
}

export function UnrealPropertyBool({
  label,
  hint,
  checked,
  disabled,
  onCheckedChange,
}: UnrealPropertyBoolProps) {
  return (
    <UnrealPropertyRow label={label} hint={hint}>
      <div className="flex h-[22px] items-center justify-end">
        <UnrealCheckbox
          checked={checked}
          disabled={disabled}
          onCheckedChange={(value) => onCheckedChange(value === true)}
        />
      </div>
    </UnrealPropertyRow>
  );
}

interface UnrealStatusBannerProps {
  tone: "info" | "warning" | "error";
  children: ReactNode;
}

export function UnrealStatusBanner({ tone, children }: UnrealStatusBannerProps) {
  const toneClass =
    tone === "error"
      ? "border-[#6b2f2f] bg-[#2a1515] text-[#ff8a8a]"
      : tone === "warning"
        ? "border-[#6b5520] bg-[#2a2415] text-[#f0c060]"
        : "border-[#2f4a6b] bg-[#152030] text-[#9ec8f0]";

  return (
    <div className={cn("border px-2 py-1.5 text-[10px] leading-snug", toneClass)}>
      {children}
    </div>
  );
}

interface UnrealModeToggleProps {
  value: string;
  options: Array<{ value: string; label: string }>;
  onValueChange: (value: string) => void;
}

export function UnrealModeToggle({ value, options, onValueChange }: UnrealModeToggleProps) {
  return (
    <div className="flex h-[22px] border border-[#555] bg-[#282828]">
      {options.map((option) => {
        const active = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onValueChange(option.value)}
            className={cn(
              "flex-1 truncate px-1 text-[10px] transition-colors",
              active
                ? "bg-[#e67e22] font-medium text-[#101010]"
                : "text-[#b8b8b8] hover:bg-[#1f1f1f] hover:text-[#f0f0f0]",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
