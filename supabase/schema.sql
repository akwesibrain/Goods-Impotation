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
  provider     text not null default 'arkesel',
  api_key      text,
  account_sid  text,
  sender_id    text,
  updated_at   timestamptz not null default now(),
  constraint sms_settings_provider_check
    check (provider in ('arkesel', 'twilio'))
);

insert into public.sms_settings (id, provider)
values (1, 'arkesel')
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
