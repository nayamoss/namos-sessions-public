// A real white card with a soft shadow — not fully transparent — and generous rounding. This is
// the one screen in the app that intentionally carries a shadow; it's the front door.
export const clerkAppearance = {
  variables: {
    colorPrimary: "#0066FF",
    colorBackground: "#FFFFFF",
    colorText: "#1B2233",
    colorTextSecondary: "#657086",
    colorInputBackground: "#F1F4F9",
    colorInputText: "#1B2233",
    borderRadius: "0.75rem",
  },
  elements: {
    rootBox: "w-full",
    card: "shadow-[0_8px_30px_rgba(0,0,0,0.08)] rounded-xl border-0",
    formButtonPrimary: "bg-[#0066FF] hover:bg-[#005CE6] text-white shadow-none",
    socialButtonsBlockButton: "shadow-none border-0 bg-[#F1F4F9] hover:bg-[#E8EDF5]",
    formFieldInput: "shadow-none border-0 bg-[#F1F4F9]",
    footerActionLink: "text-[#0066FF] hover:text-[#005CE6]",
  },
};

export function clerkAppearanceForTheme(resolvedTheme?: string) {
  if (resolvedTheme !== "dark") return clerkAppearance;
  return {
    ...clerkAppearance,
    variables: { ...clerkAppearance.variables, colorBackground: "#151922", colorText: "#F4F7FB", colorTextSecondary: "#AAB4C5", colorInputBackground: "#202633", colorInputText: "#F4F7FB" },
    elements: { ...clerkAppearance.elements, card: "shadow-none rounded-xl border-0 bg-[#151922]", socialButtonsBlockButton: "shadow-none border-0 bg-[#202633] hover:bg-[#293142]", formFieldInput: "shadow-none border-0 bg-[#202633]" },
  };
}

// Clerk's default English strings interpolate the Clerk *application's* dashboard display name
// ("Sign in to {{applicationName}}") — that name can only be renamed from the Clerk dashboard,
// not via the CLI/API, and still reads "Sessionboard Clone" there. Overriding the strings
// directly is the only way to get the app's real name into the widget without dashboard access.
export const clerkLocalization = {
  signIn: {
    start: { title: "Sign in to Namos Sessions", subtitle: "" },
  },
  signUp: {
    start: { title: "Create your Namos Sessions account", subtitle: "" },
  },
};
