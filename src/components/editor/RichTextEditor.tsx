import { useEffect, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import { Bold, Italic, List, ListOrdered, Link2, Quote, Undo2, Redo2, Heading2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { normalizeRichTextContent } from "@/lib/rich-text";
import "./rich-text-editor.css";

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

export function RichTextEditor({
  value,
  onChange,
  placeholder = "Write policy content...",
  disabled = false,
}: RichTextEditorProps) {
  // An inline link row, not window.prompt: a native dialog blocks the whole page
  // and hangs any automated walkthrough of the speaker profile.
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const normalizedValue = normalizeRichTextContent(value);
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
      }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        defaultProtocol: "https",
      }),
    ],
    content: normalizedValue,
    editorProps: {
      attributes: {
        class: "tiptap",
      },
    },
    onUpdate: ({ editor: current }) => onChange(current.getHTML()),
    editable: !disabled,
    immediatelyRender: false,
  });

  useEffect(() => {
    if (!editor) return;
    if (editor.getHTML() === normalizedValue) return;
    editor.commands.setContent(normalizedValue, { emitUpdate: false });
  }, [editor, normalizedValue]);

  if (!editor) return null;

  const applyLink = () => {
    const href = linkUrl.trim();
    if (href) editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
    else editor.chain().focus().extendMarkRange("link").unsetLink().run();
    setLinkOpen(false);
  };

  return (
    <div className="min-w-0 space-y-2 overflow-hidden">
      <div className="flex min-w-0 flex-wrap gap-1 rounded bg-muted/50 p-2">
        <ToolbarButton onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive("bold")} icon={<Bold className="w-4 h-4" />} title="Bold" />
        <ToolbarButton onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive("italic")} icon={<Italic className="w-4 h-4" />} title="Italic" />
        <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive("heading", { level: 2 })} icon={<Heading2 className="w-4 h-4" />} title="Heading" />
        <ToolbarButton onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive("bulletList")} icon={<List className="w-4 h-4" />} title="Bullet List" />
        <ToolbarButton onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive("orderedList")} icon={<ListOrdered className="w-4 h-4" />} title="Ordered List" />
        <ToolbarButton onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive("blockquote")} icon={<Quote className="w-4 h-4" />} title="Quote" />
        <ToolbarButton
          onClick={() => {
            setLinkUrl(editor.getAttributes("link").href ?? "");
            setLinkOpen(open => !open);
          }}
          active={editor.isActive("link")}
          icon={<Link2 className="w-4 h-4" />}
          title="Link"
        />
        <ToolbarButton onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} icon={<Undo2 className="w-4 h-4" />} title="Undo" />
        <ToolbarButton onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} icon={<Redo2 className="w-4 h-4" />} title="Redo" />
      </div>
      {linkOpen && (
        <div className="flex flex-wrap items-center gap-2 rounded bg-muted/50 p-2">
          <label className="sr-only" htmlFor="rich-text-link-url">Link URL</label>
          <Input
            id="rich-text-link-url"
            type="url"
            placeholder="https://"
            value={linkUrl}
            onChange={event => setLinkUrl(event.target.value)}
            onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); applyLink(); } if (event.key === "Escape") setLinkOpen(false); }}
            className="h-8 min-w-0 flex-1 sm:w-64 sm:flex-none"
          />
          <Button type="button" variant="accent" size="sm" onClick={applyLink}>Apply</Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setLinkOpen(false)}>Cancel</Button>
        </div>
      )}
      <EditorContent editor={editor} placeholder={placeholder} />
    </div>
  );
}

function ToolbarButton({
  onClick,
  icon,
  title,
  active = false,
  disabled = false,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`h-8 w-8 rounded inline-flex items-center justify-center ${
        active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
      } ${disabled ? "opacity-40 cursor-not-allowed" : ""}`}
    >
      {icon}
    </button>
  );
}
