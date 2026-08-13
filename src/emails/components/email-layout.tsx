import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import type { CSSProperties, ReactNode } from "react";

const colors = {
  background: "#FAFAFA",
  card: "#FFFFFF",
  foreground: "#171717",
  muted: "#E8E8E8",
  mutedForeground: "#737373",
  accent: "#0066FF",
} as const;

const fonts = {
  body: "Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  heading: "'Instrument Serif', Georgia, serif",
} as const;

export type EmailLayoutProps = {
  children: ReactNode;
  eventName: string;
  heading: string;
  logoUrl?: string;
  preview: string;
};

export type CustomMessageBlockProps = {
  customMessage?: string;
};

export function EmailLayout({
  children,
  eventName,
  heading,
  logoUrl,
  preview,
}: EmailLayoutProps) {
  return (
    <Html lang="en">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={bodyStyle}>
        <Container style={outerContainerStyle}>
          <Section style={wordmarkSectionStyle}>
            {logoUrl ? (
              <Img
                alt={eventName}
                src={logoUrl}
                style={eventLogoStyle}
              />
            ) : (
              <Text style={wordmarkStyle}>
                <span style={wordmarkMarkStyle}>N</span>
                Namos Sessions
              </Text>
            )}
          </Section>

          <Section style={cardStyle}>
            <Text style={eventLabelStyle}>{eventName}</Text>
            <Heading as="h1" style={headingStyle}>
              {heading}
            </Heading>
            {children}
          </Section>

          <Section style={footerStyle}>
            <Text style={footerTextStyle}>
              Sent by the {eventName} organizing team about your submission or
              speaker role.
            </Text>
            <Text style={footerTextStyle}>
              Namos Sessions · Conference program management
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export function Greeting({ name }: { name?: string }) {
  return (
    <Text style={paragraphStyle}>
      Hi{name?.trim() ? ` ${name.trim()}` : ""},
    </Text>
  );
}

export function CustomMessageBlock({ customMessage }: CustomMessageBlockProps) {
  if (!customMessage?.trim()) return null;

  return (
    <Section style={customMessageStyle}>
      <Text style={customMessageLabelStyle}>A note from the organizer</Text>
      <Text style={customMessageTextStyle}>{customMessage.trim()}</Text>
    </Section>
  );
}

export function EmailButton({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Section style={buttonSectionStyle}>
      <Button href={href} style={buttonStyle}>
        {children}
      </Button>
    </Section>
  );
}

export const paragraphStyle: CSSProperties = {
  color: colors.foreground,
  fontFamily: fonts.body,
  fontSize: "16px",
  lineHeight: "26px",
  margin: "0 0 20px",
};

export const secondaryTextStyle: CSSProperties = {
  ...paragraphStyle,
  color: colors.mutedForeground,
};

export const insetStyle: CSSProperties = {
  backgroundColor: "#F4F4F4",
  borderRadius: "8px",
  margin: "0 0 20px",
  padding: "16px 18px",
};

export const insetTitleStyle: CSSProperties = {
  color: colors.foreground,
  fontFamily: fonts.body,
  fontSize: "15px",
  fontWeight: 600,
  lineHeight: "22px",
  margin: "0",
};

export const insetMetaStyle: CSSProperties = {
  color: colors.mutedForeground,
  fontFamily: fonts.body,
  fontSize: "13px",
  lineHeight: "20px",
  margin: "4px 0 0",
};

export const accent = colors.accent;

const bodyStyle: CSSProperties = {
  backgroundColor: colors.background,
  color: colors.foreground,
  fontFamily: fonts.body,
  margin: 0,
  padding: "36px 12px",
};

const outerContainerStyle: CSSProperties = {
  margin: "0 auto",
  maxWidth: "600px",
  width: "100%",
};

const wordmarkSectionStyle: CSSProperties = {
  padding: "0 4px 18px",
};

const wordmarkStyle: CSSProperties = {
  color: colors.foreground,
  fontFamily: fonts.heading,
  fontSize: "24px",
  lineHeight: "30px",
  margin: 0,
};

const eventLogoStyle: CSSProperties = {
  display: "block",
  height: "auto",
  margin: 0,
  maxHeight: "48px",
  maxWidth: "180px",
};

const wordmarkMarkStyle: CSSProperties = {
  backgroundColor: colors.accent,
  borderRadius: "8px",
  color: colors.foreground,
  display: "inline-block",
  fontFamily: fonts.heading,
  fontSize: "18px",
  lineHeight: "28px",
  marginRight: "9px",
  textAlign: "center",
  width: "28px",
};

const cardStyle: CSSProperties = {
  backgroundColor: colors.card,
  borderRadius: "12px",
  padding: "38px 40px 34px",
};

const eventLabelStyle: CSSProperties = {
  color: colors.mutedForeground,
  fontFamily: fonts.body,
  fontSize: "12px",
  fontWeight: 600,
  letterSpacing: "0.08em",
  lineHeight: "18px",
  margin: "0 0 10px",
  textTransform: "uppercase",
};

const headingStyle: CSSProperties = {
  color: colors.foreground,
  fontFamily: fonts.heading,
  fontSize: "38px",
  fontWeight: 400,
  letterSpacing: "-0.01em",
  lineHeight: "44px",
  margin: "0 0 28px",
};

const customMessageStyle: CSSProperties = {
  backgroundColor: colors.muted,
  borderRadius: "8px",
  margin: "4px 0 24px",
  padding: "17px 18px",
};

const customMessageLabelStyle: CSSProperties = {
  color: colors.mutedForeground,
  fontFamily: fonts.body,
  fontSize: "11px",
  fontWeight: 600,
  letterSpacing: "0.08em",
  lineHeight: "16px",
  margin: "0 0 7px",
  textTransform: "uppercase",
};

const customMessageTextStyle: CSSProperties = {
  color: colors.foreground,
  fontFamily: fonts.body,
  fontSize: "15px",
  lineHeight: "24px",
  margin: 0,
  whiteSpace: "pre-wrap",
};

const buttonSectionStyle: CSSProperties = {
  margin: "0",
  padding: "2px 0 0",
};

const buttonStyle: CSSProperties = {
  backgroundColor: colors.accent,
  borderRadius: "8px",
  color: colors.foreground,
  display: "inline-block",
  fontFamily: fonts.body,
  fontSize: "15px",
  fontWeight: 600,
  lineHeight: "20px",
  padding: "13px 18px",
  textDecoration: "none",
};

const footerStyle: CSSProperties = {
  padding: "20px 6px 0",
};

const footerTextStyle: CSSProperties = {
  color: colors.mutedForeground,
  fontFamily: fonts.body,
  fontSize: "12px",
  lineHeight: "18px",
  margin: "0 0 4px",
};
