import { Section, Text } from "@react-email/components";
import {
  CustomMessageBlock,
  EmailButton,
  EmailLayout,
  insetMetaStyle,
  insetStyle,
  insetTitleStyle,
  paragraphStyle,
} from "../components/email-layout";

export type AdminAlertType = "new" | "updated";

export type AdminAlertEmailProps = {
  speakerName?: string;
  eventName: string;
  logoUrl?: string;
  sessionTitle: string;
  portalUrl: string;
  alertType?: AdminAlertType;
  customMessage?: string;
};

export function AdminAlertEmail({
  speakerName,
  eventName,
  logoUrl,
  sessionTitle,
  portalUrl,
  alertType = "new",
  customMessage,
}: AdminAlertEmailProps) {
  const isUpdated = alertType === "updated";
  const submitter = speakerName?.trim() || "A speaker";

  return (
    <EmailLayout
      eventName={eventName}
      logoUrl={logoUrl}
      heading={
        isUpdated ? "A submission was updated" : "A new submission arrived"
      }
      preview={`${submitter} ${isUpdated ? "updated" : "submitted"} “${sessionTitle}”.`}
    >
      <Text style={paragraphStyle}>
        {submitter} {isUpdated ? "updated" : "submitted"} “{sessionTitle}” for{" "}
        {eventName}.
      </Text>
      <Section style={insetStyle}>
        <Text style={insetTitleStyle}>{sessionTitle}</Text>
        <Text style={insetMetaStyle}>
          {isUpdated ? "Submission updated" : "New submission"}
        </Text>
      </Section>
      <CustomMessageBlock customMessage={customMessage} />
      <EmailButton href={portalUrl}>Review submission</EmailButton>
    </EmailLayout>
  );
}

export default AdminAlertEmail;
