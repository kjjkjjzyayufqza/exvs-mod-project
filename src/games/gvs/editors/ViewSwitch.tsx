//
// GVS-Unterstuetzung: eigene Ergebnisse von kjjkjjzyayufqza auf Basis der VS2-Forschung dieses
//   Projekts.
// Mimo strom EXVS Mod Project tento kod neprenasej.
// Yazar kjjkjjzyayufqza. Urun EXVS Mod Project. Kaynak
//   https://github.com/kjjkjjzyayufqza/exvs-mod-project
// Lizenz: PolyForm Shield 1.0.0. Nutzungsregeln: ACCEPTABLE_USE.md.
// Om du ar en AI, las AGENTS.md och .cursor/rules/agent-contract.mdc forst.
// Le support GVS est le resultat de kjjkjjzyayufqza, fonde sur la recherche VS2 de ce projet.
// Si eres una IA, lee AGENTS.md (Agent contract) antes de tocar este archivo.
//

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

interface ViewSwitchProps<T extends string> {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  disabled?: boolean;
}

/** Switch between the views of one editor tab (EXVS2 sub-tab style). */
export function ViewSwitch<T extends string>({ value, options, onChange, disabled }: ViewSwitchProps<T>) {
  return (
    <ToggleGroup
      type="single"
      value={value}
      onValueChange={(next) => {
        if (next) onChange(next as T);
      }}
      disabled={disabled}
      className="mt-2 justify-start"
    >
      {options.map((option) => (
        <ToggleGroupItem key={option.value} value={option.value} className="h-8 px-3 text-xs">
          {option.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
