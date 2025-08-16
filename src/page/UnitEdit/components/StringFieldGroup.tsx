import { FC } from "react";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";

interface StringField {
  name: string;
  label: string;
  value: string;
}

interface StringFieldGroupProps {
  fields: StringField[];
  onChange: (fieldName: string, value: string) => void;
}

export const StringFieldGroup: FC<StringFieldGroupProps> = ({
  fields,
  onChange,
}) => {
  const handleInputChange = (fieldName: string, inputValue: string) => {
    // Remove any non-hex characters and convert to uppercase
    const cleanValue = inputValue.replace(/[^0-9A-Fa-f]/g, '').toUpperCase();
    onChange(fieldName, cleanValue);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {fields.map((field) => (
        <div key={field.name} className="space-y-2">
          <Label htmlFor={field.name} className="text-sm font-medium">
            {field.label}
          </Label>
          <Input
            id={field.name}
            type="text"
            value={field.value || ""}
            onChange={(e) => handleInputChange(field.name, e.target.value)}
            className="w-full font-mono text-sm"
            placeholder="Enter hex string (e.g., 8B934FD71543D083...)"
            maxLength={200}
          />
        </div>
      ))}
    </div>
  );
};
