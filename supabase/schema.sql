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
  email      text not null default '',
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
  with check (
    id = auth.uid()
    and is_staff is not distinct from (select p.is_staff from public.profiles p where p.id = auth.uid())
    and staff_role is not distinct from (select p.staff_role from public.profiles p where p.id = auth.uid())
  );

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
  insert into public.profiles (id, full_name, phone, email, is_staff)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'phone', ''),
    coalesce(new.email, ''),
    false
  )
  on conflict (id) do update
    set email = excluded.email
    where public.profiles.email = '';
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
-- Site settings — one row. Channel link and social URLs.
-- The public site reads this so the floating group button and video gate
-- pick up whatever the admin pasted in.
-- whatsapp_channel_url holds the WhatsApp group invite (chat.whatsapp.com/...).
-- ============================================================

create table if not exists public.site_settings (
  id                    integer primary key default 1 check (id = 1),
  whatsapp_channel_url  text,
  whatsapp_url          text,
  facebook_url          text,
  instagram_url         text,
  tiktok_url            text,
  advert_video_url      text,
  support_phone         text,
  support_email         text,
  updated_at            timestamptz not null default now()
);

insert into public.site_settings (id)
values (1)
on conflict (id) do nothing;

alter table public.site_settings
  add column if not exists support_phone text,
  add column if not exists support_email text;

update public.site_settings
set
  support_phone = coalesce(nullif(btrim(support_phone), ''), '054 030 9637'),
  support_email = coalesce(nullif(btrim(support_email), ''), 'amponsahbrain2007@gmail.com')
where id = 1;

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
-- Storage — product photos.
-- Public can read; only a signed-in admin can upload.
-- ============================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = true,
      file_size_limit = 5242880,
      allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

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
    and coalesce(storage.extension(name), '') in ('jpg', 'jpeg', 'png', 'webp')
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

-- Privilege columns are never updatable by browser roles. Owners use set_staff_role().
revoke update (is_staff, staff_role) on table public.profiles from authenticated, anon, public;

create or replace function public.set_staff_role(target_id uuid, make_staff boolean, new_role text default 'assistant')
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not private.is_owner() then
    raise exception 'Only owners can change staff roles';
  end if;
  if target_id is null then
    raise exception 'Missing profile';
  end if;
  if new_role is null or new_role not in ('owner', 'assistant') then
    raise exception 'Invalid staff role';
  end if;
  update public.profiles
  set is_staff = make_staff,
      staff_role = case when make_staff then new_role else 'assistant' end,
      updated_at = now()
  where id = target_id;
end;
$$;

revoke all on function public.set_staff_role(uuid, boolean, text) from public;
grant execute on function public.set_staff_role(uuid, boolean, text) to authenticated;

alter table public.profiles
  add column if not exists email text not null default '',
  add column if not exists company_name text not null default '',
  add column if not exists whatsapp text not null default '',
  add column if not exists region text not null default '',
  add column if not exists city text not null default '',
  add column if not exists address text not null default '',
  add column if not exists landmark text not null default '',
  add column if not exists preferred_origin text not null default 'either',
  add column if not exists desk_notes text not null default '',
  add column if not exists notify_sms boolean not null default true,
  add column if not exists notify_whatsapp boolean not null default true,
  add column if not exists notify_email boolean not null default true,
  add column if not exists updated_at timestamptz not null default now();

alter table public.profiles drop constraint if exists profiles_preferred_origin_check;
alter table public.profiles add constraint profiles_preferred_origin_check
  check (preferred_origin in ('china', 'turkey', 'either'));

grant update (
  full_name, phone, email, company_name, whatsapp, region, city, address, landmark,
  preferred_origin, notify_sms, notify_whatsapp, notify_email, updated_at
) on table public.profiles to authenticated;

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
drop policy if exists "Staff can update desk settings" on public.desk_settings;
create policy "Staff can update desk settings"
  on public.desk_settings for update to authenticated
  using (private.is_staff())
  with check (private.is_staff());

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
    'Order received',
    E'Order Received! 🛍️\n\nHello {{name}}, your order has been successfully received and is now being processed. ✅\n\nWe’ll notify you once your goods are ready for delivery/pickup.\n\nThank you for choosing Mwinbarka Imports. We appreciate your business! ❤️',
    'order:New'
  ),
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
drop policy if exists "Owners can write sms settings" on public.sms_settings;
drop policy if exists "Owners can update sms settings" on public.sms_settings;
create policy "Staff can read sms settings"
  on public.sms_settings for select to authenticated
  using (private.is_staff());
