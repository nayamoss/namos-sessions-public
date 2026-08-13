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

export type SpeakerTaskCompletedEmailProps = {
  speakerName?: string;
  eventName: string;
  logoUrl?: string;
  sessionTitle: string;
  portalUrl: string;
  taskTitle: string;
  customMessage?: string;
};

export function SpeakerTaskCompletedEmail({
  speakerName,
  eventName,
  logoUrl,
  sessionTitle,
  portalUrl,
  taskTitle,
  customMessage,
}: SpeakerTaskCompletedEmailProps) {
  return (
    <EmailLayout
      eventName={eventName}
      logoUrl={logoUrl}
      heading="Your speaker task is complete"
      preview={`${taskTitle} was marked complete for ${eventName}.`}
    >
      <Greeting name={speakerName} />
      <Text style={paragraphStyle}>
        We recorded your completed task for “{sessionTitle}” at {eventName}.
      </Text>
      <Section style={insetStyle}>
        <Text style={insetTitleStyle}>{taskTitle}</Text>
        <Text style={insetMetaStyle}>Complete · {sessionTitle}</Text>
      </Section>
      <CustomMessageBlock customMessage={customMessage} />
      <EmailButton href={portalUrl}>View speaker tasks</EmailButton>
    </EmailLayout>
  );
}

export default SpeakerTaskCompletedEmail;
