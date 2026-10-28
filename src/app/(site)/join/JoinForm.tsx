"use client";
import { useActionState } from "react";
import { joinWaitlist, type FormState } from "@/app/actions/public";
import { SubmitButton } from "@/components/client";

export function JoinForm({ refCode, minAge }: { refCode?: string; minAge: number }) {
  const [state, action] = useActionState<FormState, FormData>(joinWaitlist, undefined);
  if (state?.message) return <div className="card text-center"><p className="h-display text-lg text-accent">You&apos;re in.</p><p className="mt-2 text-sm text-muted">{state.message}</p></div>;
  return (
    <form action={action} className="card space-y-3">
      <input className="input" name="full_name" placeholder="Full name" required autoComplete="name" />
      <input className="input" name="email" type="email" placeholder="Email" required autoComplete="email" />
      <input className="input" name="phone" type="tel" placeholder="Phone (WhatsApp), e.g. 03 123 456" required autoComplete="tel" />
      <input className="input" name="instagram" placeholder="Instagram @username (optional)" />
      <input className="input" name="ref" placeholder="Referral code (optional)" defaultValue={refCode} autoCapitalize="characters" />
      <label className="flex gap-2 text-sm"><input type="checkbox" name="age" required /> I confirm I am {minAge} or older.</label>
      <label className="flex gap-2 text-sm"><input type="checkbox" name="privacy" required /> I agree to the <a href="/privacy" className="underline">privacy policy</a>.</label>
      <label className="flex gap-2 text-sm text-muted"><input type="checkbox" name="marketing" /> Send me event announcements by email/WhatsApp. Unsubscribe anytime.</label>
      {state?.error && <p className="text-sm text-bad" role="alert">{state.error}</p>}
      <SubmitButton className="btn-primary w-full" pendingText="Joining…">Get early access</SubmitButton>
    </form>
  );
}
