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

export type WaitlistPromotedEmailProps = {
  speakerName?: string;
  eventName: string;
  logoUrl?: string;
  sessionTitle: string;
  portalUrl: string;
  responseDeadline?: string;
  customMessage?: string;
};

export function WaitlistPromotedEmail({
  speakerName,
  eventName,
  logoUrl,
  sessionTitle,
  portalUrl,
  responseDeadline,
  customMessage,
}: WaitlistPromotedEmailProps) {
  return (
    <EmailLayout
      eventName={eventName}
      logoUrl={logoUrl}
      heading="Your session has been accepted"
      preview={`“${sessionTitle}” moved from the waitlist to accepted for ${eventName}.`}
    >
      <Greeting name={speakerName} />
      <Text style={paragraphStyle}>
        A place opened in the {eventName} program, and “{sessionTitle}” has
        moved from the waitlist to accepted.
      </Text>
      <Section style={insetStyle}>
        <Text style={insetTitleStyle}>{sessionTitle}</Text>
        <Text style={insetMetaStyle}>
          Accepted from waitlist
          {responseDeadline?.trim()
            ? ` · Respond by ${responseDeadline.trim()}`
            : " · Speaker tasks are ready"}
        </Text>
      </Section>
      <CustomMessageBlock customMessage={customMessage} />
      <EmailButton href={portalUrl}>Review session and tasks</EmailButton>
    </EmailLayout>
  );
}

export default WaitlistPromotedEmail;
