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

export type PostEventThanksEmailProps = {
  speakerName?: string;
  eventName: string;
  logoUrl?: string;
  sessionTitle: string;
  portalUrl: string;
  feedbackDeadline?: string;
  customMessage?: string;
};

export function PostEventThanksEmail({
  speakerName,
  eventName,
  logoUrl,
  sessionTitle,
  portalUrl,
  feedbackDeadline,
  customMessage,
}: PostEventThanksEmailProps) {
  return (
    <EmailLayout
      eventName={eventName}
      logoUrl={logoUrl}
      heading="Thank you for speaking"
      preview={`Thank you for sharing “${sessionTitle}” at ${eventName}.`}
    >
      <Greeting name={speakerName} />
      <Text style={paragraphStyle}>
        Thank you for sharing “{sessionTitle}” with the {eventName} community.
        Your time and preparation helped make the program possible.
      </Text>
      <Section style={insetStyle}>
        <Text style={insetTitleStyle}>{sessionTitle}</Text>
        <Text style={insetMetaStyle}>
          Speaker follow-up
          {feedbackDeadline?.trim()
            ? ` · Feedback requested by ${feedbackDeadline.trim()}`
            : " · Feedback requested"}
        </Text>
      </Section>
      <CustomMessageBlock customMessage={customMessage} />
      <EmailButton href={portalUrl}>Share feedback</EmailButton>
    </EmailLayout>
  );
}

export default PostEventThanksEmail;
