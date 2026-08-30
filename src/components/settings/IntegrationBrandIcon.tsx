import { AtSign, Bot, Mail, MessageSquare } from "lucide-react";
import { siAirtable, siNotion, siResend, type SimpleIcon } from "simple-icons";
import { cn } from "@/lib/utils";

export type IntegrationProvider =
  | "airtable"
  | "amazon_ses"
  | "notion"
  | "operations_agent"
  | "resend"
  | "sanity"
  | "slack";

type IconDefinition = {
  icon: SimpleIcon;
  iconClassName: string;
  surfaceClassName: string;
};

const iconDefinitions: Partial<Record<IntegrationProvider, IconDefinition>> = {
  resend: {
    icon: siResend,
    iconClassName: "text-foreground",
    surfaceClassName: "bg-muted",
  },
  notion: {
    icon: siNotion,
    iconClassName: "text-foreground",
    surfaceClassName: "bg-muted",
  },
  airtable: {
    icon: siAirtable,
    iconClassName: "text-[#0b91c9] dark:text-[#55d2ff]",
    surfaceClassName: "bg-muted",
  },
};

// Neither lucide-react (dropped all brand/logo icons in its 1.x major) nor simple-icons
// (dropped the Slack mark specifically) ships a Slack logo any more, so there's no verified
// SVG path to draw here. Stand in with a generic chat icon in Slack's brand purple until a
// real Slack mark source is picked — don't hand-copy path data for a trademarked logo from
// memory into this file.
function SlackMark() {
  return (
    <MessageSquare
      className="h-5 w-5 text-[#611f69] dark:text-[#e5b7ea]"
      fill="currentColor"
      strokeWidth={0}
      aria-hidden="true"
    />
  );
}

function SimpleBrandMark({ definition }: { definition: IconDefinition }) {
  const { icon } = definition;
  return (
    <svg viewBox="0 0 24 24" className={cn("h-5 w-5", definition.iconClassName)} aria-hidden="true">
      <path d={icon.path} fill="currentColor" />
    </svg>
  );
}

function AmazonSesMark() {
  return (
    <span className="relative flex h-7 w-7 items-center justify-center text-[#DD344C]" aria-hidden="true">
      <Mail className="h-6 w-6" strokeWidth={1.8} />
      <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-[#DD344C] text-white ring-2 ring-[#fff1f3] dark:ring-[#4d1820]">
        <AtSign className="h-2.5 w-2.5" strokeWidth={2.4} />
      </span>
    </span>
  );
}

/** The official Sanity "S" mark, drawn from Sanity's published logo artwork. */
function SanityMark() {
  return (
    <svg viewBox="0 0 55 72" className="h-7 w-6" aria-hidden="true">
      <path
        fill="#F04939"
        d="M6.9 9.5c0 9.5 5.9 15.2 17.7 18.2l12.5 2.9c11.2 2.6 18 9 18 19.4.1 4.5-1.4 8.9-4.1 12.5 0-10.4-5.4-16-18.3-19.4l-12.3-2.8c-9.9-2.2-17.5-7.5-17.5-18.8 0-4.3 1.4-8.6 4-12"
      />
      <path
        fill="#F37368"
        d="M43.3 47.4c5.3 3.4 7.7 8.2 7.7 15.1-4.5 5.7-12.2 8.8-21.3 8.8-15.3 0-26.2-7.6-28.5-20.7h14.7c1.9 6 6.9 8.8 13.7 8.8 8.1.1 13.6-4.3 13.7-12M14.6 23.6c-5-3-7.9-8.4-7.7-14.2 4.3-5.6 11.7-9 20.7-9 15.7 0 24.7 8.3 27 19.9H40.4c-1.6-4.6-5.5-8.2-12.6-8.2-7.7.1-12.9 4.5-13.2 11.5"
      />
    </svg>
  );
}

export function IntegrationBrandIcon({
  provider,
  size = "default",
  className,
}: {
  provider: IntegrationProvider;
  size?: "default" | "small";
  className?: string;
}) {
  const definition = iconDefinitions[provider];
  const surfaceClassName =
    provider === "amazon_ses"
      ? "bg-muted"
      : provider === "sanity"
        ? "bg-muted"
      : provider === "operations_agent"
        ? "bg-muted"
      : provider === "slack"
        ? "bg-muted"
        : definition?.surfaceClassName;

  return (
    <span
      data-integration-provider={provider}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-xl",
        size === "small" ? "h-8 w-8 rounded-lg" : "h-11 w-11",
        surfaceClassName,
        className,
      )}
      aria-hidden="true"
    >
      {provider === "amazon_ses" ? (
        <AmazonSesMark />
      ) : provider === "sanity" ? (
        <SanityMark />
      ) : provider === "operations_agent" ? (
        <Bot className={cn("text-primary", size === "small" ? "h-4 w-4" : "h-5 w-5")} />
      ) : provider === "slack" ? (
        <SlackMark />
      ) : definition ? (
        <SimpleBrandMark definition={definition} />
      ) : null}
    </span>
  );
}
