import "server-only";
import { cookies, headers } from "next/headers";
import { sha256 } from "@/lib/tokens";
import { env } from "@/lib/env";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function clientIpHash(): Promise<string> {
  const h = await headers();
  const ip = h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  return sha256(`${env.signingSecret}:${ip}`).slice(0, 32);
}

/** Returns true if allowed. Fails closed if the limiter itself errors. */
export async function rateLimit(bucket: string, limit: number, windowSeconds: number, key?: string): Promise<boolean> {
  const k = `${bucket}:${key ?? (await clientIpHash())}`;
  const { data, error } = await supabaseAdmin().rpc("hit_rate_limit", { p_key: k, p_limit: limit, p_window_seconds: windowSeconds });
  return !error && data === true;
}

export type Attribution = { utm?: Record<string, string>; promoter?: string; ref?: string; source?: string };
export async function getAttribution(): Promise<Attribution> {
  try { return JSON.parse((await cookies()).get("aftr_attr")?.value ?? "{}"); } catch { return {}; }
}
