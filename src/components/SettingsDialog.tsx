import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Application preferences including appearance.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
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
      </DialogContent>
    </Dialog>
  );
}
