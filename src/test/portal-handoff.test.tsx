import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { ClerkProvider } from "@clerk/clerk-react";
import { RepoContext, type Repository } from "@/data/repo";
import type { Event, EventId, Speaker, SpeakerId } from "@/data/types";
import { consumePortalHandoffSpeaker, storePortalHandoffSpeaker } from "@/lib/portal-handoff";
import { PortalIdentityProvider, usePortalIdentity } from "@/pages/portal/PortalIdentity";
import { TEST_CLERK_PUBLISHABLE_KEY } from "./clerk-test-key";

const event: Event = { id: "event-1" as EventId, name: "Test Conf", slug: "test-conf", timezone: "UTC", startDate: 0, endDate: 0, exhibitorsEnabled: false, sponsorsEnabled: false, status: "published" };
const speakers: Speaker[] = [
  { id: "speaker-1" as SpeakerId, eventId: event.id, name: "Ada Lovelace", confirmationStatus: "awaiting" },
  { id: "speaker-2" as SpeakerId, eventId: event.id, name: "Grace Hopper", confirmationStatus: "confirmed" },
];

// Only the portal event/identity calls are real; the rest of the repository is never
// reached on this path. This signed-out fixture models an organizer demo fallback, so
// getMine returns null and the explicit speaker list remains available.
function stubRepo(ownSpeaker: Speaker | null = null): Repository {
  return {
    events: { listForPortal: async () => [event] },
    speakers: { getMine: async () => ownSpeaker, list: async () => speakers },
  } as unknown as Repository;
}

/** Renders the provider and returns the speaker it settled on. */
async function selectedSpeakerAfterLoad(ownSpeaker: Speaker | null = null): Promise<{ selectedSpeakerId?: string; handoffMismatch: boolean }> {
  let selected: string | undefined;
  let mismatch = false;
  function Probe() {
    const { selectedSpeaker, loading, handoffMismatch } = usePortalIdentity();
    if (!loading) { selected = selectedSpeaker?.id; mismatch = handoffMismatch; }
    return null;
  }
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <ClerkProvider publishableKey={TEST_CLERK_PUBLISHABLE_KEY}>
        <RepoContext.Provider value={stubRepo(ownSpeaker)}><PortalIdentityProvider><Probe /></PortalIdentityProvider></RepoContext.Provider>
      </ClerkProvider>,
    );
  });
  await act(async () => { await Promise.resolve(); });
  act(() => root.unmount());
  container.remove();
  return { selectedSpeakerId: selected, handoffMismatch: mismatch };
}

afterEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
});

describe("portal handoff storage", () => {
  it("returns the stored speaker exactly once", () => {
    storePortalHandoffSpeaker("speaker-1");
    expect(consumePortalHandoffSpeaker()).toBe("speaker-1");
    expect(consumePortalHandoffSpeaker()).toBeUndefined();
  });

  it("reports no handoff rather than an empty string when nothing was stored", () => {
    expect(consumePortalHandoffSpeaker()).toBeUndefined();
    storePortalHandoffSpeaker("");
    expect(consumePortalHandoffSpeaker()).toBeUndefined();
  });
});

describe("portal identity handoff", () => {
  it("selects the speaker handed over from a submission", async () => {
    storePortalHandoffSpeaker("speaker-2");
    await expect(selectedSpeakerAfterLoad()).resolves.toEqual({ selectedSpeakerId: "speaker-2", handoffMismatch: false });
  });

  it("promotes the handoff to the stored selection so a reload keeps it", async () => {
    storePortalHandoffSpeaker("speaker-2");
    await selectedSpeakerAfterLoad();
    expect(window.localStorage.getItem(`sessionboard:portal-speaker:${event.id}`)).toBe("speaker-2");
    // The handoff is consumed, so the second load is carried by storage alone.
    expect(window.sessionStorage.length).toBe(0);
    await expect(selectedSpeakerAfterLoad()).resolves.toEqual({ selectedSpeakerId: "speaker-2", handoffMismatch: false });
  });

  it("falls back to the dropdown when the handoff is not a speaker at this event", async () => {
    storePortalHandoffSpeaker("speaker-from-another-event");
    await expect(selectedSpeakerAfterLoad()).resolves.toEqual({ selectedSpeakerId: undefined, handoffMismatch: false });
    expect(window.localStorage.getItem(`sessionboard:portal-speaker:${event.id}`)).toBeNull();
  });

  it("leaves an existing selection alone when there is no handoff", async () => {
    window.localStorage.setItem(`sessionboard:portal-speaker:${event.id}`, "speaker-1");
    await expect(selectedSpeakerAfterLoad()).resolves.toEqual({ selectedSpeakerId: "speaker-1", handoffMismatch: false });
  });

  it("keeps a verified Clerk speaker authoritative and exposes a conflicting CFP handoff", async () => {
    storePortalHandoffSpeaker("speaker-2");
    await expect(selectedSpeakerAfterLoad(speakers[0])).resolves.toEqual({ selectedSpeakerId: "speaker-1", handoffMismatch: true });
  });
});
