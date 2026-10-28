// Unit tests for pure helpers. Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { ticketPayload, parseTicketPayload, verifyWebhook, webhookSignature, referralCode } from "../src/lib/tokens.ts";
import { beirutToUtc, utcToBeirutInput } from "../src/lib/time.ts";

const S = "x".repeat(40);
const id = "0f8fad5b-d9cb-469f-a165-70867728950e";

test("ticket QR payload round-trips and rejects forgeries", () => {
  const p = ticketPayload(S, id);
  assert.equal(parseTicketPayload(S, p), id);
  assert.equal(parseTicketPayload("y".repeat(40), p), null);
  assert.equal(parseTicketPayload(S, p.slice(0, -1) + (p.endsWith("A") ? "B" : "A")), null);
  assert.equal(parseTicketPayload(S, `AFTR1.${id.replace("0f", "1f")}.${p.split(".")[2]}`), null);
  assert.equal(parseTicketPayload(S, "garbage"), null);
});

test("webhook signature: valid, tampered, replayed outside tolerance", () => {
  const body = '{"a":1}', t = 1_700_000_000;
  const h = `t=${t},v1=${webhookSignature(S, t, body)}`;
  assert.ok(verifyWebhook(S, h, body, t + 10));
  assert.ok(!verifyWebhook(S, h, '{"a":2}', t + 10));
  assert.ok(!verifyWebhook(S, h, body, t + 3600));
  assert.ok(!verifyWebhook(S, null, body, t));
});

test("Beirut time conversion handles DST", () => {
  assert.equal(beirutToUtc("2026-01-15T22:00"), "2026-01-15T20:00:00.000Z"); // winter UTC+2
  assert.equal(beirutToUtc("2026-07-15T22:00"), "2026-07-15T19:00:00.000Z"); // summer UTC+3
  assert.equal(utcToBeirutInput("2026-07-15T19:00:00.000Z"), "2026-07-15T22:00");
  assert.equal(beirutToUtc(""), null);
});

test("referral codes", () => {
  const c = referralCode();
  assert.match(c, /^[A-Z2-9]{6}$/);
});
