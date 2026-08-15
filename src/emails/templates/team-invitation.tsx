import { Text } from "@react-email/components";
import {
  EmailButton,
  EmailLayout,
  Greeting,
  paragraphStyle,
  secondaryTextStyle,
} from "../components/email-layout";

export type TeamInvitationEmailProps = {
  eventName: string;
  inviterEmail?: string;
  invitationUrl: string;
  role: "organizer" | "reviewer";
};

export function TeamInvitationEmail({ eventName, inviterEmail, invitationUrl, role }: TeamInvitationEmailProps) {
  const roleDescription = role === "organizer"
    ? "Organizers can manage event settings, program data, communications, and teammates."
    : "Reviewers can access the review work assigned to them for this event.";
  return (
    <EmailLayout
      eventName={eventName}
      heading={`Join the ${eventName} team`}
      preview={`You’ve been invited to help manage ${eventName}.`}
    >
      <Greeting />
      <Text style={paragraphStyle}>
        {inviterEmail?.trim() || "An event organizer"} invited you to join {eventName} as an {role}.
      </Text>
      <Text style={secondaryTextStyle}>
        Your access is limited to this event. {roleDescription}
      </Text>
      <EmailButton href={invitationUrl}>Join event team</EmailButton>
      <Text style={secondaryTextStyle}>
        Use this email address when you sign in or create your Namos Sessions account. Clerk invitation links expire after 30 days; an event organizer can resend a fresh link from the Event Team page.
      </Text>
    </EmailLayout>
  );
}

export default TeamInvitationEmail;
