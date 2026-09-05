import { useEffect, useMemo, useState } from "react";
import { FilePlus2, Loader2, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DaeImportFieldRow,
  DaeImportSection,
  DaeImportStatusAlert,
  daeImportModalSelectContentClass,
} from "./daeImportUi";
import {
  deleteDaeImportConfigProfile,
  loadDaeImportConfigProfileLibrary,
  upsertDaeImportConfigProfile,
  type DaeImportConfigProfile,
  type DaeImportConfigProfileLibrary,
  type DaeImportConfigProfileSnapshot,
} from "./daeImportConfigProfiles";

interface DaeImportConfigProfileSelectorProps {
  captureSnapshot: () => DaeImportConfigProfileSnapshot;
  onApply: (snapshot: DaeImportConfigProfileSnapshot) => void;
}

const EMPTY_LIBRARY: DaeImportConfigProfileLibrary = {
  version: 1,
  profiles: [],
};

export function DaeImportConfigProfileSelector({
  captureSnapshot,
  onApply,
}: DaeImportConfigProfileSelectorProps) {
  const { t } = useTranslation("scene-dae-forms");
  const [library, setLibrary] = useState<DaeImportConfigProfileLibrary>(EMPTY_LIBRARY);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [profileName, setProfileName] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"save" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void loadDaeImportConfigProfileLibrary()
      .then((nextLibrary) => {
        if (!active) return;
        setLibrary(nextLibrary);
        setError(null);
      })
      .catch((reason) => {
        if (!active) return;
        setError(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const selectedProfile = useMemo(
    () => library.profiles.find((profile) => profile.id === selectedId) ?? null,
    [library.profiles, selectedId],
  );

  const handleSelect = (profileId: string) => {
    const profile = library.profiles.find((candidate) => candidate.id === profileId);
    if (!profile) return;
    try {
      onApply(profile.snapshot);
      setSelectedId(profile.id);
      setProfileName(profile.name);
      setError(null);
      toast.success(t("profiles.applied", { name: profile.name }));
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      setError(message);
      toast.error(t("profiles.applyFailed"), { description: message });
    }
  };

  const handleNew = () => {
    setSelectedId(null);
    setProfileName("");
    setError(null);
  };

  const handleSave = async () => {
    const name = profileName.trim();
    if (!name) {
      setError(t("profiles.nameRequired"));
      return;
    }
    setBusy("save");
    setError(null);
    try {
      const profile: DaeImportConfigProfile = {
        id: selectedProfile?.id ?? crypto.randomUUID(),
        name,
        updatedAt: new Date().toISOString(),
        snapshot: captureSnapshot(),
      };
      const nextLibrary = await upsertDaeImportConfigProfile(profile);
      setLibrary(nextLibrary);
      setSelectedId(profile.id);
      setProfileName(profile.name);
      toast.success(selectedProfile ? t("profiles.updated") : t("profiles.saved"));
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      setError(message);
      toast.error(t("profiles.saveFailed"), { description: message });
    } finally {
      setBusy(null);
    }
  };

  const handleDelete = async () => {
    if (!selectedProfile) return;
    setBusy("delete");
    setError(null);
    try {
      const nextLibrary = await deleteDaeImportConfigProfile(selectedProfile.id);
      setLibrary(nextLibrary);
      setSelectedId(null);
      setProfileName("");
      toast.success(t("profiles.deleted", { name: selectedProfile.name }));
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      setError(message);
      toast.error(t("profiles.deleteFailed"), { description: message });
    } finally {
      setBusy(null);
    }
  };

  const disabled = loading || busy !== null;

  return (
    <DaeImportSection title={t("profiles.title")}>
      <DaeImportFieldRow
        label={t("profiles.savedProfile")}
        hint={t("profiles.savedProfileHint")}
      >
        <div className="flex min-w-0 items-center gap-1.5">
          <Select value={selectedId ?? undefined} onValueChange={handleSelect} disabled={disabled}>
            <SelectTrigger className="h-8 min-w-0 flex-1 text-[11px]">
              {loading ? (
                <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {t("profiles.loading")}
                </span>
              ) : (
                <SelectValue
                  placeholder={library.profiles.length > 0 ? t("profiles.choose") : t("profiles.none")}
                />
              )}
            </SelectTrigger>
            <SelectContent className={daeImportModalSelectContentClass}>
              {library.profiles.map((profile) => (
                <SelectItem key={profile.id} value={profile.id} className="text-[11px]">
                  {profile.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={handleNew}
            disabled={disabled}
            title={t("profiles.createTitle")}
            aria-label={t("profiles.createAria")}
          >
            <FilePlus2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </DaeImportFieldRow>

      <DaeImportFieldRow
        label={t("profiles.name")}
        hint={selectedProfile ? t("profiles.editHint") : t("profiles.nameHint")}
      >
        <div className="flex min-w-0 items-center gap-1.5">
          <Input
            className="h-8 min-w-0 flex-1 text-[11px]"
            value={profileName}
            onChange={(event) => setProfileName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !disabled) void handleSave();
            }}
            placeholder={t("profiles.namePlaceholder")}
            disabled={disabled}
            aria-label={t("profiles.nameAria")}
          />
          <Button
            type="button"
            size="sm"
            className="h-8 shrink-0 gap-1.5 px-2.5 text-[11px]"
            onClick={() => void handleSave()}
            disabled={disabled || !profileName.trim()}
          >
            {busy === "save" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            {t("profiles.save")}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-8 w-8 shrink-0 text-destructive hover:text-destructive"
            onClick={() => void handleDelete()}
            disabled={disabled || !selectedProfile}
            title={t("profiles.deleteTitle")}
            aria-label={t("profiles.deleteAria")}
          >
            {busy === "delete" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Trash2 className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
      </DaeImportFieldRow>

      {error ? (
        <DaeImportStatusAlert tone="error" compact>
          {error}
        </DaeImportStatusAlert>
      ) : null}
    </DaeImportSection>
  );
}
