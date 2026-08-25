-- ============================================================
-- MWINBARKA IMPORTS — database schema
-- Run this once in the Supabase SQL editor (Dashboard > SQL Editor).
-- ============================================================

create table if not exists public.requests (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  phone           text not null,
  email           text,
  location        text,
  request_details text not null,
  category        text,
  reference_url   text,
  budget_range    text,
  quantity        text,
  origin          text,
  shipping_method text,
  photo_url       text,
  user_id         uuid references auth.users(id) on delete set null,
  status          text not null default 'New',
  created_at      timestamptz not null default now(),
  constraint requests_status_check
    check (status in ('New', 'Contacted', 'Quoted', 'Confirmed', 'Closed'))
);

-- The admin desk always sorts newest first.
create index if not exists requests_created_at_idx
  on public.requests (created_at desc);

create index if not exists requests_user_id_idx
  on public.requests (user_id);

-- ============================================================
-- Row level security
--
-- The anon key ships in the browser, so RLS is the only thing
-- protecting customer data. Guests may INSERT a request.
-- Customers may read their own rows. Staff may read/update all.
-- ============================================================

create schema if not exists private;

create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  full_name  text,
  phone      text,
  is_staff   boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create or replace function private.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select p.is_staff from public.profiles p where p.id = auth.uid()),
    false
  );
$$;

revoke all on function private.is_staff() from public;
grant execute on function private.is_staff() to anon, authenticated;

drop policy if exists "Users can read own profile" on public.profiles;
create policy "Users can read own profile"
  on public.profiles for select to authenticated
  using (id = auth.uid() or private.is_staff());

drop policy if exists "Users can insert own profile" on public.profiles;
create policy "Users can insert own profile"
  on public.profiles for insert to authenticated
  with check (id = auth.uid() and is_staff = false);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
  on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

revoke update on table public.profiles from anon, authenticated;
grant select, insert on table public.profiles to authenticated;
grant update (full_name, phone) on table public.profiles to authenticated;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, phone, is_staff)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'phone', ''),
    false
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

alter table public.requests enable row level security;

drop policy if exists "Anyone can submit a request" on public.requests;
create policy "Anyone can submit a request"
  on public.requests
  for insert
  to anon, authenticated
  with check (
    user_id is null
    or user_id = auth.uid()
    or private.is_staff()
  );

drop policy if exists "Signed-in staff can read requests" on public.requests;
drop policy if exists "Signed-in staff can update requests" on public.requests;
drop policy if exists "Staff can read all requests" on public.requests;
create policy "Staff can read all requests"
  on public.requests for select to authenticated
  using (private.is_staff());

drop policy if exists "Customers can read own requests" on public.requests;
create policy "Customers can read own requests"
  on public.requests for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "Staff can update requests" on public.requests;
create policy "Staff can update requests"
  on public.requests for update to authenticated
  using (private.is_staff())
  with check (private.is_staff());

-- Note: no delete policy on purpose. Leads are archived by setting
-- status to 'Closed' rather than removed, so nothing is lost by a
-- mis-click in the dashboard.

-- ============================================================
-- Products — admin adds these; the public site can only read them.
-- ============================================================

create table if not exists public.products (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  price       text,
  category    text,
  image_url   text,
  created_at  timestamptz not null default now()
);

alter table public.products enable row level security;

drop policy if exists "Anyone can view products" on public.products;
create policy "Anyone can view products"
  on public.products
  for select
  to anon, authenticated
  using (true);

drop policy if exists "Staff can add products" on public.products;
create policy "Staff can add products"
  on public.products
  for insert
  to authenticated
  with check (private.is_staff());

drop policy if exists "Staff can update products" on public.products;
create policy "Staff can update products"
  on public.products
  for update
  to authenticated
  using (private.is_staff())
  with check (private.is_staff());

