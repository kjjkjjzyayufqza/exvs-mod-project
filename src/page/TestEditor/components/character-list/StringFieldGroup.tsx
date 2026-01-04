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
            onChange={(e) => onChange(field.name, e.target.value)}
            className="w-full h-8 text-xs"
            placeholder="Enter UTF-8 text..."
            maxLength={200}
          />
        </div>
      ))}
    </div>
  );
}



