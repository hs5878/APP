-- T19 · 사진 Storage 경로 정책. 비공개 버킷 photos, 경로 spaces/{space_id}/photos/{photo_id}(.thumb).bin.
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

create schema tests;
grant usage on schema tests to authenticated;
create function tests.login(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
end;
$$;
grant execute on all functions in schema tests to authenticated;

insert into auth.users (id, email) values
  ('00000000-0000-4000-a000-00000000000a', 'a@test'),
  ('00000000-0000-4000-a000-00000000000b', 'b@test'),
  ('00000000-0000-4000-a000-00000000000c', 'c@test');
select public.create_space('00000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-00000000000a');
select public.create_space('00000000-0000-4000-b000-000000000002', '00000000-0000-4000-a000-00000000000c');
insert into public.space_members (space_id, user_id, role)
values ('00000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-00000000000b', 'member');

select is(
  public.photo_object_space_id('spaces/00000000-0000-4000-b000-000000000001/photos/00000000-0000-4000-c000-0000000000f1.thumb.bin'),
  '00000000-0000-4000-b000-000000000001'::uuid,
  '썸네일 경로에서 space_id를 꺼냄'
);
select is(
  public.photo_object_space_id('spaces/00000000-0000-4000-b000-000000000001/photos/../x.bin'),
  null,
  '정해진 모양이 아닌 경로는 공간 없음'
);

-- ── 멤버 A가 올림 ───────────────────────────────────────────────────

select tests.login('00000000-0000-4000-a000-00000000000a');
select lives_ok($$
  insert into storage.objects (bucket_id, name, owner)
  values ('photos', 'spaces/00000000-0000-4000-b000-000000000001/photos/00000000-0000-4000-c000-0000000000f1.bin',
          '00000000-0000-4000-a000-00000000000a')
$$, '멤버는 자기 공간 경로에 보관본을 올림');
select lives_ok($$
  insert into storage.objects (bucket_id, name, owner)
  values ('photos', 'spaces/00000000-0000-4000-b000-000000000001/photos/00000000-0000-4000-c000-0000000000f1.thumb.bin',
          '00000000-0000-4000-a000-00000000000a')
$$, '멤버는 썸네일을 올림');
select throws_ok($$
  insert into storage.objects (bucket_id, name, owner)
  values ('photos', 'spaces/00000000-0000-4000-b000-000000000001/photos/name-with-plaintext.jpg',
          '00000000-0000-4000-a000-00000000000a')
$$, '42501', null, '정해진 이름 모양이 아니면 못 올림');
select throws_ok($$
  insert into storage.objects (bucket_id, name, owner)
  values ('photos', 'spaces/00000000-0000-4000-b000-000000000002/photos/00000000-0000-4000-c000-0000000000f2.bin',
          '00000000-0000-4000-a000-00000000000a')
$$, '42501', null, '남의 공간 경로에는 못 올림');

-- ── 상대 B, 비멤버 C ────────────────────────────────────────────────

select tests.login('00000000-0000-4000-a000-00000000000b');
select is((select count(*)::int from storage.objects where bucket_id = 'photos'), 2, '상대는 공간 사진 객체를 읽음');

select tests.login('00000000-0000-4000-a000-00000000000c');
select is_empty($$select name from storage.objects where bucket_id = 'photos'$$, '비멤버는 남의 사진 객체를 못 봄');
update storage.objects set metadata = '{"x":1}'
 where name = 'spaces/00000000-0000-4000-b000-000000000001/photos/00000000-0000-4000-c000-0000000000f1.bin';
delete from storage.objects
 where name = 'spaces/00000000-0000-4000-b000-000000000001/photos/00000000-0000-4000-c000-0000000000f1.bin';

select tests.login('00000000-0000-4000-a000-00000000000a');
delete from storage.objects
 where name = 'spaces/00000000-0000-4000-b000-000000000001/photos/00000000-0000-4000-c000-0000000000f1.bin';
reset role;
select results_eq(
  $$select count(*)::int, count(metadata)::int from storage.objects where bucket_id = 'photos'$$,
  $$values (2, 0)$$,
  '비멤버는 못 고치고, 클라이언트는 누구도 못 지움(영구 삭제는 예약 작업만)'
);

-- ── 해제 공간 ───────────────────────────────────────────────────────

update public.spaces set status = 'unlinked', unlinked_at = now() where id = '00000000-0000-4000-b000-000000000001';
select tests.login('00000000-0000-4000-a000-00000000000b');
select is((select count(*)::int from storage.objects where bucket_id = 'photos'), 2, '해제 뒤에도 멤버는 사진을 받음');
select throws_ok($$
  insert into storage.objects (bucket_id, name, owner)
  values ('photos', 'spaces/00000000-0000-4000-b000-000000000001/photos/00000000-0000-4000-c000-0000000000f3.bin',
          '00000000-0000-4000-a000-00000000000b')
$$, '42501', null, '해제 공간에는 새 사진을 못 올림');
update storage.objects set metadata = '{"x":1}' where bucket_id = 'photos';
reset role;
select is((select count(metadata)::int from storage.objects where bucket_id = 'photos'), 0, '해제 공간 사진은 못 덮어씀');

select * from finish();
rollback;
