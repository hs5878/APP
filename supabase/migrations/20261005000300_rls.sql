-- T19 · 권한과 RLS. 기준: DATA_MODEL §5(RLS), §3(테이블별 쓰기 주체), D-025(해제 공간은 읽기만).
--
-- 원칙
-- - anon은 아무것도 못 한다. authenticated는 아래에서 준 권한만 갖는다(Supabase 기본 권한을 먼저 거둔다).
-- - 서버 함수는 service_role(RLS 우회)이나 security definer 함수로 쓴다.
-- - S 테이블과 Storage 경로: 읽기는 is_space_member, 쓰기는 is_space_writable(멤버 + 공간이 active).
-- - 하드 삭제는 클라이언트에 주지 않는다(소프트 삭제만, 영구 삭제는 예약 작업).

-- ── 검사 함수 ───────────────────────────────────────────────────────

-- 정책 안에서 space_members를 직접 조회하면 그 정책이 다시 돌아 재귀가 된다. security definer로 RLS 밖에서 본다.
create function public.is_space_member(sid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.space_members m
     where m.space_id = sid
       and m.user_id = (select auth.uid())
  );
$$;

-- 해제(unlinked)된 공간은 멤버도 읽기만 한다.
create function public.is_space_writable(sid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.space_members m
      join public.spaces s on s.id = m.space_id
     where m.space_id = sid
       and m.user_id = (select auth.uid())
       and s.status = 'active'
       and s.deleted_at is null
  );
$$;

revoke execute on function public.is_space_member(uuid), public.is_space_writable(uuid) from public, anon;
grant execute on function public.is_space_member(uuid), public.is_space_writable(uuid) to authenticated, service_role;

-- ── 기본 권한 정리 ──────────────────────────────────────────────────

revoke all on table
  public.users, public.spaces, public.space_members, public.space_revs,
  public.member_profiles, public.anniversaries, public.date_cards, public.photos,
  public.place_stops, public.card_notes,
  public.invites, public.devices, public.join_requests, public.relink_requests,
  public.key_grants, public.ai_usage
from anon, authenticated;

alter table public.users enable row level security;
alter table public.spaces enable row level security;
alter table public.space_members enable row level security;
alter table public.space_revs enable row level security;
alter table public.member_profiles enable row level security;
alter table public.anniversaries enable row level security;
alter table public.date_cards enable row level security;
alter table public.photos enable row level security;
alter table public.place_stops enable row level security;
alter table public.card_notes enable row level security;
alter table public.invites enable row level security;
alter table public.devices enable row level security;
alter table public.join_requests enable row level security;
alter table public.relink_requests enable row level security;
alter table public.key_grants enable row level security;
alter table public.ai_usage enable row level security;

-- ── S: spaces ───────────────────────────────────────────────────────

-- 행은 create-space가 만든다. 클라이언트는 started_on(= payload)만 고친다. status·unlinked_at·key_id는 서버 함수만.
grant select on public.spaces to authenticated;
grant update (payload, updated_at) on public.spaces to authenticated;

create policy spaces_select on public.spaces
  for select to authenticated
  using (public.is_space_member(id));

create policy spaces_update on public.spaces
  for update to authenticated
  using (public.is_space_writable(id))
  with check (public.is_space_writable(id));

-- ── S: 봉투 테이블 ──────────────────────────────────────────────────

-- 새 행의 작성자는 본인이어야 한다. 기존 행 수정은 같은 공간 멤버면 누구나 할 수 있다(행 단위 나중 도착 승).
-- 업서트(insert ... on conflict do update)는 충돌로 수정 경로를 타더라도 제안된 행에 insert 검사를 먼저 한다.
-- 그래서 같은 id·공간·작성자의 행이 이미 있으면 insert 검사를 통과시키고, 실제 수정 권한은 update 정책이 본다.
-- 없는 행을 남의 이름으로 만드는 것은 여전히 막힌다.
do $$
declare
  t text;
