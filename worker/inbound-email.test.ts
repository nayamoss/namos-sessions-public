// @vitest-environment node
import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { handleResendInbound, handleSesInbound, verifySnsMessage } from "./inbound-email";

function environment() {
  return {
    CONVEX_SITE_URL: "https://convex.example.test",
    INBOUND_EMAIL_EDGE_SECRET: "edge-secret",
    RESEND_API_KEY: "re_test",
    RESEND_WEBHOOK_SIGNING_SECRET: `whsec_${Buffer.from("webhook-test-secret").toString("base64")}`,
    SES_INBOUND_SNS_TOPIC_ARN: "arn:aws:sns:us-east-1:123456789012:inbound",
  } as unknown as Env;
}

afterEach(() => vi.unstubAllGlobals());

describe("inbound email edge", () => {
  it("verifies a Resend webhook, retrieves attachment-free content, and forwards a normalized envelope", async () => {
    const env = environment();
    const payload = JSON.stringify({
      type: "email.received",
      created_at: new Date().toISOString(),
      data: { email_id: "email-1", created_at: new Date().toISOString(), from: "Ada <ada@example.test>", to: ["opaque@reply.example.test"], bcc: [], cc: [], message_id: "incoming-1", subject: "Re: Session", attachments: [] },
    });
    const id = "msg_test";
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = createHmac("sha256", Buffer.from("webhook-test-secret"))
      .update(`${id}.${timestamp}.${payload}`)
      .digest("base64");
    const forwarded: unknown[] = [];
    vi.stubGlobal("fetch", vi.fn(async (resource: string | URL | Request, init?: RequestInit) => {
      const url = String(resource);
      if (url.includes("api.resend.com/emails/receiving/email-1")) return Response.json({
        object: "email", id: "email-1", to: ["opaque@reply.example.test"], from: "Ada <ada@example.test>", created_at: new Date().toISOString(), subject: "Re: Session", bcc: null, cc: null, reply_to: null,
        html: null, text: "Here is my reply.", headers: { "in-reply-to": "<outbound-1>", references: "<older-1> <outbound-1>" }, message_id: "<incoming-1>", attachments: [],
      });
      if (url.includes("convex.example.test/internal/inbound-email")) {
        expect((init?.headers as Record<string, string>)["x-namos-edge-secret"]).toBe("edge-secret");
        forwarded.push(JSON.parse(String(init?.body)));
        return Response.json({ id: "inbound-1" }, { status: 202 });
      }
      return new Response(null, { status: 404 });
    }));
    const response = await handleResendInbound(new Request("https://app.example.test/api/webhooks/resend/inbound", { method: "POST", headers: { "svix-id": id, "svix-timestamp": timestamp, "svix-signature": `v1,${signature}` }, body: payload }), env);
    expect(response.status).toBe(204);
    expect(forwarded).toEqual([expect.objectContaining({ provider: "resend", recipient: "opaque@reply.example.test", fromEmail: "ada@example.test", inReplyTo: "<outbound-1>", references: ["<older-1>", "<outbound-1>"], text: "Here is my reply." })]);
  });

  it("rejects Resend requests whose signature is missing", async () => {
    const response = await handleResendInbound(new Request("https://app.example.test/api/webhooks/resend/inbound", { method: "POST", body: "{}" }), environment());
    expect(response.status).toBe(400);
  });

  it("normalizes a verified SES/SNS receipt and forwards no attachment data", async () => {
    const forwarded: unknown[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_resource: string | URL | Request, init?: RequestInit) => {
      forwarded.push(JSON.parse(String(init?.body)));
      return Response.json({ id: "inbound-2" }, { status: 202 });
    }));
    const notification = {
      notificationType: "Received",
      receipt: { recipients: ["opaque@reply.example.test"], timestamp: "2026-08-20T00:00:00Z" },
      mail: { timestamp: "2026-08-20T00:00:00Z", messageId: "ses-incoming-1", commonHeaders: { from: ["Ada <ada@example.test>"], to: ["opaque@reply.example.test"], subject: "Re: Session", messageId: "<ses-incoming-1>" } },
      content: "From: Ada <ada@example.test>\r\nTo: opaque@reply.example.test\r\nSubject: Re: Session\r\nMessage-ID: <ses-incoming-1>\r\nIn-Reply-To: <outbound-1>\r\nReferences: <older-1> <outbound-1>\r\n\r\nA concise reply.",
    };
    const sns = { Type: "Notification", MessageId: "sns-1", Message: JSON.stringify(notification), Timestamp: "2026-08-20T00:00:00Z", TopicArn: environment().SES_INBOUND_SNS_TOPIC_ARN, Signature: "signed", SignatureVersion: "2", SigningCertURL: "https://sns.us-east-1.amazonaws.com/SimpleNotificationService-test.pem" };
    const response = await handleSesInbound(new Request("https://app.example.test/api/webhooks/ses/inbound", { method: "POST", body: JSON.stringify(sns) }), environment(), async (message, topicArn) => message.Signature === "signed" && topicArn === environment().SES_INBOUND_SNS_TOPIC_ARN);
    expect(response.status).toBe(204);
    expect(forwarded).toEqual([expect.objectContaining({ provider: "ses", recipient: "opaque@reply.example.test", fromEmail: "ada@example.test", inReplyTo: "<outbound-1>", text: "A concise reply." })]);
  });

  it("rejects an SNS certificate URL outside the AWS SNS domain before fetching", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await verifySnsMessage({ Type: "Notification", Message: "{}", MessageId: "1", Timestamp: "2026-08-20T00:00:00Z", TopicArn: environment().SES_INBOUND_SNS_TOPIC_ARN, Signature: "x", SignatureVersion: "2", SigningCertURL: "https://attacker.example.test/cert.pem" }, environment().SES_INBOUND_SNS_TOPIC_ARN)).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("confirms a signed SNS subscription only through the exact trusted topic URL", async () => {
    const env = environment();
    const token = "subscription-token";
    const subscribeUrl = `https://sns.us-east-1.amazonaws.com/?Action=ConfirmSubscription&TopicArn=${encodeURIComponent(env.SES_INBOUND_SNS_TOPIC_ARN)}&Token=${token}`;
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const response = await handleSesInbound(new Request("https://app.example.test/api/webhooks/ses/inbound", {
      method: "POST",
      body: JSON.stringify({ Type: "SubscriptionConfirmation", Message: "Confirm", MessageId: "sns-confirm-1", SubscribeURL: subscribeUrl, Token: token, Timestamp: "2026-08-20T00:00:00Z", TopicArn: env.SES_INBOUND_SNS_TOPIC_ARN, Signature: "signed", SignatureVersion: "2", SigningCertURL: "https://sns.us-east-1.amazonaws.com/SimpleNotificationService-test.pem" }),
    }), env, async (message, expectedTopicArn) => message.Signature === "signed" && message.TopicArn === expectedTopicArn);
    expect(response.status).toBe(204);
    expect(fetchMock).toHaveBeenCalledWith(subscribeUrl, { method: "GET", redirect: "error" });
  });

  it("rejects unsigned SNS subscription confirmations", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const response = await handleSesInbound(new Request("https://app.example.test/api/webhooks/ses/inbound", {
      method: "POST",
      body: JSON.stringify({ Type: "SubscriptionConfirmation", TopicArn: environment().SES_INBOUND_SNS_TOPIC_ARN }),
    }), environment(), async () => false);
    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects signed SNS confirmations for another topic", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const response = await handleSesInbound(new Request("https://app.example.test/api/webhooks/ses/inbound", {
      method: "POST",
      body: JSON.stringify({ Type: "SubscriptionConfirmation", TopicArn: "arn:aws:sns:us-east-1:123456789012:other", Signature: "signed" }),
    }), environment(), async (message, expectedTopicArn) => message.TopicArn === expectedTopicArn);
    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a signed SNS confirmation with an untrusted SubscribeURL", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const response = await handleSesInbound(new Request("https://app.example.test/api/webhooks/ses/inbound", {
      method: "POST",
      body: JSON.stringify({ Type: "SubscriptionConfirmation", Message: "Confirm", MessageId: "sns-confirm-2", SubscribeURL: "https://attacker.example.test/confirm", Token: "token", Timestamp: "2026-08-20T00:00:00Z", TopicArn: environment().SES_INBOUND_SNS_TOPIC_ARN, Signature: "signed", SignatureVersion: "2", SigningCertURL: "https://sns.us-east-1.amazonaws.com/SimpleNotificationService-test.pem" }),
    }), environment(), async () => true);
    expect(response.status).toBe(422);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
