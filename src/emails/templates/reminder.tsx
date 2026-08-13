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

export type ReminderEmailProps = {
  speakerName?: string;
  eventName: string;
  logoUrl?: string;
  sessionTitle: string;
  portalUrl: string;
  taskTitle?: string;
  dueDate?: string;
  customMessage?: string;
};

export function ReminderEmail({
  speakerName,
  eventName,
  logoUrl,
  sessionTitle,
  portalUrl,
  taskTitle,
  dueDate,
  customMessage,
}: ReminderEmailProps) {
  const taskContext = taskTitle?.trim()
    ? `${taskTitle.trim()}${dueDate?.trim() ? ` is due ${dueDate.trim()}.` : "."}`
    : dueDate?.trim()
      ? `Your next speaker task is due ${dueDate.trim()}.`
      : "A speaker task is ready for your attention.";

  return (
    <EmailLayout
      eventName={eventName}
      logoUrl={logoUrl}
      heading="A reminder about your session"
      preview={`Action is needed for “${sessionTitle}” at ${eventName}.`}
    >
      <Greeting name={speakerName} />
      <Text style={paragraphStyle}>
        This is a reminder about “{sessionTitle}” for {eventName}.
      </Text>
      <Section style={insetStyle}>
        <Text style={insetTitleStyle}>{taskContext}</Text>
        <Text style={insetMetaStyle}>{sessionTitle}</Text>
      </Section>
      <CustomMessageBlock customMessage={customMessage} />
      <EmailButton href={portalUrl}>Review speaker tasks</EmailButton>
    </EmailLayout>
  );
}

export default ReminderEmail;
