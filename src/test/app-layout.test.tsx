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
    // Organization settings remain reachable from the account menu while the compact event
    // settings hub only contains event-scoped destinations.
    expect(accountMenuSource).toContain('to="/settings/organization"');
    expect(accountMenuSource).toContain("Organization settings");
  });

  it("keeps page headers identity-only and places workspace utilities in the body", () => {
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
    expect(shellHeader.querySelectorAll("h1")).toHaveLength(1);
    expect(shellHeader.querySelector("button, input, select, a")).not.toBeInTheDocument();
    const workspaceUtilities = content.querySelector<HTMLElement>('nav[aria-label="Workspace utilities"]')!;
    expect(workspaceUtilities.querySelector('button[aria-label="Open command palette"]')).toBeInTheDocument();
    expect(workspaceUtilities.querySelector('button[aria-label="Notifications"]')).toBeInTheDocument();
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
    expect(programSection?.querySelector('a[href="/program/speakers"]')).toHaveTextContent("Speaker CRM");
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

  it("shows one representative destination per section in the collapsed sidebar", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const previousCollapsed = localStorage.getItem("sessionboard.sidebarCollapsed");
    localStorage.setItem("sessionboard.sidebarCollapsed", "true");

    act(() => root.render(
      <ClerkProvider publishableKey={TEST_CLERK_PUBLISHABLE_KEY}>
        <MemoryRouter>
          <DashboardLayout
            accountContext="portal"
            homeHref="/portal"
            navSections={[
              { label: "Program", items: [{ to: "/portal", label: "Home", icon: Home, end: true }, { to: "/portal/submissions", label: "Submissions", icon: FileText }] },
              { label: "Resources", items: [{ to: "/portal/resources", label: "Resources", icon: FileText }, { to: "/portal/help", label: "Help", icon: Home }] },
            ]}
            title="My submissions"
          >
            <p>Speaker content</p>
          </DashboardLayout>
        </MemoryRouter>
      </ClerkProvider>,
    ));

    const links = container.querySelectorAll("aside nav a");
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveAttribute("aria-label", "Home");
    expect(links[1]).toHaveAttribute("aria-label", "Resources");

    act(() => root.unmount());
    if (previousCollapsed === null) localStorage.removeItem("sessionboard.sidebarCollapsed");
    else localStorage.setItem("sessionboard.sidebarCollapsed", previousCollapsed);
    container.remove();
  });

  it("renders a page utility rail beside the content surface", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() => root.render(
      <ClerkProvider publishableKey={TEST_CLERK_PUBLISHABLE_KEY}>
        <MemoryRouter>
          <DashboardLayout
            accountContext="portal"
            homeHref="/portal"
            navSections={[]}
            title="Workspace"
            utility={<p>Page utilities</p>}
          >
            <p>Primary content</p>
          </DashboardLayout>
        </MemoryRouter>
      </ClerkProvider>,
    ));

    const content = container.querySelector<HTMLElement>('section[aria-label="Page content"]')!;
    const utility = container.querySelector<HTMLElement>('aside[aria-label="Page utilities"]')!;
    const shell = container.querySelector<HTMLElement>(".mobile-safe-shell")!;
    const main = container.querySelector<HTMLElement>("main")!;
    expect(utility).toHaveTextContent("Page utilities");
    expect(content).not.toContainElement(utility);
    expect(utility.parentElement).toBe(shell);
    expect(main).not.toContainElement(utility);
    expect(content.closest("main")).toBe(main);

    act(() => root.unmount());
    container.remove();
  });

  it("keeps multi-item navigation collapsible and opens Configure as a compact hub", () => {
    window.localStorage.removeItem("namos-sidebar-section-state");
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
    const programToggle = programHeader.querySelector("button")!;
    const configureButton = container.querySelector<HTMLButtonElement>('button[aria-label="Configure"]')!;

    // No active route inside either group, so both start collapsed.
    expect(programToggle).toHaveAttribute("aria-expanded", "false");
    expect(configureButton).toBeInTheDocument();
    expect(configureButton.closest("section")?.querySelector("h2")).toBeNull();

    act(() => configureButton.click());
    expect(document.querySelector('[role="dialog"]')).toHaveTextContent("Event details");
    expect(document.querySelector('[role="dialog"]')).toHaveTextContent("AI Usage");

    act(() => programToggle.click());
    expect(programHeader.querySelector("button")).toHaveAttribute("aria-expanded", "true");

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
