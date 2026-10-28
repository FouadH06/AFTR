import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { env } from "@/lib/env";

/** Acts as the signed-in user (RLS applies). */
export async function supabaseUser() {
  const store = await cookies();
  return createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try { list.forEach(({ name, value, options }) => store.set(name, value, options)); } catch { /* called from a Server Component */ }
      },
    },
  });
}

/** Anonymous reads of public data (RLS applies). */
export const supabasePublic = () => createClient(env.supabaseUrl, env.supabaseAnonKey, { auth: { persistSession: false } });

/** Service role: bypasses RLS. Only call after server-side authorization. Never import from client code. */
export const supabaseAdmin = () =>
  createClient(env.supabaseUrl, env.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
