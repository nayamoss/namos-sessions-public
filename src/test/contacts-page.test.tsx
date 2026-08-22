import { act } from "react";
import { readFileSync } from "node:fs";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RepoContext, type Repository } from "@/data/repo";
import type { EventId } from "@/data/types";

vi.mock("@/components/AppLayout", () => ({ AppLayout: ({ title, children, detail }: { title: string; children: ReactNode; detail?: ReactNode }) => <main><header><h1>{title}</h1></header><div data-testid="page-body">{children}</div>{detail}</main> }));
vi.mock("@/components/EventContext", () => ({ useCurrentEvent: () => ({ event: { id: "event-1" as EventId, slug: "demo-event" } }) }));

import Contacts from "@/pages/program/Contacts";

describe("Contacts directory", () => {
  beforeEach(() => document.body.replaceChildren());

  it("keeps the title identity-only and provides controls in the toolbar", async () => {
    const container = document.createElement("div"); document.body.append(container); const root = createRoot(container);
    const repo = {
      crm: {
        list: vi.fn().mockResolvedValue([{ id: "contact-1", firstName: "Ada", lastName: "Lovelace", email: "ada@example.test", stage: "qualified", score: 80 }]),
        listSegments: vi.fn().mockResolvedValue([{ id: "segment-1", name: "Qualified", stage: "qualified" }]),
      },
      submissions: { list: vi.fn().mockResolvedValue([]) },
    } as unknown as Repository;
    await act(async () => root.render(<MemoryRouter><RepoContext.Provider value={repo}><Contacts /></RepoContext.Provider></MemoryRouter>));
    await act(async () => undefined);
    expect(container.querySelector("h1")).toHaveTextContent("Contacts");
    expect(container.querySelector("h1")?.parentElement).not.toHaveTextContent("Add contact");
    expect([...container.querySelectorAll("button")].some((button) => button.textContent?.includes("Add contact"))).toBe(true);
    expect(container).toHaveTextContent("Ada Lovelace");
    expect(container.querySelector('input[aria-label="Search contacts"]')).toBeInTheDocument();
    expect(container).toHaveTextContent("All stages");
    act(() => root.unmount());
  });

  it("shows a linked speaker's submissions in the contact detail pane", async () => {
    const container = document.createElement("div"); document.body.append(container); const root = createRoot(container);
    const repo = {
      crm: {
        list: vi.fn().mockResolvedValue([{ id: "contact-1", firstName: "Ada", lastName: "Lovelace", email: "ada@example.test", stage: "qualified", score: 80, speakerId: "speaker-1" }]),
        listSegments: vi.fn().mockResolvedValue([]),
      },
      submissions: {
        list: vi.fn().mockResolvedValue([
          { id: "sub-1", title: "Keynote: Analytical Engines", status: "accepted", speakerIds: ["speaker-1"] },
          { id: "sub-2", title: "Unrelated talk", status: "pending", speakerIds: ["speaker-2"] },
        ]),
      },
    } as unknown as Repository;
    await act(async () => root.render(
      <MemoryRouter initialEntries={["/events/demo-event/program/contacts/contact-1/edit"]}>
        <RepoContext.Provider value={repo}>
          <Routes><Route path="/events/:slug/program/contacts/:contactId/edit" element={<Contacts />} /></Routes>
        </RepoContext.Provider>
      </MemoryRouter>,
    ));
    await act(async () => undefined);
    // Only the speaker's own submission shows, not another speaker's.
    expect(container).toHaveTextContent("Keynote: Analytical Engines");
    expect(container).not.toHaveTextContent("Unrelated talk");
    act(() => root.unmount());
  });

  it("keeps OAuth completion in the body dialog and contact IDs out of URLs", () => {
    const source = readFileSync("src/pages/program/Contacts.tsx", "utf8");
    expect(source).toContain("startSourceOAuth");
    expect(source).toContain("finishSourceOAuth");
    expect(source).toContain('searchParams.get("crm_oauth")');
    expect(source).toContain("Connect with OAuth");
    expect(source).toContain("Separate first and last fields");
    expect(source).toContain("firstNameField");
    expect(source).toContain("lastNameField");
    expect(source).toContain("Save filters");
    expect(source).toContain("Remove from event");
    expect(source).not.toContain("?contactId=");
  });
});
