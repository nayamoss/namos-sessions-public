import { act } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RepoContext, type Repository } from "@/data/repo";
import type { EventAnalyticsSummary, EventId } from "@/data/types";

vi.mock("@/components/AppLayout", () => ({ AppLayout: ({ title, children }: { title: string; children: ReactNode }) => <main><h1>{title}</h1>{children}</main> }));
vi.mock("@/components/EventContext", () => ({ useCurrentEvent: () => ({ event: { id: "event-1" as EventId, slug: "demo-event" } }) }));

import EventAnalytics from "@/pages/dashboard/EventAnalytics";

const summary: EventAnalyticsSummary = {
  version: 1, generatedAt: Date.UTC(2026, 7, 16, 12),
  submissions: { total: 10, draft: 1, pending: 2, inReview: 2, accepted: 4, declined: 1, withdrawn: 0, acceptanceRate: 80 },
  reviews: { assigned: 8, completed: 6, completionRate: 75 },
  speakers: { total: 5, awaiting: 2, confirmed: 3, declined: 0, profileComplete: 2 },
  agenda: { total: 4, published: 3, acceptedSessions: 4, scheduledAccepted: 3, scheduleRate: 75 },
  communications: { total: 5, queued: 1, sent: 3, failed: 1 },
  tasks: { total: 6, pending: 2, inProgress: 1, completed: 3, overdue: 1, completionRate: 50 },
  history: { available: false, daily: [] },
};

describe("organizer analytics page", () => {
  beforeEach(() => document.body.replaceChildren());

  it("renders operational funnels with links to the owning workflows", async () => {
    const container = document.createElement("div"); document.body.append(container); const root = createRoot(container);
    const repo = { analytics: { summary: vi.fn().mockResolvedValue(summary) } } as unknown as Repository;
    await act(async () => root.render(<MemoryRouter><RepoContext.Provider value={repo}><EventAnalytics /></RepoContext.Provider></MemoryRouter>));
    expect(container.querySelector("h1")).toHaveTextContent("Analytics");
    expect(container).toHaveTextContent("10");
    expect(container).toHaveTextContent("Acceptance rate");
    expect(container).toHaveTextContent("Reviews complete");
    expect(container).toHaveTextContent("Speaker readiness");
    expect(container.querySelector('a[href="/events/demo-event/program/abstracts"]')).toBeInTheDocument();
    expect(container.querySelector('a[href="/events/demo-event/program/agenda"]')).toBeInTheDocument();
    expect(container).toHaveTextContent("no synthetic history is generated");
    act(() => root.unmount());
  });

  it("provides a useful empty state", async () => {
    const container = document.createElement("div"); document.body.append(container); const root = createRoot(container);
    const empty = structuredClone(summary);
    empty.submissions = { total: 0, draft: 0, pending: 0, inReview: 0, accepted: 0, declined: 0, withdrawn: 0, acceptanceRate: 0 };
    empty.speakers = { total: 0, awaiting: 0, confirmed: 0, declined: 0, profileComplete: 0 };
    empty.tasks = { total: 0, pending: 0, inProgress: 0, completed: 0, overdue: 0, completionRate: 0 };
    empty.agenda = { total: 0, published: 0, acceptedSessions: 0, scheduledAccepted: 0, scheduleRate: 0 };
    const repo = { analytics: { summary: vi.fn().mockResolvedValue(empty) } } as unknown as Repository;
    await act(async () => root.render(<MemoryRouter><RepoContext.Provider value={repo}><EventAnalytics /></RepoContext.Provider></MemoryRouter>));
    expect(container).toHaveTextContent("Your event snapshot starts here");
    expect(container).toHaveTextContent("Set up a call");
    act(() => root.unmount());
  });
});
