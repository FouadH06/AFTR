# AFTR — party & event platform

Next.js 15 + Supabase. It covers the brand site, waitlist with referrals, ticket waves, sandbox checkout, QR tickets, the door scanner, an admin and finance dashboard, and promoters. See `PROJECT_PLAN.md` for the architecture and `REMAINING_WORK.md` for current status.

## Local development
```bash
npm install
cp .env.example .env.local   # fill in values (see below)
npm run dev                  # http://localhost:3000
```
Without Supabase env vars, the public site renders with the default brand and protected areas show "Setup required".

## Environment variables
See `.env.example`.
- **Required:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (server only), `TICKET_SIGNING_SECRET` (32+ random chars; rotating it invalidates every issued QR code), `NEXT_PUBLIC_SITE_URL`.
- **Optional:** `SUPER_ADMIN_EMAILS`, `PAYMENTS_SANDBOX`, `SANDBOX_WEBHOOK_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM`.

## Supabase setup
1. Create a project (choose an EU region close to Lebanon, e.g. `eu-central-1`).
2. Apply the migrations in `supabase/migrations/` in order. Either:
   - `npx supabase link --project-ref <ref> && npx supabase db push`, or
   - paste the SQL into the SQL editor.
3. Under Auth → Providers → Email, keep **Confirm email ON**. The account page relies on confirmed emails to show orders bought with that email.
4. Under Auth → URL configuration, set the Site URL to your deployment URL and add `<site>/auth/callback` to the redirect URLs.

Never edit the production schema by hand. Add a new migration file instead.

## Admin initialisation
1. Set `SUPER_ADMIN_EMAILS=you@example.com`.
2. Create an account at `/login` and confirm the email.
3. Sign in. You'll be granted `super_admin` automatically.
4. Grant other roles at **/admin/team**: event_manager, finance, door_staff or promoter, either globally or scoped to one event. People need an account first.

## Running a first event
1. Go to **/admin/events**, create a draft, then fill in details, venue, lineup and FAQ.
2. Add ticket types/waves (price, quantity, sale window, per-order limit).
3. Add expenses. Break-even and profit appear on **/admin**.
4. Move the status to `waitlist` (teaser), then `announced` (home page features it), then `on_sale`.
5. Before doors open, cancel sandbox test orders: Events → event → "Cancel all test orders".

## Payments
`src/lib/payments/index.ts` defines the `PaymentProvider` interface. Only **sandbox** is implemented. It's clearly labeled; test tickets are marked TEST everywhere and flagged on the scanner.

To add a real Lebanese provider (Whish, PayTabs, NetCommerce, …):
1. Get a merchant account and its **official** API docs.
2. Implement `startCheckout` and `refund`.
3. Add webhook verification in `src/app/api/webhooks/[provider]/route.ts`, then call `confirm_payment` (it's idempotent).
4. Test end to end in the provider's test mode, then set `PAYMENTS_SANDBOX=false`.

**Do not launch paid sales publicly before this is done.**

The sandbox webhook expects the header `x-signature: t=<unix>,v1=<hex HMAC-SHA256(secret, "<t>.<body>")>` and the body `{id, order_id, status: "paid"|"failed", txn_id, amount_cents, fee_cents}`.

## Door scanner (/staff/scanner)
- Sign in as door_staff, choose the event, then tap **Start camera** and scan.
- **Green VALID — ADMIT:** attach a wristband. **Red ALREADY USED:** do not admit. **Orange:** wrong event, cancelled, invalid, or no result.
- Check-in is atomic on the server, so two phones scanning the same ticket at the same moment admit it exactly once.
- **Offline policy:** the scanner shows a red OFFLINE banner, and offline scans are never admitted. Bring a backup 4G hotspot. If the network is down, a supervisor uses the manual lookup (scanner → Manual lookup, or /admin/orders → Check in) once connectivity returns. Don't run independent offline devices.
- If the camera permission is denied, enable it in the browser settings or use manual lookup.

## Testing
```bash
npm test             # unit tests (QR token, webhook signature, Beirut DST)
npm run test:db      # SQL integration tests on a throwaway local Postgres 16
npm run typecheck && npm run lint && npm run build
```

## Deploying on Vercel (free tier)
1. Import the GitHub repo in Vercel.
2. Add the environment variables for Preview and Production.
3. Deploy, using the generated `*.vercel.app` domain.
4. Set `NEXT_PUBLIC_SITE_URL` to that URL and redeploy.
5. Update the Supabase Auth URLs to match.
