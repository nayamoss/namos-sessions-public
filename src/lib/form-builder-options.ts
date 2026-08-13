export function parseOptionsDraft(value: string) {
  return value.split("\n");
}

export function sanitizeOptionsForSave(options: string[] | undefined) {
  return options?.map((option) => option.trim()).filter(Boolean);
}
