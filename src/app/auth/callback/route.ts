import { NextResponse } from "next/server";
import { supabaseUser } from "@/lib/supabase/server";

export async function GET(req: Request) {
  const u = new URL(req.url);
  const code = u.searchParams.get("code");
  const next = u.searchParams.get("next") ?? "/account";
  if (code) await (await supabaseUser()).auth.exchangeCodeForSession(code);
  return NextResponse.redirect(new URL(next.startsWith("/") && !next.startsWith("//") ? next : "/account", u.origin));
}
