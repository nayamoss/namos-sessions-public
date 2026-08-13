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

export type DecisionAcceptedEmailProps = {
  speakerName?: string;
  eventName: string;
  logoUrl?: string;
  sessionTitle: string;
  portalUrl: string;
  customMessage?: string;
};

export function DecisionAcceptedEmail({
  speakerName,
  eventName,
  logoUrl,
  sessionTitle,
  portalUrl,
  customMessage,
}: DecisionAcceptedEmailProps) {
  return (
    <EmailLayout
      eventName={eventName}
      logoUrl={logoUrl}
      heading="Your session has been accepted"
      preview={`“${sessionTitle}” has been accepted for ${eventName}.`}
    >
      <Greeting name={speakerName} />
      <Text style={paragraphStyle}>
        Great news — “{sessionTitle}” has been accepted for {eventName}.
      </Text>
      <Section style={insetStyle}>
        <Text style={insetTitleStyle}>{sessionTitle}</Text>
        <Text style={insetMetaStyle}>Accepted · Speaker tasks are ready</Text>
      </Section>
      <CustomMessageBlock customMessage={customMessage} />
      <EmailButton href={portalUrl}>Review session and tasks</EmailButton>
    </EmailLayout>
  );
}

export default DecisionAcceptedEmail;
