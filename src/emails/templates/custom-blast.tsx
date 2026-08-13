import { Text } from "@react-email/components";
import {
  EmailButton,
  EmailLayout,
  Greeting,
  paragraphStyle,
} from "../components/email-layout";

export type CustomBlastEmailProps = {
  speakerName?: string;
  eventName: string;
  logoUrl?: string;
  sessionTitle: string;
  portalUrl: string;
  customMessage?: string;
  heading?: string;
};

export function CustomBlastEmail({
  speakerName,
  eventName,
  logoUrl,
  portalUrl,
  customMessage,
  heading = "An update from the organizing team",
}: CustomBlastEmailProps) {
  const message =
    customMessage?.trim() ||
    `The ${eventName} organizing team has shared an update with you.`;

  return (
    <EmailLayout
      eventName={eventName}
      heading={heading}
      logoUrl={logoUrl}
      preview={message}
    >
      <Greeting name={speakerName} />
      <Text style={messageStyle}>{message}</Text>
      <EmailButton href={portalUrl}>Open speaker portal</EmailButton>
    </EmailLayout>
  );
}

const messageStyle = {
  ...paragraphStyle,
  marginBottom: "24px",
  whiteSpace: "pre-wrap" as const,
};

export default CustomBlastEmail;
