import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";
import { AnalyticsConsentBanner, AnalyticsPreferences, AnalyticsRuntime } from "@/components/AnalyticsConsent";
import {
  __resetAnalyticsForTests,
  getAnalyticsConsent,
  isReplayAllowed,
  normalizeAnalyticsPath,
  sanitizeAnalyticsProperties,
  setAnalyticsConsent,
  track,
} from "@/lib/analytics";

describe("analytics privacy lifecycle", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    document.head.querySelectorAll("[data-namos-analytics]").forEach((node) => node.remove());
    __resetAnalyticsForTests();
  });

  it("defaults to unknown, persists choices, and never loads a vendor before consent", () => {
    expect(getAnalyticsConsent()).toBe("unknown");
    track("event_created", { event_status: "draft" });
    expect(document.head.querySelector("[data-namos-analytics]")).not.toBeInTheDocument();
    setAnalyticsConsent("rejected");
    expect(getAnalyticsConsent()).toBe("rejected");
    setAnalyticsConsent("accepted");
    expect(getAnalyticsConsent()).toBe("accepted");
    setAnalyticsConsent("rejected");
    expect(getAnalyticsConsent()).toBe("rejected");
  });

  it("keeps only catalog-approved enum, boolean, count, and normalized route values", () => {
    expect(sanitizeAnalyticsProperties("public_submission_completed", {
      participant_count: 2,
      email: "person@example.com",
      title: "Secret proposal",
      unknown: true,
    })).toEqual({ participant_count: 2 });
    expect(sanitizeAnalyticsProperties("page_view", {
      route: "/events/:eventSlug/program/forms/:formId/edit",
      surface: "app",
      name: "Jordan",
    })).toEqual({ route: "/events/:eventSlug/program/forms/:formId/edit", surface: "app" });
    expect(sanitizeAnalyticsProperties("page_view", { route: "/events/private-slug?email=a@b.com", surface: "app" })).toEqual({ surface: "app" });
    expect(sanitizeAnalyticsProperties("form_saved", { mode: "invented", form_kind: "abstract" })).toEqual({ form_kind: "abstract" });
  });

  it("normalizes dynamic route identifiers and applies the strict replay matrix", () => {
    expect(normalizeAnalyticsPath("/events/hackathon/program/forms/form_123/edit")).toBe("/events/:eventSlug/program/forms/:formId/edit");
    expect(normalizeAnalyticsPath("/events/hackathon/cms/embeds/embed_123")).toBe("/events/:eventSlug/cms/embeds/:embedId");
    expect(normalizeAnalyticsPath("/events/hackathon/program/submissions/private-record-id")).toBe("/unknown");
    expect(normalizeAnalyticsPath("/submit/hackathon/form_123")).toBe("/submit/:eventSlug/:formId");
    expect(normalizeAnalyticsPath("/some/private/value")).toBe("/unknown");
    expect(isReplayAllowed("/submit/hackathon/form_123")).toBe(true);
    expect(isReplayAllowed("/e/hackathon/agenda")).toBe(true);
    for (const route of ["/events/hackathon/dashboard", "/sign-in", "/portal", "/api-docs", "/embed/embed_123"]) expect(isReplayAllowed(route)).toBe(false);
  });

  it("renders accessible consent and preference controls with an external privacy link", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => root.render(<MemoryRouter><AnalyticsConsentBanner /></MemoryRouter>));
    expect(container.querySelector('[role="region"][aria-label="Analytics preference"]')).toBeInTheDocument();
    expect(container.querySelector('a[href="https://namos-sessions.xyz/privacy"]')).toHaveTextContent("Privacy");
    await act(async () => container.querySelector<HTMLButtonElement>("button")?.click());
    expect(getAnalyticsConsent()).toBe("accepted");
    expect(container.querySelector('[aria-label="Analytics preference"]')).not.toBeInTheDocument();

    await act(async () => root.render(<MemoryRouter><AnalyticsPreferences /></MemoryRouter>));
    expect(container).toHaveTextContent("analytics are enabled");
    const disable = [...container.querySelectorAll("button")].find((button) => button.textContent?.includes("Disable"));
    await act(async () => disable?.click());
    expect(getAnalyticsConsent()).toBe("rejected");
    expect(container).toHaveTextContent("analytics are disabled");
    act(() => root.unmount());
    container.remove();
  });

  it("renders no consent UI inside third-party embeds", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => root.render(<MemoryRouter initialEntries={["/embed/embed_123"]}><AnalyticsRuntime /></MemoryRouter>));
    expect(container).toBeEmptyDOMElement();
    act(() => root.unmount());
    container.remove();
  });
});
