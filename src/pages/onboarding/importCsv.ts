import type { SpeakerImportRow } from "@/data/types";

export type PreviewRow = SpeakerImportRow & { row: number; error?: string };
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function validateImportRows(rows: Record<string, string>[]): { rows: PreviewRow[]; error?: string } {
  if (rows.length > 500) return { rows: [], error: `This file has ${rows.length} rows; the limit is 500. Split it into two files.` };
  return { rows: rows.map((value, index) => {
    const row: PreviewRow = { row: index + 1, firstName: (value.firstName ?? "").trim(), lastName: (value.lastName ?? "").trim(), email: (value.email ?? "").trim(), bio: value.bio?.trim() || undefined, talkTitle: value.talkTitle?.trim() || undefined, talkAbstract: value.talkAbstract?.trim() || undefined };
    if (!row.firstName) row.error = "First name is required.";
    else if (row.firstName.length > 200) row.error = "First name is too long.";
    else if (!row.lastName) row.error = "Last name is required.";
    else if (row.lastName.length > 200) row.error = "Last name is too long.";
    else if (!emailPattern.test(row.email)) row.error = "Enter a valid email address.";
    return row;
  }) };
}
