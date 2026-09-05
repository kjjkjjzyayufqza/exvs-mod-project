import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Languages, Settings2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { AppRndModalShell } from "@/components/AppRndModalShell";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useConfigStore } from "@/store/configStore";
import {
  SUPPORTED_APP_LOCALES,
  normalizeAppLocale,
} from "@/i18n/locale";

const SETTINGS_DIMENSIONS = {
  width: 500,
  height: 420,
  minWidth: 420,
  minHeight: 300,
};

type SettingsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const { t, i18n } = useTranslation("settings");
  const locale = useConfigStore((state) => state.locale);
  const setLocale = useConfigStore((state) => state.setLocale);
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

  const handleLocaleChange = (value: string) => {
    void setLocale(normalizeAppLocale(value)).catch(() => {
      toast.error(t("languageSaveError"));
    });
  };

  if (!open) return null;

  return (
    <AppRndModalShell
      titleId="settings-dialog-title"
      title={t("title")}
      subtitle={t("subtitle")}
      headerIcon={<Settings2 className="h-5 w-5 text-primary" />}
      dimensions={SETTINGS_DIMENSIONS}
      storageKey="app.rnd-size.settings"
      onClose={() => onOpenChange(false)}
    >
      <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto p-4">
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-0.5">
              <Label htmlFor="app-language" className="flex items-center gap-2">
                <Languages className="h-4 w-4" />
                {t("languageLabel")}
              </Label>
              <p className="text-xs text-muted-foreground">
                {t("languageDescription")}
              </p>
            </div>
            <Select value={locale} onValueChange={handleLocaleChange}>
              <SelectTrigger
                id="app-language"
                className="w-40"
                aria-label={t("languageLabel")}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SUPPORTED_APP_LOCALES.map((option) => (
                  <SelectItem key={option} value={option}>
                    {i18n.getFixedT(option, "settings")("language.selfName")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {mounted ? (
            <>
              <div className="flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <Label htmlFor="follow-system">
                    {t("followSystem")}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {t("followSystemDescription")}
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
                  <Label htmlFor="dark-mode">{t("darkMode")}</Label>
                  <p className="text-xs text-muted-foreground">
                    {t("darkModeDescription")}
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
              {t("loadingAppearance")}
            </p>
          )}
      </div>
    </AppRndModalShell>
  );
}
