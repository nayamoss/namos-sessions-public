// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { deliverEventEmail } from "../../convex/emailDelivery";

afterEach(() => vi.unstubAllGlobals());

describe("demo email delivery sink", () => {
  it("captures rendered mail and decoded calendar data without resolving a provider", async () => {
    const runQuery = vi.fn().mockResolvedValue({ workspaceId: "workspace-1" });
    const runMutation = vi.fn().mockResolvedValue({ id: "delivery-1" });
    const ctx = { runQuery, runMutation } as never;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const calendar = "BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n";

    await deliverEventEmail(ctx, "event-1" as never, {
      to: "speaker+workspace-1@demo.namos-sessions.invalid",
      subject: "Accepted",
      text: "Your session is accepted.",
      html: "<p>Your session is accepted.</p>",
      attachments: [{ filename: "session.ics", content: Buffer.from(calendar).toString("base64"), contentType: "text/calendar" }],
    });

    expect(runQuery).toHaveBeenCalledTimes(1);
    expect(runMutation).toHaveBeenCalledTimes(1);
    expect(runMutation.mock.calls[0][1]).toMatchObject({
      eventId: "event-1",
      subject: "Accepted",
      attachmentName: "session.ics",
      attachmentContent: calendar,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
