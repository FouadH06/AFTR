import { grantRole, revokeRole } from "@/app/actions/admin";
import { ConfirmButton, SubmitButton } from "@/components/client";
import { Field } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/server";

const ROLES = ["event_manager", "finance", "door_staff", "promoter", "super_admin"];

export default async function Team() {
  await requireRole([]);
  const db = supabaseAdmin();
  const [{ data: roles }, { data: events }, { data: users }] = await Promise.all([
    db.from("user_roles").select("*").order("created_at"),
    db.from("events").select("id, title").order("starts_at", { ascending: false }),
    db.auth.admin.listUsers({ perPage: 1000 }).then((r) => ({ data: r.data?.users ?? [] })),
  ]);
  const email = new Map(users.map((u) => [u.id, u.email]));
  return (
    <div className="space-y-6">
      <h1 className="h-display text-2xl">Team & roles</h1>
      <div className="card overflow-x-auto p-0">
        <table className="table"><thead><tr><th>User</th><th>Role</th><th>Scope</th><th></th></tr></thead>
          <tbody>{(roles ?? []).map((r) => (
            <tr key={r.id}><td>{email.get(r.user_id) ?? r.user_id}</td><td>{r.role}</td><td>{r.event_id ? events?.find((e) => e.id === r.event_id)?.title : "All events"}</td>
              <td><form action={revokeRole}><input type="hidden" name="id" value={r.id} /><ConfirmButton message="Revoke this role?">Revoke</ConfirmButton></form></td></tr>
          ))}</tbody></table>
      </div>
      <form action={grantRole} className="card grid max-w-3xl gap-3 sm:grid-cols-4">
        <h2 className="h-display text-lg sm:col-span-4">Grant role</h2>
        <div className="sm:col-span-2"><Field label="Account email" name="email" type="email" required hint="They must create an account at /login first" /></div>
        <label className="block"><span className="label">Role</span><select name="role" className="input">{ROLES.map((r) => <option key={r}>{r}</option>)}</select></label>
        <label className="block"><span className="label">Event scope</span><select name="event_id" className="input"><option value="">All events</option>{(events ?? []).map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}</select></label>
        <div className="sm:col-span-4"><SubmitButton>Grant</SubmitButton></div>
      </form>
    </div>
  );
}
