import { FC } from "react";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";

interface FormField {
  name: string;
  label: string;
  value: number;
}

interface FormFieldGroupProps {
  fields: FormField[];
  onChange: (fieldName: string, value: number) => void;
}

export const FormFieldGroup: FC<FormFieldGroupProps> = ({
  fields,
  onChange,
}) => {
  const handleInputChange = (fieldName: string, inputValue: string) => {
    // Parse the input value as a number, defaulting to 0 if invalid
    const numericValue = parseInt(inputValue) || 0;
    onChange(fieldName, numericValue);
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {fields.map((field) => (
        <div key={field.name} className="space-y-2">
          <Label htmlFor={field.name} className="text-sm font-medium">
            {field.label}
          </Label>
          <Input
            id={field.name}
            type="number"
            value={field.value || 0}
            onChange={(e) => handleInputChange(field.name, e.target.value)}
            className="w-full"
            placeholder="Enter value..."
          />
        </div>
      ))}
    </div>
  );
};
