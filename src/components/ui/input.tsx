import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "touch-target flex h-8 rounded-md bg-muted px-3 py-1.5 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:bg-accent disabled:cursor-not-allowed disabled:opacity-50",
          type !== "file" && "w-full",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
