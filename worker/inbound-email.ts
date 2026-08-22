import { X509Certificate, verify as verifySignature } from "node:crypto";
import { Resend, type EmailReceivedEvent } from "resend";

type Provider = "resend" | "ses";

type InboundEnvelope = {
  provider: Provider;
  recipient: string;
  messageId: string;
  inReplyTo?: string;
  references: string[];
  fromEmail: string;
  subject: string;
  text: string;
  receivedAt: number;
};

type SnsMessage = Record<string, unknown> & {
  Type?: string;
  Message?: string;
  MessageId?: string;
  Subject?: string;
  Timestamp?: string;
  TopicArn?: string;
  Signature?: string;
  SignatureVersion?: string;
  SigningCertURL?: string;
};

const maxWebhookBytes = 512_000;

function jsonError(status: number, error: string) {
  return Response.json({ error }, { status, headers: { "cache-control": "no-store" } });
}

function firstAddress(value: string | string[] | null | undefined) {
  const input = Array.isArray(value) ? value[0] : value;
  if (!input) return "";
  return input.match(/<([^>]+)>/)?.[1]?.trim().toLowerCase() ?? input.trim().toLowerCase();
}

function splitMessageIds(value: string | undefined) {
  return value?.match(/<[^>]+>|[^\s,]+/g)?.map((item) => item.trim()).filter(Boolean) ?? [];
}

function getHeader(headers: Record<string, string> | null | undefined, name: string) {
  if (!headers) return undefined;
  const key = Object.keys(headers).find((candidate) => candidate.toLowerCase() === name.toLowerCase());
  return key ? headers[key] : undefined;
}

async function forwardToConvex(env: Env, envelope: InboundEnvelope) {
  const response = await fetch(`${env.CONVEX_SITE_URL.replace(/\/$/, "")}/internal/inbound-email`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-namos-edge-secret": env.INBOUND_EMAIL_EDGE_SECRET },
    body: JSON.stringify(envelope),
  });
  if (!response.ok) return jsonError(response.status === 401 ? 502 : response.status, "ingress_rejected");
  return new Response(null, { status: 204 });
}

export async function handleResendInbound(request: Request, env: Env) {
  if (request.method !== "POST") return new Response(null, { status: 405 });
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > maxWebhookBytes) return jsonError(413, "payload_too_large");
  const id = request.headers.get("svix-id");
  const timestamp = request.headers.get("svix-timestamp");
  const signature = request.headers.get("svix-signature");
  if (!id || !timestamp || !signature) return jsonError(400, "missing_signature");

  let event: EmailReceivedEvent;
  const resend = new Resend(env.RESEND_API_KEY);
  try {
    const verified = resend.webhooks.verify({ payload: raw, headers: { id, timestamp, signature }, webhookSecret: env.RESEND_WEBHOOK_SIGNING_SECRET });
    if (verified.type !== "email.received") return new Response(null, { status: 204 });
    event = verified;
  } catch {
    return jsonError(401, "invalid_signature");
  }

  const received = await resend.emails.receiving.get(event.data.email_id);
  if (received.error || !received.data) return jsonError(502, "email_fetch_failed");
  const email = received.data;
  const headers = email.headers;
  const recipient = firstAddress(email.to);
  const fromEmail = firstAddress(email.from);
  if (!recipient || !fromEmail || !email.message_id) return jsonError(422, "invalid_email");
  return forwardToConvex(env, {
    provider: "resend",
    recipient,
    messageId: email.message_id,
    inReplyTo: getHeader(headers, "in-reply-to"),
    references: splitMessageIds(getHeader(headers, "references")),
    fromEmail,
    subject: email.subject || "(No subject)",
    text: (email.text || "").slice(0, 20_000),
    receivedAt: Date.parse(email.created_at) || Date.now(),
  });
}

function trustedSnsCertificateUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:"
      && url.port === ""
      && /^sns(?:\.[a-z0-9-]+)?\.amazonaws\.com(?:\.cn)?$/i.test(url.hostname)
      && /^\/SimpleNotificationService-[A-Za-z0-9_-]+\.pem$/.test(url.pathname);
  } catch {
    return false;
  }
}

function trustedSnsSubscriptionUrl(value: string, expectedTopicArn: string, expectedToken: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:"
      && url.port === ""
      && /^sns(?:\.[a-z0-9-]+)?\.amazonaws\.com(?:\.cn)?$/i.test(url.hostname)
      && url.pathname === "/"
      && url.searchParams.get("Action") === "ConfirmSubscription"
      && url.searchParams.get("TopicArn") === expectedTopicArn
      && url.searchParams.get("Token") === expectedToken;
  } catch {
    return false;
  }
}

function snsFields(message: SnsMessage) {
  return message.Type === "Notification"
    ? ["Message", "MessageId", ...(typeof message.Subject === "string" ? ["Subject"] : []), "Timestamp", "TopicArn", "Type"]
    : ["Message", "MessageId", "SubscribeURL", "Timestamp", "Token", "TopicArn", "Type"];
}

