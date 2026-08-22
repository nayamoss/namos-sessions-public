import { forwardRef, type ComponentProps } from "react";

// File selection still relies on the platform control, but keeping the hidden input in the UI
// layer gives feature pages the same typed, accessible primitive as every other form field.
export const FileInput = forwardRef<HTMLInputElement, ComponentProps<"input">>(function FileInput({ className = "", ...props }, ref) {
  return <input ref={ref} className={`sr-only ${className}`.trim()} type="file" {...props} />;
});
