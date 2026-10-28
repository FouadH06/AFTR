import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { env, isConfigured } from "@/lib/env";
import { supabaseAdmin, supabaseUser } from "@/lib/supabase/server";

export type Role = "super_admin" | "event_manager" | "finance" | "door_staff" | "promoter";
export type Session = { user: { id: string; email: string }; roles: { role: Role; event_id: string | null }[] };

export const getSession = cache(async (): Promise<Session | null> => {
  if (!isConfigured()) return null;
  const { data } = await (await supabaseUser()).auth.getUser(); // verifies the JWT with Supabase Auth
  const user = data.user;
  if (!user?.email) return null;
  const admin = supabaseAdmin();
  let { data: roles } = await admin.from("user_roles").select("role, event_id").eq("user_id", user.id);
  // Bootstrap: confirmed emails listed in SUPER_ADMIN_EMAILS become super admins.
  if (user.email_confirmed_at && env.superAdminEmails.includes(user.email.toLowerCase()) && !roles?.some((r) => r.role === "super_admin")) {
    await admin.from("user_roles").upsert({ user_id: user.id, role: "super_admin", event_id: null }, { onConflict: "user_id,role,event_id", ignoreDuplicates: true });
    roles = [...(roles ?? []), { role: "super_admin", event_id: null }];
  }
  return { user: { id: user.id, email: user.email.toLowerCase() }, roles: (roles ?? []) as Session["roles"] };
});

export function can(s: Session | null, roles: Role[], eventId?: string | null): boolean {
  return !!s?.roles.some((r) => r.role === "super_admin" || (roles.includes(r.role) && (!eventId || !r.event_id || r.event_id === eventId)));
}

export async function requireRole(roles: Role[], eventId?: string | null, next = "/admin"): Promise<Session> {
  const s = await getSession();
  if (!s) redirect(`/login?next=${encodeURIComponent(next)}`);
  if (!can(s, roles, eventId)) redirect("/forbidden");
  return s;
}

/** For server actions: throws instead of redirecting. */
export async function assertRole(roles: Role[], eventId?: string | null): Promise<Session> {
  const s = await getSession();
  if (!can(s, roles, eventId)) throw new Error("Not authorized");
  return s!;
}

export const STAFF_ROLES: Role[] = ["event_manager", "finance", "door_staff", "promoter"];