create policy "Staff can write sms settings"
  on public.sms_settings for insert to authenticated
  with check (private.is_staff());
create policy "Staff can update sms settings"
  on public.sms_settings for update to authenticated
  using (private.is_staff())
  with check (private.is_staff());

drop policy if exists "Staff can read payment settings" on public.payment_settings;
drop policy if exists "Owners can update payment settings" on public.payment_settings;
drop policy if exists "Staff can update payment settings" on public.payment_settings;
create policy "Staff can read payment settings"
  on public.payment_settings for select to authenticated
  using (private.is_staff());
create policy "Staff can update payment settings"
  on public.payment_settings for update to authenticated
  using (private.is_staff())
  with check (private.is_staff());

-- ============================================================
-- Input length + HTML strip (server-side; never trust the browser)
-- ============================================================

create or replace function private.strip_tags(value text)
returns text
language sql
immutable
as $$
  select trim(both from regexp_replace(
    regexp_replace(coalesce(value, ''), '<(script|style)[^>]*>.*?</\1>', '', 'gi'),
    '<[^>]+>', '', 'g'
  ));
$$;

create or replace function private.sanitize_request_row()
returns trigger
language plpgsql
as $$
begin
  new.name := left(private.strip_tags(new.name), 100);
  new.phone := left(regexp_replace(coalesce(new.phone, ''), '[^\d\s+\-]', '', 'g'), 24);
  new.email := left(lower(private.strip_tags(new.email)), 254);
  new.location := left(private.strip_tags(new.location), 200);
  new.request_details := left(private.strip_tags(new.request_details), 4000);
  new.category := left(private.strip_tags(new.category), 80);
  new.quantity := left(private.strip_tags(new.quantity), 80);
  new.origin := left(private.strip_tags(new.origin), 40);
  new.reference_url := left(private.strip_tags(new.reference_url), 2048);
  if new.reference_url is not null
     and new.reference_url <> ''
     and new.reference_url !~* '^https?://' then
    new.reference_url := null;
  end if;
  return new;
end;
$$;

drop trigger if exists requests_sanitize on public.requests;
create trigger requests_sanitize
  before insert or update on public.requests
  for each row execute function private.sanitize_request_row();

create or replace function private.sanitize_review_row()
returns trigger
language plpgsql
as $$
begin
  new.author_name := left(private.strip_tags(new.author_name), 100);
  new.location := left(private.strip_tags(new.location), 200);
  new.quote := left(private.strip_tags(new.quote), 2000);
  return new;
end;
$$;

drop trigger if exists reviews_sanitize on public.reviews;
create trigger reviews_sanitize
  before insert or update on public.reviews
  for each row execute function private.sanitize_review_row();

create or replace function private.sanitize_profile_row()
returns trigger
language plpgsql
as $$
begin
  new.full_name := left(private.strip_tags(new.full_name), 100);
  new.phone := left(regexp_replace(coalesce(new.phone, ''), '[^\d\s+\-]', '', 'g'), 24);
  new.company_name := left(private.strip_tags(new.company_name), 120);
  new.whatsapp := left(regexp_replace(coalesce(new.whatsapp, ''), '[^\d\s+\-]', '', 'g'), 24);
  new.city := left(private.strip_tags(new.city), 80);
  new.address := left(private.strip_tags(new.address), 200);
  new.landmark := left(private.strip_tags(new.landmark), 120);
  return new;
end;
$$;

drop trigger if exists profiles_sanitize on public.profiles;
create trigger profiles_sanitize
  before insert or update on public.profiles
  for each row execute function private.sanitize_profile_row();

alter table public.requests drop constraint if exists requests_name_len;
alter table public.requests add constraint requests_name_len
  check (char_length(name) between 1 and 100);
alter table public.requests drop constraint if exists requests_phone_len;
alter table public.requests add constraint requests_phone_len
  check (char_length(phone) between 8 and 24);
alter table public.requests drop constraint if exists requests_details_len;
alter table public.requests add constraint requests_details_len
  check (char_length(request_details) between 1 and 4000);

alter table public.reviews drop constraint if exists reviews_author_len;
alter table public.reviews add constraint reviews_author_len
  check (char_length(author_name) between 1 and 100);
alter table public.reviews drop constraint if exists reviews_quote_len;
alter table public.reviews add constraint reviews_quote_len
  check (char_length(quote) between 1 and 2000);

-- Login may use a Ghana number. Anon can resolve it to the account email
-- so the browser can call signInWithPassword without reading profiles.
create or replace function public.login_email_for_identifier(p_id text)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  raw text := lower(btrim(coalesce(p_id, '')));
  digits text;
  found_email text;
