-- ============================================================
-- MWINBARKA IMPORTS — AI assistant tables
-- Run once if the live project was created from schema.sql
-- before this section existed. Safe to re-run.
-- ============================================================

create table if not exists public.ai_settings (
  id                        integer primary key default 1 check (id = 1),
  enabled                   boolean not null default true,
  welcome_message           text not null,
  business_description      text not null default '',
  faqs                      text not null default '',
  importation_instructions  text not null default '',
  business_hours            text not null default '',
  support_contact           text not null default '',
  whatsapp_number           text not null default '054 030 9637',
  extra_instructions        text not null default '',
  updated_at                timestamptz not null default now()
);

alter table public.ai_settings enable row level security;

revoke all on table public.ai_settings from public;
grant select on table public.ai_settings to anon, authenticated;
grant update on table public.ai_settings to authenticated;

drop policy if exists "Anyone can read AI settings" on public.ai_settings;
create policy "Anyone can read AI settings"
  on public.ai_settings for select
  to anon, authenticated
  using (true);

drop policy if exists "Staff can update AI settings" on public.ai_settings;
create policy "Staff can update AI settings"
  on public.ai_settings for update
  to authenticated
  using (private.is_staff())
  with check (private.is_staff());

insert into public.ai_settings (
  id,
  enabled,
  welcome_message,
  business_description,
  faqs,
  importation_instructions,
  business_hours,
  support_contact,
  whatsapp_number,
  extra_instructions
) values (
  1,
  true,
  'Hi 👋 Welcome to Mwinbarka Imports. I''m your AI assistant. I can help you find products, understand our importation process, check product information, and help you start an order. What would you like to import?',
  'Mwinbarka Imports is an Accra import desk. We source goods from China and Turkey for customers in Ghana and quote one landed price in GH₵. There is no cart and no payment on the website. Pricing, payment, and confirmation happen on the official line 054 030 9637 only.',
  'How is pricing done?
Supplier price plus sea freight plus clearing is combined into one GH₵ landed quote. Catalog prices are indicative only.

How long does it take?
Most quotes come within 24 hours. Sea transit is typically 4–8 weeks after the supplier ships.

How do I pay?
Payment terms are agreed on the official line before we source. Nothing is charged through this website.

Can I send a product link or photo?
Yes. Use the Order Now form, or send a link/photo in this chat and we will open a request for the desk.

Do you ship by air?
No. We ship by sea only, to Tema, then deliver nationwide in Ghana.',
  '1. Customer describes the item, pastes a product link, or uploads a photo.
2. They submit an importation request (Order Now form or this assistant).
3. The desk sources the item and sends one GH₵ landed quote, usually within 24 hours.
4. Customer confirms price and payment on the official line 054 030 9637.
5. We buy, ship by sea to Tema (typically 4–8 weeks after the supplier ships), clear customs, and deliver in Ghana.',
  'Monday–Saturday 9:00–18:00. Sunday closed.',
  'Official line 054 030 9637 only. If another number asks for a private fee, it is not Mwinbarka.',
  '054 030 9637',
  ''
)
on conflict (id) do nothing;

create table if not exists public.ai_messages (
  id          uuid primary key default gen_random_uuid(),
  session_id  text not null,
  user_id     uuid references auth.users(id) on delete set null,
  role        text not null check (role in ('user', 'assistant')),
  content     text not null,
  created_at  timestamptz not null default now()
);

create index if not exists ai_messages_created_at_idx
  on public.ai_messages (created_at desc);

create index if not exists ai_messages_session_created_idx
  on public.ai_messages (session_id, created_at);

alter table public.ai_messages enable row level security;

revoke all on table public.ai_messages from public, anon;
grant select on table public.ai_messages to authenticated;

drop policy if exists "Staff can read AI messages" on public.ai_messages;
create policy "Staff can read AI messages"
  on public.ai_messages for select
  to authenticated
  using (private.is_staff());
