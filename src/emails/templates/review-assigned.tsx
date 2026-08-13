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

export type ReviewAssignedEmailProps = {
  speakerName?: string;
  eventName: string;
  logoUrl?: string;
  sessionTitle: string;
  portalUrl: string;
  assignmentCount: number;
  reviewDeadline?: string;
  customMessage?: string;
};

export function ReviewAssignedEmail({
  speakerName,
  eventName,
  logoUrl,
  sessionTitle,
  portalUrl,
  assignmentCount,
  reviewDeadline,
  customMessage,
}: ReviewAssignedEmailProps) {
  const assignmentLabel = `${assignmentCount} ${assignmentCount === 1 ? "submission" : "submissions"}`;

  return (
    <EmailLayout
      eventName={eventName}
      logoUrl={logoUrl}
      heading="Submissions are ready for review"
      preview={`${assignmentLabel} assigned to you for ${eventName}.`}
    >
      <Greeting name={speakerName} />
      <Text style={paragraphStyle}>
        You’ve been assigned {assignmentLabel} to review for {eventName}.
      </Text>
      <Section style={insetStyle}>
        <Text style={insetTitleStyle}>{assignmentLabel} assigned</Text>
        <Text style={insetMetaStyle}>
          {reviewDeadline?.trim()
            ? `Review by ${reviewDeadline.trim()}`
            : `Review round · ${sessionTitle}`}
        </Text>
      </Section>
      <CustomMessageBlock customMessage={customMessage} />
      <EmailButton href={portalUrl}>Open review queue</EmailButton>
    </EmailLayout>
  );
}

export default ReviewAssignedEmail;
