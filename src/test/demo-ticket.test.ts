import { describe, expect, it, vi } from "vitest";
import { consumeDemoTicket } from "@/lib/demo-ticket";

describe("demo sign-in tickets", () => {
  it("signs out the current Clerk session before consuming the next role ticket", async () => {
    const signOut = vi.fn(async (_options: { redirectUrl: string }) => undefined);
    await consumeDemoTicket(signOut, "https://clerk.example/ticket");
    expect(signOut).toHaveBeenCalledWith({ redirectUrl: "https://clerk.example/ticket" });
  });
});
