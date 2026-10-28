import Link from "next/link";
import { saveEvent } from "@/app/actions/admin";
import { SubmitButton } from "@/components/client";
import { Field, StatusBadge } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { fmtDate } from "@/lib/time";
import { staffEvents } from "../lib";

export default async function EventsPage() {
  const s = await requireRole(["event_manager"]);
  const events = await staffEvents(s);
  return (
    <div className="space-y-6">
      <h1 className="h-display text-2xl">Events</h1>
      <div className="card overflow-x-auto">
        <table className="table"><thead><tr><th>Event</th><th>Date</th><th>Status</th><th>Capacity</th><th></th></tr></thead>
          <tbody>{events.map((e) => (
            <tr key={e.id}><td className="font-medium">{e.title}</td><td>{fmtDate(e.starts_at)}</td><td><StatusBadge s={e.status} /></td><td>{e.capacity}</td>
              <td className="space-x-2 text-right"><Link className="btn-ghost btn-sm" href={`/admin/events/${e.id}`}>Manage</Link>{e.status !== "draft" && <Link className="btn-ghost btn-sm" href={`/e/${e.slug}`}>View</Link>}</td></tr>
          ))}</tbody></table>
        {!events.length && <p className="p-3 text-sm text-muted">No events yet.</p>}
      </div>
      {s.roles.some((r) => r.role === "super_admin" || (r.role === "event_manager" && !r.event_id)) && (
        <form action={saveEvent} className="card grid max-w-2xl gap-3 sm:grid-cols-2">
          <h2 className="h-display text-lg sm:col-span-2">New event</h2>
          <div className="sm:col-span-2"><Field label="Title" name="title" required /></div>
          <Field label="Starts (Beirut time)" name="starts_at" type="datetime-local" required />
          <Field label="Ends (Beirut time)" name="ends_at" type="datetime-local" required />
          <Field label="Capacity" name="capacity" type="number" min={1} defaultValue={300} required />
          <Field label="Area (public)" name="area" defaultValue="Beirut" />
          <input type="hidden" name="status" value="draft" />
          <div className="sm:col-span-2"><SubmitButton>Create draft</SubmitButton></div>
        </form>
      )}
    </div>
  );
}
