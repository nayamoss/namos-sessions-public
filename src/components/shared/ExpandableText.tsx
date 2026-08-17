import { useState } from "react";
import { Button } from "@/components/ui/button";

/**
 * Keeps an organizer-facing detail pane usable when a submission contains a
 * long, user-authored response. Short values retain their natural height.
 */
export function ExpandableText({
  children,
  className = "",
  threshold = 320,
}: {
  children: string;
  className?: string;
  threshold?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const canExpand = children.length > threshold;

  return (
    <div className={`min-w-0 ${className}`}>
      <p
        className={`whitespace-pre-wrap break-words text-base leading-relaxed${
          canExpand && !expanded ? " line-clamp-6" : ""
        }`}
      >
        {children}
      </p>
      {canExpand && (
        <Button
          type="button"
          variant="link"
          size="sm"
          onClick={() => setExpanded((current) => !current)}
          className="mt-1 h-auto px-0 text-sm font-medium text-muted-foreground"
        >
          {expanded ? "Show less" : "Show more"}
        </Button>
      )}
    </div>
  );
}
