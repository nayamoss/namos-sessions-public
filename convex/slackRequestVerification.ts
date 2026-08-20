export async function verifySlackRequestWeb(input: { rawBody: string; timestamp: string | null; signature: string | null; signingSecret: string; nowMs?: number }) {
  if (!input.timestamp || !input.signature || !/^\d+$/.test(input.timestamp)) return false;
  const seconds = Number(input.timestamp);
  if (!Number.isSafeInteger(seconds) || Math.abs(Math.floor((input.nowMs ?? Date.now()) / 1000) - seconds) > 300) return false;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(input.signingSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(`v0:${input.timestamp}:${input.rawBody}`)));
  const expected = `v0=${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
  const actual = input.signature;
  if (actual.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < expected.length; index += 1) difference |= expected.charCodeAt(index) ^ actual.charCodeAt(index);
  return difference === 0;
}

export async function sha256Hex(value: string) {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
