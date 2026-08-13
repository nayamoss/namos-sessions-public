import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AgendaSessionForm } from "@/pages/program/AgendaSessionForm";
import type { Event, EventId, Room, Speaker, SpeakerId, Submission, SubmissionId, Track } from "@/data/types";

const event = { id: "event-1" as EventId, name: "Namos Summit", slug: "namos", timezone: "America/New_York", startDate: Date.UTC(2026, 8, 15), endDate: Date.UTC(2026, 8, 17), exhibitorsEnabled: false, sponsorsEnabled: false, status: "draft" } satisfies Event;
const rooms = [{ id: "room-1", eventId: event.id, name: "Main Hall", sortOrder: 0 }] satisfies Room[];
const tracks = [{ id: "track-1", eventId: event.id, name: "Engineering", sortOrder: 0 }] satisfies Track[];
const speakers = [{ id: "speaker-1" as SpeakerId, eventId: event.id, name: "Ada Lovelace", confirmationStatus: "confirmed" }] satisfies Speaker[];
const submissions = [{ id: "submission-1" as SubmissionId, eventId: event.id, formId: "form-1" as never, speakerIds: [speakers[0].id], tagIds: [], trackId: tracks[0].id, status: "accepted", title: "Reliable systems" }] satisfies Submission[];

describe("AgendaSessionForm", () => {
  it("prefills accepted submission data and submits a timezone-safe agenda record", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<AgendaSessionForm event={event} rooms={rooms} tracks={tracks} speakers={speakers} submissions={submissions} onSave={onSave} onCancel={() => undefined} />);
    fireEvent.click(screen.getByRole("button", { name: "From submission" }));
    fireEvent.keyDown(screen.getByRole("combobox", { name: "Accepted submission" }), { key: "ArrowDown" });
    fireEvent.click(await screen.findByRole("option", { name: "Reliable systems" }));
    expect(screen.getByLabelText("Title")).toHaveValue("Reliable systems");
    expect(screen.getByLabelText("Title")).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Save session" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect(onSave.mock.calls[0][0]).toMatchObject({ title: "Reliable systems", roomId: "room-1", trackId: "track-1", submissionId: "submission-1", speakerIds: ["speaker-1"], isPublished: false });
  });

  it("keeps invalid standalone data in the pane and explains the time error", async () => {
    const onSave = vi.fn();
    render(<AgendaSessionForm event={event} rooms={rooms} tracks={tracks} speakers={speakers} submissions={submissions} onSave={onSave} onCancel={() => undefined} />);
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Office hours" } });
    fireEvent.change(screen.getByLabelText("Start"), { target: { value: "11:00" } });
    fireEvent.change(screen.getByLabelText("End"), { target: { value: "10:00" } });
    fireEvent.click(screen.getByRole("button", { name: "Save session" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("End time must be after start time");
    expect(screen.getByLabelText("Title")).toHaveValue("Office hours");
    expect(onSave).not.toHaveBeenCalled();
  });
});
