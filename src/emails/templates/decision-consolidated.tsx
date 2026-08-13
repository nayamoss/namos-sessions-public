import { Section, Text } from "@react-email/components";
import type { CSSProperties } from "react";
import {
  CustomMessageBlock,
  EmailButton,
  EmailLayout,
  Greeting,
  accent,
  insetMetaStyle,
  insetStyle,
  insetTitleStyle,
  paragraphStyle,
} from "../components/email-layout";

export type ConsolidatedDecisionOutcome = "accepted" | "declined";

export type ConsolidatedDecisionItem = {
  sessionTitle: string;
  outcome: ConsolidatedDecisionOutcome;
};

export type DecisionConsolidatedEmailProps = {
  speakerName?: string;
  eventName: string;
  logoUrl?: string;
  sessionTitle: string;
  portalUrl: string;
  submissions: ConsolidatedDecisionItem[];
  customMessage?: string;
};

export function DecisionConsolidatedEmail({
  speakerName,
  eventName,
  logoUrl,
  portalUrl,
  submissions,
  customMessage,
}: DecisionConsolidatedEmailProps) {
  const acceptedCount = submissions.filter(
    ({ outcome }) => outcome === "accepted",
  ).length;
  const declinedCount = submissions.length - acceptedCount;

  return (
    <EmailLayout
      eventName={eventName}
      logoUrl={logoUrl}
      heading="Your submission decisions"
      preview={`Decisions for your ${submissions.length} submissions to ${eventName}.`}
    >
      <Greeting name={speakerName} />
      <Text style={paragraphStyle}>
        We’ve completed review of your submissions to {eventName}. Here is one
        clear summary of the outcomes.
      </Text>
      <Text style={summaryStyle}>
        {acceptedCount} accepted · {declinedCount} not selected
      </Text>
      {submissions.map((submission, index) => (
        <Section key={`${submission.sessionTitle}-${index}`} style={insetStyle}>
          <Text style={insetTitleStyle}>{submission.sessionTitle}</Text>
          <Text
            style={
              submission.outcome === "accepted"
                ? acceptedMetaStyle
                : insetMetaStyle
            }
          >
            {submission.outcome === "accepted"
              ? "Accepted"
              : "Not selected for this program"}
          </Text>
        </Section>
      ))}
      <CustomMessageBlock customMessage={customMessage} />
      <EmailButton href={portalUrl}>Review submissions and tasks</EmailButton>
    </EmailLayout>
  );
}

const summaryStyle: CSSProperties = {
  color: "#737373",
  fontFamily:
    "Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  fontSize: "13px",
  lineHeight: "20px",
  margin: "0 0 14px",
};

const acceptedMetaStyle: CSSProperties = {
  ...insetMetaStyle,
  color: "#171717",
  textDecorationColor: accent,
  textDecorationLine: "underline",
  textDecorationThickness: "3px",
  textUnderlineOffset: "4px",
};

export default DecisionConsolidatedEmail;
