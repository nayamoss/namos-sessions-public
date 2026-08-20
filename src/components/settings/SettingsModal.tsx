import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { SETTINGS_NAV_GROUPS, settingsPath } from "./settings-nav";

export function SettingsModal({ open, eventSlug, onOpenChange }: {
  open: boolean;
  eventSlug?: string;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-6">
        <DialogTitle>Settings</DialogTitle>
        <DialogDescription>Choose an area to configure.</DialogDescription>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {SETTINGS_NAV_GROUPS.flatMap((group) => group.items).map((item) => (
            <Button key={item.id} type="button" variant="outline" className="h-auto justify-start gap-3 px-4 py-3 text-left" onClick={() => {
              onOpenChange(false);
              navigate(settingsPath(item.id, eventSlug));
            }}>
              <item.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{item.label}</span>
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