drop policy if exists "Staff can delete products" on public.products;
create policy "Staff can delete products"
  on public.products
  for delete
  to authenticated
  using (private.is_staff());

-- ============================================================
-- Site settings — one row. Channel link, social URLs, advert video.
-- The public site reads this so the floating button and video gate
-- pick up whatever the admin pasted in.
-- ============================================================

create table if not exists public.site_settings (
  id                    integer primary key default 1 check (id = 1),
  whatsapp_channel_url  text,
  whatsapp_url          text,
  facebook_url          text,
  instagram_url         text,
  tiktok_url            text,
  advert_video_url      text,
  updated_at            timestamptz not null default now()
);

insert into public.site_settings (id)
values (1)
on conflict (id) do nothing;

alter table public.site_settings enable row level security;

drop policy if exists "Anyone can read site settings" on public.site_settings;
create policy "Anyone can read site settings"
  on public.site_settings
  for select
  to anon, authenticated
  using (true);

drop policy if exists "Staff can update site settings" on public.site_settings;
create policy "Staff can update site settings"
  on public.site_settings
  for update
  to authenticated
  using (private.is_staff())
  with check (private.is_staff());

-- ============================================================
-- Reviews — public can read published quotes; anyone may submit
-- a draft. Staff publish, edit, or remove.
-- ============================================================

create table if not exists public.reviews (
  id          uuid primary key default gen_random_uuid(),
  author_name text not null,
  location    text,
  rating      integer not null default 5 check (rating between 1 and 5),
  quote       text not null,
  published   boolean not null default false,
  user_id     uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists reviews_published_idx
  on public.reviews (published, created_at desc);

alter table public.reviews enable row level security;

drop policy if exists "Public can read published reviews" on public.reviews;
create policy "Public can read published reviews"
  on public.reviews for select to anon, authenticated
  using (published = true);

drop policy if exists "Staff can read all reviews" on public.reviews;
create policy "Staff can read all reviews"
  on public.reviews for select to authenticated
  using (private.is_staff());

drop policy if exists "Anyone can submit a review" on public.reviews;
create policy "Anyone can submit a review"
  on public.reviews for insert to anon, authenticated
  with check (published = false and (user_id is null or user_id = auth.uid()));

drop policy if exists "Staff can add reviews" on public.reviews;
create policy "Staff can add reviews"
  on public.reviews for insert to authenticated
  with check (private.is_staff());

drop policy if exists "Staff can update reviews" on public.reviews;
create policy "Staff can update reviews"
  on public.reviews for update to authenticated
  using (private.is_staff())
  with check (private.is_staff());

drop policy if exists "Staff can delete reviews" on public.reviews;
create policy "Staff can delete reviews"
  on public.reviews for delete to authenticated
  using (private.is_staff());

-- ============================================================
-- Storage — product photos and the advert video.
-- Public can read; only a signed-in admin can upload.
-- ============================================================

insert into storage.buckets (id, name, public)
values ('media', 'media', true)
on conflict (id) do update set public = true;

drop policy if exists "Public can read media" on storage.objects;
create policy "Public can read media"
  on storage.objects
  for select
  to anon, authenticated
  using (bucket_id = 'media');

drop policy if exists "Staff can upload media" on storage.objects;
create policy "Staff can upload media"
  on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'media' and private.is_staff());

drop policy if exists "Staff can update media" on storage.objects;
create policy "Staff can update media"
  on storage.objects
  for update
  to authenticated
  using (bucket_id = 'media' and private.is_staff())
  with check (bucket_id = 'media' and private.is_staff());

drop policy if exists "Staff can delete media" on storage.objects;
create policy "Staff can delete media"
  on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'media' and private.is_staff());

drop policy if exists "Anyone can upload request photos" on storage.objects;
create policy "Anyone can upload request photos"
  on storage.objects
  for insert
  to anon, authenticated
  with check (
    bucket_id = 'media'
    and name like 'requests/%'
  );

