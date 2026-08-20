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

const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;

type ProfileSettingsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  firstName: string;
  lastName?: string;
  avatarUrl?: string;
  onSaveName: (firstName: string, lastName?: string) => Promise<void>;
  onUploadPhoto?: (file: File) => Promise<void>;
};

export function ProfileSettingsDialog({
  open,
  onOpenChange,
  firstName,
  lastName = "",
  avatarUrl,
  onSaveName,
  onUploadPhoto,
}: ProfileSettingsDialogProps) {
  const [givenName, setGivenName] = useState(firstName);
  const [familyName, setFamilyName] = useState(lastName);
  const [photo, setPhoto] = useState<File>();
  const [photoPreview, setPhotoPreview] = useState<string>();
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setGivenName(firstName);
    setFamilyName(lastName);
    setPhoto(undefined);
    setPhotoPreview(undefined);
    setError(undefined);
  }, [firstName, lastName, open]);

  useEffect(() => () => {
    if (photoPreview) URL.revokeObjectURL(photoPreview);
  }, [photoPreview]);

  const initials = (givenName.trim() || firstName || "U").slice(0, 2).toUpperCase();
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
    const trimmedFirstName = givenName.trim();
    const trimmedLastName = familyName.trim();
    if (!trimmedFirstName) {
      setError("Enter your first name before saving.");
      return;
    }
    setSaving(true);
    setError(undefined);
    try {
      await onSaveName(trimmedFirstName, trimmedLastName || undefined);
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
          <DialogDescription className="sr-only">Update your profile.</DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <div className="flex items-start gap-4">
            <Button type="button" variant="ghost" size="icon" className="group relative h-16 w-16 shrink-0 rounded-full p-0" onClick={() => document.getElementById("profile-photo")?.click()} disabled={!onUploadPhoto || saving} aria-label={imageSrc ? "Change profile photo" : "Upload profile photo"}>
              <Avatar className="h-16 w-16">
                <AvatarImage src={imageSrc} alt="" />
                <AvatarFallback className="text-base font-medium">{initials}</AvatarFallback>
              </Avatar>
              <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/0 text-white opacity-0 transition group-hover:bg-black/35 group-hover:opacity-100 group-focus-visible:bg-black/35 group-focus-visible:opacity-100"><ImageUp className="h-4 w-4" /></span>
            </Button>
            <div className="grid min-w-0 flex-1 gap-4 sm:grid-cols-2">
              <Input
                id="profile-photo"
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => selectPhoto(event.target.files?.[0])}
              />
              <div className="space-y-2">
                <Label htmlFor="profile-first-name">First name</Label>
                <Input id="profile-first-name" value={givenName} onChange={(event) => setGivenName(event.target.value)} autoFocus />
              </div>
              <div className="space-y-2">
                <Label htmlFor="profile-last-name">Last name <span className="font-normal text-muted-foreground">(optional)</span></Label>
                <Input id="profile-last-name" value={familyName} onChange={(event) => setFamilyName(event.target.value)} />
              </div>
            </div>
          </div>
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
