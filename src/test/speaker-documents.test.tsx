import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { RepoContext, type Repository } from "@/data/repo";
import type { Event, EventId, Speaker, SpeakerId, Submission, SubmissionId } from "@/data/types";
import { PortalIdentityProvider } from "@/pages/portal/PortalIdentity";
import { SpeakerDocuments } from "@/pages/portal/SpeakerDocuments";

const event: Event = { id: "event-1" as EventId, name: "Test Conf", slug: "test-conf", timezone: "UTC", startDate: 0, endDate: 0, exhibitorsEnabled: false, sponsorsEnabled: false, status: "published" };
const speaker: Speaker = { id: "speaker-1" as SpeakerId, eventId: event.id, name: "Ada Lovelace", confirmationStatus: "awaiting" };
const submission: Submission = { id: "submission-1" as SubmissionId, eventId: event.id, formId: "form-1" as never, speakerIds: [speaker.id], tagIds: [], title: "A real proposal", status: "pending", answers: {}, updatedAt: 1 };

describe("speaker documents", () => {
  it("loads the signed-in speaker's submissions through the speaker-scoped query", async () => {
    const list = vi.fn().mockResolvedValue([submission]);
    const repository = {
      events: {
        listForPortal: async () => [event],
        portalSpeakerIdentity: async () => ({ event, speaker, publishedEvents: [event] }),
      },
      speakers: { getMine: async () => speaker, listDocuments: async () => [] },
      submissions: { list },
    } as unknown as Repository;
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<RepoContext.Provider value={repository}><PortalIdentityProvider><SpeakerDocuments /></PortalIdentityProvider></RepoContext.Provider>);
    });
    await act(async () => { await Promise.resolve(); });

    expect(list).toHaveBeenCalledWith({ eventId: event.id, speakerId: speaker.id });
    expect(container.textContent).toContain("Upload slides");
    expect(container.textContent).toContain("Upload document");

    act(() => root.unmount());
    container.remove();
  });
});
