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

export type SpeakerTaskAssignedEmailProps = {
  speakerName?: string;
  eventName: string;
  logoUrl?: string;
  sessionTitle: string;
  portalUrl: string;
  taskTitle: string;
  dueDate?: string;
  customMessage?: string;
};

export function SpeakerTaskAssignedEmail({
  speakerName,
  eventName,
  logoUrl,
  sessionTitle,
  portalUrl,
  taskTitle,
  dueDate,
  customMessage,
}: SpeakerTaskAssignedEmailProps) {
  return (
    <EmailLayout
      eventName={eventName}
      logoUrl={logoUrl}
      heading="A speaker task was assigned"
      preview={`${taskTitle} is ready for “${sessionTitle}” at ${eventName}.`}
    >
      <Greeting name={speakerName} />
      <Text style={paragraphStyle}>
        The {eventName} organizing team assigned a new task for “{sessionTitle}.”
      </Text>
      <Section style={insetStyle}>
        <Text style={insetTitleStyle}>{taskTitle}</Text>
        <Text style={insetMetaStyle}>
          {dueDate?.trim() ? `Due ${dueDate.trim()}` : sessionTitle}
        </Text>
      </Section>
      <CustomMessageBlock customMessage={customMessage} />
      <EmailButton href={portalUrl}>Review task</EmailButton>
    </EmailLayout>
  );
}

export default SpeakerTaskAssignedEmail;
