// Pure crypto helpers (no framework imports, so they can be unit tested with plain Node).
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function sign(secret: string, purpose: string, id: string): string {
  if (!secret || secret.length < 32) throw new Error("Signing secret missing or shorter than 32 chars");
  return createHmac("sha256", secret).update(`${purpose}:${id}`).digest("base64url").slice(0, 32);
}

export function verifySig(secret: string, purpose: string, id: string, sig: string | null | undefined): boolean {
  if (!sig) return false;
  const expected = Buffer.from(sign(secret, purpose, id));
  const given = Buffer.from(sig);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

// QR payload: AFTR1.<ticket uuid>.<hmac>. Contains no personal data; unforgeable without the server secret.
export const ticketPayload = (secret: string, ticketId: string) => `AFTR1.${ticketId}.${sign(secret, "ticket", ticketId)}`;

export function parseTicketPayload(secret: string, raw: string): string | null {
  const parts = raw.trim().split(".");
  if (parts.length !== 3 || parts[0] !== "AFTR1" || !UUID.test(parts[1])) return null;
  return verifySig(secret, "ticket", parts[1], parts[2]) ? parts[1].toLowerCase() : null;
}

export const randomToken = (bytes = 24) => randomBytes(bytes).toString("base64url");
export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function referralCode(len = 6): string {
  const b = randomBytes(len);
  return Array.from(b, (x) => CODE_ALPHABET[x % CODE_ALPHABET.length]).join("");
}

// Webhook signatures: header "t=<unix seconds>,v1=<hex hmac of `${t}.${body}`>"
export function webhookSignature(secret: string, t: number, body: string): string {
  return createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");
}

export function verifyWebhook(secret: string, header: string | null, body: string, nowSec = Math.floor(Date.now() / 1000), toleranceSec = 300): boolean {
  if (!secret || !header) return false;
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=", 2) as [string, string]));
  const t = Number(parts.t);
  if (!Number.isFinite(t) || Math.abs(nowSec - t) > toleranceSec || !parts.v1) return false;
  const expected = Buffer.from(webhookSignature(secret, t, body));
  const given = Buffer.from(parts.v1);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
