import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { PublicSubmissionFormConfig } from "@/data/types";
import {
  PublicFormRenderer,
  usePublicFormState,
  type EmailVerificationController,
} from "@/pages/public/PublicFormRenderer";

const config: PublicSubmissionFormConfig = {
  event: {
    name: "Testy Conf",
    slug: "testy-conf",
    timezone: "UTC",
    startDate: Date.UTC(2026, 8, 1),
    endDate: Date.UTC(2026, 8, 2),
    accentColor: "#0f62fe",
  },
  form: {
    externalTitle: "Submit a proposal",
    pageHeading: "Share your idea",
    kind: "session",
    collectParticipants: true,
    showWelcomeMessage: true,
    welcomeMessage: "<p>Have your proposal ready.</p>",
    pages: [
      { id: "account", kind: "system", systemRole: "account", label: "Account", pageHeading: "Account", fieldKeys: [] },
      { id: "proposal", kind: "custom", label: "Proposal", pageHeading: "Your proposal", fieldKeys: ["title", "kind", "setup"] },
      { id: "participants", kind: "system", systemRole: "participant", label: "Participants", pageHeading: "Presenters", fieldKeys: ["speaker-name"] },
      { id: "review", kind: "system", systemRole: "review", label: "Review", pageHeading: "Review", fieldKeys: [] },
    ],
    sections: [],
    participantRoles: [{ role: "Speaker", min: 1, max: 2 }],
    crossFieldLimits: [],
    allowMultipleDrafts: false,
    autoRedirectToPortal: true,
    confirmationEnabled: true,
    successPageMessage: "Your proposal is in.",
    fields: [
      { key: "title", label: "Title", type: "text", required: true },
      { key: "kind", label: "Session kind", type: "text", required: true },
      { key: "setup", label: "Workshop setup", type: "text", required: true, showIf: { fieldKey: "kind", equals: "Workshop" } },
      { key: "speaker-name", label: "Speaker name", type: "text", required: true },
    ],
  },
};

const verification = {
  status: "verified",
  code: "",
  setCode: vi.fn(),
  error: undefined,
  sendCode: vi.fn(),
  verifyCode: vi.fn(),
  reset: vi.fn(),
  signOutAndRetry: vi.fn(),
  signOutAndEdit: vi.fn(),
  verifiedEmail: "ada@example.test",
  conflictingEmail: undefined,
  ready: true,
} as unknown as EmailVerificationController;

function Flow({
  onSubmit,
  verificationComplete,
  submitted = false,
}: {
  onSubmit: () => void;
  verificationComplete: boolean;
  submitted?: boolean;
}) {
  const state = usePublicFormState(config);
  return (
    <PublicFormRenderer
      config={config}
      mode="public"
      state={state}
      onSubmit={onSubmit}
      submitted={submitted}
      secondsToRedirect={10}
      emailVerification={verification}
      turnstileSlot={<div aria-label="Submission verification" />}
      submissionVerificationComplete={verificationComplete}
    />
  );
}

describe("public form renderer flow", () => {
  it("walks the pages in order and gates submission on current Turnstile verification", () => {
    const onSubmit = vi.fn();
    const view = render(
      <MemoryRouter>
        <Flow onSubmit={onSubmit} verificationComplete={false} />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "Share your idea" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    fireEvent.change(screen.getByLabelText("First name"), { target: { value: "Ada" } });
    fireEvent.change(screen.getByLabelText("Last name"), { target: { value: "Lovelace" } });
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "ada@example.test" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByText("Title is required.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Title/), { target: { value: "Reliable programs" } });
    fireEvent.change(screen.getByLabelText(/Session kind/), { target: { value: "Workshop" } });
    expect(screen.getByLabelText(/Workshop setup/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Workshop setup/), { target: { value: "Bring a laptop" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    fireEvent.change(screen.getByLabelText(/Speaker name/), { target: { value: "Ada Lovelace" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(screen.getByRole("heading", { name: "Review your proposal" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Submit proposal" })).toBeDisabled();

    view.rerender(
      <MemoryRouter>
        <Flow onSubmit={onSubmit} verificationComplete />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Submit proposal" }));
    expect(onSubmit).toHaveBeenCalledOnce();

    view.rerender(
      <MemoryRouter>
        <Flow onSubmit={onSubmit} verificationComplete submitted />
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { name: "Thank you, Ada." })).toBeInTheDocument();
    expect(screen.getByText(/Your proposal is in/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open the speaker portal now" })).toHaveAttribute("href", "/portal");
  });
});