export async function verifySnsMessage(message: SnsMessage, expectedTopicArn: string) {
  const certUrl = typeof message.SigningCertURL === "string" ? message.SigningCertURL : "";
  if (!trustedSnsCertificateUrl(certUrl) || message.TopicArn !== expectedTopicArn) return false;
  if (message.SignatureVersion !== "1" && message.SignatureVersion !== "2") return false;
  if (typeof message.Signature !== "string") return false;
  const fields = snsFields(message);
  if (fields.some((field) => typeof message[field] !== "string")) return false;
  const canonical = fields.map((field) => `${field}\n${String(message[field])}`).join("\n");
  const certificateResponse = await fetch(certUrl, { cf: { cacheTtl: 3600, cacheEverything: true } });
  if (!certificateResponse.ok) return false;
  const certificate = new X509Certificate(await certificateResponse.text());
  return verifySignature(
    message.SignatureVersion === "2" ? "RSA-SHA256" : "RSA-SHA1",
    new TextEncoder().encode(canonical),
    certificate.publicKey,
    Buffer.from(message.Signature, "base64"),
  );
}

function parseMime(raw: string) {
  const unfolded = raw.replace(/\r?\n[\t ]+/g, " ");
  const splitAt = unfolded.search(/\r?\n\r?\n/);
  const headerBlock = splitAt >= 0 ? unfolded.slice(0, splitAt) : unfolded;
  const body = splitAt >= 0 ? unfolded.slice(splitAt).replace(/^\r?\n\r?\n/, "") : "";
  const headers = Object.fromEntries(headerBlock.split(/\r?\n/).map((line) => {
    const colon = line.indexOf(":");
    return colon > 0 ? [line.slice(0, colon).trim().toLowerCase(), line.slice(colon + 1).trim()] : ["", ""];
  }).filter(([name]) => name));
  return { headers, body };
}

export async function handleSesInbound(
  request: Request,
  env: Env,
  verifier: (message: SnsMessage, expectedTopicArn: string) => Promise<boolean> = verifySnsMessage,
) {
  if (request.method !== "POST") return new Response(null, { status: 405 });
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > maxWebhookBytes) return jsonError(413, "payload_too_large");
  let sns: SnsMessage;
  try { sns = JSON.parse(raw) as SnsMessage; } catch { return jsonError(400, "invalid_json"); }
  if (!(await verifier(sns, env.SES_INBOUND_SNS_TOPIC_ARN))) return jsonError(401, "invalid_signature");
  if (sns.Type === "SubscriptionConfirmation") {
    const subscribeUrl = typeof sns.SubscribeURL === "string" ? sns.SubscribeURL : "";
    const token = typeof sns.Token === "string" ? sns.Token : "";
    if (!trustedSnsSubscriptionUrl(subscribeUrl, env.SES_INBOUND_SNS_TOPIC_ARN, token)) {
      return jsonError(422, "invalid_subscription_confirmation");
    }
    const confirmation = await fetch(subscribeUrl, { method: "GET", redirect: "error" });
    return confirmation.ok ? new Response(null, { status: 204 }) : jsonError(502, "subscription_confirmation_failed");
  }
  if (sns.Type !== "Notification" || typeof sns.Message !== "string") return new Response(null, { status: 204 });

  let notification: Record<string, unknown>;
  try { notification = JSON.parse(sns.Message) as Record<string, unknown>; } catch { return jsonError(422, "invalid_notification"); }
  if (notification.notificationType !== "Received") return new Response(null, { status: 204 });
  const mail = notification.mail as Record<string, unknown> | undefined;
  const common = mail?.commonHeaders as Record<string, unknown> | undefined;
  const receipt = notification.receipt as Record<string, unknown> | undefined;
  const recipients = receipt?.recipients as string[] | undefined;
  const mime = parseMime(typeof notification.content === "string" ? notification.content : "");
  const recipient = firstAddress(recipients?.[0] ?? (common?.to as string[] | undefined));
  const fromEmail = firstAddress((common?.from as string[] | undefined)?.[0] ?? mime.headers.from);
  const messageId = String(common?.messageId ?? mail?.messageId ?? mime.headers["message-id"] ?? "");
  if (!recipient || !fromEmail || !messageId) return jsonError(422, "invalid_email");
  return forwardToConvex(env, {
    provider: "ses",
    recipient,
    messageId,
    inReplyTo: mime.headers["in-reply-to"],
    references: splitMessageIds(mime.headers.references),
    fromEmail,
    subject: String(common?.subject ?? mime.headers.subject ?? "(No subject)"),
    text: mime.body.slice(0, 20_000),
    receivedAt: Date.parse(String(mail?.timestamp ?? receipt?.timestamp ?? sns.Timestamp)) || Date.now(),
  });
}
