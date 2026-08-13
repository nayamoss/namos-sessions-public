import { Section, Text } from "@react-email/components";
import {
  CustomMessageBlock,
  EmailButton,
  EmailLayout,
  Greeting,
  insetMetaStyle,
  insetStyle,
  insetTitleStyle,
  paragraphStyle,
} from "../components/email-layout";

export type ScheduleChangedEmailProps = {
  speakerName?: string;
  eventName: string;
  logoUrl?: string;
  sessionTitle: string;
  portalUrl: string;
  previousSchedule?: string;
  scheduledTime: string;
  roomName: string;
  customMessage?: string;
};

export function ScheduleChangedEmail({
  speakerName,
  eventName,
  logoUrl,
  sessionTitle,
  portalUrl,
  previousSchedule,
  scheduledTime,
  roomName,
  customMessage,
}: ScheduleChangedEmailProps) {
  return (
    <EmailLayout
      eventName={eventName}
      logoUrl={logoUrl}
      heading="Your session schedule changed"
      preview={`The schedule for “${sessionTitle}” at ${eventName} has changed.`}
    >
      <Greeting name={speakerName} />
      <Text style={paragraphStyle}>
        The time or room for “{sessionTitle}” has changed. Please use the new
        schedule below.
      </Text>
      <Section style={insetStyle}>
        <Text style={insetTitleStyle}>{sessionTitle}</Text>
        <Text style={insetMetaStyle}>
          New · {scheduledTime} · {roomName}
        </Text>
        {previousSchedule?.trim() ? (
          <Text style={insetMetaStyle}>Previously · {previousSchedule.trim()}</Text>
        ) : null}
      </Section>
      <CustomMessageBlock customMessage={customMessage} />
      <EmailButton href={portalUrl}>Review updated schedule</EmailButton>
    </EmailLayout>
  );
}

export default ScheduleChangedEmail;
