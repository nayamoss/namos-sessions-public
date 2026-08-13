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
import { Section, Text } from "@react-email/components";

export type SubmissionConfirmationEmailProps = {
  speakerName?: string;
  eventName: string;
  logoUrl?: string;
  sessionTitle: string;
  portalUrl: string;
  customMessage?: string;
};

export function SubmissionConfirmationEmail({
  speakerName,
  eventName,
  logoUrl,
  sessionTitle,
  portalUrl,
  customMessage,
}: SubmissionConfirmationEmailProps) {
  return (
    <EmailLayout
      eventName={eventName}
      logoUrl={logoUrl}
      heading="We received your submission"
      preview={`We received “${sessionTitle}” for ${eventName}.`}
    >
      <Greeting name={speakerName} />
      <Text style={paragraphStyle}>
        Thanks for submitting “{sessionTitle}” to {eventName}. We’ll email you
        when there is an update.
      </Text>
      <Section style={insetStyle}>
        <Text style={insetTitleStyle}>{sessionTitle}</Text>
        <Text style={insetMetaStyle}>Submission received</Text>
      </Section>
      <CustomMessageBlock customMessage={customMessage} />
      <EmailButton href={portalUrl}>Review your submission</EmailButton>
    </EmailLayout>
  );
}

export default SubmissionConfirmationEmail;
