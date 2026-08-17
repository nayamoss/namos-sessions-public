import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { RepoContext, type Repository } from "@/data/repo";
import type { CommPreview, Event, EventId, SpeakerId, TaskId } from "@/data/types";
import type { SpeakerOperationsRow } from "@/lib/speaker-operations";
import { AddSpeakerPane, SpeakerDetail } from "@/pages/program/Speakers";

const eventId = "event-a" as EventId;
const speakerId = "speaker-a" as SpeakerId;
const event = { id: eventId, name: "Namos Sessions", timezone: "America/New_York" } as Event;
const row: SpeakerOperationsRow = {
  id: speakerId,
  name: "Ada Lovelace",
  email: "ada@example.test",
  speaker: { id: speakerId, eventId, name: "Ada Lovelace", email: "ada@example.test", confirmationStatus: "awaiting" },
  confirmationStatus: "awaiting",
  profileState: "bio_and_headshot_missing",
  submissions: [{ id: "submission-a", title: "Reliable workflows" }],
  tasks: [],
  openTaskCount: 0,
  overdueTaskCount: 0,
};

beforeAll(() => {
  Object.defineProperties(HTMLElement.prototype, {
    hasPointerCapture: { configurable: true, value: () => false },
    setPointerCapture: { configurable: true, value: () => undefined },
    releasePointerCapture: { configurable: true, value: () => undefined },
    scrollIntoView: { configurable: true, value: () => undefined },
  });
});

function renderDetail(overrides: { saveConfirmation?: Repository["speakers"]["setConfirmationStatus"]; createTask?: Repository["tasks"]["create"]; comms?: Partial<Repository["comms"]> } = {}) {
  const saveConfirmation = overrides.saveConfirmation ?? vi.fn().mockResolvedValue(undefined);
  const createTask = overrides.createTask ?? vi.fn().mockResolvedValue("task-created" as TaskId);
  const repo = {
    speakers: { setConfirmationStatus: saveConfirmation },
    speakerNotes: { list: vi.fn().mockResolvedValue([]), create: vi.fn().mockResolvedValue("note-created"), remove: vi.fn().mockResolvedValue(undefined) },
    tasks: { create: createTask, setStatus: vi.fn().mockResolvedValue(undefined) },
    comms: overrides.comms ?? {},
  } as unknown as Repository;
  const callbacks = {
    onClose: vi.fn(),
    onConfirmationSaved: vi.fn(),
    onTaskCreated: vi.fn(),
    onTaskStatusChanged: vi.fn(),
  };
  render(
    <MemoryRouter>
      <RepoContext.Provider value={repo}>
        <SpeakerDetail row={row} event={event} {...callbacks} />
      </RepoContext.Provider>
    </MemoryRouter>,
  );
  return { saveConfirmation, createTask, ...callbacks };
}

async function chooseConfirmation(label: "Confirmed" | "Declined") {
  fireEvent.pointerDown(screen.getByRole("combobox", { name: "Confirmation status" }), { button: 0, ctrlKey: false, pointerType: "mouse" });
  fireEvent.click(await screen.findByRole("option", { name: label }));
}

