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

export type ReviewReminderEmailProps = {
  speakerName?: string;
  eventName: string;
  logoUrl?: string;
  sessionTitle: string;
  portalUrl: string;
  remainingCount: number;
  reviewDeadline: string;
  customMessage?: string;
};

export function ReviewReminderEmail({
  speakerName,
  eventName,
  logoUrl,
  sessionTitle,
  portalUrl,
  remainingCount,
  reviewDeadline,
  customMessage,
}: ReviewReminderEmailProps) {
  const remainingLabel = `${remainingCount} ${remainingCount === 1 ? "review" : "reviews"}`;

  return (
    <EmailLayout
      eventName={eventName}
      logoUrl={logoUrl}
      heading="Your reviews are due soon"
      preview={`${remainingLabel} remain for ${eventName} before ${reviewDeadline}.`}
    >
      <Greeting name={speakerName} />
      <Text style={paragraphStyle}>
        You still have {remainingLabel} to complete for {eventName}.
      </Text>
      <Section style={insetStyle}>
        <Text style={insetTitleStyle}>{remainingLabel} remaining</Text>
        <Text style={insetMetaStyle}>
          Due {reviewDeadline} · {sessionTitle}
        </Text>
      </Section>
      <CustomMessageBlock customMessage={customMessage} />
      <EmailButton href={portalUrl}>Continue reviewing</EmailButton>
    </EmailLayout>
  );
}

export default ReviewReminderEmail;
