"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { getBrand } from "@/lib/brand";
import { emailConfigured, sendEmail } from "@/lib/email";
import { env, isConfigured, missingConfig } from "@/lib/env";
import { checkOrderKey, orderKey, orderUrl } from "@/lib/keys";
import { orderError, sendTicketEmail } from "@/lib/orders";
import { activeProvider, sandbox } from "@/lib/payments";
import { clientIpHash, getAttribution, rateLimit } from "@/lib/request";
import { supabaseAdmin, supabaseUser } from "@/lib/supabase/server";
import { randomToken, referralCode, sha256 } from "@/lib/tokens";

export type FormState = { error?: string; message?: string } | undefined;

function normalizePhone(raw: string) {
  let p = raw.replace(/[\s\-().]/g, "");
  if (p.startsWith("00")) p = "+" + p.slice(2);
  if (!p.startsWith("+") && /^0?\d{7,8}$/.test(p)) p = "+961" + p.replace(/^0/, ""); // local Lebanese format
  return p;
}
const phone = z.string().transform(normalizePhone).refine((p) => /^\+\d{8,15}$/.test(p), "Enter a valid phone number");
const checked = z.literal("on", { error: "Required" });

const waitlistSchema = z.object({
  full_name: z.string().trim().min(2, "Enter your name").max(80),
  email: z.email("Enter a valid email").trim().toLowerCase().max(120),
  phone,
  instagram: z.string().trim().max(31).regex(/^@?[A-Za-z0-9._]*$/, "Invalid Instagram username").transform((s) => s.replace(/^@/, "") || null),
  age: checked,
  privacy: checked,
  marketing: z.string().optional(),
  ref: z.string().trim().toUpperCase().max(12).optional(),
});

export async function joinWaitlist(_: FormState, fd: FormData): Promise<FormState> {
  if (!isConfigured()) return { error: "Signups are not open yet." };
  const parsed = waitlistSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const v = parsed.data;
  if (!(await rateLimit("waitlist", 5, 600))) return { error: "Too many attempts. Try again in a few minutes." };

  const db = supabaseAdmin();
  const [{ data: byEmail }, { data: byPhone }] = await Promise.all([
    db.from("waitlist_entries").select("id, email").eq("email", v.email).limit(1),
    db.from("waitlist_entries").select("id, email").eq("phone", v.phone).limit(1),
  ]);
  const existing = byEmail?.length ? byEmail : byPhone;
  if (existing?.length) {
    // Never reveal someone else's link. Rotate the access token and email it to the address on file.
    if (existing[0].email === v.email && emailConfigured() && (await rateLimit("waitlist-resend", 2, 3600, v.email))) {
      const t = randomToken();
      await db.from("waitlist_entries").update({ access_token_hash: sha256(t) }).eq("id", existing[0].id);
      await sendEmail(v.email, "Your early access link", ["You're already on the list. Here's your personal link."], { label: "Open my page", url: `${env.siteUrl}/waitlist/me?t=${t}` });
    }
    return { message: "You're already on the list. If email is enabled, we've sent your personal link to the address you signed up with." };
  }

  const attr = await getAttribution();
  const ipHash = await clientIpHash();
  const refCode = v.ref || attr.ref;
  let referredBy: string | null = null, flagged = false;
  if (refCode) {
    const { data: referrer } = await db.from("waitlist_entries").select("id, phone, ip_hash").eq("referral_code", refCode).maybeSingle();
    if (referrer) {
      referredBy = referrer.id;
      flagged = referrer.phone === v.phone || referrer.ip_hash === ipHash; // likely self-referral: stored, never counted
    }
  }

  const access = randomToken(), verify = randomToken();
  for (let attempt = 0; attempt < 4; attempt++) {
    const { error } = await db.from("waitlist_entries").insert({
      full_name: v.full_name, email: v.email, phone: v.phone, instagram: v.instagram, age_confirmed: true,
      marketing_consent: v.marketing === "on", referral_code: referralCode(), referred_by: referredBy, referral_flagged: flagged,
      access_token_hash: sha256(access), verify_token_hash: sha256(verify), source: attr.source ?? null, utm: attr.utm ?? {}, ip_hash: ipHash,
    });
    if (!error) break;
    if (error.code === "23505" && error.message.includes("referral_code")) continue;
    if (error.code === "23505") return { message: "You're already on the list." };
    return { error: "Could not save your signup. Please try again." };
  }
  const brand = await getBrand();
  await sendEmail(v.email, `Confirm your ${brand.name} early access`, [`Hi ${v.full_name}, confirm your email so your spot (and your referrals) count.`],
    { label: "Confirm my email", url: `${env.siteUrl}/waitlist/verify?t=${verify}` });
  redirect(`/waitlist/me?t=${access}&new=1`);
}

const buyerSchema = z.object({
  event_id: z.uuid(),
  full_name: z.string().trim().min(2, "Enter your full name").max(80),
  email: z.email("Enter a valid email").trim().toLowerCase().max(120),
  phone,
  promo: z.string().trim().max(24).optional(),
  idem: z.string().min(10).max(64),
  age: checked,
  terms: checked,
});

