-- Private bucket for learner checklist document uploads (signed URLs issued by the API).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'checklist-evidence',
  'checklist-evidence',
  false,
  10485760,
  array['application/pdf', 'image/png', 'image/jpeg', 'image/webp']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
