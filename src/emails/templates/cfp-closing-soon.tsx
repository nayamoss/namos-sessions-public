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

export type CfpClosingSoonEmailProps = {
  speakerName?: string;
  eventName: string;
  logoUrl?: string;
  sessionTitle: string;
  portalUrl: string;
  closeDate: string;
  customMessage?: string;
};

export function CfpClosingSoonEmail({
  speakerName,
  eventName,
  logoUrl,
  sessionTitle,
  portalUrl,
  closeDate,
  customMessage,
}: CfpClosingSoonEmailProps) {
  return (
    <EmailLayout
      eventName={eventName}
      logoUrl={logoUrl}
      heading="The call for proposals closes soon"
      preview={`Finish “${sessionTitle}” before the ${eventName} CFP closes ${closeDate}.`}
    >
      <Greeting name={speakerName} />
      <Text style={paragraphStyle}>
        Your draft “{sessionTitle}” is not submitted yet. Complete it before
        the {eventName} call for proposals closes.
      </Text>
      <Section style={insetStyle}>
        <Text style={insetTitleStyle}>{sessionTitle}</Text>
        <Text style={insetMetaStyle}>CFP closes {closeDate}</Text>
      </Section>
      <CustomMessageBlock customMessage={customMessage} />
      <EmailButton href={portalUrl}>Finish your submission</EmailButton>
    </EmailLayout>
  );
}

export default CfpClosingSoonEmail;
