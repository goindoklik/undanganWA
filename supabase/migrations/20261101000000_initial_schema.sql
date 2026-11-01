create extension if not exists pgcrypto;

create sequence if not exists public.registration_number_seq start 1;

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

create table if not exists public.invite_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  event_title text not null default 'Undangan Acara',
  event_date timestamptz,
  venue text,
  invitation_image_url text,
  ticket_background_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.invitations (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references public.invite_campaigns(id) on delete set null,
  phone text not null,
  contact_name text,
  inviter_name text,
  status text not null default 'queued' check (status in ('queued','sent','failed','registered')),
  wablas_message_id text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (campaign_id, phone)
);

create table if not exists public.registrations (
  id uuid primary key default gen_random_uuid(),
  registration_no text not null unique,
  campaign_id uuid references public.invite_campaigns(id) on delete set null,
  invitation_id uuid references public.invitations(id) on delete set null,
  name text not null,
  whatsapp text not null,
  address text not null,
  inviter text not null,
  inviter_whatsapp text,
  guest_count integer not null default 2 check (guest_count = 2),
  attendance_count integer not null default 0 check (attendance_count between 0 and 2),
  status text not null default 'registered' check (status in ('registered','cancelled','attended')),
  ticket_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists registrations_created_at_idx on public.registrations(created_at desc);
create index if not exists registrations_whatsapp_idx on public.registrations(whatsapp);
create index if not exists invitations_phone_idx on public.invitations(phone);

create table if not exists public.bot_conversations (
  phone text primary key,
  push_name text,
  state text not null default 'idle' check (state in ('idle','awaiting_registration')),
  campaign_id uuid references public.invite_campaigns(id) on delete set null,
  inviter_name text,
  inviter_whatsapp text,
  last_message_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.wablas_inbound_events (
  id bigint generated always as identity primary key,
  wablas_message_id text not null unique,
  sender_phone text not null,
  message_type text,
  message_text text,
  received_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;
alter table public.invite_campaigns enable row level security;
alter table public.invitations enable row level security;
alter table public.registrations enable row level security;
alter table public.bot_conversations enable row level security;
alter table public.wablas_inbound_events enable row level security;

create policy "Admins can read own admin profile"
on public.admin_users for select to authenticated
using (user_id = (select auth.uid()));

create policy "Admins can read campaigns"
on public.invite_campaigns for select to authenticated
using (exists (select 1 from public.admin_users a where a.user_id = (select auth.uid())));

create policy "Admins can manage campaigns"
on public.invite_campaigns for all to authenticated
using (exists (select 1 from public.admin_users a where a.user_id = (select auth.uid())))
with check (exists (select 1 from public.admin_users a where a.user_id = (select auth.uid())));

create policy "Admins can manage invitations"
on public.invitations for all to authenticated
using (exists (select 1 from public.admin_users a where a.user_id = (select auth.uid())))
with check (exists (select 1 from public.admin_users a where a.user_id = (select auth.uid())));

create policy "Admins can manage registrations"
on public.registrations for all to authenticated
using (exists (select 1 from public.admin_users a where a.user_id = (select auth.uid())))
with check (exists (select 1 from public.admin_users a where a.user_id = (select auth.uid())));

create policy "Admins can read conversations"
on public.bot_conversations for select to authenticated
using (exists (select 1 from public.admin_users a where a.user_id = (select auth.uid())));

create policy "Admins can read inbound events"
on public.wablas_inbound_events for select to authenticated
using (exists (select 1 from public.admin_users a where a.user_id = (select auth.uid())));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('undangan-assets','undangan-assets',true,2097152,array['image/jpeg','image/png'])
on conflict (id) do nothing;

create policy "Public can view invitation and ticket assets"
on storage.objects for select to anon, authenticated
using (bucket_id = 'undangan-assets');

create policy "Admins can upload invitation and ticket assets"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'undangan-assets'
  and exists (select 1 from public.admin_users a where a.user_id = (select auth.uid()))
);

create policy "Admins can update invitation and ticket assets"
on storage.objects for update to authenticated
using (
  bucket_id = 'undangan-assets'
  and exists (select 1 from public.admin_users a where a.user_id = (select auth.uid()))
)
with check (
  bucket_id = 'undangan-assets'
  and exists (select 1 from public.admin_users a where a.user_id = (select auth.uid()))
);

create or replace function public.make_registration_no()
returns text
language sql
volatile
set search_path = ''
as $$
  select 'EVT-' || to_char(now() at time zone 'Asia/Jakarta','YYYY') || '-' ||
         lpad(nextval('public.registration_number_seq')::text, 6, '0');
$$;

grant usage, select on sequence public.registration_number_seq to service_role;
