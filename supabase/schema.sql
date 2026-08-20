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
-- Creating the admin login
--
-- Supabase Dashboard > Authentication > Users > "Add user",
-- with "Auto Confirm User" ticked. That email and password are
-- what admin.html asks for.
--
-- Then turn OFF public sign-ups so nobody else can create an
-- account that would pass the policies above:
-- Authentication > Sign In / Providers > Email > disable
-- "Allow new users to sign up".
-- ============================================================
