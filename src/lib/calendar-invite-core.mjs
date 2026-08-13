const utcStamp = (time) => {
  if (typeof time !== "number" || !Number.isFinite(time)) throw new Error("Calendar times must be finite timestamps.");
  return new Date(time).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
};

const escapeText = (value) => String(value)
  .replace(/\\/g, "\\\\")
  .replace(/\r?\n/g, "\\n")
  .replace(/,/g, "\\,")
  .replace(/;/g, "\\;");

function foldLine(line) {
  const chunks = [];
  let current = "";
  for (const character of line) {
    const candidate = `${current}${character}`;
    if (BufferByteLength(candidate) > 75) {
      chunks.push(current);
      current = ` ${character}`;
    } else {
      current = candidate;
    }
  }
  chunks.push(current);
  return chunks.join("\r\n");
}

function BufferByteLength(value) {
  return new TextEncoder().encode(value).length;
}

export function calendarInvite({ uid, title, startTime, endTime, location, description, url, sequence = 0, dtstamp = Date.now() }) {
  if (!uid?.trim()) throw new Error("A calendar invite needs a stable uid.");
  if (!title?.trim()) throw new Error("A calendar invite needs a title.");
  if (startTime >= endTime) throw new Error("A calendar invite must end after it starts.");
  if (!Number.isInteger(sequence) || sequence < 0) throw new Error("A calendar invite sequence must be a non-negative integer.");

  const eventProperties = [
    `UID:${escapeText(uid.trim())}`,
    `DTSTAMP:${utcStamp(dtstamp)}`,
    `DTSTART:${utcStamp(startTime)}`,
    `DTEND:${utcStamp(endTime)}`,
    `SUMMARY:${escapeText(title.trim())}`,
    ...(location?.trim() ? [`LOCATION:${escapeText(location.trim())}`] : []),
    ...(description?.trim() ? [`DESCRIPTION:${escapeText(description.trim())}`] : []),
    ...(url?.trim() ? [`URL:${escapeText(url.trim())}`] : []),
    "STATUS:CONFIRMED",
    `SEQUENCE:${sequence}`,
  ];

  const lines = [
    "BEGIN:VCALENDAR",
    "PRODID:-//NamosLabs//Sessionboard Clone//EN",
    "VERSION:2.0",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    ...eventProperties,
    // New Outlook strips LOCATION when VALARM appears before the event properties.
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    "TRIGGER:-PT30M",
    `DESCRIPTION:${escapeText(`Reminder: ${title.trim()}`)}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  // METHOD intentionally does not appear in the body. Resend carries method=REQUEST on the
  // attachment's actual MIME type, which is what Outlook inspects.
  return `${lines.map(foldLine).join("\r\n")}\r\n`;
}

export function calendarAttachment(input) {
  const content = calendarInvite(input);
  const safeName = input.title.trim().replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "") || "session";
  const bytes = new TextEncoder().encode(content);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return {
    filename: `${safeName}.ics`,
    content: btoa(binary),
    contentType: "text/calendar; charset=utf-8; method=REQUEST",
  };
}
