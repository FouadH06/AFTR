-- AFTR core schema: events, ticketing, waitlist, promoters, finance, audit.
-- Security model: RLS is enabled on every table. Browsers (anon/authenticated keys) can only
-- read public or own rows. All writes go through Next.js server code using the service role,
-- after server-side authorization, mostly via the SECURITY DEFINER functions below.

create extension if not exists citext;
create extension if not exists pgcrypto;

create type app_role as enum ('super_admin','event_manager','finance','door_staff','promoter');
create type event_status as enum ('draft','waitlist','announced','on_sale','sold_out','completed','cancelled');
create type order_status as enum ('pending','paid','failed','cancelled','expired','refunded','refund_required');
create type ticket_status as enum ('valid','used','cancelled','refunded');
create type commission_status as enum ('pending','approved','reversed','paid');

create or replace function set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- Brand (singleton) -----------------------------------------------------------
create table brand_settings (
  id int primary key default 1 check (id = 1),
  name text not null default 'AFTR' check (length(name) between 1 and 40),
  hero_headline text not null default 'THE NIGHT IS LOADING.',
  tagline text not null default 'Something different is coming to Beirut.',
  primary_color text not null default '#C6FF35' check (primary_color ~ '^#[0-9A-Fa-f]{6}$'),
  secondary_color text not null default '#A855F7' check (secondary_color ~ '^#[0-9A-Fa-f]{6}$'),
  logo_url text check (logo_url is null or logo_url ~ '^https://'),
  instagram_url text check (instagram_url is null or instagram_url ~ '^https://'),
  tiktok_url text check (tiktok_url is null or tiktok_url ~ '^https://'),
  contact_email text,
  launch_at timestamptz,
  min_age int not null default 18 check (min_age between 0 and 99),
  referral_tiers jsonb not null default
    '[{"threshold":3,"label":"Priority access"},{"threshold":5,"label":"Discount eligibility"},{"threshold":10,"label":"Complimentary ticket eligibility"}]',
  processing_fee_pct numeric(5,2) not null default 0 check (processing_fee_pct between 0 and 100),
  updated_at timestamptz not null default now()
);
insert into brand_settings default values;
create trigger brand_settings_updated before update on brand_settings for each row execute function set_updated_at();

-- Users -----------------------------------------------------------------------
create table profiles (
  id uuid primary key references auth.users on delete cascade,
  full_name text,
  phone text,
  created_at timestamptz not null default now()
);

create or replace function handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, full_name) values (new.id, new.raw_user_meta_data->>'full_name') on conflict do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function handle_new_user();

