import "server-only";
import { env } from "@/lib/env";

export const emailConfigured = () => Boolean(env.resendKey && env.emailFrom);

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Transactional email via Resend. No-op (returns false) until RESEND_API_KEY and EMAIL_FROM are set. */
export async function sendEmail(to: string, subject: string, lines: string[], cta?: { label: string; url: string }): Promise<boolean> {
  if (!emailConfigured()) return false;
  const html = `<div style="font-family:Arial,sans-serif;background:#08080B;color:#F5F5F7;padding:24px">${lines.map((l) => `<p>${esc(l)}</p>`).join("")}${
    cta ? `<p><a href="${esc(cta.url)}" style="background:#C6FF35;color:#08080B;padding:12px 18px;border-radius:999px;text-decoration:none;font-weight:bold">${esc(cta.label)}</a></p>` : ""}</div>`;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: env.emailFrom, to, subject, html, text: [...lines, cta?.url ?? ""].join("\n\n") }),
  }).catch(() => null);
  return !!res?.ok;
}
