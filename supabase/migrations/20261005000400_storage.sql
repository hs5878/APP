-- T19 · 사진 Storage. 기준: DATA_MODEL §3 photos.remote_path, §5.1(사진 파일), SPEC 보안(비공개 버킷 + 서명 URL).
--
-- 비공개 버킷 `photos`. 객체 이름 = photos.remote_path:
--   spaces/{space_id}/photos/{photo_id}.bin        보관본 암호문
--   spaces/{space_id}/photos/{photo_id}.thumb.bin  썸네일 암호문
-- 파일은 기기에서 암호화한 바이트라 MIME은 application/octet-stream 하나만 받는다.
-- 읽기는 공간 멤버, 올리기·덮어쓰기는 active 공간 멤버. 삭제는 영구 삭제 예약 작업(service_role)만 한다.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 10485760, array['application/octet-stream'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 객체 이름에서 space_id를 꺼낸다. 위 두 모양이 아니면 null(→ 어떤 정책도 통과하지 못함).
create function public.photo_object_space_id(object_name text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select (
    regexp_match(
      object_name,
      '^spaces/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/photos/'
      '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(\.thumb)?\.bin$'
    )
  )[1]::uuid;
$$;

revoke execute on function public.photo_object_space_id(text) from public, anon;
grant execute on function public.photo_object_space_id(text) to authenticated, service_role;

create policy photos_bucket_select on storage.objects
  for select to authenticated
  using (bucket_id = 'photos' and public.is_space_member(public.photo_object_space_id(name)));

create policy photos_bucket_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'photos' and public.is_space_writable(public.photo_object_space_id(name)));

create policy photos_bucket_update on storage.objects
  for update to authenticated
  using (bucket_id = 'photos' and public.is_space_writable(public.photo_object_space_id(name)))
  with check (bucket_id = 'photos' and public.is_space_writable(public.photo_object_space_id(name)));
