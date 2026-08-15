import { Input } from "@/components/ui/input";

export function ColorInput({
  value,
  onValueChange,
}: {
  value: string;
  onValueChange: (value: string) => void;
}) {
  const safeValue = /^#[0-9A-Fa-f]{6}$/.test(value) ? value : "#E56B5D";
  return (
    <div className="flex gap-2">
      <Input value={value} onChange={(event) => onValueChange(event.target.value)} />
      <input
        aria-label="Choose primary color"
        type="color"
        value={safeValue}
        onChange={(event) => onValueChange(event.target.value.toUpperCase())}
        className="h-9 w-12 cursor-pointer rounded-md bg-background p-1"
      />
    </div>
  );
}
