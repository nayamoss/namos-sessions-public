import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { ClerkProvider } from "@clerk/clerk-react";
import { RepoContext, type Repository } from "@/data/repo";
import type { Event, EventId, Speaker, SpeakerId } from "@/data/types";
import { PortalIdentityProvider, usePortalIdentity } from "@/pages/portal/PortalIdentity";
import { TEST_CLERK_PUBLISHABLE_KEY } from "./clerk-test-key";

// Reported live: "the speaker record exists, but the same signed-in email gets
// 'No speaker profile found'". Two causes, both pinned here:
//   1. The provider used listForPortal()[0] — only the FIRST event was ever asked for a
//      speaker record, so a record on any later event was invisible. Organizers see every
//      event in their org here, so [0] is effectively arbitrary.
//   2. listForPortal filters to status === "published", so a speaker whose event was still
//      in draft had that event excluded from the candidate list entirely. This is what the
//      real failure was: the speaker row lived on a draft event.
// events.portalSpeakerIdentity resolves identity server-side across every reachable event,
// independent of ordering and publication state.

const publishedFirst: Event = {
  id: "event-published" as EventId, name: "Some Other Conference", slug: "other", timezone: "UTC",
  startDate: 0, endDate: 0, exhibitorsEnabled: false, sponsorsEnabled: false, status: "published",
};

const draftWithSpeaker: Event = {
  id: "event-draft" as EventId, name: "Namos Sessions Neutral QA", slug: "neutral-qa", timezone: "UTC",
  startDate: 0, endDate: 0, exhibitorsEnabled: false, sponsorsEnabled: false, status: "draft",
};

const speakerOnDraft: Speaker = {
  id: "speaker-on-draft" as SpeakerId, eventId: draftWithSpeaker.id, name: "Naya QA", confirmationStatus: "awaiting",
};

function stubRepo(identity: { event: Event | null; speaker: Speaker | null }): Repository {
  return {
    events: {
      // Exactly what the old code consumed — note the draft event is absent entirely.
      listForPortal: async () => [publishedFirst],
      portalSpeakerIdentity: async () => ({ ...identity, publishedEvents: [publishedFirst] }),
    },
    speakers: { getMine: async () => null, list: async () => [] },
  } as unknown as Repository;
}

async function resolveIdentity(identity: { event: Event | null; speaker: Speaker | null }) {
  let eventId: string | undefined;
  let speakerId: string | undefined;
  function Probe() {
    const { eventId: id, selectedSpeaker, loading } = usePortalIdentity();
    if (!loading) { eventId = id; speakerId = selectedSpeaker?.id; }
    return null;
  }
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <ClerkProvider publishableKey={TEST_CLERK_PUBLISHABLE_KEY}>
        <RepoContext.Provider value={stubRepo(identity)}>
          <PortalIdentityProvider><Probe /></PortalIdentityProvider>
        </RepoContext.Provider>
      </ClerkProvider>,
    );
  });
  await act(async () => { await Promise.resolve(); });
  act(() => root.unmount());
  container.remove();
  return { eventId, speakerId };
}

afterEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
});

describe("portal speaker identity resolution", () => {
  it("finds a speaker whose record is on a draft event listForPortal excludes", async () => {
    const resolved = await resolveIdentity({ event: draftWithSpeaker, speaker: speakerOnDraft });
    expect(resolved.eventId).toBe(draftWithSpeaker.id);
    expect(resolved.speakerId).toBe(speakerOnDraft.id);
  });

  it("falls back to a published event when the account is a speaker nowhere", async () => {
    const resolved = await resolveIdentity({ event: null, speaker: null });
    expect(resolved.eventId).toBe(publishedFirst.id);
    expect(resolved.speakerId).toBeUndefined();
  });
});