begin
  if raw = '' then
    return null;
  end if;

  if position('@' in raw) > 0 then
    select p.email into found_email
    from public.profiles p
    where lower(p.email) = raw and coalesce(p.email, '') <> ''
    limit 1;
    return coalesce(found_email, raw);
  end if;

  digits := regexp_replace(raw, '\D', '', 'g');
  if left(digits, 2) = '00' then
    digits := substr(digits, 3);
  end if;
  if left(digits, 3) = '233' and length(digits) = 12 then
    digits := '0' || substr(digits, 4);
  elsif length(digits) = 9 then
    digits := '0' || digits;
  end if;
  if length(digits) <> 10 then
    return null;
  end if;

  select p.email into found_email
  from public.profiles p
  where regexp_replace(coalesce(p.phone, ''), '\D', '', 'g') in (
      digits,
      '233' || substr(digits, 2)
    )
    and coalesce(p.email, '') <> ''
  order by p.is_staff desc, p.created_at asc
  limit 1;

  return found_email;
end;
$$;

revoke all on function public.login_email_for_identifier(text) from public;
-- Browser roles must not resolve phone → email (account oracle).
-- Edge Function auth-with-identifier uses service_role instead.
revoke all on function public.login_email_for_identifier(text) from anon, authenticated;
grant execute on function public.login_email_for_identifier(text) to service_role;
-- ============================================================
-- Adminship transfer (owner-only, audited)
-- ============================================================

create table if not exists public.adminship_transfers (
  id                   uuid primary key default gen_random_uuid(),
  previous_owner_id    uuid not null references public.profiles(id),
  previous_owner_email text not null,
  new_owner_id         uuid not null references public.profiles(id),
  new_owner_email      text not null,
  status               text not null default 'completed'
                       check (status in ('completed', 'failed')),
  created_at           timestamptz not null default now()
);

alter table public.adminship_transfers enable row level security;

drop policy if exists "Owners can read adminship transfers" on public.adminship_transfers;
create policy "Owners can read adminship transfers"
  on public.adminship_transfers for select to authenticated
  using (private.is_owner());

revoke all on table public.adminship_transfers from anon, public;
grant select on table public.adminship_transfers to authenticated;

create or replace function public.transfer_adminship(new_owner_email text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  actor_email text;
  target_email text := lower(trim(coalesce(new_owner_email, '')));
  target_id uuid;
  target_row public.profiles%rowtype;
  transfer_id uuid;
begin
  if actor_id is null then
    raise exception 'Not signed in';
  end if;
  if not private.is_owner() then
    raise exception 'Only the current owner can transfer adminship';
  end if;
  if target_email = '' or position('@' in target_email) = 0 then
    raise exception 'Enter a valid registered email';
  end if;

  select coalesce(nullif(p.email, ''), u.email)
    into actor_email
  from public.profiles p
  left join auth.users u on u.id = p.id
  where p.id = actor_id;

  select p.* into target_row
  from public.profiles p
  where lower(trim(p.email)) = target_email
  limit 1;

  if target_row.id is null then
    select p.* into target_row
    from public.profiles p
    join auth.users u on u.id = p.id
    where lower(trim(u.email)) = target_email
    limit 1;
  end if;

  if target_row.id is null then
    raise exception 'No registered account found for that email';
  end if;

  target_id := target_row.id;
  if target_id = actor_id then
    raise exception 'You already own this desk';
  end if;

  -- Promote the selected user to owner/admin.
  update public.profiles
  set is_staff = true,
      staff_role = 'owner',
      email = case when coalesce(email, '') = '' then target_email else email end,
      updated_at = now()
  where id = target_id;

  -- Demote the previous owner (keeps staff access as assistant).
  update public.profiles
  set staff_role = 'assistant',
      is_staff = true,
      updated_at = now()
  where id = actor_id;

  insert into public.adminship_transfers (
    previous_owner_id, previous_owner_email,
    new_owner_id, new_owner_email, status
  ) values (
    actor_id, coalesce(actor_email, ''),
    target_id, target_email, 'completed'
  )
  returning id into transfer_id;

  return jsonb_build_object(
    'ok', true,
    'transfer_id', transfer_id,
    'previous_owner_id', actor_id,
    'previous_owner_email', coalesce(actor_email, ''),
    'new_owner_id', target_id,
    'new_owner_email', target_email,
    'status', 'completed',
    'transferred_at', now()
  );
end;
$$;

revoke all on function public.transfer_adminship(text) from public;
grant execute on function public.transfer_adminship(text) to authenticated;
