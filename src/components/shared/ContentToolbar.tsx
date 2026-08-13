import type { ReactNode } from "react";

export interface ContentToolbarProps {
  search?: ReactNode;
  utilities?: ReactNode;
  primaryAction?: ReactNode;
  ariaLabel: string;
}

/** Compact page controls inside the working surface, never inside shell chrome. */
export function ContentToolbar({
  search,
  utilities,
  primaryAction,
  ariaLabel,
}: ContentToolbarProps) {
  return (
    <section
      aria-label={ariaLabel}
      className="flex min-w-0 flex-col gap-2 md:flex-row md:items-center"
    >
      {search && <div className="min-w-0 md:max-w-md md:flex-1">{search}</div>}
      {(utilities || primaryAction) && (
        <div className="flex min-w-0 items-center gap-2 overflow-x-auto pb-1 md:ml-auto md:pb-0">
          {primaryAction && <div className="order-1 shrink-0 md:order-2">{primaryAction}</div>}
          {utilities && <div className="order-2 flex shrink-0 items-center gap-2 md:order-1">{utilities}</div>}
        </div>
      )}
    </section>
  );
}
