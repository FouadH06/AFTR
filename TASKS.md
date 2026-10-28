# Tasks

## P1 Core infrastructure
- [x] Next.js + TS + Tailwind scaffold, env config, security headers
- [x] Supabase schema migration (all tables, constraints, indexes)
- [x] RLS on every table; privileged functions locked to service_role
- [x] Auth (email/password, confirmation callback), role model, super-admin bootstrap
- [ ] Create Supabase project and apply migration (blocked: needs your approval, Pro plan cost)

## P2 Public launch
- [x] Configurable brand (name, colors, logo, copy, socials, launch date)
- [x] Home: pre-launch mode / live-event mode, archive
- [x] Waitlist (validation, duplicates, rate limit, consent, IP hash)
- [x] Referral links, verified-only counting, self-referral flagging, reward approval
- [x] Personal waitlist page with WhatsApp share
- [x] Event page (lineup, FAQ, rules, hidden venue, countdown)

## P3 Event operations
- [x] Admin event CRUD with safe status transitions, Beirut time input
- [x] Ticket types/waves (price, qty, windows, limits, visibility, promo eligibility)
- [x] Capacity enforced across types
- [x] Expenses (budgeted/committed/paid), break-even, projected vs actual profit

## P4 Ticketing
- [x] Transactional reservation (no oversell), 15-min hold, idempotency key
- [x] Sandbox checkout (clearly labeled), provider interface, signed webhook route
- [x] Idempotent ticket issuance, refunds/cancels update tickets + commissions
- [x] HMAC QR tickets, download, order capability links, ticket email (Resend)
- [x] Scanner: camera QR, atomic check-in, result screens, manual lookup, offline banner

## P5 Growth
- [x] Promoters: links, codes, commissions (fixed + %), reversal, self-dealing block, dashboard
- [x] Promo codes (%/$, max uses, scope)
- [x] Marketing dashboard: growth, leaderboard, conversion, source/promoter revenue, UTM builder
- [x] CSV exports (consented waitlist, orders), audit log

## P6 Verification & deployment
- [x] Unit + SQL integration tests, typecheck, lint, build
- [ ] Apply migration to a real Supabase project; run the end-to-end flow there
- [ ] Vercel preview deployment (blocked: no Vercel access from this environment)
- [ ] Real payment provider integration (blocked: merchant credentials)