-- Events ----------------------------------------------------------------------
create table events (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null check (length(title) between 1 and 120),
  description text not null default '',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  venue_public boolean not null default false,
  area text,                       -- coarse public location, e.g. "Beirut"
  capacity int not null check (capacity > 0),
  age_policy text not null default '18+ with valid ID',
  dress_code text,
  artwork_url text check (artwork_url is null or artwork_url ~ '^https://'),
  status event_status not null default 'draft',
  sales_start_at timestamptz,
  sales_end_at timestamptz,
  refund_policy text not null default 'Tickets are non-refundable unless the event is cancelled.',
  rules text,
  faq jsonb not null default '[]',
  lineup jsonb not null default '[]',
  links jsonb not null default '{}',
  recap text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create trigger events_updated before update on events for each row execute function set_updated_at();

-- Venue details live in their own table so RLS can hide them until the admin reveals them.
create table event_venues (
  event_id uuid primary key references events on delete cascade,
  venue_name text,
  address text,
  map_url text check (map_url is null or map_url ~ '^https://')
);

create table ticket_types (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events on delete cascade,
  name text not null,
  description text,
  price_cents int not null check (price_cents >= 0),
  quantity int not null check (quantity > 0),
  sale_starts_at timestamptz,
  sale_ends_at timestamptz,
  visible boolean not null default true,
  per_order_limit int not null default 6 check (per_order_limit between 1 and 50),
  promo_eligible boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on ticket_types (event_id);
create trigger ticket_types_updated before update on ticket_types for each row execute function set_updated_at();

create table user_roles (
  id bigserial primary key,
  user_id uuid not null references auth.users on delete cascade,
  role app_role not null,
  event_id uuid references events on delete cascade, -- null = all events
  created_at timestamptz not null default now(),
  unique nulls not distinct (user_id, role, event_id)
);

-- Promoters & promo codes -----------------------------------------------------
create table promoters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users on delete set null,
  name text not null,
  code citext not null unique check (code ~ '^[A-Za-z0-9_-]{3,24}$'),
  commission_fixed_cents int not null default 0 check (commission_fixed_cents >= 0),
  commission_percent numeric(5,2) not null default 0 check (commission_percent between 0 and 100),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table promo_codes (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references events on delete cascade,  -- null = any event
  promoter_id uuid references promoters on delete set null,
  code citext not null unique check (code ~ '^[A-Za-z0-9_-]{3,24}$'),
  discount_type text not null check (discount_type in ('fixed','percent')),
  discount_value int not null check (discount_value >= 0), -- cents for fixed, whole % for percent
  max_uses int check (max_uses is null or max_uses > 0),
  active boolean not null default true,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  check (discount_type <> 'percent' or discount_value <= 100)
);

-- Orders, payments, tickets ---------------------------------------------------
-- A pending order with expires_at in the future IS the inventory reservation.
create table orders (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events,
  user_id uuid references auth.users on delete set null,
  email citext not null,
  full_name text not null,
  phone text,
  status order_status not null default 'pending',
  subtotal_cents int not null default 0,
  discount_cents int not null default 0,
  total_cents int not null default 0 check (total_cents >= 0),
  currency text not null default 'USD',
  promo_code_id uuid references promo_codes,
  promoter_id uuid references promoters,
  source text,
  utm jsonb not null default '{}',
  is_test boolean not null default false,
  provider text,
  expires_at timestamptz not null,
  paid_at timestamptz,
  refunded_at timestamptz,
  idempotency_key text unique,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on orders (event_id, status);
create index on orders (email);
create index on orders (user_id);
create index on orders (promoter_id);
create trigger orders_updated before update on orders for each row execute function set_updated_at();

create table order_items (
  id bigserial primary key,
  order_id uuid not null references orders on delete cascade,
  ticket_type_id uuid not null references ticket_types,
  quantity int not null check (quantity > 0),
  unit_price_cents int not null check (unit_price_cents >= 0),
  unique (order_id, ticket_type_id)
);
create index on order_items (ticket_type_id);

create table payments (
  id bigserial primary key,
  order_id uuid not null references orders,
  provider text not null,
  provider_txn_id text not null,
  kind text not null default 'charge' check (kind in ('charge','refund')),
  status text not null check (status in ('paid','failed','refunded')),
  amount_cents int not null,
  fee_cents int not null default 0,
  raw jsonb,
  created_at timestamptz not null default now(),
  unique (provider, provider_txn_id, kind)
);
create index on payments (order_id);

create table webhook_events (
  id bigserial primary key,
  provider text not null,
  external_id text not null,
  received_at timestamptz not null default now(),
  unique (provider, external_id)
);

create table tickets (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders,
  event_id uuid not null references events,
  ticket_type_id uuid not null references ticket_types,
  attendee_name text,
  status ticket_status not null default 'valid',
  checked_in_at timestamptz,
  checked_in_by uuid references auth.users,
  created_at timestamptz not null default now()
);
create index on tickets (order_id);
create index on tickets (event_id, status);

create table ticket_scans (
  id bigserial primary key,
  event_id uuid references events,
  ticket_id uuid references tickets,
  staff_id uuid references auth.users,
  result text not null,
  created_at timestamptz not null default now()
);
create index on ticket_scans (event_id, created_at);

create table commission_records (
  id uuid primary key default gen_random_uuid(),
  promoter_id uuid not null references promoters,
  order_id uuid not null unique references orders,
  amount_cents int not null check (amount_cents >= 0),
  status commission_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger commission_updated before update on commission_records for each row execute function set_updated_at();

-- Waitlist & referrals --------------------------------------------------------
create table waitlist_entries (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (length(full_name) between 2 and 80),
  email citext not null unique,
  phone text not null unique,
  instagram text,
  age_confirmed boolean not null check (age_confirmed),
  marketing_consent boolean not null default false,
  referral_code text not null unique,
  referred_by uuid references waitlist_entries on delete set null,
  referral_flagged boolean not null default false, -- suspected self/abusive referral: never counted
  verified_at timestamptz,
  access_token_hash text not null unique,
  verify_token_hash text unique,
  source text,
  utm jsonb not null default '{}',
  ip_hash text,
  created_at timestamptz not null default now()
);
create index on waitlist_entries (referred_by);
create index on waitlist_entries (created_at);

create table reward_grants (
  id bigserial primary key,
  waitlist_entry_id uuid not null references waitlist_entries on delete cascade,
  threshold int not null,
  label text not null,
  status text not null default 'approved' check (status in ('approved','rejected')),
  decided_by uuid references auth.users,
  created_at timestamptz not null default now(),
  unique (waitlist_entry_id, threshold)
);

-- Finance ---------------------------------------------------------------------
create table event_expenses (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events on delete cascade,
  category text not null check (category in ('venue','djs','sound','lighting','security','photography','marketing','staff','misc')),
  description text,
  budgeted_cents int not null default 0 check (budgeted_cents >= 0),
  committed_cents int not null default 0 check (committed_cents >= 0),
  paid_cents int not null default 0 check (paid_cents >= 0),
  created_at timestamptz not null default now()
);
create index on event_expenses (event_id);

-- Ops -------------------------------------------------------------------------
create table audit_logs (
  id bigserial primary key,
  actor_id uuid,
  action text not null,
  entity text not null,
  entity_id text,
  data jsonb,
  created_at timestamptz not null default now()
);
create index on audit_logs (created_at desc);

create table rate_limits (
  key text primary key,
  window_start timestamptz not null,
  count int not null
);

-- Helpers ---------------------------------------------------------------------
create or replace function has_role(p_roles app_role[], p_event uuid default null) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from user_roles r
    where r.user_id = auth.uid()
      and (r.role = 'super_admin'
           or (r.role = any(p_roles) and (r.event_id is null or p_event is null or r.event_id = p_event)))
  )
$$;

-- Returns true when the call is allowed.
create or replace function hit_rate_limit(p_key text, p_limit int, p_window_seconds int) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  insert into rate_limits as r (key, window_start, count) values (p_key, now(), 1)
  on conflict (key) do update set
    count = case when r.window_start < now() - make_interval(secs => p_window_seconds) then 1 else r.count + 1 end,
    window_start = case when r.window_start < now() - make_interval(secs => p_window_seconds) then now() else r.window_start end
  returning count into v_count;
  return v_count <= p_limit;
end $$;

-- Seats held by paid orders and unexpired reservations.
create or replace function committed_qty(p_ticket_type uuid) returns int
language sql stable security definer set search_path = public as $$
  select coalesce(sum(oi.quantity), 0)::int
  from order_items oi join orders o on o.id = oi.order_id
  where oi.ticket_type_id = p_ticket_type
    and (o.status = 'paid' or (o.status = 'pending' and o.expires_at > now()))
$$;

create or replace function event_committed_qty(p_event uuid) returns int
language sql stable security definer set search_path = public as $$
  select coalesce(sum(oi.quantity), 0)::int
  from order_items oi join orders o on o.id = oi.order_id
  where o.event_id = p_event
    and (o.status = 'paid' or (o.status = 'pending' and o.expires_at > now()))
$$;

-- Public availability for visible ticket types of non-draft events.
create or replace function get_ticket_availability(p_event uuid)
returns table (ticket_type_id uuid, remaining int)
language sql stable security definer set search_path = public as $$
  select t.id, greatest(0, least(t.quantity - committed_qty(t.id), e.capacity - event_committed_qty(e.id)))
  from ticket_types t join events e on e.id = t.event_id
  where t.event_id = p_event and t.visible and e.status <> 'draft'
$$;

create or replace function audit(p_actor uuid, p_action text, p_entity text, p_entity_id text, p_data jsonb default null)
returns void language sql security definer set search_path = public as $$
  insert into audit_logs (actor_id, action, entity, entity_id, data) values (p_actor, p_action, p_entity, p_entity_id, p_data)
$$;

-- Reserve inventory and create a pending order. Prices come from the DB only.
-- The event row lock serialises all reservations for one event, so concurrent buyers
-- can never oversell a ticket type or the event capacity.
create or replace function create_order(
  p_event uuid, p_items jsonb, p_email text, p_full_name text, p_phone text, p_user uuid,
  p_promo text, p_promoter text, p_source text, p_utm jsonb, p_idempotency_key text,
  p_is_test boolean, p_ttl_minutes int default 15
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_event events; v_type ticket_types; v_promo promo_codes; v_promoter promoters;
  v_order uuid; v_item record; v_subtotal int := 0; v_eligible int := 0; v_discount int := 0;
  v_uses int; v_owner_email text;
begin
  if p_idempotency_key is not null then
    select id into v_order from orders where idempotency_key = p_idempotency_key;
    if found then return v_order; end if;
  end if;

  select * into v_event from events where id = p_event for update;
  if not found then raise exception 'EVENT_NOT_FOUND'; end if;
  if v_event.status <> 'on_sale' or v_event.ends_at < now()
     or (v_event.sales_start_at is not null and now() < v_event.sales_start_at)
     or (v_event.sales_end_at is not null and now() > v_event.sales_end_at) then
    raise exception 'NOT_ON_SALE';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'NO_ITEMS'; end if;

  insert into orders (event_id, user_id, email, full_name, phone, source, utm, is_test, expires_at, idempotency_key)
  values (p_event, p_user, lower(p_email), p_full_name, p_phone, p_source, coalesce(p_utm, '{}'), p_is_test,
          now() + make_interval(mins => p_ttl_minutes), p_idempotency_key)
  returning id into v_order;

  for v_item in
    select (e->>'ticket_type_id')::uuid as tt, (e->>'quantity')::int as q from jsonb_array_elements(p_items) e
  loop
    if v_item.q is null or v_item.q < 1 then raise exception 'BAD_QUANTITY'; end if;
    select * into v_type from ticket_types where id = v_item.tt and event_id = p_event;
    if not found or not v_type.visible then raise exception 'TYPE_UNAVAILABLE'; end if;
    if (v_type.sale_starts_at is not null and now() < v_type.sale_starts_at)
       or (v_type.sale_ends_at is not null and now() > v_type.sale_ends_at) then
      raise exception 'TYPE_NOT_ON_SALE';
    end if;
    if v_item.q > v_type.per_order_limit then raise exception 'OVER_ORDER_LIMIT'; end if;
    if committed_qty(v_type.id) + v_item.q > v_type.quantity then raise exception 'SOLD_OUT'; end if;
    insert into order_items (order_id, ticket_type_id, quantity, unit_price_cents)
    values (v_order, v_type.id, v_item.q, v_type.price_cents);
    v_subtotal := v_subtotal + v_item.q * v_type.price_cents;
    if v_type.promo_eligible then v_eligible := v_eligible + v_item.q * v_type.price_cents; end if;
  end loop;

  if event_committed_qty(p_event) > v_event.capacity then raise exception 'EVENT_CAPACITY'; end if;

  if coalesce(p_promo, '') <> '' then
    select * into v_promo from promo_codes
     where code = p_promo::citext and active and (event_id is null or event_id = p_event)
       and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at >= now())
     for update;
    if not found then raise exception 'INVALID_PROMO'; end if;
    if v_promo.max_uses is not null then
      select count(*) into v_uses from orders
       where promo_code_id = v_promo.id and (status = 'paid' or (status = 'pending' and expires_at > now()));
      if v_uses >= v_promo.max_uses then raise exception 'PROMO_EXHAUSTED'; end if;
    end if;
    v_discount := case when v_promo.discount_type = 'percent' then (v_eligible * v_promo.discount_value) / 100
                       else least(v_promo.discount_value, v_eligible) end;
    if v_promo.promoter_id is not null then select * into v_promoter from promoters where id = v_promo.promoter_id and active; end if;
  end if;

  if v_promoter.id is null and coalesce(p_promoter, '') <> '' then
    select * into v_promoter from promoters where code = p_promoter::citext and active;
  end if;

  -- Self-dealing: a promoter buying through their own code earns nothing and cannot use their own discount.
  if v_promoter.id is not null and v_promoter.user_id is not null then
    select email into v_owner_email from auth.users where id = v_promoter.user_id;
    if v_promoter.user_id = p_user or lower(v_owner_email) = lower(p_email) then
      if v_promo.id is not null and v_promo.promoter_id = v_promoter.id then raise exception 'SELF_PROMO'; end if;
      v_promoter := null;
    end if;
  end if;

  update orders set subtotal_cents = v_subtotal, discount_cents = v_discount, total_cents = v_subtotal - v_discount,
         promo_code_id = v_promo.id, promoter_id = v_promoter.id
   where id = v_order;
  return v_order;
end $$;

-- Does a (non-reserving) order still fit in inventory? Caller must hold the event lock.
create or replace function order_fits(p_order uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare v_item record; v_event events; v_total int := 0;
begin
  select e.* into v_event from events e join orders o on o.event_id = e.id where o.id = p_order;
  for v_item in select oi.*, t.quantity as type_qty from order_items oi join ticket_types t on t.id = oi.ticket_type_id where oi.order_id = p_order loop
    if committed_qty(v_item.ticket_type_id) + v_item.quantity > v_item.type_qty then return false; end if;
    v_total := v_total + v_item.quantity;
  end loop;
  return event_committed_qty(v_event.id) + v_total <= v_event.capacity;
end $$;

-- Record a verified successful payment and issue tickets exactly once.
-- Returns: 'paid' | 'already_paid' | 'refund_required'
create or replace function confirm_payment(
  p_order uuid, p_provider text, p_txn text, p_amount_cents int, p_fee_cents int, p_raw jsonb
) returns text language plpgsql security definer set search_path = public as $$
declare v_order orders; v_item record; v_promoter promoters; v_qty int := 0; v_commission int;
begin
  perform 1 from events e join orders o on o.event_id = e.id where o.id = p_order for update of e;
  select * into v_order from orders where id = p_order for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;

  insert into payments (order_id, provider, provider_txn_id, kind, status, amount_cents, fee_cents, raw)
  values (p_order, p_provider, p_txn, 'charge', 'paid', p_amount_cents, coalesce(p_fee_cents, 0), p_raw)
  on conflict (provider, provider_txn_id, kind) do nothing;

  if v_order.status = 'paid' then return 'already_paid'; end if;
  if v_order.status in ('refunded', 'refund_required') then return v_order.status::text; end if;
  if v_order.provider is not null and v_order.provider <> p_provider then raise exception 'PROVIDER_MISMATCH'; end if;

  if p_amount_cents <> v_order.total_cents
     or (v_order.status <> 'pending' or v_order.expires_at <= now()) and not order_fits(p_order) then
    update orders set status = 'refund_required', provider = p_provider,
           note = case when p_amount_cents <> v_order.total_cents then 'Amount mismatch' else 'Paid after reservation expired; sold out' end
     where id = p_order;
    perform audit(null, 'payment.refund_required', 'order', p_order::text, jsonb_build_object('amount', p_amount_cents));
    return 'refund_required';
  end if;

  update orders set status = 'paid', paid_at = now(), provider = p_provider where id = p_order;
  for v_item in select * from order_items where order_id = p_order loop
    insert into tickets (order_id, event_id, ticket_type_id, attendee_name)
    select p_order, v_order.event_id, v_item.ticket_type_id, v_order.full_name from generate_series(1, v_item.quantity);
    v_qty := v_qty + v_item.quantity;
  end loop;

  if v_order.promoter_id is not null and v_order.total_cents > 0 then
    select * into v_promoter from promoters where id = v_order.promoter_id;
    v_commission := v_qty * v_promoter.commission_fixed_cents + floor(v_order.total_cents * v_promoter.commission_percent / 100)::int;
    insert into commission_records (promoter_id, order_id, amount_cents) values (v_promoter.id, p_order, v_commission)
    on conflict (order_id) do nothing;
  end if;

  perform audit(null, 'payment.confirmed', 'order', p_order::text, jsonb_build_object('provider', p_provider, 'txn', p_txn));
  return 'paid';
end $$;

-- Mark a pending order as failed (releases its reservation).
create or replace function fail_order(p_order uuid, p_reason text) returns void
language sql security definer set search_path = public as $$
  update orders set status = 'failed', note = p_reason where id = p_order and status = 'pending';
$$;

-- Refund (p_refund=true) or cancel a paid/pending order. Used tickets stay 'used' for the record.
create or replace function close_order(p_order uuid, p_actor uuid, p_refund boolean, p_refund_txn text default null)
returns text language plpgsql security definer set search_path = public as $$
declare v_order orders;
begin
  select * into v_order from orders where id = p_order for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if v_order.status in ('refunded', 'cancelled') then return v_order.status::text; end if;

  if v_order.status in ('pending', 'failed', 'expired') then
    if p_refund then raise exception 'NOTHING_TO_REFUND'; end if;
    update orders set status = 'cancelled' where id = p_order;
  elsif v_order.status in ('paid', 'refund_required') then
    if p_refund then
      update orders set status = 'refunded', refunded_at = now() where id = p_order;
      insert into payments (order_id, provider, provider_txn_id, kind, status, amount_cents)
      values (p_order, coalesce(v_order.provider, 'manual'), coalesce(p_refund_txn, 'refund-' || p_order), 'refund', 'refunded', v_order.total_cents)
      on conflict do nothing;
    else
      update orders set status = 'cancelled' where id = p_order;
    end if;
    update tickets set status = case when p_refund then 'refunded'::ticket_status else 'cancelled'::ticket_status end
     where order_id = p_order and status = 'valid';
    update commission_records set status = 'reversed' where order_id = p_order and status <> 'paid';
  end if;

  perform audit(p_actor, case when p_refund then 'order.refunded' else 'order.cancelled' end, 'order', p_order::text, null);
  return case when p_refund then 'refunded' else 'cancelled' end;
end $$;

-- Atomic check-in. The conditional UPDATE guarantees only one scanner can admit a ticket.
create or replace function scan_ticket(p_ticket uuid, p_event uuid, p_staff uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_t tickets; v_event events; v_result text; v_type text;
begin
  if not exists (select 1 from user_roles where user_id = p_staff
                 and (role = 'super_admin' or (role in ('door_staff','event_manager') and (event_id is null or event_id = p_event)))) then
    raise exception 'FORBIDDEN';
  end if;
  select * into v_event from events where id = p_event;
  if not found then raise exception 'EVENT_NOT_FOUND'; end if;

  if v_event.status in ('cancelled', 'draft') then
    v_result := 'event_not_active';
  else
    update tickets set status = 'used', checked_in_at = now(), checked_in_by = p_staff
     where id = p_ticket and event_id = p_event and status = 'valid'
     returning * into v_t;
    if found then v_result := 'admitted'; end if;
  end if;

  if v_result is null then
    select * into v_t from tickets where id = p_ticket;
    v_result := case
      when not found then 'invalid'
      when v_t.event_id <> p_event then 'wrong_event'
      when v_t.status = 'used' then 'already_used'
      else 'cancelled' end;
  end if;

  insert into ticket_scans (event_id, ticket_id, staff_id, result)
  values (p_event, case when v_t.id is not null then v_t.id end, p_staff, v_result);

  select name into v_type from ticket_types where id = v_t.ticket_type_id;
  return jsonb_build_object('result', v_result, 'ticket_type', v_type, 'attendee_name',
    case when v_result = 'admitted' then v_t.attendee_name end,
    'checked_in_at', case when v_result in ('admitted', 'already_used') then v_t.checked_in_at end);
end $$;

-- Lock down function execution: only the server (service_role) may call privileged functions.
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function has_role(app_role[], uuid) to anon, authenticated;
grant execute on function get_ticket_availability(uuid) to anon, authenticated;
grant execute on all functions in schema public to service_role;

-- Row Level Security ------------------------------------------------------------
alter table brand_settings enable row level security;
alter table profiles enable row level security;
alter table events enable row level security;
alter table event_venues enable row level security;
alter table ticket_types enable row level security;
alter table user_roles enable row level security;
alter table promoters enable row level security;
alter table promo_codes enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;
alter table payments enable row level security;
alter table webhook_events enable row level security;
alter table tickets enable row level security;
alter table ticket_scans enable row level security;
alter table commission_records enable row level security;
alter table waitlist_entries enable row level security;
alter table reward_grants enable row level security;
alter table event_expenses enable row level security;
alter table audit_logs enable row level security;
alter table rate_limits enable row level security;

create policy brand_read on brand_settings for select using (true);
create policy profiles_own on profiles for select using (id = auth.uid() or has_role('{}'));
create policy events_public on events for select using (status <> 'draft' or has_role('{event_manager,finance,door_staff}', id));
create policy venues_public on event_venues for select using (
  exists (select 1 from events e where e.id = event_id and e.status <> 'draft' and e.venue_public)
  or has_role('{event_manager,door_staff}', event_id));
create policy ticket_types_public on ticket_types for select using (
  (visible and exists (select 1 from events e where e.id = event_id and e.status <> 'draft'))
  or has_role('{event_manager,finance}', event_id));
create policy roles_own on user_roles for select using (user_id = auth.uid() or has_role('{}'));
create policy promoters_own on promoters for select using (user_id = auth.uid() or has_role('{finance,event_manager}'));
create policy promo_staff on promo_codes for select using (has_role('{event_manager,finance}', event_id));
create policy orders_own on orders for select using (user_id = auth.uid() or has_role('{finance,event_manager}', event_id));
create policy order_items_own on order_items for select using (
  exists (select 1 from orders o where o.id = order_id and (o.user_id = auth.uid() or has_role('{finance,event_manager}', o.event_id))));
create policy tickets_own on tickets for select using (
  exists (select 1 from orders o where o.id = order_id and o.user_id = auth.uid()) or has_role('{event_manager,door_staff}', event_id));
create policy payments_staff on payments for select using (has_role('{finance}'));
create policy scans_staff on ticket_scans for select using (has_role('{event_manager}', event_id));
create policy commissions_own on commission_records for select using (
  exists (select 1 from promoters p where p.id = promoter_id and p.user_id = auth.uid()) or has_role('{finance}'));
create policy waitlist_staff on waitlist_entries for select using (has_role('{event_manager}'));
create policy rewards_staff on reward_grants for select using (has_role('{event_manager}'));
create policy expenses_staff on event_expenses for select using (has_role('{finance,event_manager}', event_id));
create policy audit_staff on audit_logs for select using (has_role('{}'));
-- webhook_events, rate_limits: no policies => no browser access at all.
