-- Public image bucket for beat covers. The upload API creates this if it can;
-- run this in the Supabase SQL editor if JPEG covers still fail.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'covers',
  'covers',
  true,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public read covers" on storage.objects;
create policy "Public read covers"
on storage.objects for select
using (bucket_id = 'covers');
