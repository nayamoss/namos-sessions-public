import { calendarInvite } from "./calendar-invite";

export type CalendarScheduleEvent = Parameters<typeof calendarInvite>[0];

export function calendarSchedule(events: CalendarScheduleEvent[]) {
  if (!events.length) throw new Error("A calendar schedule needs at least one event.");

  const calendars = events.map((event) => calendarInvite(event));
  const firstEventStart = calendars[0].indexOf("BEGIN:VEVENT\r\n");
  const calendarEnd = "END:VCALENDAR\r\n";
  if (firstEventStart < 0 || !calendars[0].endsWith(calendarEnd)) {
    throw new Error("The calendar invite generator returned an invalid calendar.");
  }

  const header = calendars[0].slice(0, firstEventStart);
  const eventBlocks = calendars.map((calendar) => {
    const start = calendar.indexOf("BEGIN:VEVENT\r\n");
    const end = calendar.lastIndexOf("END:VEVENT\r\n");
    if (start < 0 || end < start) {
      throw new Error("The calendar invite generator returned an invalid event.");
    }
    return calendar.slice(start, end + "END:VEVENT\r\n".length);
  });

  return `${header}${eventBlocks.join("")}${calendarEnd}`;
}
