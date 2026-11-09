-- "Start over" for the trial period: wipe this account's data on the server and on every device.
-- This is the ONE place rows in public.operations are ever deleted, and only all of them at once
-- for the signed-in user (a full reset, never a correction — corrections stay append-only).
--
-- Each reset bumps account_state.epoch. On every sync a device compares its stored epoch with the
-- server's; if the server's is newer the device clears its local data before pushing anything,
-- so old test data on a second phone cannot come back.

create table if not exists public.account_state (
  owner uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  epoch integer not null default 0,
  reset_at timestamptz
);
alter table public.account_state enable row level security;
create policy "own state: read" on public.account_state for select using (owner = (select auth.uid()));

create or replace function public.reset_my_data()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  paths text[];
  new_epoch integer;
begin
  if uid is null then
    raise exception 'not signed in';
  end if;
  select coalesce(array_agg(path), '{}') into paths from public.attachments where owner = uid;
  delete from public.attachments where owner = uid;
  delete from public.operations where owner = uid;
  delete from public.items where owner = uid;
  delete from public.customers where owner = uid;
  insert into public.account_state (owner, epoch, reset_at) values (uid, 1, now())
  on conflict (owner) do update set epoch = public.account_state.epoch + 1, reset_at = now()
  returning epoch into new_epoch;
  return jsonb_build_object('epoch', new_epoch, 'paths', to_jsonb(paths));
end $$;

revoke all on function public.reset_my_data() from public, anon;
grant execute on function public.reset_my_data() to authenticated;

-- Photos are removed through the Storage API (direct SQL deletes on storage.objects are blocked).
create policy "own files: delete" on storage.objects for delete
  using (bucket_id = 'attachments' and (storage.foldername(name))[1] = (select auth.uid())::text);
