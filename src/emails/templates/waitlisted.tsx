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

export type WaitlistedEmailProps = {
  speakerName?: string;
  eventName: string;
  logoUrl?: string;
  sessionTitle: string;
  portalUrl: string;
  customMessage?: string;
};

export function WaitlistedEmail({
  speakerName,
  eventName,
  logoUrl,
  sessionTitle,
  portalUrl,
  customMessage,
}: WaitlistedEmailProps) {
  return (
    <EmailLayout
      eventName={eventName}
      logoUrl={logoUrl}
      heading="Your session is on the waitlist"
      preview={`“${sessionTitle}” is on the waitlist for ${eventName}.`}
    >
      <Greeting name={speakerName} />
      <Text style={paragraphStyle}>
        We’re not able to confirm “{sessionTitle}” for {eventName} yet, but it
        remains under consideration. We’ll contact you if space becomes
        available.
      </Text>
      <Section style={insetStyle}>
        <Text style={insetTitleStyle}>{sessionTitle}</Text>
        <Text style={insetMetaStyle}>Waitlisted · No action needed</Text>
      </Section>
      <CustomMessageBlock customMessage={customMessage} />
      <EmailButton href={portalUrl}>Review your submission</EmailButton>
    </EmailLayout>
  );
}

export default WaitlistedEmail;
