# AFTR — Project Plan

## 1. Product
A mobile-first brand site plus an operations platform for a Beirut party brand (300 → thousands of attendees). The core journey is **discover → join waitlist → announcement → buy → QR ticket → scan → wristband**. The brand name, colors, logo and copy are all configurable in the database (`brand_settings`). Nothing is hardcoded.

## 2. Architecture
- **Next.js 15 (App Router, TypeScript, Tailwind v4)**: server components by default, server actions for mutations. Client components are used only for interactive parts (buy form, scanner, countdown).
- **Supabase**: Postgres, Auth (email/password) and RLS. The browser holds only the anon key. All writes go through server code using the service role after a server-side role check. The critical operations are `SECURITY DEFINER` SQL functions:
  - `create_order`: inventory reservation under an event row lock, prices read from the DB.
  - `confirm_payment`: idempotent ticket issuance.
  - `close_order`: refund or cancel.
  - `scan_ticket`: atomic check-in.
- **QR tokens**: the payload is `AFTR1.<ticket uuid>.<HMAC-SHA256>`. Nothing secret is stored in the DB, the code can't be forged without `TICKET_SIGNING_SECRET`, and it contains no personal data.
- **Payments**: a `PaymentProvider` interface. Sandbox is implemented and clearly labeled. Whish, PayTabs and NetCommerce are stubbed as "not configured" and must be built from official merchant docs.
- **Email**: Resend over HTTPS. It is a no-op until a key is set.
- **Hosting**: Vercel (free tier) plus a Supabase project.
- **Deliberate simplifications**:
  - Lineup and FAQ are stored as JSON on `events`; there are no artists tables yet.
  - Reservations are pending orders with `expires_at`; there is no separate `inventory_reservations` table.
  - Charts are plain CSS bars; Recharts was skipped to keep the bundle small.
  - Plain forms with Zod are used instead of shadcn and React Hook Form, to keep dependencies minimal.

## 3. Database (supabase/migrations)
Tables:
- `brand_settings`, `profiles`, `user_roles` (role + optional event scope)
- `events`, `event_venues` (hidden by RLS until revealed), `ticket_types`
- `orders`, `order_items`, `payments`, `webhook_events`, `tickets`, `ticket_scans`
- `promoters`, `promo_codes`, `commission_records`
- `waitlist_entries`, `reward_grants`
- `event_expenses`, `audit_logs`, `rate_limits`

## 4. Roles
`super_admin`, `event_manager`, `finance`, `door_staff` and `promoter` can each be global or scoped to one event. A customer is any signed-in user with no role.

## 5. Routes
| Route | Purpose |
|---|---|
| `/` | Pre-launch hero, or the featured event when one is live; event archive |
| `/join`, `/waitlist/me?t=`, `/waitlist/verify?t=` | Waitlist, personal referral page, email verification |
| `/e/[slug]` | Event page and ticket purchase |
| `/checkout/[id]?k=` | Sandbox payment page |
| `/orders/[id]?k=` | Tickets with QR codes (signed link) |
| `/login`, `/account` | Sign in; the customer's own orders |
| `/staff/scanner` | Door scanner |
| `/promoter` | Promoter dashboard |
| `/admin/*` | Dashboard, events, orders, waitlist, marketing, promoters, team, brand, audit |
| `/api/webhooks/[provider]`, `/api/tickets/[id]`, `/api/export/[kind]` | Payment webhooks, QR download, CSV export |

## 6–8. MVP scope
**In the MVP:** priorities 1–5 from the brief:
- Branded site, waitlist, referrals and reward approval
- Events, ticket waves and promo codes
- Sandbox checkout, QR tickets and the scanner
- Refunds and cancels
- Dashboard KPIs and profitability
- Promoter commissions, a marketing dashboard with UTM tracking, CSV export and the audit log

**Deferred:**
- A real payment provider and its webhooks
- Arabic UI
- Offline scanning
- Tier-based promoter bonuses
- Password reset UI
- Sponsors
- An image upload UI (artwork is set by https URL)
- Third-party pixels behind a consent banner

## 9. Security
- RLS is enabled on every table, and no browser write policies exist.
- Privileged functions are revoked from `anon` and `authenticated`.
- The client never sees the service role key; `server-only` guards it at build time.
- All prices and inventory checks happen server-side.
- Idempotency keys for orders; `(provider, txn)` uniqueness on payments; webhook event dedupe and HMAC with a 5-minute window.
- Check-in is a conditional `UPDATE` (exactly one scan wins).
- Rate limiting is backed by the database and fails closed.
- Zod validation on all inputs; CSV exports are protected against formula injection.
- Security headers, `Referrer-Policy: no-referrer` (so capability links don't leak), and an audit log.

## 10. Testing
- `npm test`: unit tests for tokens, webhook signatures and Beirut DST handling.
- `npm run test:db`: SQL integration tests on a local Postgres 16 covering:
  - concurrent last-ticket purchases and abandoned reservations
  - idempotency, duplicate and forged payments
  - refunds and late payments
  - concurrent, duplicate, wrong-event, cancelled and unauthorized scans
  - promoter commissions and self-dealing
  - RLS
- `npm run typecheck`, `npm run lint` and `npm run build`.

## 11. Deployment
Push to GitHub, then:
1. Create the Supabase project and apply the migration.
2. Import the repo into Vercel and set the environment variables.
3. Deploy a preview.

Keep `PAYMENTS_SANDBOX=true` until a real provider is integrated and tested end to end. **No public paid launch before that.**

## 12. Budget
No billing API is available in this environment, so AI spend can't be measured. The work was done in one bounded, token-frugal pass:
- no subagents
- no alternative implementations
- minimal re-reading of files

## 13. Blockers (at time of writing)
- **Vercel:** no CLI or token, and the network blocks `api.vercel.com`. You need to import the repo yourself.
- **Supabase:** your org is on the Pro plan, so a new project costs money. I won't create it without your approval. The existing projects (`B2B`, `neat`) are unrelated to AFTR and were not touched.
- **Payment provider:** no merchant account or credentials yet.
- **Email:** no Resend key yet.

## 14. Acceptance criteria
See the brief's §25. Status for each item is tracked in `REMAINING_WORK.md`.
