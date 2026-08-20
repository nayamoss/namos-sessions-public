import { useCallback, useEffect, useState } from "react";
import { FileText, Presentation, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/EmptyState";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useRepo } from "@/data/repo";
import type { SpeakerDocument, SpeakerDocumentKind, Submission, SubmissionId } from "@/data/types";
import { usePortalIdentity } from "./PortalIdentity";

const acceptedFiles = ".pdf,.ppt,.pptx,.key,.doc,.docx,.odt,.odp,.rtf,.txt";
const maxDocumentBytes = 10 * 1024 * 1024;

function submissionName(submission: Submission) {
  return submission.title?.trim() || "Untitled submission";
}

export function SpeakerDocuments() {
  const repo = useRepo();
  const { eventId, selectedSpeaker } = usePortalIdentity();
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [submissionId, setSubmissionId] = useState<SubmissionId | "">("");
  const [documents, setDocuments] = useState<SpeakerDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState<SpeakerDocumentKind>();
  const [removingId, setRemovingId] = useState<string>();
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    let active = true;
    setDocuments([]);
    setMessage(undefined);
    setError(undefined);
    if (!eventId || !selectedSpeaker) {
      setSubmissions([]);
      setSubmissionId("");
      return () => { active = false; };
    }
    // Scoped to this speaker: an unscoped list({ eventId }) call hits the Convex
    // organizer-only branch and throws "Forbidden" for a genuine (non-organizer) speaker.
    void repo.submissions.list({ eventId, speakerId: selectedSpeaker.id }).then((mine) => {
      if (!active) return;
      setSubmissions(mine);
      setSubmissionId((current) => mine.some((submission) => submission.id === current) ? current : mine[0]?.id ?? "");
    }).catch((cause) => {
      if (active) setError(cause instanceof Error ? cause.message : "Could not load your submissions.");
    });
    return () => { active = false; };
  }, [eventId, repo, selectedSpeaker]);

  const loadDocuments = useCallback(async () => {
    if (!eventId || !selectedSpeaker || !submissionId) {
      setDocuments([]);
      return;
    }
    setLoading(true);
    setError(undefined);
    try {
      setDocuments(await repo.speakers.listDocuments({ eventId, speakerId: selectedSpeaker.id, submissionId }));
    } catch (cause) {
      setDocuments([]);
      setError(cause instanceof Error ? cause.message : "Could not load your documents.");
    } finally {
      setLoading(false);
    }
  }, [eventId, repo, selectedSpeaker, submissionId]);

  useEffect(() => { void loadDocuments(); }, [loadDocuments]);

  const upload = async (kind: SpeakerDocumentKind, file: File | undefined) => {
    if (!file || !eventId || !selectedSpeaker || !submissionId) return;
    if (file.size > maxDocumentBytes) {
      setError("Speaker documents must be 10 MB or smaller.");
      return;
    }
    setUploading(kind);
    setMessage(undefined);
    setError(undefined);
    const scope = { eventId, speakerId: selectedSpeaker.id, submissionId };
    try {
      const { uploadUrl } = await repo.speakers.requestDocumentUpload(scope);
      const response = await fetch(uploadUrl, {
        method: "POST",
        headers: { "content-type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!response.ok) throw new Error("The document upload was rejected.");
      const { storageId } = await response.json() as { storageId?: string };
      if (!storageId) throw new Error("The upload did not return a storage reference.");
      await repo.speakers.saveDocument({ ...scope, storageId, fileName: file.name, kind });
      await loadDocuments();
      setMessage(`${kind === "slides" ? "Slides" : "Document"} uploaded.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not upload this document.");
    } finally {
      setUploading(undefined);
    }
  };

  const remove = async (document: SpeakerDocument) => {
    if (!eventId || !selectedSpeaker || !submissionId) return;
    setRemovingId(document.id);
    setMessage(undefined);
    setError(undefined);
    try {
      await repo.speakers.removeDocument({ eventId, speakerId: selectedSpeaker.id, submissionId, documentId: document.id });
      setDocuments((current) => current.filter((item) => item.id !== document.id));
      setMessage(`${document.fileName} removed.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not remove this document.");
    } finally {
      setRemovingId(undefined);
    }
  };

  return (
    <section className={cardSurfaceClasses("default", "space-y-5 p-6")}>
      <h2 className="text-base font-semibold">Slides and documents</h2>
      {submissions.length > 1 && (
        <div className="space-y-2">
          <label htmlFor="speaker-document-submission" className="text-sm font-medium">Submission</label>
          <Select value={submissionId} onValueChange={(value) => setSubmissionId(value as SubmissionId)}>
            <SelectTrigger id="speaker-document-submission" aria-label="Submission for speaker documents">
              <SelectValue placeholder="Select a submission" />
            </SelectTrigger>
            <SelectContent>
              {submissions.map((submission) => <SelectItem key={submission.id} value={submission.id}>{submissionName(submission)}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}
      {!submissions.length ? (
        <EmptyState compact icon={FileText} title="No submission available" />
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {([{"kind":"slides","label":"Upload slides","icon":Presentation},{"kind":"supporting_doc","label":"Upload document","icon":Upload}] as const).map(({ kind, label, icon: Icon }) => (
              <label key={kind} className="inline-flex cursor-pointer">
                <span className="sr-only">{label}</span>
                <Input type="file" accept={acceptedFiles} className="sr-only" disabled={Boolean(uploading)} onChange={(event) => { void upload(kind, event.target.files?.[0]); event.currentTarget.value = ""; }} />
                <Button type="button" variant="outline" size="sm" disabled={Boolean(uploading)} asChild>
                  <span><Icon />{uploading === kind ? "Uploading…" : label}</span>
                </Button>
              </label>
            ))}
          </div>
          {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          {loading ? <p className="text-sm text-muted-foreground">Loading documents…</p> : documents.length ? (
            <ul className="space-y-2">
              {documents.map((document) => (
                <li key={document.id} className="flex flex-wrap items-center gap-3 rounded-md bg-background p-3">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <a className="min-w-0 flex-1 truncate text-sm font-medium underline underline-offset-4" href={document.fileUrl} target="_blank" rel="noreferrer">{document.fileName}</a>
                  <span className="text-xs text-muted-foreground">{document.kind === "slides" ? "Slides" : "Supporting document"}</span>
                  <Button type="button" variant="ghost" size="sm" disabled={removingId === document.id} onClick={() => void remove(document)}>
                    <Trash2 />{removingId === document.id ? "Removing…" : "Remove"}
                  </Button>
                </li>
              ))}
            </ul>
          ) : <EmptyState compact icon={FileText} title="No files uploaded" />}
        </>
      )}
    </section>
  );
}
import { cardSurfaceClasses } from "@/components/ui/card";
