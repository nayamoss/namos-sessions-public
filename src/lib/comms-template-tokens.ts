export type CommTemplateTokens = {
  speakerName?: string;
  eventName?: string;
  sessionTitle?: string;
  portalUrl?: string;
  scheduleTime?: string;
  location?: string;
  videoUrl?: string;
  taskTitle?: string;
  dueDate?: string;
};

const tokenPattern = /{{\s*(speakerName|eventName|sessionTitle|portalUrl|scheduleTime|location|videoUrl|taskTitle|dueDate)\s*}}/g;

/** Resolve the deliberately small, documented communication-template token set. */
export function resolveCommTemplate(value: string, tokens: CommTemplateTokens): string {
  return value.replace(tokenPattern, (_match, key: keyof CommTemplateTokens) => tokens[key]?.trim() ?? "");
}