-- ============================================================
-- SMS — staff-only credentials and outbound log.
-- Public site_settings is readable by anyone, so SMS keys live here.
-- ============================================================

create table if not exists public.sms_settings (
  id           integer primary key default 1 check (id = 1),
  provider     text not null default 'txtconnect',
  api_key      text,
  account_sid  text,
  sender_id    text,
  updated_at   timestamptz not null default now(),
  constraint sms_settings_provider_check
    check (provider in ('txtconnect', 'arkesel', 'twilio'))
);

insert into public.sms_settings (id, provider)
values (1, 'txtconnect')
on conflict (id) do nothing;

alter table public.sms_settings enable row level security;

revoke all on table public.sms_settings from public, anon;
grant select, insert, update on table public.sms_settings to authenticated;

drop policy if exists "Staff can read sms settings" on public.sms_settings;
create policy "Staff can read sms settings"
  on public.sms_settings for select to authenticated
  using (private.is_staff());

drop policy if exists "Staff can write sms settings" on public.sms_settings;
create policy "Staff can write sms settings"
  on public.sms_settings for insert to authenticated
  with check (private.is_staff());

drop policy if exists "Staff can update sms settings" on public.sms_settings;
create policy "Staff can update sms settings"
  on public.sms_settings for update to authenticated
  using (private.is_staff())
  with check (private.is_staff());

create table if not exists public.sms_messages (
  id            uuid primary key default gen_random_uuid(),
  customer_name text,
  phone         text not null,
  body          text not null,
  status        text not null default 'sent',
  error         text,
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  constraint sms_messages_status_check
    check (status in ('sent', 'failed'))
);

create index if not exists sms_messages_created_at_idx
  on public.sms_messages (created_at desc);

alter table public.sms_messages enable row level security;

revoke all on table public.sms_messages from public, anon;
grant select, insert on table public.sms_messages to authenticated;

drop policy if exists "Staff can read sms messages" on public.sms_messages;
create policy "Staff can read sms messages"
  on public.sms_messages for select to authenticated
  using (private.is_staff());

drop policy if exists "Staff can insert sms messages" on public.sms_messages;
create policy "Staff can insert sms messages"
  on public.sms_messages for insert to authenticated
  with check (private.is_staff());

-- ============================================================
-- Paystack — staff-only keys. Secret is never selected by the browser.
-- ============================================================

create table if not exists public.payment_settings (
  id          integer primary key default 1 check (id = 1),
  public_key  text,
  secret_key  text,
  updated_at  timestamptz not null default now()
);

insert into public.payment_settings (id)
values (1)
on conflict (id) do nothing;

alter table public.payment_settings enable row level security;

revoke all on table public.payment_settings from public, anon, authenticated;
grant select (id, public_key, updated_at) on table public.payment_settings to authenticated;
grant update (public_key, secret_key, updated_at) on table public.payment_settings to authenticated;

drop policy if exists "Staff can read payment settings" on public.payment_settings;
create policy "Staff can read payment settings"
  on public.payment_settings for select to authenticated
  using (private.is_staff());

drop policy if exists "Staff can update payment settings" on public.payment_settings;
create policy "Staff can update payment settings"
  on public.payment_settings for update to authenticated
  using (private.is_staff())
  with check (private.is_staff());

create table if not exists public.payments (
  id                 uuid primary key default gen_random_uuid(),
  request_id         uuid references public.requests(id) on delete set null,
  customer_name      text,
  phone              text,
  email              text not null,
  amount_pesewas     integer not null check (amount_pesewas > 0),
  currency           text not null default 'GHS',
  reference          text not null unique,
  authorization_url  text,
  status             text not null default 'pending',
  paid_at            timestamptz,
  created_by         uuid references auth.users(id) on delete set null,
  created_at         timestamptz not null default now(),
  constraint payments_status_check
    check (status in ('pending', 'paid', 'failed', 'abandoned'))
);

