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
