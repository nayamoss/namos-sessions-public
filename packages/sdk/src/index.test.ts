import { describe, expect, it, vi } from "vitest";
import { NamosSessionsApiError, NamosSessionsClient } from "./index";

const token = `ns_live_${"a1".repeat(24)}`;
const response = (body: unknown, status = 200, statusText = "") => new Response(JSON.stringify(body), { status, statusText, headers: { "content-type": "application/json" } });
const error = (status: number, code: string, message: string) => response({ code, message, details: null }, status);

describe("NamosSessionsClient", () => {
  it("returns typed data and sends authorization and event query parameters", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(response({ data: [{ id: "event-1", name: "Namos" }] }))
      .mockResolvedValueOnce(response({ data: [] }));
    const client = new NamosSessionsClient({ token, baseUrl: "https://sessions.example/", fetch });

    await expect(client.events.list()).resolves.toEqual([{ id: "event-1", name: "Namos" }]);
    await client.submissions.list("event id");

    expect(fetch).toHaveBeenNthCalledWith(1, new URL("https://sessions.example/api/v1/events"), expect.objectContaining({
      method: "GET", headers: expect.objectContaining({ Authorization: `Bearer ${token}` }),
    }));
    expect(String(fetch.mock.calls[1][0])).toBe("https://sessions.example/api/v1/submissions?eventId=event+id");
  });

  it.each([
    [401, "unauthorized", "Invalid or revoked API token."],
    [403, "forbidden", "This token does not have the events:read scope."],
    [429, "rate_limited", "Rate limit exceeded."],
    [409, "idempotency_conflict", "Idempotency-Key was already used with a different request body."],
  ])("throws a typed error for %i responses", async (status, code, message) => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(error(status, code, message));
    const client = new NamosSessionsClient({ token, baseUrl: "https://sessions.example", fetch });

    const call = status === 409
      ? client.submissions.updateStatus("submission-1", "accepted", { idempotencyKey: "request-1" })
      : client.events.list();

    await expect(call).rejects.toMatchObject<NamosSessionsApiError>({ status, code, message });
  });

  it("posts status changes with the required idempotency header", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(response({ data: { _id: "submission-1", status: "accepted" } }));
    const client = new NamosSessionsClient({ token, baseUrl: "https://sessions.example", fetch });

    await expect(client.submissions.updateStatus("submission 1", "accepted", { idempotencyKey: "once" })).resolves.toMatchObject({ status: "accepted" });
    expect(String(fetch.mock.calls[0][0])).toBe("https://sessions.example/api/v1/submissions/submission%201/status");
    expect(fetch.mock.calls[0][1]).toMatchObject({ method: "POST", body: '{"status":"accepted"}', headers: expect.objectContaining({ "Idempotency-Key": "once" }) });
  });
});
