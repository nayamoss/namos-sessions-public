import { describe, expect, it } from "vitest";
import { EMBED_RESIZE_SOURCE, iframeHeight, iframeSnippet } from "@/lib/public-embed";
import type { EmbedId } from "@/data/types";

describe("public embed responsive iframe height", () => {
  const id = "k57j59xq5q6yyx123" as EmbedId;

  it("keeps the static per-view height as the fallback attribute", () => {
    const snippet = iframeSnippet("https://app.example", id, "speaker_gallery");
    expect(snippet).toContain(`height="${iframeHeight("speaker_gallery")}"`);
  });

  it("ships an inline resize listener scoped to this embed's own id and origin", () => {
    const snippet = iframeSnippet("https://app.example", id, "agenda");
    expect(snippet).toContain("<script>");
    expect(snippet).toContain(JSON.stringify(id));
    expect(snippet).toContain(JSON.stringify(EMBED_RESIZE_SOURCE));
    expect(snippet).toContain("event.origin");
    expect(snippet).toContain("f.style.height");
  });

  it("gives every embed a unique iframe element id so two on one host page don't cross-resize", () => {
    const other = "other-embed-id" as EmbedId;
    const a = iframeSnippet("https://app.example", id, "agenda");
    const b = iframeSnippet("https://app.example", other, "agenda");
    expect(a).toContain(`id="namos-embed-${id}"`);
    expect(b).toContain(`id="namos-embed-${other}"`);
    expect(a).not.toContain(`namos-embed-${other}`);
  });

  it("escapes the embed id in the element id attribute", () => {
    const unsafe = '"><script>alert(1)</script>' as EmbedId;
    const snippet = iframeSnippet("https://app.example", unsafe, "agenda");
    expect(snippet).not.toContain('id="namos-embed-"><script>alert(1)</script>"');
  });

  it("cannot break out of the inline <script> block via a hostile embed id", () => {
    // JSON.stringify alone does not escape "<"/">"/"&", so a naive
    // `${JSON.stringify(embedId)}` interpolation would let an id containing
    // "</script>" close the tag early and inject arbitrary markup after it.
    const hostile = '</script><img src=x onerror=alert(1)>' as EmbedId;
    const snippet = iframeSnippet("https://app.example", hostile, "agenda");
    // Exactly one </script> may appear anywhere in the output: the real closing
    // tag at the very end. A hostile id that could inject its own would produce
    // a second, earlier one.
    expect(snippet.match(/<\/script>/g)).toHaveLength(1);
    expect(snippet.endsWith("</script>")).toBe(true);
    expect(snippet).not.toContain("<img src=x onerror=alert(1)>");
    // The id survives, just safely encoded for a JS string in a script context.
    expect(snippet).toContain("\\u003C/script\\u003E");
  });
});
