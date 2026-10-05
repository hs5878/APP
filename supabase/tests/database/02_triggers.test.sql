-- T19 · 트리거와 create_space. 멤버 2명 상한, 삭제 되돌림 거부, 봉투 정체 고정, 공간별 rev, 승인 요청 1회 기록, 복구 30일.
begin;
create extension if not exists pgtap with schema extensions;
select plan(38);

create schema tests;
grant usage on schema tests to authenticated;
create function tests.login(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
end;
$$;
create function tests.blob() returns bytea language sql immutable as $$
  select decode(repeat('ab', 48), 'hex');
$$;
-- 공간 하나의 모든 S 행 rev(현재 값).
create function tests.revs(sid uuid) returns setof bigint language sql as $$
  select rev from public.spaces where space_id = sid
  union all select rev from public.member_profiles where space_id = sid
  union all select rev from public.anniversaries where space_id = sid
  union all select rev from public.date_cards where space_id = sid
  union all select rev from public.photos where space_id = sid
  union all select rev from public.place_stops where space_id = sid
  union all select rev from public.card_notes where space_id = sid
$$;
grant execute on all functions in schema tests to authenticated;

insert into auth.users (id, email) values
  ('00000000-0000-4000-a000-00000000000a', 'a@test'),
  ('00000000-0000-4000-a000-00000000000b', 'b@test'),
  ('00000000-0000-4000-a000-00000000000c', 'c@test');

-- ── auth.users → users, create_space ────────────────────────────────

select is(
  (select count(*)::int from public.users where id in (
    '00000000-0000-4000-a000-00000000000a', '00000000-0000-4000-a000-00000000000b', '00000000-0000-4000-a000-00000000000c')),
  3, '가입하면 users 행이 생김'
);

select is(
  public.create_space('00000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-00000000000a'),
  'created', 'create_space가 공간을 만듦'
);
select results_eq(
  $$select s.created_by::text, s.status, s.key_id, s.rev, r.last_rev, m.user_id::text, m.role
      from public.spaces s
      join public.space_revs r on r.space_id = s.id
      join public.space_members m on m.space_id = s.id
     where s.id = '00000000-0000-4000-b000-000000000001'$$,
  $$values ('00000000-0000-4000-a000-00000000000a', 'active', 1, 1::bigint, 1::bigint, '00000000-0000-4000-a000-00000000000a', 'owner')$$,
  'spaces 행·owner 멤버·space_revs가 함께 생기고 spaces 행이 rev 1을 받음'
);
select is(
  public.create_space('00000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-00000000000a'),
  'exists', '같은 사람의 재시도는 그대로 둠'
);
select throws_ok(
  $$select public.create_space('00000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-00000000000c')$$,
  'LR006', null, '남의 space_id로는 못 만듦'
);
select throws_ok(
  $$select public.create_space('00000000-0000-4000-b000-000000000009', '00000000-0000-4000-a000-0000000000ff')$$,
  '23503', null, '없는 사용자로는 못 만듦'
);

-- ── 멤버 2명 상한 ───────────────────────────────────────────────────

select lives_ok($$
  insert into public.space_members (space_id, user_id, role)
  values ('00000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-00000000000b', 'member')
$$, '두 번째 멤버는 들어감');
select throws_ok($$
  insert into public.space_members (space_id, user_id, role)
  values ('00000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-00000000000c', 'member')
$$, 'LR002', null, '세 번째 멤버는 거부');
select lives_ok($$
  update public.space_members set role = 'member'
   where space_id = '00000000-0000-4000-b000-000000000001' and user_id = '00000000-0000-4000-a000-00000000000b'
$$, '정원이 찬 공간에서도 기존 멤버 행 수정은 됨');
select public.create_space('00000000-0000-4000-b000-000000000002', '00000000-0000-4000-a000-00000000000c');
select throws_ok($$
  update public.space_members set space_id = '00000000-0000-4000-b000-000000000001'
   where user_id = '00000000-0000-4000-a000-00000000000c'
$$, 'LR002', null, '다른 공간 멤버를 옮겨 넣는 것도 거부');
delete from public.space_members
 where space_id = '00000000-0000-4000-b000-000000000001' and user_id = '00000000-0000-4000-a000-00000000000b';
select lives_ok($$
  insert into public.space_members (space_id, user_id, role)
  values ('00000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-00000000000c', 'member')
$$, '한 명이 나가면 다시 들어올 수 있음');
delete from public.space_members
 where space_id = '00000000-0000-4000-b000-000000000001' and user_id = '00000000-0000-4000-a000-00000000000c';
insert into public.space_members (space_id, user_id, role)
values ('00000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-00000000000b', 'member');

-- ── rev ─────────────────────────────────────────────────────────────

select tests.login('00000000-0000-4000-a000-00000000000a');

insert into public.date_cards (id, space_id, created_by, key_id, payload, rev)
values ('00000000-0000-4000-c000-000000000001', '00000000-0000-4000-b000-000000000001',
        '00000000-0000-4000-a000-00000000000a', 1, tests.blob(), 999);
select is(
  (select rev from public.date_cards where id = '00000000-0000-4000-c000-000000000001'), 2::bigint,
  '클라이언트가 보낸 rev는 무시하고 공간 카운터 다음 값을 줌'
);

insert into public.photos (id, space_id, parent_id, created_by, key_id, payload, remote_path)
values ('00000000-0000-4000-c000-0000000000f1', '00000000-0000-4000-b000-000000000001',
        '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-00000000000a', 1, tests.blob(),
        'spaces/00000000-0000-4000-b000-000000000001/photos/00000000-0000-4000-c000-0000000000f1.bin');
insert into public.place_stops (id, space_id, parent_id, created_by, key_id, payload)
values ('00000000-0000-4000-c000-0000000000e1', '00000000-0000-4000-b000-000000000001',
        '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-00000000000a', 1, tests.blob());
insert into public.anniversaries (id, space_id, created_by, key_id, payload)
values ('00000000-0000-4000-c000-0000000000d1', '00000000-0000-4000-b000-000000000001',
        '00000000-0000-4000-a000-00000000000a', 1, tests.blob());
update public.date_cards set payload = decode(repeat('cd', 48), 'hex'), rev = 1
 where id = '00000000-0000-4000-c000-000000000001';

select tests.login('00000000-0000-4000-a000-00000000000b');
insert into public.card_notes (id, space_id, parent_id, created_by, key_id, payload)
values ('00000000-0000-4000-c000-0000000000c1', '00000000-0000-4000-b000-000000000001',
        '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-00000000000b', 1, tests.blob());

select results_eq(
  $$select rev from public.date_cards where id = '00000000-0000-4000-c000-000000000001'
    union all select rev from public.card_notes where id = '00000000-0000-4000-c000-0000000000c1'$$,
  $$values (6::bigint), (7::bigint)$$,
  '수정도 새 rev를 받고, 두 사람의 쓰기가 한 카운터를 나눠 씀'
);
select results_eq(
  $$select r from tests.revs('00000000-0000-4000-b000-000000000001') r order by r$$,
  $$values (1::bigint), (3), (4), (5), (6), (7)$$,
  '여러 테이블에 걸쳐 rev가 겹치지 않음(수정된 카드는 rev 2 대신 6을 가짐)'
);
select is(
  (select last_rev from public.space_revs where space_id = '00000000-0000-4000-b000-000000000001'), 7::bigint,
  'last_rev = 마지막으로 나눠 준 rev'
);

select tests.login('00000000-0000-4000-a000-00000000000c');
insert into public.date_cards (id, space_id, created_by, key_id, payload)
values ('00000000-0000-4000-c000-000000000002', '00000000-0000-4000-b000-000000000002',
        '00000000-0000-4000-a000-00000000000c', 1, tests.blob());
select is(
  (select rev from public.date_cards where id = '00000000-0000-4000-c000-000000000002'), 2::bigint,
  'rev는 공간별 카운터(다른 공간 쓰기와 무관)'
);
reset role;

-- ── 삭제 되돌림 거부 ────────────────────────────────────────────────

select tests.login('00000000-0000-4000-a000-00000000000a');

select lives_ok($$
  update public.date_cards set deleted_at = now(), updated_at = now()
   where id = '00000000-0000-4000-c000-000000000001'
$$, '소프트 삭제');
select throws_ok($$
  update public.date_cards set deleted_at = null, payload = tests.blob()
   where id = '00000000-0000-4000-c000-000000000001'
$$, 'LR001', null, '삭제된 카드를 오프라인 수정으로 되살리지 못함');
select throws_ok($$
  insert into public.date_cards (id, space_id, created_by, key_id, payload, deleted_at)
  values ('00000000-0000-4000-c000-000000000001', '00000000-0000-4000-b000-000000000001',
          '00000000-0000-4000-a000-00000000000a', 1, tests.blob(), null)
  on conflict (id) do update set payload = excluded.payload, deleted_at = excluded.deleted_at
$$, 'LR001', null, '업서트로도 되살리지 못함');

select tests.login('00000000-0000-4000-a000-00000000000b');
select throws_ok($$
  update public.date_cards set deleted_at = null where id = '00000000-0000-4000-c000-000000000001'
$$, 'LR001', null, '상대도 되살리지 못함');
reset role;
select throws_ok($$
  update public.date_cards set deleted_at = null where id = '00000000-0000-4000-c000-000000000001'
$$, 'LR001', null, '서버 함수(RLS 우회)도 되살리지 못함');
select lives_ok($$
  update public.date_cards set updated_at = now() where id = '00000000-0000-4000-c000-000000000001'
$$, '삭제 상태를 유지하는 수정은 됨');
select isnt(
  (select deleted_at from public.date_cards where id = '00000000-0000-4000-c000-000000000001'), null,
  '카드는 여전히 삭제 상태'
);

-- ── 봉투 정체 고정 ──────────────────────────────────────────────────

select tests.login('00000000-0000-4000-a000-00000000000a');
select throws_ok($$
  update public.anniversaries set created_by = '00000000-0000-4000-a000-00000000000b'
   where id = '00000000-0000-4000-c000-0000000000d1'
$$, 'LR003', null, '작성자는 못 바꿈');
select throws_ok($$
  update public.anniversaries set created_at = now() - interval '1 day'
   where id = '00000000-0000-4000-c000-0000000000d1'
$$, 'LR003', null, '생성 시각은 못 바꿈');
select lives_ok($$
  update public.photos set parent_id = '00000000-0000-4000-c000-000000000009'
   where id = '00000000-0000-4000-c000-0000000000f1'
$$, '사진은 다른 카드로 옮길 수 있음(parent_id 변경)');
reset role;
select throws_ok($$
  update public.anniversaries set space_id = '00000000-0000-4000-b000-000000000002'
   where id = '00000000-0000-4000-c000-0000000000d1'
$$, 'LR003', null, '행을 다른 공간으로 못 옮김');
select throws_ok($$
  update public.spaces set id = '00000000-0000-4000-b000-0000000000aa', space_id = '00000000-0000-4000-b000-0000000000aa'
   where id = '00000000-0000-4000-b000-000000000002'
$$, 'LR003', null, '공간 id도 못 바꿈');

-- ── 봉투 제약 ───────────────────────────────────────────────────────

select throws_ok($$
  update public.photos set remote_path = 'spaces/00000000-0000-4000-b000-000000000001/photos/someone-else.jpg'
   where id = '00000000-0000-4000-c000-0000000000f1'
$$, '23514', null, 'remote_path는 spaces/{space_id}/photos/{id}.bin 모양만');
select throws_ok($$
  insert into public.anniversaries (id, space_id, created_by, key_id, payload)
  values ('00000000-0000-4000-c000-0000000000d2', '00000000-0000-4000-b000-000000000001',
          '00000000-0000-4000-a000-00000000000a', 1, '\x00'::bytea)
$$, '23514', null, 'payload는 nonce+태그보다 짧을 수 없음');

-- ── 승인 요청: 한 번만 쓰는 값 ──────────────────────────────────────

insert into public.devices (id, user_id, public_key, label, status) values
  ('00000000-0000-4000-d000-00000000000a', '00000000-0000-4000-a000-00000000000a', decode(repeat('11', 32), 'hex'), 'A', 'active'),
  ('00000000-0000-4000-d000-00000000000b', '00000000-0000-4000-a000-00000000000b', decode(repeat('12', 32), 'hex'), 'B', 'active'),
  ('00000000-0000-4000-d000-0000000000b2', '00000000-0000-4000-a000-00000000000b', decode(repeat('13', 32), 'hex'), 'B new', 'pending');

select throws_ok($$
  update public.devices set status = 'active' where id = '00000000-0000-4000-d000-0000000000b2'
$$, '23505', null, '사용자당 active 기기는 1대');

insert into public.join_requests (id, space_id, kind, requester_user_id, requester_device_id, requester_commit)
values ('00000000-0000-4000-e000-000000000001', '00000000-0000-4000-b000-000000000001', 'device',
        '00000000-0000-4000-a000-00000000000b', '00000000-0000-4000-d000-0000000000b2', decode(repeat('44', 32), 'hex'));

select throws_ok($$
  update public.join_requests set requester_nonce = decode(repeat('55', 32), 'hex')
   where id = '00000000-0000-4000-e000-000000000001'
$$, '23514', null, 'n_A 전에는 n_R을 기록 못 함(제약)');
select lives_ok($$
  update public.join_requests
     set approver_device_id = '00000000-0000-4000-d000-00000000000a', approver_nonce = decode(repeat('66', 32), 'hex')
   where id = '00000000-0000-4000-e000-000000000001'
$$, '첫 claim은 기록됨');
select throws_ok($$
  update public.join_requests
     set approver_device_id = '00000000-0000-4000-d000-00000000000b', approver_nonce = decode(repeat('77', 32), 'hex')
   where id = '00000000-0000-4000-e000-000000000001'
$$, 'LR004', null, '두 번째 claim은 거부');
select throws_ok($$
  update public.join_requests set requester_commit = decode(repeat('00', 32), 'hex')
   where id = '00000000-0000-4000-e000-000000000001'
$$, 'LR003', null, '커밋은 못 바꿈');

-- ── 복구 요청: 해제 30일 안에만 ─────────────────────────────────────

select throws_ok($$
  insert into public.relink_requests (space_id, requested_by)
  values ('00000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-00000000000a')
$$, 'LR005', null, 'active 공간에는 복구 요청 없음');
update public.spaces set status = 'unlinked', unlinked_at = now() - interval '29 days'
 where id = '00000000-0000-4000-b000-000000000001';
select lives_ok($$
  insert into public.relink_requests (space_id, requested_by)
  values ('00000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-00000000000a')
$$, '해제 29일째에는 복구 요청 가능');
update public.spaces set unlinked_at = now() - interval '31 days'
 where id = '00000000-0000-4000-b000-000000000001';
select throws_ok($$
  insert into public.relink_requests (space_id, requested_by)
  values ('00000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-00000000000a')
$$, 'LR005', null, '30일이 지나면 복구 요청 거부');

select * from finish();
rollback;
