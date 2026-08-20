import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "touch-target inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:brightness-95 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-[hsl(var(--primary-hover))]",
        accent: "bg-primary text-primary-foreground hover:bg-[hsl(var(--primary-hover))]",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/85",
        outline: "bg-muted hover:bg-muted/70 text-foreground",
        secondary: "bg-secondary text-secondary-foreground hover:bg-muted",
        ghost: "hover:bg-muted",
        link: "text-primary underline-offset-4 hover:underline rounded-none",
        muted: "bg-muted text-foreground hover:bg-muted/80",
        subtle: "bg-primary/10 text-foreground hover:bg-primary/15",
      },
      size: {
        default: "h-10 px-4 py-2.5",
        sm: "h-9 px-3.5 py-2 text-sm",
        lg: "h-11 px-6 py-3",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, title, "aria-label": ariaLabel, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    const hoverLabel = title ?? (size === "icon" && typeof ariaLabel === "string" ? ariaLabel : undefined);
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} title={hoverLabel} aria-label={ariaLabel} {...props} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