create index if not exists payments_created_at_idx
  on public.payments (created_at desc);

create index if not exists payments_request_id_idx
  on public.payments (request_id);

alter table public.payments enable row level security;

revoke all on table public.payments from public, anon;
grant select, insert, update on table public.payments to authenticated;

drop policy if exists "Staff can read payments" on public.payments;
create policy "Staff can read payments"
  on public.payments for select to authenticated
  using (private.is_staff());

drop policy if exists "Staff can insert payments" on public.payments;
create policy "Staff can insert payments"
  on public.payments for insert to authenticated
  with check (private.is_staff());

drop policy if exists "Staff can update payments" on public.payments;
create policy "Staff can update payments"
  on public.payments for update to authenticated
  using (private.is_staff())
  with check (private.is_staff());

-- ============================================================
-- Creating the admin login
--
-- Supabase Dashboard > Authentication > Users > "Add user",
-- with "Auto Confirm User" ticked. That email and password are
-- what admin.html asks for.
--
-- ============================================================
-- Customer sign-up is on
--
-- Authentication → Providers → Email must allow new users to
-- sign up. New auth users get a profiles row (is_staff = false).
-- Mark the desk login as staff:
--
--   update public.profiles set is_staff = true
--   where id = (select id from auth.users where email = 'you@desk.com');
--
-- ============================================================
-- ============================================================
-- Agency desk — quotes, deposits, roles, templates, receipts
-- ============================================================

alter table public.profiles
  add column if not exists staff_role text not null default 'assistant';

alter table public.profiles drop constraint if exists profiles_staff_role_check;
alter table public.profiles add constraint profiles_staff_role_check
  check (staff_role in ('owner', 'assistant'));

update public.profiles
set staff_role = 'owner'
where is_staff = true;

create or replace function private.is_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select p.is_staff and p.staff_role = 'owner'
      from public.profiles p
      where p.id = auth.uid()
    ),
    false
  );
$$;

revoke all on function private.is_owner() from public;
grant execute on function private.is_owner() to anon, authenticated;

grant update (is_staff, staff_role) on table public.profiles to authenticated;

drop policy if exists "Owners can manage staff profiles" on public.profiles;
create policy "Owners can manage staff profiles"
  on public.profiles for update to authenticated
  using (private.is_owner())
  with check (private.is_owner());

alter table public.requests
  add column if not exists shipment_status text not null default '',
  add column if not exists source_cost_pesewas integer not null default 0,
  add column if not exists freight_pesewas integer not null default 0,
  add column if not exists duty_pesewas integer not null default 0,
  add column if not exists agent_fee_pesewas integer not null default 0,
  add column if not exists staff_notified_at timestamptz;

alter table public.requests drop constraint if exists requests_shipment_status_check;
alter table public.requests add constraint requests_shipment_status_check
  check (shipment_status in ('', 'sourcing', 'warehouse', 'vessel', 'tema', 'ready'));

create table if not exists public.desk_settings (
  id                      integer primary key default 1 check (id = 1),
  notify_phone            text,
  notify_on_new_request   boolean not null default true,
  auto_sms_on_status      boolean not null default false,
  auto_sms_on_shipment    boolean not null default false,
  updated_at              timestamptz not null default now()
);

insert into public.desk_settings (id)
values (1)
on conflict (id) do nothing;

alter table public.desk_settings enable row level security;

revoke all on table public.desk_settings from public, anon;
grant select on table public.desk_settings to authenticated;
grant update on table public.desk_settings to authenticated;

drop policy if exists "Staff can read desk settings" on public.desk_settings;
create policy "Staff can read desk settings"
  on public.desk_settings for select to authenticated
  using (private.is_staff());

drop policy if exists "Owners can update desk settings" on public.desk_settings;
create policy "Owners can update desk settings"
  on public.desk_settings for update to authenticated
  using (private.is_owner())
  with check (private.is_owner());

