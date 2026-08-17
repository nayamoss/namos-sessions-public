import { useEffect, useState } from "react";
import { ImageUp } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AnalyticsPreferences } from "@/components/AnalyticsConsent";

const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;

type ProfileSettingsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  displayName: string;
  avatarUrl?: string;
  onSaveName: (displayName: string) => Promise<void>;
  onUploadPhoto?: (file: File) => Promise<void>;
};

export function ProfileSettingsDialog({
  open,
  onOpenChange,
  displayName,
  avatarUrl,
  onSaveName,
  onUploadPhoto,
}: ProfileSettingsDialogProps) {
  const [name, setName] = useState(displayName);
  const [photo, setPhoto] = useState<File>();
  const [photoPreview, setPhotoPreview] = useState<string>();
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(displayName);
    setPhoto(undefined);
    setPhotoPreview(undefined);
    setError(undefined);
  }, [displayName, open]);

  useEffect(() => () => {
    if (photoPreview) URL.revokeObjectURL(photoPreview);
  }, [photoPreview]);

  const initials = (name.trim() || displayName || "U").slice(0, 2).toUpperCase();
  const imageSrc = photoPreview ?? avatarUrl;

  function selectPhoto(file?: File) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Choose an image file.");
      return;
    }
    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      setError("Choose an image smaller than 5 MB.");
      return;
    }
    setError(undefined);
    setPhoto(file);
    setPhotoPreview((current) => {
      if (current) URL.revokeObjectURL(current);
      return URL.createObjectURL(file);
    });
  }

  async function save() {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Enter your name before saving.");
      return;
    }
    setSaving(true);
    setError(undefined);
    try {
      await onSaveName(trimmedName);
      if (photo && onUploadPhoto) await onUploadPhoto(photo);
      onOpenChange(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Your profile could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Profile settings</DialogTitle>
          <DialogDescription>Update the name and photo shown across Namos Sessions.</DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              <AvatarImage src={imageSrc} alt="" />
              <AvatarFallback className="text-base font-medium">{initials}</AvatarFallback>
            </Avatar>
            <div className="space-y-1.5">
              <Label htmlFor="profile-photo" className="sr-only">Profile photo</Label>
              <Button type="button" variant="secondary" size="sm" onClick={() => document.getElementById("profile-photo")?.click()} disabled={!onUploadPhoto || saving}>
                <ImageUp />
                {imageSrc ? "Change photo" : "Upload photo"}
              </Button>
              <Input
                id="profile-photo"
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => selectPhoto(event.target.files?.[0])}
              />
              <p className="text-xs text-muted-foreground">PNG, JPG, or WebP up to 5 MB.</p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="profile-name">Your name</Label>
            <Input
              id="profile-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Jane Doe"
              autoFocus
            />
          </div>
          <AnalyticsPreferences />
          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button type="button" onClick={() => void save()} disabled={saving}>{saving ? "Saving..." : "Save changes"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
