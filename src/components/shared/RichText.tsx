import DOMPurify from "dompurify";
import { cn } from "@/lib/utils";

// Organizer copy authored in RichTextEditor is stored as an HTML string. Rendering it
// as text (the old behaviour on the public CFP) printed literal "<p>…</p>" to submitters.
// Sanitize and render it, using the same allowlist and prose classes as the
// communications template preview.
export function RichText({ html, className }: { html: string; className?: string }) {
  const trimmed = html.trim();
  if (!trimmed) return null;
  return (
    <div
      className={cn(
        "[&_a]:underline [&_h2]:mt-4 [&_h2]:font-semibold [&_h3]:mt-3 [&_h3]:font-semibold [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5",
        className,
      )}
      dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(trimmed) }}
    />
  );
}