create table if not exists public.invoice_seq (
  year integer primary key,
  n    integer not null default 0
);

alter table public.invoice_seq enable row level security;
revoke all on table public.invoice_seq from public, anon, authenticated;

create or replace function public.next_invoice_number()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  y integer := extract(year from timezone('utc', now()))::integer;
  next_n integer;
begin
  if not private.is_staff() then
    raise exception 'Staff only';
  end if;
  insert into public.invoice_seq as s (year, n)
  values (y, 1)
  on conflict (year) do update set n = s.n + 1
  returning n into next_n;
  return 'MW-' || y::text || '-' || lpad(next_n::text, 4, '0');
end;
$$;

revoke all on function public.next_invoice_number() from public;
grant execute on function public.next_invoice_number() to authenticated;

create table if not exists public.quotes (
  id                   uuid primary key default gen_random_uuid(),
  request_id           uuid references public.requests(id) on delete set null,
  invoice_number       text not null unique,
  public_token         text not null unique default replace(gen_random_uuid()::text, '-', ''),
  customer_name        text,
  phone                text,
  email                text,
  location             text,
  line_items           jsonb not null default '[]'::jsonb,
  source_cost_pesewas  integer not null default 0,
  freight_pesewas      integer not null default 0,
  duty_pesewas         integer not null default 0,
  agent_fee_pesewas    integer not null default 0,
  total_pesewas        integer not null check (total_pesewas > 0),
  deposit_pesewas      integer not null default 0 check (deposit_pesewas >= 0),
  notes                text,
  status               text not null default 'sent',
  created_by           uuid references auth.users(id) on delete set null,
  created_at           timestamptz not null default now(),
  constraint quotes_status_check
    check (status in ('draft', 'sent', 'accepted'))
);

create index if not exists quotes_created_at_idx on public.quotes (created_at desc);
create index if not exists quotes_request_id_idx on public.quotes (request_id);
create index if not exists quotes_public_token_idx on public.quotes (public_token);

alter table public.quotes enable row level security;

revoke all on table public.quotes from public, anon;
grant select, insert, update on public.quotes to authenticated;

drop policy if exists "Staff can read quotes" on public.quotes;
create policy "Staff can read quotes"
  on public.quotes for select to authenticated
  using (private.is_staff());

drop policy if exists "Staff can insert quotes" on public.quotes;
create policy "Staff can insert quotes"
  on public.quotes for insert to authenticated
  with check (private.is_staff());

drop policy if exists "Staff can update quotes" on public.quotes;
create policy "Staff can update quotes"
  on public.quotes for update to authenticated
  using (private.is_staff())
  with check (private.is_staff());

alter table public.payments
  add column if not exists quote_id uuid references public.quotes(id) on delete set null,
  add column if not exists kind text not null default 'full',
  add column if not exists public_token text,
  add column if not exists invoice_number text;

update public.payments
set public_token = replace(gen_random_uuid()::text, '-', '')
where public_token is null;

create unique index if not exists payments_public_token_idx on public.payments (public_token);
create index if not exists payments_quote_id_idx on public.payments (quote_id);

alter table public.payments drop constraint if exists payments_kind_check;
alter table public.payments add constraint payments_kind_check
  check (kind in ('deposit', 'balance', 'full'));

create table if not exists public.sms_templates (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  body           text not null,
  trigger_event  text,
  active         boolean not null default true,
  created_at     timestamptz not null default now()
);

alter table public.sms_templates enable row level security;

revoke all on table public.sms_templates from public, anon;
grant select, insert, update, delete on table public.sms_templates to authenticated;

drop policy if exists "Staff can read sms templates" on public.sms_templates;
create policy "Staff can read sms templates"
  on public.sms_templates for select to authenticated
  using (private.is_staff());

