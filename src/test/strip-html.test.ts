import { describe, expect, it } from "vitest";
import { stripHtmlTags } from "@/lib/strip-html";

describe("stripHtmlTags", () => {
  it("removes ordinary tags", () => {
    expect(stripHtmlTags("<p>Hello <b>world</b></p>")).toBe("Hello world");
  });

  it("does not re-form markup that a single pass would leave behind", () => {
    // One pass turns this into "<script" — the bug CodeQL flagged.
    expect(stripHtmlTags("<scr<script>ipt>alert(1)")).not.toContain("<script");
    // A single pass would yield "<script" here; looping leaves inert text.
    // (The single-pass form is deliberately not written out — CodeQL flags it.)
    expect(stripHtmlTags("<scr<script>ipt>alert(1)")).toBe("ipt>alert(1)");
  });

  it("leaves plain text untouched", () => {
    expect(stripHtmlTags("no tags here")).toBe("no tags here");
  });
});
