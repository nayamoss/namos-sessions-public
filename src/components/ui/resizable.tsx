import * as React from "react";
import { GripVertical } from "lucide-react";
import * as ResizablePrimitive from "react-resizable-panels";

import { cn } from "@/lib/utils";

const ResizableOrientationContext = React.createContext<"horizontal" | "vertical">("horizontal");

const ResizablePanelGroup = ({
  className,
  orientation = "horizontal",
  ...props
}: React.ComponentProps<typeof ResizablePrimitive.Group>) => (
  <ResizableOrientationContext.Provider value={orientation}>
    <ResizablePrimitive.Group
      orientation={orientation}
      className={cn("flex h-full w-full", orientation === "vertical" && "flex-col", className)}
      {...props}
    />
  </ResizableOrientationContext.Provider>
);

const ResizablePanel = ResizablePrimitive.Panel;

const ResizableHandle = ({
  withHandle,
  className,
  ...props
}: React.ComponentProps<typeof ResizablePrimitive.Separator> & {
  withHandle?: boolean;
}) => {
  const orientation = React.useContext(ResizableOrientationContext);
  const isVertical = orientation === "vertical";
  return (
    <ResizablePrimitive.Separator
      className={cn(
        "relative flex w-px items-center justify-center bg-border after:absolute after:inset-y-0 after:left-1/2 after:w-1 after:-translate-x-1/2 focus-visible:outline-none",
        isVertical &&
          "h-px w-full after:left-0 after:top-1/2 after:h-1 after:w-full after:-translate-x-0 after:-translate-y-1/2 [&>div]:rotate-90",
        className,
      )}
      {...props}
    >
      {withHandle && (
        <div className="z-10 flex h-4 w-3 items-center justify-center rounded-sm border bg-border">
          <GripVertical className="h-2.5 w-2.5" />
        </div>
      )}
    </ResizablePrimitive.Separator>
  );
};

export { ResizablePanelGroup, ResizablePanel, ResizableHandle };
