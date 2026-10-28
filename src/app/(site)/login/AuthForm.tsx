"use client";
import { useActionState, useState } from "react";
import { signIn, signUp, type FormState } from "@/app/actions/public";
import { SubmitButton } from "@/components/client";

export function AuthForm({ next }: { next?: string }) {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [inState, inAction] = useActionState<FormState, FormData>(signIn, undefined);
  const [upState, upAction] = useActionState<FormState, FormData>(signUp, undefined);
  const state = mode === "in" ? inState : upState;
  return (
    <form action={mode === "in" ? inAction : upAction} className="card space-y-3">
      <div className="grid grid-cols-2 gap-1 rounded-full bg-surface-2 p-1 text-sm">
        {(["in", "up"] as const).map((m) => <button key={m} type="button" onClick={() => setMode(m)} className={`rounded-full py-2 ${mode === m ? "bg-fg text-bg" : "text-muted"}`}>{m === "in" ? "Sign in" : "Create account"}</button>)}
      </div>
      <input type="hidden" name="next" value={next ?? ""} />
      <input className="input" name="email" type="email" placeholder="Email" required autoComplete="email" />
      <input className="input" name="password" type="password" placeholder="Password (8+ characters)" required minLength={8} autoComplete={mode === "in" ? "current-password" : "new-password"} />
      {state?.error && <p className="text-sm text-bad" role="alert">{state.error}</p>}
      {state?.message && <p className="text-sm text-ok">{state.message}</p>}
      <SubmitButton className="btn-primary w-full">{mode === "in" ? "Sign in" : "Create account"}</SubmitButton>
      <p className="text-xs text-muted">Use the same email you bought tickets with to see them here.</p>
    </form>
  );
}
