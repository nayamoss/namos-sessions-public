import { describe, expect, it, vi } from "vitest";
import { consumeDemoTicket } from "@/lib/demo-ticket";

describe("demo sign-in tickets", () => {
  it("signs out the current Clerk session before consuming the next role ticket", async () => {
    const signOut = vi.fn(async (_options: { redirectUrl: string }) => undefined);
    const navigate = vi.fn();
    await consumeDemoTicket(signOut, "https://clerk.example/ticket", true, navigate);
    expect(signOut).toHaveBeenCalledWith({ redirectUrl: "https://clerk.example/ticket" });
    expect(navigate).not.toHaveBeenCalled();
  });

  it("navigates directly when no Clerk session exists", async () => {
    const signOut = vi.fn(async (_options: { redirectUrl: string }) => undefined);
    const navigate = vi.fn();
    await consumeDemoTicket(signOut, "https://clerk.example/ticket", false, navigate);
    expect(signOut).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledWith("https://clerk.example/ticket");
  });
});
