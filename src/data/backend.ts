export type Backend = "convex" | "airtable";

export function selectedBackend(): Backend {
  const value = import.meta.env.VITE_DATA_BACKEND;
  if (value === undefined || value === "convex") return "convex";
  if (value === "airtable") return "airtable";
  throw new Error("VITE_DATA_BACKEND must be convex or airtable");
}

/** ClerkProvider is mounted globally in main.tsx regardless of data backend. */
export function isClerkEnabled(): boolean { return true; }
