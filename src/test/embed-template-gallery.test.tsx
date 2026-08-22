import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  EMBED_TEMPLATES,
  EmbedTemplateGallery,
} from "@/components/embeds/EmbedTemplateGallery";

describe("embed template gallery", () => {
  it("shows all six embed layouts and the blank option", () => {
    render(
      <EmbedTemplateGallery
        onSelect={vi.fn()}
        onBlank={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(EMBED_TEMPLATES).toHaveLength(6);
    for (const template of EMBED_TEMPLATES) {
      expect(
        screen.getByRole("button", {
          name: `Use ${template.name} template`,
        }),
      ).toBeInTheDocument();
    }
    expect(screen.getByRole("button", { name: /start from blank/i })).toBeInTheDocument();
  });

  it("returns the selected template", () => {
    const onSelect = vi.fn();
    render(
      <EmbedTemplateGallery
        onSelect={onSelect}
        onBlank={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /speaker gallery/i }));
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ view: "speaker_gallery", name: "Speaker gallery" }),
    );
  });
});
