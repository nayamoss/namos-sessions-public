import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type PublicLayoutProps = {
  children: ReactNode;
  width?: "form" | "submission" | "wide" | "reference";
  brandHref?: string;
};

export function PublicLayout({ children, width = "wide", brandHref }: PublicLayoutProps) {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div
        className={cn(
          "mx-auto min-h-screen w-full space-y-6 px-4 py-8 sm:px-6 sm:py-12",
          width === "form" ? "max-w-2xl" : width === "reference" ? "max-w-[1280px]" : "max-w-5xl",
        )}
      >
        {brandHref && <a className="text-sm font-semibold" href={brandHref}>Namos Sessions</a>}
        {children}
      </div>
    </main>
  );
}
