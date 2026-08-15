// Ported from takumi-main/takumi-chat/src/lib/timezones.ts (same `getBrowserTimezone` /
// `getTimezoneOptions` shape) rather than reinventing timezone detection — the browser-detected
// zone and whatever the caller already has selected are always folded into the result set even
// if `Intl.supportedValuesOf` omits them, so a pre-filled value never silently disappears from
// the list.
const FALLBACK_TIMEZONES = [
  "Africa/Cairo",
  "Africa/Johannesburg",
  "Africa/Lagos",
  "America/Anchorage",
  "America/Argentina/Buenos_Aires",
  "America/Bogota",
  "America/Chicago",
  "America/Denver",
  "America/Halifax",
  "America/Lima",
  "America/Los_Angeles",
  "America/Mexico_City",
  "America/New_York",
  "America/Phoenix",
  "America/Sao_Paulo",
  "America/Toronto",
  "America/Vancouver",
  "Asia/Bangkok",
  "Asia/Dubai",
  "Asia/Hong_Kong",
  "Asia/Jakarta",
  "Asia/Jerusalem",
  "Asia/Karachi",
  "Asia/Kolkata",
  "Asia/Manila",
  "Asia/Seoul",
  "Asia/Shanghai",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Atlantic/Reykjavik",
  "Australia/Adelaide",
  "Australia/Brisbane",
  "Australia/Melbourne",
  "Australia/Perth",
  "Australia/Sydney",
  "Europe/Amsterdam",
  "Europe/Berlin",
  "Europe/London",
  "Europe/Madrid",
  "Europe/Moscow",
  "Europe/Paris",
  "Europe/Rome",
  "Pacific/Auckland",
  "Pacific/Honolulu",
] as const;

const intlWithSupportedValues = Intl as typeof Intl & {
  supportedValuesOf?: (key: "timeZone") => string[];
};

export function getBrowserTimezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export function getTimezoneOptions(currentTimezone?: string) {
  const values = new Set(intlWithSupportedValues.supportedValuesOf?.("timeZone") ?? FALLBACK_TIMEZONES);
  const browserTimezone = getBrowserTimezone();
  if (browserTimezone) values.add(browserTimezone);
  if (currentTimezone) values.add(currentTimezone);
  return [...values].sort((left, right) => left.localeCompare(right));
}
