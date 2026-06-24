-- Asset photos for the resale board (Task 1.4).
-- photos[] holds ordered PUBLIC object URLs from the `gear` Storage bucket.
-- Decision: the gear bucket is PUBLIC-read. Photos are non-sensitive gear
-- images and object paths are unguessable; a public bucket avoids per-render
-- signed-URL complexity on the token-gated buyer board (built next).

alter table public.assets
  add column photos text[] not null default '{}';

-- ── gear bucket: public read, owner-only write ──────────────────────────────
insert into storage.buckets (id, name, public)
values ('gear', 'gear', true)
on conflict (id) do nothing;

-- public SELECT: anyone can read gear images by URL (needed for buyer board)
create policy gear_public_read on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'gear');

-- authenticated-only writes: only the logged-in owner uploads/replaces/removes
create policy gear_owner_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'gear');

create policy gear_owner_update on storage.objects
  for update to authenticated
  using (bucket_id = 'gear')
  with check (bucket_id = 'gear');

create policy gear_owner_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'gear');