begin
  foreach t in array array['member_profiles', 'anniversaries', 'date_cards', 'photos', 'place_stops', 'card_notes'] loop
    execute format('grant select, insert, update on public.%I to authenticated', t);

    execute format(
      'create policy %I on public.%I for select to authenticated
         using (public.is_space_member(space_id))', t || '_select', t);

    execute format(
      'create policy %1$I on public.%2$I for insert to authenticated
         with check (
           public.is_space_writable(space_id)
           and (
             created_by = (select auth.uid())
             or exists (
               select 1 from public.%2$I e
                where e.id = %2$I.id and e.space_id = %2$I.space_id and e.created_by = %2$I.created_by
             )
           )
         )', t || '_insert', t);
  end loop;

  foreach t in array array['anniversaries', 'date_cards', 'photos', 'place_stops', 'card_notes'] loop
    execute format(
      'create policy %I on public.%I for update to authenticated
         using (public.is_space_writable(space_id))
         with check (public.is_space_writable(space_id))', t || '_update', t);
  end loop;
end;
$$;

-- 별명은 본인만 고친다.
create policy member_profiles_update on public.member_profiles
  for update to authenticated
  using (public.is_space_writable(space_id) and created_by = (select auth.uid()))
  with check (public.is_space_writable(space_id) and created_by = (select auth.uid()));

-- ── SV: 읽기만 ──────────────────────────────────────────────────────

grant select on public.users to authenticated;
create policy users_select_self on public.users
  for select to authenticated
  using (id = (select auth.uid()));

-- pull 때마다 통째로 받아 members_cache를 갱신한다.
grant select on public.space_members to authenticated;
create policy space_members_select on public.space_members
  for select to authenticated
  using (public.is_space_member(space_id));

-- 클라이언트는 purged_below를 보고 전체 재수신 여부를 정한다.
grant select on public.space_revs to authenticated;
create policy space_revs_select on public.space_revs
  for select to authenticated
  using (public.is_space_member(space_id));

grant select on public.invites to authenticated;
create policy invites_select on public.invites
  for select to authenticated
  using (public.is_space_member(space_id));

grant select on public.relink_requests to authenticated;
create policy relink_requests_select on public.relink_requests
  for select to authenticated
  using (public.is_space_member(space_id));

-- 본인 기기 행만 읽는다. 쓰기 정책(승인 기기만)은 연결 서버 함수 작업(T25)에서 붙인다.
grant select on public.key_grants to authenticated;
create policy key_grants_select_own_device on public.key_grants
  for select to authenticated
  using (
    exists (
      select 1
        from public.devices d
       where d.id = key_grants.device_id
         and d.user_id = (select auth.uid())
    )
  );

-- ai_usage: 권한도 정책도 없다(ai-draft 함수만 service_role로 쓴다).

-- ── SV: 기기 ────────────────────────────────────────────────────────

-- 새 기기는 클라이언트가 pending으로 직접 등록한다. status·revoked_at은 서버 함수만 바꾼다.
grant select on public.devices to authenticated;
grant insert (id, user_id, public_key, label, push_token) on public.devices to authenticated;
grant update (label, push_token) on public.devices to authenticated;

create policy devices_select_own on public.devices
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy devices_insert_own on public.devices
  for insert to authenticated
  with check (user_id = (select auth.uid()) and status = 'pending');

create policy devices_update_own on public.devices
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ── SV: 승인 요청 ───────────────────────────────────────────────────

-- 요청자 본인과 그 공간 멤버(승인 기기 쪽)가 읽는다. 생성·claim·승인은 서버 함수가 한다.
-- 요청 기기는 n_A가 올라온 뒤 n_R(requester_nonce)만 직접 쓴다(한 번만, 트리거와 제약으로 강제).
grant select on public.join_requests to authenticated;
grant update (requester_nonce) on public.join_requests to authenticated;

create policy join_requests_select on public.join_requests
  for select to authenticated
  using (requester_user_id = (select auth.uid()) or public.is_space_member(space_id));

create policy join_requests_reveal on public.join_requests
  for update to authenticated
  using (
    requester_user_id = (select auth.uid())
    and status = 'pending'
    and expires_at > now()
    and approver_nonce is not null
  )
  with check (requester_user_id = (select auth.uid()));
