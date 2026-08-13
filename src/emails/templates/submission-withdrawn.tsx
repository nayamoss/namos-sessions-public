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

export type SubmissionWithdrawnEmailProps = {
  speakerName?: string;
  eventName: string;
  logoUrl?: string;
  sessionTitle: string;
  portalUrl: string;
  customMessage?: string;
};

export function SubmissionWithdrawnEmail({
  speakerName,
  eventName,
  logoUrl,
  sessionTitle,
  portalUrl,
  customMessage,
}: SubmissionWithdrawnEmailProps) {
  return (
    <EmailLayout
      eventName={eventName}
      logoUrl={logoUrl}
      heading="Your submission was withdrawn"
      preview={`“${sessionTitle}” was withdrawn from ${eventName}.`}
    >
      <Greeting name={speakerName} />
      <Text style={paragraphStyle}>
        We’ve withdrawn “{sessionTitle}” from consideration for {eventName}. It
        will no longer be reviewed for this program.
      </Text>
      <Section style={insetStyle}>
        <Text style={insetTitleStyle}>{sessionTitle}</Text>
        <Text style={insetMetaStyle}>Submission withdrawn</Text>
      </Section>
      <CustomMessageBlock customMessage={customMessage} />
      <EmailButton href={portalUrl}>Open speaker portal</EmailButton>
    </EmailLayout>
  );
}

export default SubmissionWithdrawnEmail;
