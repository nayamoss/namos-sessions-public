import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
export function ExportMenu({ onExport }: { onExport: () => void }) { return <Button variant="outline" size="sm" onClick={onExport}><Download className="mr-1.5 h-4 w-4" />Export CSV</Button>; }
