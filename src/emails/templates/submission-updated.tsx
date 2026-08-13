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

export type SubmissionUpdatedEmailProps = {
  speakerName?: string;
  eventName: string;
  logoUrl?: string;
  sessionTitle: string;
  portalUrl: string;
  changedFields?: string[];
  customMessage?: string;
};

export function SubmissionUpdatedEmail({
  speakerName,
  eventName,
  logoUrl,
  sessionTitle,
  portalUrl,
  changedFields = [],
  customMessage,
}: SubmissionUpdatedEmailProps) {
  const changeSummary = changedFields.length
    ? `Updated: ${changedFields.join(", ")}`
    : "Your latest changes were saved";

  return (
    <EmailLayout
      eventName={eventName}
      logoUrl={logoUrl}
      heading="Your submission was updated"
      preview={`Your changes to “${sessionTitle}” were saved for ${eventName}.`}
    >
      <Greeting name={speakerName} />
      <Text style={paragraphStyle}>
        We saved your changes to “{sessionTitle}” for {eventName}.
      </Text>
      <Section style={insetStyle}>
        <Text style={insetTitleStyle}>{sessionTitle}</Text>
        <Text style={insetMetaStyle}>{changeSummary}</Text>
      </Section>
      <CustomMessageBlock customMessage={customMessage} />
      <EmailButton href={portalUrl}>Review your submission</EmailButton>
    </EmailLayout>
  );
}

export default SubmissionUpdatedEmail;