drop policy if exists "Staff can insert sms templates" on public.sms_templates;
create policy "Staff can insert sms templates"
  on public.sms_templates for insert to authenticated
  with check (private.is_staff());

drop policy if exists "Staff can update sms templates" on public.sms_templates;
create policy "Staff can update sms templates"
  on public.sms_templates for update to authenticated
  using (private.is_staff())
  with check (private.is_staff());

drop policy if exists "Staff can delete sms templates" on public.sms_templates;
create policy "Staff can delete sms templates"
  on public.sms_templates for delete to authenticated
  using (private.is_staff());

insert into public.sms_templates (name, body, trigger_event)
select * from (values
  (
    'Quote ready',
    'Hello {{name}}, your landed quote {{invoice}} is ready: {{total}}. Deposit {{deposit}}. Open {{quote_url}} or call 054 030 9637.',
    'order:Quoted'
  ),
  (
    'Deposit received',
    'Hello {{name}}, we received your deposit of {{amount}} for {{invoice}}. We are sourcing your goods. Official line 054 030 9637.',
    'payment:deposit'
  ),
  (
    'Paid in full',
    'Hello {{name}}, payment of {{amount}} received for {{invoice}}. Official line 054 030 9637.',
    'payment:paid'
  ),
  (
    'Sourcing',
    'Hello {{name}}, we are sourcing {{invoice}} from China / Turkey. Official line 054 030 9637.',
    'shipment:sourcing'
  ),
  (
    'On the vessel',
    'Hello {{name}}, {{invoice}} is on the vessel to Ghana. Official line 054 030 9637.',
    'shipment:vessel'
  ),
  (
    'Tema',
    'Hello {{name}}, your goods for {{invoice}} have arrived in Tema. Balance {{balance}}. Official line 054 030 9637.',
    'shipment:tema'
  ),
  (
    'Ready for pickup',
    'Hello {{name}}, {{invoice}} is ready for pickup. Balance {{balance}}. Official line 054 030 9637.',
    'shipment:ready'
  )
) as seed(name, body, trigger_event)
where not exists (select 1 from public.sms_templates);

create table if not exists public.activity_log (
  id           uuid primary key default gen_random_uuid(),
  actor_id     uuid references auth.users(id) on delete set null,
  actor_name   text,
  action       text not null,
  entity_type  text,
  entity_id    text,
  detail       text,
  created_at   timestamptz not null default now()
);

create index if not exists activity_log_created_at_idx
  on public.activity_log (created_at desc);

alter table public.activity_log enable row level security;

revoke all on table public.activity_log from public, anon;
grant select, insert on table public.activity_log to authenticated;

drop policy if exists "Staff can read activity" on public.activity_log;
create policy "Staff can read activity"
  on public.activity_log for select to authenticated
  using (private.is_staff());

drop policy if exists "Staff can insert activity" on public.activity_log;
create policy "Staff can insert activity"
  on public.activity_log for insert to authenticated
  with check (private.is_staff());

drop policy if exists "Staff can read sms settings" on public.sms_settings;
create policy "Staff can read sms settings"
  on public.sms_settings for select to authenticated
  using (private.is_owner());

drop policy if exists "Staff can write sms settings" on public.sms_settings;
drop policy if exists "Staff can update sms settings" on public.sms_settings;
create policy "Owners can write sms settings"
  on public.sms_settings for insert to authenticated
  with check (private.is_owner());
create policy "Owners can update sms settings"
  on public.sms_settings for update to authenticated
  using (private.is_owner())
  with check (private.is_owner());

drop policy if exists "Staff can read payment settings" on public.payment_settings;
create policy "Staff can read payment settings"
  on public.payment_settings for select to authenticated
  using (private.is_owner());

drop policy if exists "Staff can update payment settings" on public.payment_settings;
create policy "Owners can update payment settings"
  on public.payment_settings for update to authenticated
  using (private.is_owner())
  with check (private.is_owner());
