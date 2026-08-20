import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ClerkProvider } from "@clerk/clerk-react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SubmissionFormBuilder from "@/pages/program/SubmissionFormBuilder";
import { RepoContext } from "@/data/repo";
import { createRepository, type DataTransport } from "@/data/transport";
import type { EventId } from "@/data/types";
import { TEST_CLERK_PUBLISHABLE_KEY } from "./clerk-test-key";

const eventId = "event-a" as EventId;
const formId = "form-a";
const titleFieldId = "field-title";
const abstractFieldId = "field-abstract";

const event = {
  id: eventId,
  name: "Wizard QA Summit",
  slug: "wizard-qa-summit",
  timezone: "America/New_York",
  startDate: 1_760_000_000_000,
  endDate: 1_760_200_000_000,
  exhibitorsEnabled: false,
  sponsorsEnabled: false,
  status: "published",
};

function storedForm(status: "draft" | "open" | "closed") {
  return {
    id: formId,
    eventId,
    name: "Standard Abstract CFP",
    internalName: "Standard Abstract CFP",
    externalTitle: "Submit your proposal",
    pageHeading: "Proposal",
    version: 1,
    kind: "abstract" as const,
    collectParticipants: false,
    isOpen: status === "open",
    status,
    welcomeMessage: "<p>We read every proposal blind.</p>",
    showWelcomeMessage: true,
    sections: [
      {
        id: "abstract",
        key: "abstract" as const,
        title: "Proposal",
        pageHeading: "Proposal",
        description: "<p>Tell us what your session covers.</p>",
        fieldIds: [titleFieldId, abstractFieldId],
      },
      { id: "participants", key: "participant" as const, title: "Participant", pageHeading: "Participant", fieldIds: [] },
    ],
    participantRoles: [],
    allowMultipleDrafts: true,
    autoRedirectToPortal: true,
    sendSubmitterConfirmation: true,
    crossFieldLimits: [],
    routingRules: [],
  };
}

const fields = [
  { id: titleFieldId, formId, label: "Title", type: "text", required: true, locked: true },
  { id: abstractFieldId, formId, label: "Abstract", type: "wysiwyg", required: true },
];

function renderBuilder(
  status: "draft" | "open" | "closed",
  write = vi.fn(),
  storedFileUrl?: string,
) {
  const transport: DataTransport = {
    read: vi.fn(async (operation) => {
      if (operation === "events.list") return [event];
      if (operation === "forms.list") return [storedForm(status)];
      if (operation === "forms.fields") return fields;
      if (operation === "files.getUrl") return storedFileUrl ?? null;
      return [];
    }) as DataTransport["read"],
    write: write as DataTransport["write"],
  };
  render(
    <ClerkProvider publishableKey={TEST_CLERK_PUBLISHABLE_KEY}>
      <MemoryRouter initialEntries={[`/program/forms/${formId}/edit`]}>
        <RepoContext.Provider value={createRepository(transport)}>
          <Routes>
            <Route path="/program/forms/:id/edit" element={<SubmissionFormBuilder />} />
          </Routes>
        </RepoContext.Provider>
      </MemoryRouter>
    </ClerkProvider>,
  );
  return { write };
}

// The toolbar renders before the form finishes loading, and the builder's first load pass
// bails while the event is still resolving. Gate on something only the loaded form can
// produce, so a click can't land on the pre-load default state.
async function loaded() {
  return within(await screen.findByRole("region", { name: "Call for proposals preview" }))
    .findByText("Wizard QA Summit")
    .then(() => screen.getByRole("region", { name: "Call for proposals preview" }));
}

