import { renderHook } from "@testing-library/react";
import { getFunctionName } from "convex/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { convexFunction, normalize } from "@/data/convex";
import { createConvexReactiveTransport } from "@/data/convex/reactive";
import { readOperations, type ReadOperation } from "@/data/transport";

const mocks = vi.hoisted(() => ({ useQuery: vi.fn() }));

vi.mock("convex-helpers/react/cache", () => ({ useQuery: mocks.useQuery }));

const genericDocumentLists = new Set<ReadOperation>([
  "events.rooms.list", "events.tracks.list", "eventMembers.list", "tags.list", "forms.fields", "forms.listFields",
  "speakers.documents.list", "evaluations.list", "evaluations.plans.list", "evaluations.assignments.list",
  "agenda.list", "agenda.listForSpeaker", "tasks.list", "availability.list", "organizers.list", "taskTemplates.list",
  "comms.templates.list", "apiKeys.list",
  "sponsors.list", "sponsorTiers.list", "sponsorContacts.listBySponsor",
]);

function fixtureFor(operation: ReadOperation): unknown {
  const document = { _id: `${operation}-id`, _creationTime: 123, eventId: "event-a", title: "Example" };

  if (operation === "events.list" || operation === "events.listMine" || operation === "events.listForPortal") return [document];
  if (operation === "events.get" || operation === "events.getBySlug" || operation === "emailIntegrations.status" || operation === "organizers.getMine") return document;
  if (genericDocumentLists.has(operation)) return [document];
  if (operation === "forms.list") return [{ ...document, internalName: "Internal CFP", status: "open" }];
  if (operation === "speakers.list") return [{ ...document, firstName: "Ada", lastName: "Lovelace" }];
  if (operation === "speakers.getMine") return { ...document, firstName: "Grace", lastName: "Hopper" };
  if (operation === "submissions.list") return [{ ...document, speakerId: "speaker-a", tagIds: undefined }];
  if (operation === "submissions.getForSpeaker") {
    return { submission: { ...document, speakerId: "speaker-a", tagIds: ["tag-a"] }, form: { title: "CFP" } };
  }
  if (operation === "sponsors.get") return { ...document, contacts: [], tasks: [], submissions: [] };
  if (operation === "comms.list") return [{ ...document, channel: "email" }];
  if (operation === "speakers.headshotUrl") return "https://example.test/headshot";
  if (operation === "organizers.isCurrentUserOrganizer" || operation === "organizers.canClaimOwner" || operation === "organizers.hasAdminAccess") return true;

  return { operation, unchanged: true };
}

describe("Convex reactive normalization parity", () => {
  beforeEach(() => mocks.useQuery.mockReset());

  it.each(readOperations)("returns the HTTP-normalized shape for %s", (operation) => {
    const raw = fixtureFor(operation);
    const input = { marker: operation };
    mocks.useQuery.mockReturnValue(raw);

    const transport = createConvexReactiveTransport();
    const { result } = renderHook(() => transport.useRead<unknown>(operation, input));

    expect(result.current).toEqual({
      data: normalize(operation, raw),
      isLoading: false,
      error: undefined,
    });
    const [query, args] = mocks.useQuery.mock.calls[0];
    expect(getFunctionName(query)).toBe(convexFunction[operation]);
    expect(args).toEqual(input);
  });

  it("suspends the subscription when input is skip", () => {
    mocks.useQuery.mockReturnValue(undefined);
    const transport = createConvexReactiveTransport();
    const { result } = renderHook(() => transport.useRead("events.list", "skip"));

    const [query, args] = mocks.useQuery.mock.calls[0];
    expect(getFunctionName(query)).toBe(convexFunction["events.list"]);
    expect(args).toBe("skip");
    expect(result.current).toEqual({ data: undefined, isLoading: false, error: undefined });
  });

  it("reports undefined as loading only for an active subscription", () => {
    mocks.useQuery.mockReturnValue(undefined);
    const transport = createConvexReactiveTransport();
    const { result } = renderHook(() => transport.useRead("events.list", {}));

    expect(result.current).toEqual({ data: undefined, isLoading: true, error: undefined });
  });
});
