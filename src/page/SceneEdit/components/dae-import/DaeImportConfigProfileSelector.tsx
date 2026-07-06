import { useEffect, useMemo, useState } from "react";
import { FilePlus2, Loader2, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
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
      toast.success(`Applied import config '${profile.name}'`);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      setError(message);
      toast.error("Failed to apply import config", { description: message });
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
      setError("Profile name is required.");
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
      toast.success(selectedProfile ? "Import config updated" : "Import config saved");
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      setError(message);
      toast.error("Failed to save import config", { description: message });
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
      toast.success(`Deleted import config '${selectedProfile.name}'`);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      setError(message);
      toast.error("Failed to delete import config", { description: message });
    } finally {
      setBusy(null);
    }
  };

  const disabled = loading || busy !== null;

  return (
    <DaeImportSection title="Import Config Profiles">
      <DaeImportFieldRow
        label="Saved Profile"
        hint="Applies reusable conversion, material, texture, and output settings"
      >
        <div className="flex min-w-0 items-center gap-1.5">
          <Select value={selectedId ?? undefined} onValueChange={handleSelect} disabled={disabled}>
            <SelectTrigger className="h-8 min-w-0 flex-1 text-[11px]">
              {loading ? (
                <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Loading profiles
                </span>
              ) : (
                <SelectValue
                  placeholder={library.profiles.length > 0 ? "Choose profile" : "No saved profiles"}
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
            title="Create new profile"
            aria-label="Create new import config profile"
          >
            <FilePlus2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </DaeImportFieldRow>

      <DaeImportFieldRow
        label="Profile Name"
        hint={selectedProfile ? "Edit name or save current settings over selected profile" : "Name current settings"}
      >
        <div className="flex min-w-0 items-center gap-1.5">
          <Input
            className="h-8 min-w-0 flex-1 text-[11px]"
            value={profileName}
            onChange={(event) => setProfileName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !disabled) void handleSave();
            }}
            placeholder="e.g. Standard Unit Model"
            disabled={disabled}
            aria-label="Import config profile name"
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
            Save
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-8 w-8 shrink-0 text-destructive hover:text-destructive"
            onClick={() => void handleDelete()}
            disabled={disabled || !selectedProfile}
            title="Delete selected profile"
            aria-label="Delete selected import config profile"
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
