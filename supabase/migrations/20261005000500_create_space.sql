-- T19 · create_space. Edge Function `create-space`가 service_role로 부른다(DATA_MODEL §5 공간 생성, §7).
-- spaces 행, owner 멤버, space_revs를 한 트랜잭션으로 만든다. space_id는 클라이언트가 로컬에서 만든 UUID v7이다.
-- 같은 사람이 같은 id로 다시 부르면(응답 유실 후 재시도) 아무것도 바꾸지 않고 'exists'를 돌려준다.
-- payload(started_on)는 서버가 모르므로 비워 두고, 클라이언트가 공간 키로 암호화해 update한다.

create function public.create_space(p_space_id uuid, p_user_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
begin
  if p_space_id is null or p_user_id is null then
    raise exception 'space id and user id are required'
      using errcode = 'null_value_not_allowed';
  end if;

  -- auth.users 트리거가 이미 만들었어야 하지만, 트리거 이전 사용자도 받는다(FK가 실제 사용자인지 확인).
  insert into public.users (id) values (p_user_id) on conflict (id) do nothing;

  select created_by into v_owner from public.spaces where id = p_space_id;
  if found then
    if v_owner = p_user_id then
      return 'exists';
    end if;
    raise exception 'space id % is already taken', p_space_id
      using errcode = 'LR006';
  end if;

  -- space_revs를 먼저 만들어야 spaces 행의 rev 트리거가 번호를 받는다(FK는 커밋 때 검사).
  insert into public.space_revs (space_id) values (p_space_id);
  insert into public.spaces (id, space_id, created_by) values (p_space_id, p_space_id, p_user_id);
  insert into public.space_members (space_id, user_id, role) values (p_space_id, p_user_id, 'owner');
  return 'created';
end;
$$;

revoke execute on function public.create_space(uuid, uuid) from public, anon, authenticated;
grant execute on function public.create_space(uuid, uuid) to service_role;