describe("SpeakerDetail", () => {
  it("saves a note with the keyboard shortcut and exposes it in the activity feed", async () => {
    const create = vi.fn().mockResolvedValue("note-created");
    render(
      <MemoryRouter>
        <RepoContext.Provider value={{ speakers: { setConfirmationStatus: vi.fn() }, speakerNotes: { list: vi.fn().mockResolvedValue([]), create, remove: vi.fn() }, tasks: { create: vi.fn(), setStatus: vi.fn() }, comms: {} } as unknown as Repository}>
          <SpeakerDetail row={row} event={event} onClose={vi.fn()} onConfirmationSaved={vi.fn()} onTaskCreated={vi.fn()} onTaskStatusChanged={vi.fn()} />
        </RepoContext.Provider>
      </MemoryRouter>,
    );
    const note = await screen.findByRole("textbox", { name: "New note" });
    fireEvent.change(note, { target: { value: "Confirmed travel details." } });
    fireEvent.keyDown(note, { key: "Enter", metaKey: true });
    await waitFor(() => expect(create).toHaveBeenCalledWith({ eventId, speakerId, body: "Confirmed travel details." }));
    expect((await screen.findAllByText("Confirmed travel details.")).length).toBe(2);
    expect(await screen.findByText("Added note")).toBeInTheDocument();
  });

  it("persists explicit confirmation and keeps success feedback available", async () => {
    const harness = renderDetail();
    await chooseConfirmation("Confirmed");
    fireEvent.click(screen.getByRole("button", { name: "Save confirmation" }));

    await waitFor(() => expect(harness.saveConfirmation).toHaveBeenCalledWith({ eventId, speakerId, status: "confirmed" }));
    expect(harness.onConfirmationSaved).toHaveBeenCalledWith("confirmed");
    expect(await screen.findByRole("status")).toHaveTextContent("Confirmation status saved.");
  });

  it("keeps the pane open and announces a confirmation failure", async () => {
    renderDetail({ saveConfirmation: vi.fn().mockRejectedValue(new Error("Confirmation unavailable")) });
    await chooseConfirmation("Declined");
    fireEvent.click(screen.getByRole("button", { name: "Save confirmation" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Confirmation unavailable");
    expect(screen.getByRole("heading", { name: "Ada Lovelace" })).toBeInTheDocument();
  });

  it("validates, creates, and reports task failures locally", async () => {
    const createTask = vi.fn().mockRejectedValueOnce(new Error("Task service unavailable")).mockResolvedValueOnce("task-created" as TaskId);
    const harness = renderDetail({ createTask });
    fireEvent.click(screen.getByRole("button", { name: "Add task" }));
    fireEvent.click(screen.getByRole("button", { name: "Create task" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Enter a task title.");

    fireEvent.change(screen.getByRole("textbox", { name: "Task title" }), { target: { value: "Upload final slides" } });
    fireEvent.click(screen.getByRole("button", { name: "Create task" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Task service unavailable");

    fireEvent.click(screen.getByRole("button", { name: "Create task" }));
    await waitFor(() => expect(harness.onTaskCreated).toHaveBeenCalledWith(expect.objectContaining({ id: "task-created", speakerId, title: "Upload final slides", status: "pending" })));
    expect(await screen.findByRole("status")).toHaveTextContent("Onboarding task created.");
  });

  it("previews the resolved reminder and calendar attachment before confirming delivery", async () => {
    const preview: CommPreview = { kind: "reminder", templateName: "Speaker task reminder", subject: "Slides are due", body: "Please upload your slides.", recipients: [{ speakerId, name: "Ada Lovelace", email: "ada@example.test" }], calendarAttached: true, scheduleTime: "October 12 at 1:00 PM" };
    const previewReminder = vi.fn().mockResolvedValue(preview);
    const sendReminder = vi.fn().mockResolvedValue({ status: "sent", requested: 1, sent: 1, failed: 0, skipped: 0, results: [{ speakerId, toEmail: "ada@example.test", status: "sent" }] });
    renderDetail({ comms: { previewReminder, sendReminder } });

    fireEvent.click(screen.getByRole("button", { name: "Send reminder" }));
    expect(await screen.findByText("Slides are due")).toBeInTheDocument();
    expect(screen.getByText(/Calendar invite attached/)).toHaveTextContent("October 12 at 1:00 PM");
    expect(sendReminder).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Confirm send" }));
    await waitFor(() => expect(sendReminder).toHaveBeenCalledWith({ eventId, speakerId }));
    expect(await screen.findByRole("status")).toHaveTextContent("Reminder sent to 1 recipient.");
  });

  it("keeps a failed reminder visible and actionable", async () => {
    const previewReminder = vi.fn().mockResolvedValue({ kind: "reminder", subject: "Reminder", body: "Action needed", recipients: [{ speakerId, name: "Ada Lovelace", email: "ada@example.test" }], calendarAttached: false });
    const sendReminder = vi.fn().mockResolvedValue({ status: "failed", requested: 1, sent: 0, failed: 1, skipped: 0, results: [{ speakerId, toEmail: "ada@example.test", status: "failed", error: "Provider unavailable" }] });
    renderDetail({ comms: { previewReminder, sendReminder } });
    fireEvent.click(screen.getByRole("button", { name: "Send reminder" }));
    await screen.findByText("Reminder");
    fireEvent.click(screen.getByRole("button", { name: "Confirm send" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Provider unavailable");
    expect(screen.getByText("Reminder")).toBeInTheDocument();
  });
});

describe("AddSpeakerPane", () => {
  it("validates and persists a manually added speaker", async () => {
    const create = vi.fn().mockResolvedValue("speaker-created" as SpeakerId);
    const onCreated = vi.fn();
    render(
      <MemoryRouter>
        <RepoContext.Provider value={{ speakers: { create } } as unknown as Repository}>
          <AddSpeakerPane event={event} onClose={vi.fn()} onCreated={onCreated} />
        </RepoContext.Provider>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add speaker" }));
    expect(screen.getByRole("alert")).toHaveTextContent("first and last name");

    fireEvent.change(screen.getByLabelText("First name"), { target: { value: " Ada " } });
    fireEvent.change(screen.getByLabelText("Last name"), { target: { value: " Lovelace " } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: " ADA@EXAMPLE.TEST " } });
    fireEvent.click(screen.getByRole("button", { name: "Add speaker" }));

    await waitFor(() => expect(create).toHaveBeenCalledWith({ eventId, firstName: "Ada", lastName: "Lovelace", email: "ada@example.test", confirmationStatus: "awaiting" }));
    expect(onCreated).toHaveBeenCalledWith(expect.objectContaining({ id: "speaker-created", firstName: "Ada", lastName: "Lovelace", email: "ada@example.test" }));
  });

  it("keeps the form open when creation fails", async () => {
    const create = vi.fn().mockRejectedValue(new Error("A speaker with this email already exists for this event."));
    render(
      <MemoryRouter>
        <RepoContext.Provider value={{ speakers: { create } } as unknown as Repository}>
          <AddSpeakerPane event={event} onClose={vi.fn()} onCreated={vi.fn()} />
        </RepoContext.Provider>
      </MemoryRouter>,
    );
    fireEvent.change(screen.getByLabelText("First name"), { target: { value: "Ada" } });
    fireEvent.change(screen.getByLabelText("Last name"), { target: { value: "Lovelace" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "ada@example.test" } });
    fireEvent.click(screen.getByRole("button", { name: "Add speaker" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("already exists");
    expect(screen.getByRole("heading", { name: "Add speaker" })).toBeInTheDocument();
  });
});
