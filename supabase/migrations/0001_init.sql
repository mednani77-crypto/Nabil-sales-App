-- Nabil Sales Assistant — cloud schema (phase 5)
-- One personal account. Every row belongs to auth.uid(); RLS makes other users' data invisible.
-- Operations are APPEND-ONLY: there are no update/delete policies on them.

-- ---------- operations ----------
create table if not exists public.operations (
  id uuid primary key,
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  device_id text not null,
  type text not null,
  op_date date not null,
  created_at timestamptz not null,
  payload jsonb not null,
  server_seq bigint generated always as identity unique,
  received_at timestamptz not null default now()
);
create index if not exists operations_owner_seq on public.operations (owner, server_seq);

alter table public.operations enable row level security;
create policy "own operations: read" on public.operations for select using (owner = (select auth.uid()));
create policy "own operations: append" on public.operations for insert with check (owner = (select auth.uid()));

-- ---------- master data (items, customers): last write wins by updated_at ----------
create sequence if not exists public.master_seq;

create table if not exists public.items (
  id uuid primary key,
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  payload jsonb not null,
  updated_at timestamptz not null,
  server_seq bigint not null default nextval('public.master_seq')
);
create table if not exists public.customers (
  id uuid primary key,
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  payload jsonb not null,
  updated_at timestamptz not null,
  server_seq bigint not null default nextval('public.master_seq')
);
create index if not exists items_owner_seq on public.items (owner, server_seq);
create index if not exists customers_owner_seq on public.customers (owner, server_seq);

-- Ignore stale updates (older updated_at) and bump server_seq on every accepted change.
create or replace function public.master_lww()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.updated_at <= old.updated_at then
    return old;
  end if;
  new.owner := old.owner;
  new.server_seq := nextval('public.master_seq');
  return new;
end $$;

create trigger items_lww before update on public.items for each row execute function public.master_lww();
create trigger customers_lww before update on public.customers for each row execute function public.master_lww();

alter table public.items enable row level security;
alter table public.customers enable row level security;
create policy "own items" on public.items for all using (owner = (select auth.uid())) with check (owner = (select auth.uid()));
create policy "own customers" on public.customers for all using (owner = (select auth.uid())) with check (owner = (select auth.uid()));

-- ---------- attachments (receipt photos) ----------
create table if not exists public.attachments (
  id uuid primary key,
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  op_id uuid not null,
  path text not null,
  mime text not null,
  created_at timestamptz not null,
  server_seq bigint generated always as identity unique
);
create index if not exists attachments_owner_seq on public.attachments (owner, server_seq);
alter table public.attachments enable row level security;
create policy "own attachments: read" on public.attachments for select using (owner = (select auth.uid()));
create policy "own attachments: add" on public.attachments for insert with check (owner = (select auth.uid()));

insert into storage.buckets (id, name, public) values ('attachments', 'attachments', false)
on conflict (id) do nothing;

-- Files live under "<user id>/..." and only that user can read or add them.
create policy "own files: read" on storage.objects for select
  using (bucket_id = 'attachments' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "own files: add" on storage.objects for insert
  with check (bucket_id = 'attachments' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ---------- devices (unique short code per device, used in document numbers) ----------
create table if not exists public.devices (
  id text primary key,
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  code text not null,
  label text,
  last_sync_at timestamptz,
  unique (owner, code)
);
alter table public.devices enable row level security;
create policy "own devices" on public.devices for all using (owner = (select auth.uid())) with check (owner = (select auth.uid()));
