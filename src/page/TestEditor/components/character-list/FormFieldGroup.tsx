import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface FormField {
  name: string;
  label: string;
  value: number;
  inputClassName?: string;
  labelClassName?: string;
}

interface FormFieldGroupProps {
  fields: FormField[];
  onChange: (fieldName: string, value: number) => void;
}

function parseNumberInput(inputValue: string): number {
  const trimmed = inputValue.trim();
  if (!trimmed) return 0;
  const numericValue = Number(trimmed);
  return Number.isFinite(numericValue) ? Math.trunc(numericValue) : 0;
}

export function FormFieldGroup({ fields, onChange }: FormFieldGroupProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
      {fields.map((field) => (
        <div key={field.name} className="space-y-2">
          <Label htmlFor={field.name} className={cn("text-xs font-medium", field.labelClassName)}>
            {field.label}
          </Label>
          <Input
            id={field.name}
            type="number"
            value={field.value ?? 0}
            onChange={(e) => onChange(field.name, parseNumberInput(e.target.value))}
            className={cn("w-full h-8 text-xs", field.inputClassName)}
            placeholder="Enter value..."
          />
        </div>
      ))}
    </div>
  );
}



