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

export type DecisionDeclinedEmailProps = {
  speakerName?: string;
  eventName: string;
  logoUrl?: string;
  sessionTitle: string;
  portalUrl: string;
  customMessage?: string;
};

export function DecisionDeclinedEmail({
  speakerName,
  eventName,
  logoUrl,
  sessionTitle,
  portalUrl,
  customMessage,
}: DecisionDeclinedEmailProps) {
  return (
    <EmailLayout
      eventName={eventName}
      logoUrl={logoUrl}
      heading="An update on your submission"
      preview={`An update on “${sessionTitle}” for ${eventName}.`}
    >
      <Greeting name={speakerName} />
      <Text style={paragraphStyle}>
        Thank you for submitting “{sessionTitle}” to {eventName}. We are not
        able to include it in this program.
      </Text>
      <Section style={insetStyle}>
        <Text style={insetTitleStyle}>{sessionTitle}</Text>
        <Text style={insetMetaStyle}>Not selected for this program</Text>
      </Section>
      <CustomMessageBlock customMessage={customMessage} />
      <EmailButton href={portalUrl}>Review your submission</EmailButton>
    </EmailLayout>
  );
}

export default DecisionDeclinedEmail;
