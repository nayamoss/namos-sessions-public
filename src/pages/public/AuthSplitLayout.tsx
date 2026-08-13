import type { ReactNode } from "react";

// Matches the real Takumi product's own auth layout (app.takumihq.site): a dark brand panel on
// the left telling visitors what this is, and a light panel on the right holding the actual
// Clerk widget in a real (lightly shadowed) card — not the transparent-card treatment used on
// Takumi's internal chat tool. This is the one screen in this app that intentionally carries a
// shadow: it's the brand's front door, and the real product it's modeled on does the same.
export function AuthSplitLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <div className="hidden w-1/2 flex-col justify-center bg-[#111827] px-16 py-16 text-[#F4F7FB] lg:flex">
        <div className="mb-16 flex items-center gap-2">
          <span className="text-base font-semibold">Namos Sessions</span>
          <span className="h-1.5 w-1.5 rounded-full bg-[#0066FF]" />
        </div>
        <h1 className="max-w-md text-4xl font-bold leading-tight">
          Run your conference<br />from CFP to stage,<br /><span className="text-[#4D94FF]">in one place.</span>
        </h1>
        <p className="mt-6 max-w-sm text-base text-[#AAB4C5]">
          Submissions come in, reviewers score them, the schedule builds itself, and speakers
          manage their own bios — one program, start to finish.
        </p>
      </div>
      <div className="flex w-full flex-col justify-center bg-[#F5F7FB] px-6 py-16 lg:w-1/2 lg:px-16">
        <div className="mx-auto w-full max-w-sm">{children}</div>
      </div>
    </div>
  );
}
