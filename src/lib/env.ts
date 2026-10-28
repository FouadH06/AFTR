import "server-only";

export const env = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  siteUrl: (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, ""),
  signingSecret: process.env.TICKET_SIGNING_SECRET ?? "",
  sandboxPayments: process.env.PAYMENTS_SANDBOX === "true",
  sandboxWebhookSecret: process.env.SANDBOX_WEBHOOK_SECRET ?? "",
  resendKey: process.env.RESEND_API_KEY ?? "",
  emailFrom: process.env.EMAIL_FROM ?? "",
  superAdminEmails: (process.env.SUPER_ADMIN_EMAILS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean),
};

/** Names (never values) of required settings that are missing or invalid. */
export function missingConfig(): string[] {
  const m: string[] = [];
  if (!env.supabaseUrl) m.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!env.supabaseAnonKey) m.push("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  if (!env.serviceRoleKey) m.push("SUPABASE_SERVICE_ROLE_KEY");
  if (env.signingSecret.length < 32) m.push(`TICKET_SIGNING_SECRET (${env.signingSecret.length ? "shorter than 32 characters" : "missing"})`);
  return m;
}
export const isConfigured = () => missingConfig().length === 0;
