-- T19 · RLS. 비멤버 접근 거부, 상대의 행 수정, 해제 공간 읽기 전용, SV 쓰기 차단, 기기·승인 요청 규칙.
begin;
create extension if not exists pgtap with schema extensions;
select plan(48);

-- ── 도우미(트랜잭션과 함께 사라짐) ──────────────────────────────────

create schema tests;
grant usage on schema tests to anon, authenticated;

-- Supabase API 요청처럼 authenticated 역할과 JWT sub를 이 트랜잭션에 건다.
create function tests.login(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
end;
$$;

-- 봉투 payload 대용(내용은 상관없고 길이만 맞춘다).
create function tests.blob() returns bytea language sql immutable as $$
  select decode(repeat('ab', 48), 'hex');
$$;
grant execute on all functions in schema tests to anon, authenticated;

-- A·B = 커플 공간 S1, C = 자기 1인 공간 S2만 가진 외부인.
insert into auth.users (id, email) values
  ('00000000-0000-4000-a000-00000000000a', 'a@test'),
  ('00000000-0000-4000-a000-00000000000b', 'b@test'),
  ('00000000-0000-4000-a000-00000000000c', 'c@test');
select public.create_space('00000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-00000000000a');
select public.create_space('00000000-0000-4000-b000-000000000002', '00000000-0000-4000-a000-00000000000c');
insert into public.space_members (space_id, user_id, role)
values ('00000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-00000000000b', 'member');

-- ── 멤버 A: 쓰기 ────────────────────────────────────────────────────

select tests.login('00000000-0000-4000-a000-00000000000a');

select lives_ok($$
  insert into public.date_cards (id, space_id, created_by, key_id, payload)
  values ('00000000-0000-4000-c000-000000000001', '00000000-0000-4000-b000-000000000001',
          '00000000-0000-4000-a000-00000000000a', 1, tests.blob())
$$, '멤버는 자기 공간에 카드를 올림');

select lives_ok($$
  insert into public.member_profiles (id, space_id, created_by, key_id, payload)
  values ('00000000-0000-4000-c000-0000000000a1', '00000000-0000-4000-b000-000000000001',
          '00000000-0000-4000-a000-00000000000a', 1, tests.blob())
$$, '멤버는 자기 별명 행을 올림');

select lives_ok($$
  update public.spaces set payload = tests.blob(), updated_at = now()
   where id = '00000000-0000-4000-b000-000000000001'
$$, '멤버는 공간의 started_on(payload)을 고침');

select throws_ok($$
  update public.spaces set status = 'unlinked', unlinked_at = now()
   where id = '00000000-0000-4000-b000-000000000001'
$$, '42501', null, '클라이언트는 공간 status를 못 바꿈');

select throws_ok($$
  insert into public.spaces (id, space_id, created_by) values
    ('00000000-0000-4000-b000-0000000000ff', '00000000-0000-4000-b000-0000000000ff', '00000000-0000-4000-a000-00000000000a')
$$, '42501', null, '클라이언트는 spaces 행을 직접 못 만듦(create-space만)');

select throws_ok($$
  insert into public.space_members (space_id, user_id, role)
  values ('00000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-00000000000c', 'member')
$$, '42501', null, '클라이언트는 space_members에 못 씀');

select throws_ok($$
  update public.space_revs set last_rev = 0 where space_id = '00000000-0000-4000-b000-000000000001'
$$, '42501', null, '클라이언트는 space_revs를 못 바꿈');

select throws_ok($$
  delete from public.date_cards where id = '00000000-0000-4000-c000-000000000001'
$$, '42501', null, '클라이언트는 하드 삭제를 못 함');

select results_eq($$
  select user_id::text, role from public.space_members order by role desc
$$, $$values ('00000000-0000-4000-a000-00000000000a', 'owner'), ('00000000-0000-4000-a000-00000000000b', 'member')$$,
'멤버는 자기 공간 멤버 목록을 읽음(다른 공간 멤버는 안 보임)');

select is(
  (select count(*)::int from public.space_revs), 1,
  '멤버는 자기 공간 rev 행만 읽음'
);

-- ── 상대 B: 같은 공간 행 수정 ───────────────────────────────────────

select tests.login('00000000-0000-4000-a000-00000000000b');

select is(
  (select count(*)::int from public.date_cards where space_id = '00000000-0000-4000-b000-000000000001'), 1,
  '상대는 같은 공간 카드를 읽음'
);

select lives_ok($$
  insert into public.date_cards (id, space_id, created_by, key_id, payload, updated_at)
  values ('00000000-0000-4000-c000-000000000001', '00000000-0000-4000-b000-000000000001',
          '00000000-0000-4000-a000-00000000000a', 1, decode(repeat('cd', 48), 'hex'), now())
  on conflict (id) do update set payload = excluded.payload, updated_at = excluded.updated_at
$$, '상대는 A가 만든 카드를 업서트로 고침(행 단위 나중 도착 승)');

select throws_ok($$
  insert into public.date_cards (id, space_id, created_by, key_id, payload)
  values ('00000000-0000-4000-c000-000000000002', '00000000-0000-4000-b000-000000000001',
          '00000000-0000-4000-a000-00000000000a', 1, tests.blob())
$$, '42501', null, '새 행의 작성자를 남으로 못 씀');

update public.member_profiles set payload = decode(repeat('ee', 48), 'hex')
 where id = '00000000-0000-4000-c000-0000000000a1';

select throws_ok($$
  insert into public.member_profiles (id, space_id, created_by, key_id, payload)
  values ('00000000-0000-4000-c000-0000000000a1', '00000000-0000-4000-b000-000000000001',
          '00000000-0000-4000-a000-00000000000a', 1, decode(repeat('ee', 48), 'hex'))
  on conflict (id) do update set payload = excluded.payload
$$, '42501', null, '상대 별명은 업서트로도 못 고침');

select lives_ok($$
  insert into public.member_profiles (id, space_id, created_by, key_id, payload)
  values ('00000000-0000-4000-c000-0000000000b1', '00000000-0000-4000-b000-000000000001',
          '00000000-0000-4000-a000-00000000000b', 1, tests.blob())
$$, '상대는 자기 별명 행을 올림');

reset role;

select is(
  (select payload::bytea from public.member_profiles where id = '00000000-0000-4000-c000-0000000000a1'), tests.blob(),
  '별명은 본인만 고침(상대의 update는 반영 안 됨)'
);
select is(
  (select payload::bytea from public.date_cards where id = '00000000-0000-4000-c000-000000000001'), decode(repeat('cd', 48), 'hex'),
  '상대의 카드 수정은 반영됨'
);

-- ── 비멤버 C ────────────────────────────────────────────────────────

select tests.login('00000000-0000-4000-a000-00000000000c');

select is_empty($$select id from public.spaces where id = '00000000-0000-4000-b000-000000000001'$$, '비멤버는 남의 공간을 못 봄');
select is_empty($$select id from public.date_cards$$, '비멤버는 남의 카드를 못 봄');
select is_empty($$select id from public.member_profiles$$, '비멤버는 남의 별명 행을 못 봄');
select is_empty($$select user_id from public.space_members where space_id = '00000000-0000-4000-b000-000000000001'$$, '비멤버는 남의 멤버 목록을 못 봄');
select is_empty($$select space_id from public.space_revs where space_id = '00000000-0000-4000-b000-000000000001'$$, '비멤버는 남의 rev를 못 봄');

select throws_ok($$
  insert into public.date_cards (id, space_id, created_by, key_id, payload)
  values ('00000000-0000-4000-c000-000000000003', '00000000-0000-4000-b000-000000000001',
          '00000000-0000-4000-a000-00000000000c', 1, tests.blob())
$$, '42501', null, '비멤버는 남의 공간에 못 씀');

select throws_ok($$
  insert into public.date_cards (id, space_id, created_by, key_id, payload)
  values ('00000000-0000-4000-c000-000000000001', '00000000-0000-4000-b000-000000000001',
          '00000000-0000-4000-a000-00000000000c', 1, tests.blob())
  on conflict (id) do update set payload = excluded.payload
$$, '42501', null, '비멤버는 남의 카드를 업서트로 못 덮어씀');

update public.date_cards set payload = tests.blob() where id = '00000000-0000-4000-c000-000000000001';
update public.spaces set payload = tests.blob() where id = '00000000-0000-4000-b000-000000000001';

select lives_ok($$
  insert into public.date_cards (id, space_id, created_by, key_id, payload)
  values ('00000000-0000-4000-c000-0000000000c1', '00000000-0000-4000-b000-000000000002',
          '00000000-0000-4000-a000-00000000000c', 1, tests.blob())
$$, 'C도 자기 1인 공간에는 씀');

reset role;

select is(
  (select payload::bytea from public.date_cards where id = '00000000-0000-4000-c000-000000000001'), decode(repeat('cd', 48), 'hex'),
  '비멤버의 update는 반영 안 됨'
);

-- anon(로그인 안 함)은 아무 테이블도 못 읽음.
set local role anon;
select throws_ok($$select 1 from public.date_cards$$, '42501', null, 'anon은 S 테이블을 못 읽음');
select throws_ok($$select 1 from public.space_members$$, '42501', null, 'anon은 SV 테이블을 못 읽음');
reset role;

-- ── 기기 ────────────────────────────────────────────────────────────

select tests.login('00000000-0000-4000-a000-00000000000a');

select lives_ok($$
  insert into public.devices (id, user_id, public_key, label)
  values ('00000000-0000-4000-d000-00000000000a', '00000000-0000-4000-a000-00000000000a',
          decode(repeat('11', 32), 'hex'), 'iPhone')
$$, '본인 기기를 pending으로 등록');

select throws_ok($$
  insert into public.devices (id, user_id, public_key, label)
  values ('00000000-0000-4000-d000-0000000000ab', '00000000-0000-4000-a000-00000000000b',
          decode(repeat('11', 32), 'hex'), 'fake')
$$, '42501', null, '남의 기기는 못 등록');

select throws_ok($$
  insert into public.devices (id, user_id, public_key, label, status)
  values ('00000000-0000-4000-d000-0000000000ac', '00000000-0000-4000-a000-00000000000a',
          decode(repeat('11', 32), 'hex'), 'x', 'active')
$$, '42501', null, '기기를 active로 직접 못 등록');

select lives_ok($$
  update public.devices set push_token = 'ExponentPushToken[x]' where id = '00000000-0000-4000-d000-00000000000a'
$$, '본인 기기 푸시 토큰 갱신');

select throws_ok($$
  update public.devices set status = 'active' where id = '00000000-0000-4000-d000-00000000000a'
$$, '42501', null, '기기 status는 서버만 바꿈');

reset role;

-- A 기기를 활성화하고 공간 키를 봉인해 둔 상태(서버 함수가 하는 일).
update public.devices set status = 'active' where id = '00000000-0000-4000-d000-00000000000a';
insert into public.key_grants (space_id, device_id, key_id, sealed_key, granted_by_device_id)
values ('00000000-0000-4000-b000-000000000001', '00000000-0000-4000-d000-00000000000a', 1,
        decode(repeat('22', 80), 'hex'), '00000000-0000-4000-d000-00000000000a');

select tests.login('00000000-0000-4000-a000-00000000000a');
select is((select count(*)::int from public.key_grants), 1, '본인 기기의 key_grants를 읽음');
select throws_ok($$
  insert into public.key_grants (space_id, device_id, key_id, sealed_key, granted_by_device_id)
  values ('00000000-0000-4000-b000-000000000001', '00000000-0000-4000-d000-00000000000a', 2,
          decode(repeat('22', 80), 'hex'), '00000000-0000-4000-d000-00000000000a')
$$, '42501', null, 'key_grants 쓰기는 아직 아무 클라이언트에도 없음(T25)');

select tests.login('00000000-0000-4000-a000-00000000000b');
select is_empty($$select device_id from public.key_grants$$, '남의 기기 key_grants는 상대도 못 읽음');
select is_empty($$select id from public.devices$$, '남의 기기 행은 못 읽음');

-- ── 승인 요청: n_R 공개 ─────────────────────────────────────────────

reset role;
insert into public.devices (id, user_id, public_key, label)
values ('00000000-0000-4000-d000-00000000000c', '00000000-0000-4000-a000-00000000000c', decode(repeat('33', 32), 'hex'), 'Galaxy');
insert into public.join_requests (id, space_id, kind, requester_user_id, requester_device_id, invite_code, requester_commit)
values ('00000000-0000-4000-e000-000000000001', '00000000-0000-4000-b000-000000000001', 'partner',
        '00000000-0000-4000-a000-00000000000c', '00000000-0000-4000-d000-00000000000c', 'ABCD2345',
        decode(repeat('44', 32), 'hex'));

select tests.login('00000000-0000-4000-a000-00000000000c');
select is((select count(*)::int from public.join_requests), 1, '요청자는 자기 요청을 읽음(아직 멤버 아님)');
update public.join_requests set requester_nonce = decode(repeat('55', 32), 'hex')
 where id = '00000000-0000-4000-e000-000000000001';
reset role;
select is(
  (select requester_nonce from public.join_requests where id = '00000000-0000-4000-e000-000000000001'), null,
  'n_A가 올라오기 전에는 n_R을 못 씀'
);

-- 승인 기기 A가 요청을 열어 n_A를 올림(claim-join이 하는 일).
update public.join_requests
   set approver_device_id = '00000000-0000-4000-d000-00000000000a', approver_nonce = decode(repeat('66', 32), 'hex')
 where id = '00000000-0000-4000-e000-000000000001';

select tests.login('00000000-0000-4000-a000-00000000000c');
select throws_ok($$
  update public.join_requests set approver_nonce = decode(repeat('77', 32), 'hex')
   where id = '00000000-0000-4000-e000-000000000001'
$$, '42501', null, '요청자는 n_A를 못 씀');
select lives_ok($$
  update public.join_requests set requester_nonce = decode(repeat('55', 32), 'hex')
   where id = '00000000-0000-4000-e000-000000000001'
$$, 'n_A가 올라온 뒤 요청자가 n_R을 공개');
select throws_ok($$
  update public.join_requests set requester_nonce = decode(repeat('88', 32), 'hex')
   where id = '00000000-0000-4000-e000-000000000001'
$$, 'LR004', null, 'n_R은 한 번만 씀');

select tests.login('00000000-0000-4000-a000-00000000000b');
select is((select count(*)::int from public.join_requests), 1, '공간 멤버(승인 기기 쪽)는 요청을 읽음');
reset role;
select throws_ok($$
  update public.join_requests set requester_nonce = decode(repeat('99', 32), 'hex')
   where id = '00000000-0000-4000-e000-000000000001'
$$, 'LR004', null, '서버도 공개된 n_R을 못 바꿈');

-- ── 해제된 공간: 읽기만 ─────────────────────────────────────────────

update public.spaces set status = 'unlinked', unlinked_at = now() where id = '00000000-0000-4000-b000-000000000001';

select tests.login('00000000-0000-4000-a000-00000000000a');
select is(
  (select count(*)::int from public.date_cards where space_id = '00000000-0000-4000-b000-000000000001'), 1,
  '해제 공간도 멤버는 읽음'
);
select throws_ok($$
  insert into public.date_cards (id, space_id, created_by, key_id, payload)
  values ('00000000-0000-4000-c000-000000000004', '00000000-0000-4000-b000-000000000001',
          '00000000-0000-4000-a000-00000000000a', 1, tests.blob())
$$, '42501', null, '해제 공간에는 새 행을 못 씀');
select throws_ok($$
  insert into public.date_cards (id, space_id, created_by, key_id, payload)
  values ('00000000-0000-4000-c000-000000000001', '00000000-0000-4000-b000-000000000001',
          '00000000-0000-4000-a000-00000000000a', 1, tests.blob())
  on conflict (id) do update set payload = excluded.payload
$$, '42501', null, '해제 공간 행은 업서트로도 못 고침');
update public.date_cards set payload = tests.blob() where id = '00000000-0000-4000-c000-000000000001';
reset role;

select is(
  (select payload::bytea from public.date_cards where id = '00000000-0000-4000-c000-000000000001'), decode(repeat('cd', 48), 'hex'),
  '해제 공간 행의 update는 반영 안 됨'
);

select * from finish();
rollback;
