import { createContext, useContext, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export type SsbhEditorThemeVariant = "default" | "embedded";

const SsbhEditorThemeContext = createContext<SsbhEditorThemeVariant>("default");

export function useSsbhEditorTheme(): SsbhEditorThemeVariant {
  return useContext(SsbhEditorThemeContext);
}

interface SsbhEditorThemeScopeProps {
  variant?: SsbhEditorThemeVariant;
  children: ReactNode;
  className?: string;
}

/**
 * Applies shadcn `.dark` tokens for editors embedded inside custom dark surfaces
 * (e.g. SceneEdit DAE import modal). Radix portals must opt in separately via
 * `ssbhEditorPortalThemeClass`.
 */
export function SsbhEditorThemeScope({
  variant = "default",
  children,
  className,
}: SsbhEditorThemeScopeProps) {
  return (
    <SsbhEditorThemeContext.Provider value={variant}>
      {variant === "default" ? (
        children
      ) : (
        <div
          className={cn(
            "dark text-foreground scheme-dark",
            "[&_select]:border-input [&_select]:bg-background [&_select]:text-foreground",
            className,
          )}
        >
          {children}
        </div>
      )}
    </SsbhEditorThemeContext.Provider>
  );
}

/** Portal-mounted overlays (Select, etc.) need explicit dark class — they render outside the scope node. */
export function ssbhEditorPortalThemeClass(variant: SsbhEditorThemeVariant): string | undefined {
  return variant === "embedded" ? "dark border-border bg-popover text-popover-foreground" : undefined;
}
