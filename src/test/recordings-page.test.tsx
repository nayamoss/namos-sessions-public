import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import Recordings from "@/pages/program/Recordings";
import type { AgendaItemId, EventId, RecordingId, RecordingManagerRow } from "@/data/types";

const rows: RecordingManagerRow[] = [
  {
    id: "agenda-1" as AgendaItemId, eventId: "event-1" as EventId, title: "Published provider session", roomId: "room-1", roomName: "Main Hall", trackId: "track-1", trackName: "Keynote", speakerIds: [], speakerNames: ["Ada Lovelace"], startTime: Date.UTC(2026, 8, 5, 14), endTime: Date.UTC(2026, 8, 5, 15), isPublished: true,
    recording: { id: "recording-1" as RecordingId, sourceType: "hosted", fileName: "Hosted recording", publicationStatus: "published", updatedAt: 1, provider: "youtube", availability: "ready" },
  },
  {
    id: "agenda-2" as AgendaItemId, eventId: "event-1" as EventId, title: "Missing session", roomId: "room-2", roomName: "Workshop", speakerIds: [], speakerNames: [], startTime: Date.UTC(2026, 8, 6, 14), endTime: Date.UTC(2026, 8, 6, 15), isPublished: true,
  },
];

vi.mock("@/components/EventContext", () => ({ useCurrentEvent: () => ({ event: { id: "event-1", slug: "demo-event", timezone: "America/New_York" } }) }));
vi.mock("@/components/AppLayout", () => ({ AppLayout: ({ children, detail }: { children: ReactNode; detail?: ReactNode }) => <main>{children}{detail}</main> }));
vi.mock("@/data/repo", () => ({ useRepo: () => ({ recordings: { listPage: vi.fn().mockImplementation(async (input: { status?: string; source?: string }) => ({
  page: rows.filter(row => (!input.status || input.status === "all" || (input.status === "published" && row.recording?.publicationStatus === "published")) && (!input.source || input.source === "all" || row.recording?.sourceType === input.source)),
  isDone: true,
  continueCursor: "",
})), list: vi.fn(), get: vi.fn(), listAssets: vi.fn(), requestUpload: vi.fn(), attachHosted: vi.fn(), attachUpload: vi.fn(), attachAsset: vi.fn(), publish: vi.fn(), unpublish: vi.fn(), detach: vi.fn(), retry: vi.fn(), bulkPublish: vi.fn(), bulkUnpublish: vi.fn(), migrateLegacy: vi.fn() } }) }));

describe("Recordings manager page", () => {
  it("restores URL filters and keeps manager controls out of the page title", async () => {
    const { container } = render(<MemoryRouter initialEntries={["/events/demo-event/program/recordings?filter=published&source=hosted"]}><Recordings /></MemoryRouter>);
    await waitFor(() => expect(screen.getAllByText("Published provider session").length).toBeGreaterThan(0));
    expect(screen.queryByText("Missing session")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Filters, 2 active" })).toBeVisible();
    expect(screen.getByRole("button", { name: /Published$/ })).toBeVisible();
    expect(container.querySelectorAll("select")).toHaveLength(0);
    expect(screen.getByRole("region", { name: "Recording controls" })).toBeVisible();
  });
});
