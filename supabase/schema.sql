-- ============================================================
-- MWINBARKA IMPORTS — database schema
-- Run this once in the Supabase SQL editor (Dashboard > SQL Editor).
-- ============================================================

create table if not exists public.requests (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  phone           text not null,
  location        text,
  request_details text not null,
  category        text,
  reference_url   text,
  budget_range    text,
  quantity        text,
  origin          text,
  shipping_method text,
  photo_url       text,
  status          text not null default 'New',
  created_at      timestamptz not null default now(),
  constraint requests_status_check
    check (status in ('New', 'Contacted', 'Quoted', 'Confirmed', 'Closed'))
);

-- The admin desk always sorts newest first.
create index if not exists requests_created_at_idx
  on public.requests (created_at desc);

-- ============================================================
-- Row level security
--
-- The anon key ships in the browser, so RLS is the only thing
-- protecting customer data. The public may INSERT a request and
-- nothing else; reading and updating requires a signed-in user.
-- ============================================================

alter table public.requests enable row level security;

drop policy if exists "Anyone can submit a request" on public.requests;
create policy "Anyone can submit a request"
  on public.requests
  for insert
  to anon, authenticated
  with check (true);

drop policy if exists "Signed-in staff can read requests" on public.requests;
create policy "Signed-in staff can read requests"
  on public.requests
  for select
  to authenticated
  using (true);

drop policy if exists "Signed-in staff can update requests" on public.requests;
create policy "Signed-in staff can update requests"
  on public.requests
  for update
  to authenticated
  using (true)
  with check (true);

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

drop policy if exists "Signed-in staff can add products" on public.products;
create policy "Signed-in staff can add products"
  on public.products
  for insert
  to authenticated
  with check (true);

drop policy if exists "Signed-in staff can update products" on public.products;
create policy "Signed-in staff can update products"
  on public.products
  for update
  to authenticated
  using (true)
  with check (true);

drop policy if exists "Signed-in staff can delete products" on public.products;
create policy "Signed-in staff can delete products"
  on public.products
  for delete
  to authenticated
  using (true);

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

drop policy if exists "Signed-in staff can update site settings" on public.site_settings;
create policy "Signed-in staff can update site settings"
  on public.site_settings
  for update
  to authenticated
  using (true)
  with check (true);

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

drop policy if exists "Signed-in staff can upload media" on storage.objects;
create policy "Signed-in staff can upload media"
  on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'media');

drop policy if exists "Signed-in staff can update media" on storage.objects;
create policy "Signed-in staff can update media"
  on storage.objects
  for update
  to authenticated
  using (bucket_id = 'media')
  with check (bucket_id = 'media');

drop policy if exists "Signed-in staff can delete media" on storage.objects;
create policy "Signed-in staff can delete media"
  on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'media');

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
-- Creating the admin login
--
-- Supabase Dashboard > Authentication > Users > "Add user",
-- with "Auto Confirm User" ticked. That email and password are
-- what admin.html asks for.
--
-- ============================================================
-- Public sign-up is off
--
-- The dashboard toggle (Authentication → Email → Allow new users
-- to sign up) needs a Management API token we don't have here, so
-- new accounts are blocked at the database instead. The existing
-- admin user can still sign in. Anyone else who hits /signup gets
-- "Public sign-up is disabled".
-- ============================================================

create schema if not exists private;

create or replace function private.reject_extra_signups()
returns trigger
language plpgsql
security definer
set search_path = auth, private
as $$
begin
  if exists (select 1 from auth.users) then
    raise exception 'Public sign-up is disabled';
  end if;
  return new;
end;
$$;

drop trigger if exists reject_extra_signups on auth.users;
create trigger reject_extra_signups
before insert on auth.users
for each row
execute function private.reject_extra_signups();
-- ============================================================
