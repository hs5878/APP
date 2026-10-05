-- T19 · 트리거. 기준: DATA_MODEL §5(rev, 삭제 고정), §3(멤버 2명, 승인 요청 1회 기록, 복구 30일).
-- BEFORE 트리거는 이름 순으로 돈다. 검사(envelope_10_guard)가 먼저, rev 부여(envelope_90_rev)가 마지막이다.

-- ── rev ─────────────────────────────────────────────────────────────

-- 공간별 카운터를 1 올려 새 rev를 준다. space_revs 행 잠금은 커밋까지 유지되므로, 같은 공간의 쓰기는
-- 커밋 순서대로 rev를 받는다. 그래서 pull이 `rev > 커서`로 읽어도 늦게 커밋된 작은 rev를 놓치지 않는다.
-- 클라이언트가 보낸 rev 값은 무시한다. space_revs는 클라이언트가 쓸 수 없으므로 security definer로 둔다.
create function public.tg_assign_rev()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.space_revs
     set last_rev = last_rev + 1
   where space_id = new.space_id
  returning last_rev into new.rev;

  if not found then
    raise exception 'space % has no rev counter', new.space_id
      using errcode = 'foreign_key_violation';
  end if;
  return new;
end;
$$;

-- ── 봉투 검사 ───────────────────────────────────────────────────────

-- 행의 정체(AAD에 묶이는 id·space_id·created_by)와 생성 시각은 바꿀 수 없다.
-- 한 번 삭제된 행은 되살리지 않는다(deleted_at을 지우는 update 거부). 거부되면 클라이언트는 로컬 행도 삭제 처리한다.
create function public.tg_envelope_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
     or new.space_id is distinct from old.space_id
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at then
    raise exception 'envelope identity columns are immutable'
      using errcode = 'LR003';
  end if;

  if old.deleted_at is not null and new.deleted_at is null then
    raise exception 'deleted row cannot be restored (%.%)', tg_table_name, old.id
      using errcode = 'LR001';
  end if;
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'spaces', 'member_profiles', 'anniversaries', 'date_cards', 'photos', 'place_stops', 'card_notes'
  ] loop
    execute format(
      'create trigger envelope_10_guard before update on public.%I
         for each row execute function public.tg_envelope_guard()', t);
    execute format(
      'create trigger envelope_90_rev before insert or update on public.%I
         for each row execute function public.tg_assign_rev()', t);
  end loop;
end;
$$;

-- ── 멤버 2명 상한 ───────────────────────────────────────────────────

-- 공간 행을 잠그고 센다. 동시에 두 명이 합류해도 뒤 트랜잭션은 앞 트랜잭션 커밋 뒤에 세므로 3명이 될 수 없다.
create function public.tg_space_members_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform 1 from public.spaces where id = new.space_id for update;

  if (
    select count(*)
      from public.space_members
     where space_id = new.space_id
       and user_id <> new.user_id
  ) >= 2 then
    raise exception 'space % already has 2 members', new.space_id
      using errcode = 'LR002';
  end if;
  return new;
end;
$$;

create trigger space_members_limit
  before insert or update of space_id, user_id on public.space_members
  for each row execute function public.tg_space_members_limit();

-- ── 승인 요청: 한 번만 쓰는 값 ──────────────────────────────────────

-- 요청의 정체와 커밋은 바뀌지 않고, 승인 기기·n_A·n_R은 비어 있을 때 한 번만 채울 수 있다.
create function public.tg_join_requests_write_once()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
     or new.space_id is distinct from old.space_id
     or new.kind is distinct from old.kind
     or new.requester_user_id is distinct from old.requester_user_id
     or new.requester_device_id is distinct from old.requester_device_id
     or new.invite_code is distinct from old.invite_code
     or new.requester_commit is distinct from old.requester_commit then
    raise exception 'join request identity columns are immutable'
      using errcode = 'LR003';
  end if;

  if (old.approver_device_id is not null and new.approver_device_id is distinct from old.approver_device_id)
     or (old.approver_nonce is not null and new.approver_nonce is distinct from old.approver_nonce)
     or (old.requester_nonce is not null and new.requester_nonce is distinct from old.requester_nonce) then
    raise exception 'join request % is already claimed or revealed', old.id
      using errcode = 'LR004';
  end if;
  return new;
end;
$$;

create trigger join_requests_write_once
  before update on public.join_requests
  for each row execute function public.tg_join_requests_write_once();

-- ── 복구 요청: 해제 30일 안에만 ─────────────────────────────────────

create function public.tg_relink_requests_window()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
      from public.spaces
     where id = new.space_id
       and status = 'unlinked'
       and new.created_at <= unlinked_at + interval '30 days'
  ) then
    raise exception 'space % cannot be relinked', new.space_id
      using errcode = 'LR005';
  end if;
  return new;
end;
$$;

create trigger relink_requests_window
  before insert on public.relink_requests
  for each row execute function public.tg_relink_requests_window();

-- ── auth.users → public.users ───────────────────────────────────────

create function public.tg_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.users (id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.tg_handle_new_user();

-- 트리거 함수는 RPC로 부를 수 없지만, 기본 실행 권한은 거둬 둔다.
revoke execute on function
  public.tg_assign_rev(),
  public.tg_envelope_guard(),
  public.tg_space_members_limit(),
  public.tg_join_requests_write_once(),
  public.tg_relink_requests_window(),
  public.tg_handle_new_user()
from public, anon, authenticated;
