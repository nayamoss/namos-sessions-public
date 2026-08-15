import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
export function ExportMenu({ onExport }: { onExport: () => void }) { return <Button variant="outline" size="icon" onClick={onExport} aria-label="Export CSV"><Download className="h-4 w-4" /></Button>; }
