# Remaining work & honest status

## Completed and tested
These were tested on a local Postgres 16 (`npm run test:db`, 9 tests) and by unit tests (`npm test`, 4 tests):
- **Inventory:** 10 concurrent buyers competing for 3 tickets produce exactly 3 orders. Event capacity is enforced across ticket types, the per-order limit holds, and abandoned reservations release their stock.
- **Pricing:** prices come from the DB. A forged payment amount ends in `refund_required` and no tickets are issued.
- **Payment idempotency:** duplicate confirmations and duplicate transaction IDs issue no extra tickets. A failed payment releases its stock. A late payment re-checks stock first.
- **Scanning:** 8 simultaneous scans of one ticket admit it exactly once. Duplicate, wrong-event, cancelled/refunded, unknown-ticket and unauthorized-staff scans are all rejected.
- **Refunds and commissions:** a refund invalidates unused tickets and reverses the commission. A promoter's own purchase earns nothing. Promo code use limits hold.
- **RLS:** the anon role can't read orders, tickets, waitlist, payments, promo codes, audit logs, draft events or hidden venues, and can't call privileged functions.
- **Tokens and time:** QR token forgery is rejected, webhook signatures are checked with a replay window, Beirut DST conversion is correct, and the rate limiter works.
- **Build and smoke checks:** typecheck, lint and production build pass. An HTTP smoke test confirmed protected routes redirect to `/login`, forged order links show "Invalid", exports and downloads return 403 without a session, and security headers are set.

## Implemented but not yet tested end to end
These need a live Supabase project; Auth and PostgREST couldn't run here.
- The full browser flow: waitlist signup, referral page, admin login, event creation, sandbox purchase, QR, scan, second scan rejected.
- The sign-up/sign-in cookie flow and the super-admin bootstrap.
- Admin pages: dashboard KPIs, profitability, orders (refund/cancel/check-in/CSV), waitlist (verify/flag/reward approval), promoters, team, brand settings, audit log.
- The camera scanner on real phones (iOS Safari and Android Chrome).
- The webhook route (its HMAC logic is unit tested).

## Mock / demo behaviour
- **Sandbox payments** (`PAYMENTS_SANDBOX=true`). Every sandbox order and ticket is marked TEST, and admin revenue excludes them by default.
- **Projected profit** is an estimate: it assumes all inventory sells at list price. It is labeled that way in the UI.

## Waiting on you or external credentials
1. **Supabase project:** I didn't create one because your org is on the Pro plan and a new project adds cost. You can either:
   - approve creating an `aftr` project, or
   - create it yourself.

   Then apply `supabase/migrations/*.sql`.
2. **Vercel:** import the GitHub repo and set the env vars. Vercel was unreachable from this environment.
3. **Payment provider** (Whish, PayTabs, NetCommerce, …): needs a merchant account and official API docs. **No public paid launch until a provider is integrated and tested end to end.**
4. **Resend API key and a verified sending domain:** without them, no emails are sent and waitlist signups can't self-verify. Admins can mark entries verified manually in the meantime.
5. **Legal review:** the privacy page is a template, and age/venue rules need checking under Lebanese law.

## Deferred
- Arabic / RTL
- Offline scanning: deliberately not built; see the contingency procedure in the README
- Tier-based promoter bonuses and a sponsors table
- Password-reset UI (Supabase supports it)
- Image upload (artwork is set by https URL)
- Consent banner plus Meta/TikTok pixels; WhatsApp Business and email-marketing integrations
- Per-attendee name assignment on multi-ticket orders
- A per-event dashboard for staff with only event-scoped finance roles; this works but is minimal

## Known limitations
- Admin server-action errors appear as a generic error panel in production (details are in the server logs).
- The same-IP self-referral heuristic can flag friends on shared Wi-Fi. Admins can unflag them.