describe("CFP form builder", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("opens a draft call for proposals through the dedicated status mutation", async () => {
    const write = vi.fn().mockResolvedValue("open");
    renderBuilder("draft", write);

    await loaded();
    expect(screen.getByText("Draft — not accepting submissions")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Open submissions" }));

    // Status must travel on its own operation. Routing it through forms.save would let an
    // unrelated field edit carry a stale status snapshot and silently revert a concurrent
    // open/close — the reason convex/forms.ts strips status from save.
    await waitFor(() => expect(write).toHaveBeenCalledWith("forms.setStatus", { id: formId, eventId, status: "open" }));
    expect(await screen.findByText("Open — accepting submissions")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close submissions" })).toBeInTheDocument();
  });

  it("closes an open call for proposals", async () => {
    const write = vi.fn().mockResolvedValue("closed");
    renderBuilder("open", write);

    await loaded();
    fireEvent.click(screen.getByRole("button", { name: "Close submissions" }));

    await waitFor(() => expect(write).toHaveBeenCalledWith("forms.setStatus", { id: formId, eventId, status: "closed" }));
    expect(await screen.findByText("Closed — not accepting submissions")).toBeInTheDocument();
  });

  it("surfaces a rejected status change instead of showing the form as open", async () => {
    const write = vi.fn().mockRejectedValue(new Error("Publish the event before opening its call for proposals."));
    renderBuilder("draft", write);

    await loaded();
    fireEvent.click(screen.getByRole("button", { name: "Open submissions" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Publish the event before opening its call for proposals.");
    expect(screen.getByText("Draft — not accepting submissions")).toBeInTheDocument();
  });

  it("renders the submitter's view live from unsaved edits", async () => {
    renderBuilder("draft");

    // Saved state first: the preview reads the builder's draft, not the public endpoint.
    const preview = await loaded();
    expect(within(preview).getByRole("heading", { name: "Submit your proposal" })).toBeInTheDocument();

    // The title lives on the welcome step, which also swings the preview to that screen.
    fireEvent.click(screen.getByRole("button", { name: /Welcome screen/ }));

    // Rich text is rendered as HTML, not printed to submitters as literal <p> tags.
    expect(await within(preview).findByText("We read every proposal blind.")).toBeInTheDocument();

    // Retitling updates the submitter's heading with no save in between.
    fireEvent.change(screen.getByLabelText("External form title"), {
      target: { value: "Speak at Wizard QA" },
    });
    await act(async () => {});
    expect(within(preview).getByRole("heading", { name: "Speak at Wizard QA" })).toBeInTheDocument();
  });

  it("follows the wizard step the organizer is editing", async () => {
    renderBuilder("draft");

    const preview = await loaded();
    fireEvent.click(screen.getByRole("button", { name: /Participant information/ }));

    await waitFor(() => expect(within(preview).getByRole("radio", { name: "Participant" })).toBeChecked());
  });

  it("edits CFP appearance with a live accent preview and reset action", async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    renderBuilder("draft", write);
    await loaded();

    fireEvent.click(screen.getByRole("button", { name: /Appearance/ }));
    expect(await screen.findByRole("heading", { name: "Appearance" })).toBeInTheDocument();
    expect(screen.getByText("Drop a logo here or click to upload")).toBeInTheDocument();

    const hexInput = screen.getByRole("textbox", { name: "Accent color hex value" });
    fireEvent.change(hexInput, { target: { value: "#FFFFFF" } });
    expect(screen.getByRole("region", { name: "Submission page appearance preview" }).getAttribute("style")).toContain("--primary-foreground: 0 0% 0%");
    fireEvent.blur(hexInput);
    await waitFor(() => expect(write).toHaveBeenCalledWith("events.save", expect.objectContaining({ id: eventId, accentColor: "#FFFFFF" })));
    expect(screen.getByRole("button", { name: "Reset to default" })).toBeInTheDocument();
  });

  it("renders an uploaded logo from its canonical storage URL", async () => {
    const canonicalLogoUrl = "https://storage.example.test/logo.png";
    const write = vi.fn(async (operation) =>
      operation === "files.generateUploadUrl"
        ? { uploadUrl: "https://uploads.example.test/logo" }
        : undefined,
    );
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ storageId: "storage-logo" }),
    } as Response);
    renderBuilder("draft", write, canonicalLogoUrl);
    await loaded();

    fireEvent.click(screen.getByRole("button", { name: /Appearance/ }));
    const uploadInput = document.querySelector<HTMLInputElement>("#cfp-logo-upload");
    expect(uploadInput).not.toBeNull();
    fireEvent.change(uploadInput!, {
      target: {
        files: [new File(["logo"], "logo.png", { type: "image/png" })],
      },
    });

    await waitFor(() =>
      expect(screen.getByRole("img", { name: "Wizard QA Summit logo" })).toHaveAttribute(
        "src",
        canonicalLogoUrl,
      ),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "https://uploads.example.test/logo",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
