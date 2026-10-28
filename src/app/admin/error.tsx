"use client";
export default function AdminError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="card max-w-lg space-y-3">
      <h2 className="h-display text-lg text-bad">That didn&apos;t work</h2>
      <p className="text-sm text-muted">{process.env.NODE_ENV === "development" ? error.message : "The action was rejected — check your inputs and permissions. Details are in the server logs."}</p>
      <button className="btn-ghost btn-sm" onClick={reset}>Back</button>
    </div>
  );
}
