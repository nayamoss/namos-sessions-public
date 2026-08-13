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

export type SessionScheduledEmailProps = {
  speakerName?: string;
  eventName: string;
  logoUrl?: string;
  sessionTitle: string;
  portalUrl: string;
  scheduledTime: string;
  roomName: string;
  customMessage?: string;
};

export function SessionScheduledEmail({
  speakerName,
  eventName,
  logoUrl,
  sessionTitle,
  portalUrl,
  scheduledTime,
  roomName,
  customMessage,
}: SessionScheduledEmailProps) {
  return (
    <EmailLayout
      eventName={eventName}
      logoUrl={logoUrl}
      heading="Your session is scheduled"
      preview={`“${sessionTitle}” is scheduled for ${scheduledTime} in ${roomName}.`}
    >
      <Greeting name={speakerName} />
      <Text style={paragraphStyle}>
        We’ve assigned a time and room for “{sessionTitle}” at {eventName}.
      </Text>
      <Section style={insetStyle}>
        <Text style={insetTitleStyle}>{sessionTitle}</Text>
        <Text style={insetMetaStyle}>
          {scheduledTime} · {roomName}
        </Text>
      </Section>
      <CustomMessageBlock customMessage={customMessage} />
      <EmailButton href={portalUrl}>Review session schedule</EmailButton>
    </EmailLayout>
  );
}

export default SessionScheduledEmail;
