import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { ContentToolbar } from "@/components/shared/ContentToolbar";
import { SkeletonList } from "@/components/shared/SkeletonList";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

type EditorPageProps = {
  title: string;
  backTo: string;
  children: ReactNode;
  error?: string;
  loading?: boolean;
  notFound?: boolean;
  dirty?: boolean;
  saving?: boolean;
  saveLabel?: string;
  saveDisabled?: boolean;
  onSave?: () => void | Promise<void>;
  secondaryAction?: ReactNode;
};

/** Shared full-page shell for persisted record editors. */
export function EditorPage({
  title,
  backTo,
  children,
  error,
  loading = false,
  notFound = false,
  dirty = false,
  saving = false,
  saveLabel = "Save",
  saveDisabled = false,
  onSave,
  secondaryAction,
}: EditorPageProps) {
  const navigate = useNavigate();
  const [discardOpen, setDiscardOpen] = useState(false);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const leave = () => {
    if (dirty) setDiscardOpen(true);
    else navigate(backTo);
  };

  return (
    <AppLayout title={title}>
      <div className="space-y-5">
        <ContentToolbar
          ariaLabel={`${title} actions`}
          utilities={
            <>
              {secondaryAction}
              <Button type="button" variant="ghost" size="sm" onClick={leave} disabled={saving}>
                Cancel
              </Button>
            </>
          }
          primaryAction={onSave ? (
            <Button type="button" variant="accent" size="sm" onClick={() => void onSave()} disabled={saving || saveDisabled}>
              {saving ? "Saving…" : saveLabel}
            </Button>
          ) : undefined}
        />

        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        {loading ? <SkeletonList rows={5} label={`Loading ${title.toLowerCase()}…`} /> : notFound ? (
          <section className="flex min-h-64 flex-col items-center justify-center text-center">
            <h2 className="text-base font-semibold">Record not found</h2>
            <Button type="button" variant="outline" size="sm" className="mt-4" onClick={() => navigate(backTo)}>
              Back to list
            </Button>
          </section>
        ) : children}
      </div>

      <AlertDialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription>Your changes will not be saved.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction onClick={() => navigate(backTo)}>Discard changes</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
