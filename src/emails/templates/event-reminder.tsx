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

export type EventReminderEmailProps = {
  speakerName?: string;
  eventName: string;
  logoUrl?: string;
  sessionTitle: string;
  portalUrl: string;
  scheduledTime: string;
  roomName?: string;
  venue?: string;
  arrivalTime?: string;
  customMessage?: string;
};

export function EventReminderEmail({
  speakerName,
  eventName,
  logoUrl,
  sessionTitle,
  portalUrl,
  scheduledTime,
  roomName,
  venue,
  arrivalTime,
  customMessage,
}: EventReminderEmailProps) {
  const location = [roomName, venue].filter(Boolean).join(" · ");

  return (
    <EmailLayout
      eventName={eventName}
      logoUrl={logoUrl}
      heading="Your event reminder"
      preview={`A reminder about “${sessionTitle}” at ${eventName}.`}
    >
      <Greeting name={speakerName} />
      <Text style={paragraphStyle}>
        {eventName} is approaching. Here are the current details for “
        {sessionTitle}.”
      </Text>
      <Section style={insetStyle}>
        <Text style={insetTitleStyle}>{sessionTitle}</Text>
        <Text style={insetMetaStyle}>{scheduledTime}</Text>
        {location ? <Text style={insetMetaStyle}>{location}</Text> : null}
        {arrivalTime?.trim() ? (
          <Text style={insetMetaStyle}>Please arrive by {arrivalTime.trim()}</Text>
        ) : null}
      </Section>
      <CustomMessageBlock customMessage={customMessage} />
      <EmailButton href={portalUrl}>Review event details</EmailButton>
    </EmailLayout>
  );
}

export default EventReminderEmail;
