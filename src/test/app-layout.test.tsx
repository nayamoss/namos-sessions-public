import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { ClerkProvider } from "@clerk/clerk-react";
import { FileText, Home } from "lucide-react";
import { AppLayout, DashboardLayout } from "@/components/AppLayout";
import { RepoContext, type Repository } from "@/data/repo";
import { ContentToolbar } from "@/components/shared/ContentToolbar";
import OrganizationSettings from "@/pages/settings/OrganizationSettings";
import { TEST_CLERK_PUBLISHABLE_KEY } from "./clerk-test-key";

describe("AppLayout", () => {
  it("puts organization settings in the account menu, not a standalone sidebar button", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() => root.render(
      <ClerkProvider publishableKey={TEST_CLERK_PUBLISHABLE_KEY}>
        <MemoryRouter>
          <AppLayout title="Abstracts">
            <p>Grid content</p>
          </AppLayout>
        </MemoryRouter>
      </ClerkProvider>,
    ));

    // No floating "Organization settings" button sitting above the event switcher.
    expect(container.querySelector('aside button[aria-label="Organization settings"]')).not.toBeInTheDocument();
    act(() => root.unmount());
    container.remove();

    const accountMenuSource = readFileSync(join(process.cwd(), "src/components/AccountMenu.tsx"), "utf8");
    // The destination moved from a route link to the settings overlay in #231, so assert the
    // entry point that exists now. What this test protects is unchanged: organization settings
    // are reachable from the account menu and not from a floating sidebar button.
    expect(accountMenuSource).toContain('openSettings("organization")');
    expect(accountMenuSource).toContain("Organization settings");
  });

  it("keeps only the page title and notification control in shell chrome", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() => root.render(
      <ClerkProvider publishableKey={TEST_CLERK_PUBLISHABLE_KEY}>
        <MemoryRouter>
          <AppLayout title="Abstracts">
            <ContentToolbar
              ariaLabel="Abstract controls"
              search={<input aria-label="Search abstracts" />}
              primaryAction={<button type="button">Add Abstract</button>}
            />
            <p>Grid content</p>
          </AppLayout>
        </MemoryRouter>
      </ClerkProvider>,
    ));

    const shellHeader = container.querySelector<HTMLElement>("header")!;
    const content = container.querySelector<HTMLElement>('section[aria-label="Page content"]')!;
    const shell = container.querySelector<HTMLElement>(".mobile-safe-shell")!;

    expect(shell).toHaveClass("h-dvh");
    expect(shellHeader.querySelector("h1")).toHaveTextContent("Abstracts");
    expect(shellHeader.querySelector('button[aria-label="Notifications"]')).toBeInTheDocument();
    const headerUtilities = [...shellHeader.children].find((child) => child.classList.contains("ml-auto"));
    expect(headerUtilities).toContainElement(shellHeader.querySelector('button[aria-label="Open command palette"]'));
    expect(headerUtilities).toContainElement(shellHeader.querySelector('button[aria-label="Notifications"]'));
    expect(shellHeader.textContent).not.toContain("Add Abstract");
    expect(shellHeader.querySelector('input[aria-label="Search abstracts"]')).not.toBeInTheDocument();
    expect(content.textContent).toContain("Add Abstract");
    expect(content.querySelector('input[aria-label="Search abstracts"]')).toBeInTheDocument();
    // Dashboard is a single link with no group header — printing "Dashboard" as both
    // a section label and the item beneath it would just repeat the word twice.
    const dashboardSection = [...container.querySelectorAll("nav section")].find((section) => section.querySelector('a[href="/dashboard"]'));
    const programSection = [...container.querySelectorAll("nav section")].find((section) => section.querySelector("h2")?.textContent === "Program");
    expect(dashboardSection?.querySelector("h2")).not.toBeInTheDocument();
    expect(dashboardSection?.textContent).not.toContain("Speaker Tracking");
    expect(programSection?.querySelector('a[href="/program/speakers"]')).toHaveTextContent("Speakers");
    act(() => root.unmount());
    container.remove();
  });

  it("reuses the dashboard shell with role-specific portal navigation", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() => root.render(
      <ClerkProvider publishableKey={TEST_CLERK_PUBLISHABLE_KEY}>
        <MemoryRouter initialEntries={["/portal/submissions"]}>
          <DashboardLayout
            accountContext="portal"
            homeHref="/portal"
            navSections={[{
              label: "Speaker portal",
              items: [
                { to: "/portal", label: "Home", icon: Home, end: true },
                { to: "/portal/submissions", label: "Submissions", icon: FileText },
              ],
            }]}
            title="My submissions"
          >
            <p>Speaker content</p>
          </DashboardLayout>
        </MemoryRouter>
      </ClerkProvider>,
    ));

    expect(container.querySelector("aside nav")).toHaveTextContent("Speaker portal");
    expect(container.querySelector('a[href="/portal/submissions"]')).toHaveTextContent("Submissions");
    expect(container.querySelector("header h1")).toHaveTextContent("My submissions");
    expect(container.querySelectorAll("h1")).toHaveLength(1);
    expect(container.querySelector('section[aria-label="Page content"]')).toHaveTextContent("Speaker content");
    expect(container.querySelector('button[aria-label="Account menu"]')).toBeInTheDocument();
    const mobileNavigation = container.querySelector<HTMLButtonElement>('button[aria-label="Open navigation"]')!;
    expect(mobileNavigation).toBeInTheDocument();
    act(() => mobileNavigation.click());
    expect(document.querySelector('[role="dialog"]')).toHaveTextContent("Speaker portal");
    act(() => root.unmount());
    container.remove();
  });

  it("keeps collapsible nav sections auto-collapsed and lets only one stay open", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() => root.render(
      <ClerkProvider publishableKey={TEST_CLERK_PUBLISHABLE_KEY}>
        <MemoryRouter initialEntries={["/events"]}>
          <AppLayout title="Abstracts">
            <p>Grid content</p>
          </AppLayout>
        </MemoryRouter>
      </ClerkProvider>,
    ));

    const sections = [...container.querySelectorAll("nav section")];
    const programHeader = sections.find((section) => section.querySelector("h2")?.textContent === "Program")!;
    const configureHeader = sections.find((section) => section.querySelector("h2")?.textContent === "Settings")!;
    const programToggle = programHeader.querySelector("button")!;
    const configureToggle = configureHeader.querySelector("button")!;

    // No active route inside either section, so both start collapsed.
    expect(programToggle).toHaveAttribute("aria-expanded", "false");
    expect(configureToggle).toHaveAttribute("aria-expanded", "false");

    act(() => programToggle.click());
    expect(programHeader.querySelector("button")).toHaveAttribute("aria-expanded", "true");

    // Opening Configure auto-collapses Program — only one section stays open.
    act(() => configureHeader.querySelector("button")!.click());
    expect(programHeader.querySelector("button")).toHaveAttribute("aria-expanded", "false");
    expect(configureHeader.querySelector("button")).toHaveAttribute("aria-expanded", "true");

    act(() => root.unmount());
    container.remove();
  });

  it("renders organization members in a table with explicit status and role columns", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const owner = {
      id: "owner-1",
      userId: "user-owner",
      email: "owner@example.com",
      role: "owner" as const,
      createdAt: 0,
    };
    const pendingAdmin = {
      id: "admin-1",
      userId: "pending:admin@example.com",
      email: "admin@example.com",
      role: "admin" as const,
      createdAt: 0,
    };
    const repo = {
      organizations: {
        getMine: async () => ({ id: "org-1", name: "Test org", createdByUserId: "user-1", createdAt: 0 }),
      },
      organizers: {
        list: async (organizationId: string) => (organizationId === "org-1" ? [owner, pendingAdmin] : []),
        getMine: async () => owner,
      },
    } as unknown as Repository;

    await act(async () => {
      root.render(
        <ClerkProvider publishableKey={TEST_CLERK_PUBLISHABLE_KEY}>
          <MemoryRouter>
            <RepoContext.Provider value={repo}>
              <OrganizationSettings />
            </RepoContext.Provider>
          </MemoryRouter>
        </ClerkProvider>,
      );
    });

    const table = container.querySelector('table[aria-label="Organization team members"]');
    expect(table).toBeInTheDocument();
    expect(table?.querySelectorAll('th[scope="col"]')).toHaveLength(4);
    expect(table).toHaveTextContent("Member");
    expect(table).toHaveTextContent("Status");
    expect(table).toHaveTextContent("Role");
    expect(table).toHaveTextContent("Pending invite");
    expect(table).toHaveTextContent("Active");
    act(() => root.unmount());
    container.remove();
  });
});
