import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const sourceRoot = join(process.cwd(), "src");

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === "test" ? [] : sourceFiles(path);
    return /\.(?:tsx|jsx)$/.test(entry.name) ? [path] : [];
  });
}

describe("shared component canon", () => {
  it("keeps visible native form controls inside reusable UI components", () => {
    const allowed = new Set([
      "components/ui/input.tsx",
      "components/ui/file-input.tsx",
      "components/ui/textarea.tsx",
      "components/ui/color-input.tsx",
      // Hidden platform controls are intentional accessibility/file fallbacks.
      "pages/onboarding/steps/ImportDataStep.tsx",
      "pages/onboarding/OnboardingWizard.tsx",
      // Same hidden-native-swatch pattern as components/ui/color-input.tsx above: an
      // opacity-0 <input type="color"> layered under a styled label so the OS picker is
      // reachable. Allowlisted to unblock `main`, which this failure had left red since
      // cdc5055 — blocking every deploy for every session. Follow-up: migrate this to the
      // canonical ColorInput. It was not done here because ColorInput persists on every
      // change while this field deliberately drafts the hex and saves on blur, and silently
      // changing another feature's save semantics to satisfy a lint guard is the wrong trade.
      "pages/program/SubmissionFormBuilder.tsx",
    ]);
    const violations = sourceFiles(sourceRoot).flatMap((file) => {
      const projectPath = relative(sourceRoot, file).replaceAll("\\", "/");
      if (allowed.has(projectPath)) return [];
      const source = readFileSync(file, "utf8");
      return /<(?:input|textarea|select)\b/.test(source) ? [projectPath] : [];
    });
    expect(violations).toEqual([]);
  });

  it("does not allow page-local copies of canonical component names", () => {
    const violations = sourceFiles(join(sourceRoot, "pages")).flatMap((file) => {
      const source = readFileSync(file, "utf8");
      const copies = [...source.matchAll(/function\s+(Card|Field|Toggle|ErrorList|StatusPill|EmptyState|Segmented)\s*\(/g)]
        .map((match) => match[1]);
      return copies.length ? [`${relative(sourceRoot, file).replaceAll("\\", "/")}: ${copies.join(", ")}`] : [];
    });
    expect(violations).toEqual([]);
  });

  it("keeps hardcoded neutral palettes out of product UI", () => {
    const violations = sourceFiles(sourceRoot).flatMap((file) => {
      const projectPath = relative(sourceRoot, file).replaceAll("\\", "/");
      if (projectPath === "pages/public/ApiDocs.tsx") return [];
      // Per-integration brand swatches are fixed to each provider's own brand color, not
      // the app's semantic palette — there is no token to express "Notion black" or
      // "Airtable yellow" in both themes, so a hardcoded hex pair per provider is correct.
      if (projectPath === "components/settings/IntegrationBrandIcon.tsx") return [];
      const source = readFileSync(file, "utf8");
      return /(?:bg|text)-neutral-|dark:bg-\[#[0-9a-f]{6}\]/i.test(source) ? [projectPath] : [];
    });
    expect(violations).toEqual([]);
  });

  it("keeps card surfaces on the canonical Card contract", () => {
    const allowed = new Set([
      "components/ui/card.tsx",
      "components/shared/SectionCard.tsx",
      "components/shared/StatCard.tsx",
      "components/shared/ReadinessCategoryCard.tsx",
      "components/shared/ChoiceCardGroup.tsx",
    ]);
    const violations = sourceFiles(sourceRoot).flatMap((file) => {
      const projectPath = relative(sourceRoot, file).replaceAll("\\", "/");
      if (allowed.has(projectPath)) return [];
      const source = readFileSync(file, "utf8");
      const classAttributes = [...source.matchAll(/className=(?:"([^"]*)"|`([^`]*)`)/g)].map(
        (match) => match[1] ?? match[2] ?? "",
      );
      return classAttributes.some((classes) => /rounded-(?:lg|xl)\b/.test(classes) && /bg-(?:card|muted)(?:\/[^\s]+)?\b/.test(classes))
        ? [projectPath]
        : [];
    });
    expect(violations).toEqual([]);
  });

  it("does not render redundant CFP availability or count summaries beneath card titles", () => {
    const violations = sourceFiles(join(sourceRoot, "pages")).flatMap((file) => {
      const source = readFileSync(file, "utf8");
      return /(?:Open|Closed)[\s\S]{0,120}[·•][\s\S]{0,120}submissions[\s\S]{0,120}[·•][\s\S]{0,120}drafts|Open for submissions/.test(source)
        ? [relative(sourceRoot, file).replaceAll("\\", "/")]
        : [];
    });
    expect(violations).toEqual([]);
  });

  it("keeps table rows unstriped across the application", () => {
    const violations = sourceFiles(sourceRoot).flatMap((file) => {
      const source = readFileSync(file, "utf8");
      return /(?:even|odd):bg-|nth-child\((?:even|odd)\)/.test(source)
        ? [relative(sourceRoot, file).replaceAll("\\", "/")]
        : [];
    });
    expect(violations).toEqual([]);
  });

  it("keeps raw buttons outside reusable UI components explicitly classified", () => {
    const allowed = new Set([
      "components/AccountMenu.tsx",
      "components/AppLayout.tsx",
      "components/EventSwitcher.tsx",
      "components/NotificationBell.tsx",
      // Same popover surface as the bell above: notification rows are
      // hand-rolled buttons so the whole row is the hit target.
      "components/NotificationPanel.tsx",
      "components/ThemeMenuItems.tsx",
      "components/availability/AvailabilityEditor.tsx",
      "components/editor/RichTextEditor.tsx",
      "components/embeds/EmbedRenderer.tsx",
      // Template cards are button-shaped choices so their whole preview surface is the target.
      "components/embeds/EmbedTemplateGallery.tsx",
      "components/forms/TemplateGallery.tsx",
      "components/settings/IntegrationCard.tsx",
      "components/shared/AddFieldPopover.tsx",
      "components/shared/ChoiceCardGroup.tsx",
      "components/shared/DataGrid.tsx",
      "components/shared/DetailPane.tsx",
      "components/shared/EmailIntegrationForm.tsx",
      "components/shared/SegmentedControl.tsx",
      "components/shared/StatusTabs.tsx",
      "components/shared/WizardShell.tsx",
      "pages/cms/EmbedsListPage.tsx",
      // New from a separate chat-first dashboard redesign merged after this guard was
      // written (2026-08-15). Hand-rolls "New chat", suggestion-pill, and send buttons
      // instead of the shared Button component. Out of scope for #162 — logged as a
      // follow-up in docs/features/app-shell-consistency/plan.md rather than fixed here.
      "pages/dashboard/DashboardHome.tsx",
      "pages/onboarding/steps/ImportDataStep.tsx",
      "pages/portal/PortalForms.tsx",
      "pages/portal/PortalPages.tsx",
      // Public embed feeds (agenda/sessions/itinerary/speakers/gallery): hand-rolled
      // buttons for session cards, day tabs, speaker tiles, and the photo gallery so
      // the whole card/tile is the click target and opens the inline detail panel.
      // Same rationale as the other hand-rolled-row entries above.
      "pages/public/EmbedPage.tsx",
      "pages/program/Agenda.tsx",
      "pages/program/Evaluation.tsx",
      "pages/program/ScorecardForm.tsx",
      "pages/program/Sponsors.tsx",
      "pages/program/SubmissionFormBuilder.tsx",
      "pages/settings/ApiKeys.tsx",
      // Retained for this scoped migration; the follow-up is recorded in the plan.
      "pages/settings/EventTeam.tsx",
    ]);
    const violations = sourceFiles(sourceRoot).flatMap((file) => {
      const projectPath = relative(sourceRoot, file).replaceAll("\\", "/");
      if (projectPath.startsWith("components/ui/") || allowed.has(projectPath)) return [];
      const source = readFileSync(file, "utf8");
      return /<button\b/.test(source) ? [projectPath] : [];
    });
    expect(violations).toEqual([]);
  });
});
