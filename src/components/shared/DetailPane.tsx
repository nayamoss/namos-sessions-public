import type { ReactNode } from "react";
import { X } from "lucide-react";
import { useSearchParams } from "react-router-dom";

export function DetailPane({ title, children, onClose }: { title: string; children: ReactNode; onClose?: () => void }) {
  const [, setSearchParams] = useSearchParams();
  const close = () => {
    if (onClose) { onClose(); return; }
    setSearchParams(params => { const next = new URLSearchParams(params); next.delete("selected"); return next; });
  };
  return <section className="space-y-6"><header className="flex items-center justify-between"><h2 className="text-base font-semibold">{title}</h2><button aria-label="Close detail" title="Close detail" onClick={close} className="touch-target flex items-center justify-center rounded-md text-muted-foreground hover:bg-background hover:text-foreground"><X className="h-4 w-4" /></button></header>{children}</section>;
}
