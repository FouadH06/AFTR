import { Notice } from "@/components/ui";
import { isConfigured } from "@/lib/env";
import { supabaseAdmin } from "@/lib/supabase/server";
import { sha256 } from "@/lib/tokens";

export const dynamic = "force-dynamic";

export default async function Verify({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { t } = await searchParams;
  let ok = false;
  if (isConfigured() && t) {
    const { data } = await supabaseAdmin().from("waitlist_entries").update({ verified_at: new Date().toISOString(), verify_token_hash: null })
      .eq("verify_token_hash", sha256(t)).select("id");
    ok = !!data?.length;
  }
  return <div className="mx-auto max-w-xl p-6 py-16">{ok ? <Notice tone="ok">Email confirmed — your spot is locked in.</Notice> : <Notice>This link is invalid or was already used.</Notice>}</div>;
}
