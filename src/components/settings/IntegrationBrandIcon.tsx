import { Bot } from "lucide-react";
import {
  siAirtable,
  siNotion,
  siResend,
  type SimpleIcon,
} from "simple-icons";
import { cn } from "@/lib/utils";

export type IntegrationProvider =
  | "airtable"
  | "amazon_ses"
  | "notion"
  | "operations_agent"
  | "resend"
  | "sanity";

type IconDefinition = {
  icon: SimpleIcon;
  iconClassName: string;
  surfaceClassName: string;
};

const iconDefinitions: Partial<Record<IntegrationProvider, IconDefinition>> = {
  resend: {
    icon: siResend,
    iconClassName: "text-foreground",
    surfaceClassName: "bg-zinc-100 dark:bg-zinc-800",
  },
  notion: {
    icon: siNotion,
    iconClassName: "text-foreground",
    surfaceClassName: "bg-stone-100 dark:bg-stone-800",
  },
  airtable: {
    icon: siAirtable,
    iconClassName: "text-[var(--icon-airtable-fg)]",
    surfaceClassName: "bg-[var(--icon-airtable-bg)]",
  },
};

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
    <svg viewBox="0 0 40 40" className="h-8 w-8" aria-hidden="true">
      <rect width="40" height="40" fill="#DD344C" />
      <path
        fill="#fff"
        d="M27.882 30.426c0-.814-.614-1.429-1.429-1.429-.814 0-1.428.615-1.428 1.429 0 .814.614 1.428 1.428 1.428.815 0 1.429-.614 1.429-1.428ZM20 30.14c-.827 0-1.5.641-1.5 1.429S19.173 33 20 33s1.5-.642 1.5-1.431-.673-1.429-1.5-1.429Zm-6.515-1.143c-.815 0-1.429.615-1.429 1.429 0 .814.614 1.428 1.429 1.428.814 0 1.428-.614 1.428-1.428 0-.814-.614-1.429-1.428-1.429Zm.474-7.936h12.082l-4.256-3.17-1.468 1.209a.5.5 0 0 1-.635 0l-1.468-1.208-4.255 3.169Zm-1.009-7.503v7.007l4.469-3.328-4.469-3.679ZM26.155 13H13.844l6.155 5.066L26.155 13Zm.895 7.566v-7.008l-4.47 3.679 4.47 3.329Zm1.832 9.86c0 1.362-1.066 2.428-2.429 2.428-1.362 0-2.428-1.066-2.428-2.428 0-1.19.814-2.154 1.928-2.378v-1.987H20.5v3.129c1.14.225 2 1.206 2 2.379C22.5 32.909 21.379 34 20 34s-2.5-1.091-2.5-2.431c0-1.173.861-2.154 2-2.379v-3.129h-5.515v1.987c1.114.224 1.928 1.188 1.928 2.378 0 1.362-1.066 2.428-2.428 2.428-1.363 0-2.429-1.066-2.429-2.428 0-1.19.814-2.154 1.929-2.378v-2.487a.5.5 0 0 1 .5-.5H19.5v-3H12.45a.5.5 0 0 1-.5-.5v-9.062a.5.5 0 0 1 .5-.5h15.1a.5.5 0 0 1 .5.5v9.062a.5.5 0 0 1-.5.5H20.5v3h5.953a.5.5 0 0 1 .5.5v2.487c1.115.224 1.929 1.188 1.929 2.378ZM34 19.999c0 2.737-.966 5.83-2.583 8.275l-.834-.552C32.074 25.469 33 22.51 33 19.999 33 12.831 27.169 7 20.001 7 12.832 7 7 12.831 7 19.999c0 2.505.926 5.465 2.417 7.724l-.834.551C6.966 25.824 6 22.73 6 19.999 6 12.28 12.28 6 19.999 6 27.719 6 34 12.28 34 19.999Z"
      />
    </svg>
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
      ? "bg-[var(--icon-ses-bg)]"
      : provider === "sanity"
        ? "bg-[var(--icon-sanity-bg)]"
      : provider === "operations_agent"
        ? "bg-[var(--icon-ops-agent-bg)]"
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
      ) : definition ? (
        <SimpleBrandMark definition={definition} />
      ) : null}
    </span>
  );
}
