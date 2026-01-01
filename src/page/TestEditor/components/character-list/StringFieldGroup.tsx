import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface StringField {
  name: string;
  label: string;
  value: string;
}

interface StringFieldGroupProps {
  fields: StringField[];
  onChange: (fieldName: string, value: string) => void;
}

function normalizeHexInput(inputValue: string): string {
  return inputValue.replace(/[^0-9A-Fa-f]/g, "").toUpperCase();
}

export function StringFieldGroup({ fields, onChange }: StringFieldGroupProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      {fields.map((field) => (
        <div key={field.name} className="space-y-2">
          <Label htmlFor={field.name} className="text-xs font-medium">
            {field.label}
          </Label>
          <Input
            id={field.name}
            type="text"
            value={field.value || ""}
            onChange={(e) => onChange(field.name, normalizeHexInput(e.target.value))}
            className="w-full h-8 font-mono text-xs"
            placeholder="Enter hex string..."
            maxLength={200}
          />
        </div>
      ))}
    </div>
  );
}



