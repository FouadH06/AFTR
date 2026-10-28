import { requireRole } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/server";
import { fmtDateTime } from "@/lib/time";

export default async function Audit() {
  await requireRole([]);
  const { data } = await supabaseAdmin().from("audit_logs").select("*").order("created_at", { ascending: false }).limit(200);
  return (
    <div className="space-y-4">
      <h1 className="h-display text-2xl">Audit log</h1>
      <div className="card overflow-x-auto p-0"><table className="table"><thead><tr><th>When</th><th>Action</th><th>Entity</th><th>Actor</th><th>Data</th></tr></thead>
        <tbody>{(data ?? []).map((a) => <tr key={a.id}><td className="whitespace-nowrap text-xs">{fmtDateTime(a.created_at)}</td><td>{a.action}</td><td className="text-xs">{a.entity} {a.entity_id?.slice(0, 8)}</td><td className="font-mono text-xs">{a.actor_id?.slice(0, 8) ?? "system"}</td><td className="max-w-md truncate font-mono text-xs text-muted">{a.data ? JSON.stringify(a.data) : ""}</td></tr>)}</tbody></table></div>
    </div>
  );
}
