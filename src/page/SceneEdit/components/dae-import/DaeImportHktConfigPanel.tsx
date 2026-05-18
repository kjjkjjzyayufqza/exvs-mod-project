import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { HktImportConfig, HavokInstallInfo } from "./daeImportTypes";

interface DaeImportHktConfigPanelProps {
  config: HktImportConfig;
  havokInfo: HavokInstallInfo | null;
  onChange: (next: HktImportConfig) => void;
}

export function DaeImportHktConfigPanel({
  config,
  havokInfo,
  onChange,
}: DaeImportHktConfigPanelProps) {
  const update = <K extends keyof HktImportConfig>(
    key: K,
    value: HktImportConfig[K],
  ) => {
    onChange({ ...config, [key]: value });
  };

  if (!havokInfo) {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 ml-5">
        <p className="text-xs text-destructive">
          Havok Content Tools not detected. Install to C:\Program
          Files\Havok\HavokContentTools to enable HKT generation.
        </p>
      </div>
    );
  }

  if (!havokInfo.fileConvertAvailable) {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 ml-5">
        <p className="text-xs text-destructive">
          FileConvert.exe not found in Havok installation.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-md border border-border/50 p-3 ml-5">
      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
        HKT Configuration
      </p>

      <div className="space-y-1">
        <Label className="text-xs">Havok tool path</Label>
        <Input
          className="h-7 text-xs font-mono"
          value={config.havokToolPath || havokInfo.version}
          readOnly
        />
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Config profile</Label>
        <Select
          value={config.configProfile}
          onValueChange={(v) => update("configProfile", v)}
        >
          <SelectTrigger className="h-7 text-xs">
            <SelectValue placeholder="Select HKO config..." />
          </SelectTrigger>
          <SelectContent>
            {havokInfo.configProfiles.map((profile) => (
              <SelectItem key={profile} value={profile}>
                {profile}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
