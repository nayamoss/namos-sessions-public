import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { DynamicField } from "./DynamicFormRenderer";

const fieldTypes: DynamicField["type"][] = [
  "text",
  "textarea",
  "email",
  "number",
];
export function AddFieldPopover({
  onAdd,
}: {
  onAdd: (type: DynamicField["type"]) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          Add field
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-48 p-2">
        <div className="space-y-1">
          {fieldTypes.map((type) => (
            <button
              key={type}
              onClick={() => onAdd(type)}
              className="touch-target w-full rounded-md px-3 py-2 text-left text-sm capitalize hover:bg-muted"
            >
              {type}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
