import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Settings2 } from "lucide-react";
import { AppRndModalShell } from "@/components/AppRndModalShell";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

const SETTINGS_DIMENSIONS = {
  width: 500,
  height: 360,
  minWidth: 420,
  minHeight: 300,
};

type SettingsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const followSystem = theme === "system";

  const handleFollowSystem = (checked: boolean) => {
    if (checked) {
      setTheme("system");
      return;
    }
    if (resolvedTheme === "dark") {
      setTheme("dark");
      return;
    }
    setTheme("light");
  };

  const handleDarkMode = (checked: boolean) => {
    setTheme(checked ? "dark" : "light");
  };

  if (!open) return null;

  return (
    <AppRndModalShell
      titleId="settings-dialog-title"
      title="Settings"
      subtitle="Application preferences"
      headerIcon={<Settings2 className="h-5 w-5 text-primary" />}
      dimensions={SETTINGS_DIMENSIONS}
      storageKey="app.rnd-size.settings"
      onClose={() => onOpenChange(false)}
    >
      <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto p-4">
          {mounted ? (
            <>
              <div className="flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <Label htmlFor="follow-system">Use system theme</Label>
                  <p className="text-xs text-muted-foreground">
                    Match light or dark mode to the operating system.
                  </p>
                </div>
                <Switch
                  id="follow-system"
                  checked={followSystem}
                  onCheckedChange={handleFollowSystem}
                />
              </div>
              <div className="flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <Label htmlFor="dark-mode">Dark mode</Label>
                  <p className="text-xs text-muted-foreground">
                    Use dark colors for the interface. Disabled when following
                    the system theme.
                  </p>
                </div>
                <Switch
                  id="dark-mode"
                  checked={resolvedTheme === "dark"}
                  disabled={followSystem}
                  onCheckedChange={handleDarkMode}
                />
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Loading appearance settings…
            </p>
          )}
      </div>
    </AppRndModalShell>
  );
}
