import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

const PROTECTED = ["/admin", "/staff", "/promoter", "/account"];
const UTM = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];

export async function middleware(req: NextRequest) {
  let res = NextResponse.next({ request: req });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Keep the Supabase session fresh on authenticated areas.
  if (url && key && PROTECTED.some((p) => req.nextUrl.pathname.startsWith(p))) {
    const supabase = createServerClient(url, key, {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (list) => {
          list.forEach(({ name, value }) => req.cookies.set(name, value));
          res = NextResponse.next({ request: req });
          list.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
        },
      },
    });
    await supabase.auth.getUser();
  }

  // First-party attribution cookie (UTM, promoter link ?p=, waitlist referral ?ref=). No third-party tracking.
  const sp = req.nextUrl.searchParams;
  const utm = Object.fromEntries(UTM.filter((k) => sp.get(k)).map((k) => [k, sp.get(k)!.slice(0, 80)]));
  const promoter = sp.get("p")?.slice(0, 24), ref = sp.get("ref")?.slice(0, 12);
  if (Object.keys(utm).length || promoter || ref) {
    let prev: Record<string, unknown> = {};
    try { prev = JSON.parse(req.cookies.get("aftr_attr")?.value ?? "{}"); } catch {}
    const next = { ...prev, ...(Object.keys(utm).length ? { utm, source: utm.utm_source } : {}), ...(promoter ? { promoter } : {}), ...(ref ? { ref } : {}) };
    res.cookies.set("aftr_attr", JSON.stringify(next), { maxAge: 60 * 60 * 24 * 30, httpOnly: true, sameSite: "lax", secure: req.nextUrl.protocol === "https:", path: "/" });
  }
  return res;
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|api/webhooks).*)"] };