export async function buyTickets(_: FormState, fd: FormData): Promise<FormState> {
  const provider = isConfigured() ? activeProvider() : null;
  if (!provider) return { error: "Online ticket sales are not open yet." };
  const parsed = buyerSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const v = parsed.data;
  const items = [...fd.entries()]
    .filter(([k, val]) => k.startsWith("qty_") && Number(val) > 0)
    .map(([k, val]) => ({ ticket_type_id: k.slice(4), quantity: Math.floor(Number(val)) }));
  if (!items.length) return { error: "Pick at least one ticket." };
  if (!(await rateLimit("checkout", 10, 600))) return { error: "Too many attempts. Try again in a few minutes." };

  const session = await getSession();
  const attr = await getAttribution();
  const db = supabaseAdmin();
  const { data: orderId, error } = await db.rpc("create_order", {
    p_event: v.event_id, p_items: items, p_email: v.email, p_full_name: v.full_name, p_phone: v.phone, p_user: session?.user.id ?? null,
    p_promo: v.promo || null, p_promoter: attr.promoter ?? null, p_source: attr.source ?? null, p_utm: attr.utm ?? {},
    p_idempotency_key: v.idem, p_is_test: provider.isTest,
  });
  if (error || !orderId) return { error: orderError(error?.message ?? "") };

  const { data: order } = await db.from("orders").update({ provider: provider.id }).eq("id", orderId).eq("status", "pending").select("total_cents, status").single();
  if (order && order.total_cents === 0) {
    await db.rpc("confirm_payment", { p_order: orderId, p_provider: provider.id, p_txn: `free-${orderId}`, p_amount_cents: 0, p_fee_cents: 0, p_raw: { free: true } });
    await sendTicketEmail(orderId);
    redirect(orderUrl(orderId));
  }
  if (!order) redirect(orderUrl(orderId)); // idempotent re-submit of an already processed order
  const { redirectUrl } = await provider.startCheckout({ id: orderId, accessKey: orderKey(orderId) });
  redirect(redirectUrl);
}

/** Sandbox only: simulates the provider's server-side confirmation. Disabled unless PAYMENTS_SANDBOX=true. */
export async function sandboxPay(fd: FormData) {
  const id = String(fd.get("order_id")), k = String(fd.get("k")), outcome = String(fd.get("outcome"));
  if (!sandbox.configured() || !checkOrderKey(id, k)) throw new Error("Not allowed");
  const db = supabaseAdmin();
  const { data: o } = await db.from("orders").select("total_cents, provider, status").eq("id", id).single();
  if (!o || o.provider !== "sandbox") throw new Error("Not a sandbox order");
  if (outcome === "fail") {
    await db.rpc("fail_order", { p_order: id, p_reason: "Sandbox: simulated decline" });
  } else {
    const fee = Math.round((o.total_cents * (await getBrand()).processing_fee_pct) / 100);
    const { data } = await db.rpc("confirm_payment", { p_order: id, p_provider: "sandbox", p_txn: `sbx-${id}`, p_amount_cents: o.total_cents, p_fee_cents: fee, p_raw: { sandbox: true } });
    if (data === "paid") await sendTicketEmail(id);
  }
  redirect(orderUrl(id));
}

const authSchema = z.object({ email: z.email("Enter a valid email").trim().toLowerCase(), password: z.string().min(8, "Password must be at least 8 characters").max(72), next: z.string().optional() });
const safeNext = (n?: string) => (n && n.startsWith("/") && !n.startsWith("//") ? n : "/account");

export async function signIn(_: FormState, fd: FormData): Promise<FormState> {
  if (!isConfigured()) return { error: `Auth is not configured. Missing on the server: ${missingConfig().join(", ")}` };
  const p = authSchema.safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: p.error.issues[0].message };
  if (!(await rateLimit("login", 10, 600))) return { error: "Too many attempts. Try again later." };
  const { error } = await (await supabaseUser()).auth.signInWithPassword({ email: p.data.email, password: p.data.password });
  if (error) return { error: "Invalid email or password (or email not confirmed yet)." };
  redirect(safeNext(p.data.next));
}

export async function signUp(_: FormState, fd: FormData): Promise<FormState> {
  if (!isConfigured()) return { error: `Auth is not configured. Missing on the server: ${missingConfig().join(", ")}` };
  const p = authSchema.safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: p.error.issues[0].message };
  if (!(await rateLimit("signup", 5, 3600))) return { error: "Too many attempts. Try again later." };
  const { error } = await (await supabaseUser()).auth.signUp({ email: p.data.email, password: p.data.password, options: { emailRedirectTo: `${env.siteUrl}/auth/callback?next=${encodeURIComponent(safeNext(p.data.next))}` } });
  if (error) return { error: error.message };
  return { message: "Check your inbox to confirm your email, then sign in." };
}

export async function signOut() {
  await (await supabaseUser()).auth.signOut();
  redirect("/");
}
