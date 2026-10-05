-- T19 · 서버 스키마 모양. 🔒 컬럼과 L 컬럼이 서버에 없음(D-020, DATA_MODEL §5.1), RLS·권한 기본값.
begin;
create extension if not exists pgtap with schema extensions;
select plan(29);

-- ── 테이블 목록 ─────────────────────────────────────────────────────

select tables_are('public', array[
  'users', 'spaces', 'space_members', 'space_revs', 'invites', 'devices', 'join_requests',
  'relink_requests', 'key_grants', 'ai_usage',
  'member_profiles', 'anniversaries', 'date_cards', 'photos', 'place_stops', 'card_notes'
], 'public 테이블은 DATA_MODEL의 S·SV 테이블뿐');

-- ── S 테이블: 봉투 컬럼만 ───────────────────────────────────────────

select columns_are('public', 'spaces', array[
  'id', 'space_id', 'parent_id', 'created_by', 'key_id', 'payload', 'status', 'unlinked_at',
  'rev', 'created_at', 'updated_at', 'deleted_at'
], 'spaces = 봉투 + 평문 status·unlinked_at');
select columns_are('public', 'photos', array[
  'id', 'space_id', 'parent_id', 'created_by', 'key_id', 'payload', 'remote_path',
  'rev', 'created_at', 'updated_at', 'deleted_at'
], 'photos = 봉투 + 평문 remote_path');
select columns_are('public', t, array[
  'id', 'space_id', 'parent_id', 'created_by', 'key_id', 'payload', 'rev', 'created_at', 'updated_at', 'deleted_at'
], t || ' = 봉투 컬럼만')
from unnest(array['member_profiles', 'anniversaries', 'date_cards', 'place_stops', 'card_notes']) as t;

-- 🔒 컬럼(평문 내용)과 L 컬럼(기기 전용) 이름이 public 어디에도 없다.
select is_empty($$
  select table_name || '.' || column_name
    from information_schema.columns
   where table_schema = 'public'
     and column_name = any (array[
       'started_on', 'nickname', 'title', 'date', 'repeat', 'notify',
       'start_at', 'end_at', 'summary', 'summary_source', 'ai_draft', 'ai_attempts', 'cover_photo_id',
       'taken_at', 'tz_offset_min', 'width', 'height', 'place_stop_id', 'sort',
       'seq', 'arrived_at', 'left_at', 'name', 'name_source', 'category', 'region', 'lat_c', 'lng_c', 'text',
       'lat', 'lng', 'local_asset_id', 'local_path', 'export_path', 'upload_state', 'download_state', 'dirty'
     ])
$$, '🔒 컬럼과 L 컬럼은 서버 스키마에 없음');

select col_type_is('public', 'date_cards', 'payload', 'envelope_payload', 'payload는 바이트(암호문) 도메인');

-- ── SV 테이블 ───────────────────────────────────────────────────────

select columns_are('public', 'users', array['id', 'created_at'], 'users에는 이름이 없음');
select columns_are('public', 'space_members', array['space_id', 'user_id', 'role', 'joined_at'], 'space_members 컬럼');
select columns_are('public', 'space_revs', array['space_id', 'last_rev', 'purged_below'], 'space_revs 컬럼');
select columns_are('public', 'invites', array['code', 'space_id', 'created_by', 'expires_at', 'used_by', 'used_at'], 'invites 컬럼');
select columns_are('public', 'devices', array[
  'id', 'user_id', 'public_key', 'label', 'status', 'push_token', 'created_at', 'revoked_at'
], 'devices 컬럼');
select columns_are('public', 'join_requests', array[
  'id', 'space_id', 'kind', 'requester_user_id', 'requester_device_id', 'invite_code', 'requester_commit',
  'approver_device_id', 'approver_nonce', 'requester_nonce', 'status', 'expires_at'
], 'join_requests 컬럼');
select columns_are('public', 'relink_requests', array['id', 'space_id', 'requested_by', 'status', 'created_at'], 'relink_requests 컬럼');
select columns_are('public', 'key_grants', array[
  'space_id', 'device_id', 'key_id', 'sealed_key', 'granted_by_device_id', 'created_at'
], 'key_grants 컬럼');
select columns_are('public', 'ai_usage', array['space_id', 'day_kst', 'count'], 'ai_usage 컬럼');

select col_is_pk('public', 'space_members', array['space_id', 'user_id'], 'space_members PK(space_id, user_id)');
select col_is_pk('public', 'key_grants', array['space_id', 'device_id', 'key_id'], 'key_grants PK(space_id, device_id, key_id)');
select col_is_pk('public', 'ai_usage', array['space_id', 'day_kst'], 'ai_usage PK(space_id, day_kst)');

-- ── RLS와 권한 ──────────────────────────────────────────────────────

select is_empty($$
  select c.relname
    from pg_class c
   where c.relnamespace = 'public'::regnamespace
     and c.relkind = 'r'
     and not c.relrowsecurity
$$, '모든 public 테이블에 RLS가 켜져 있음');

select is_empty($$
  select table_name || ':' || privilege_type
    from information_schema.role_table_grants
   where table_schema = 'public' and grantee = 'anon'
$$, 'anon은 public 테이블 권한이 없음');

select is_empty($$
  select table_name || ':' || privilege_type
    from information_schema.role_table_grants
   where table_schema = 'public' and grantee = 'authenticated' and privilege_type in ('DELETE', 'TRUNCATE')
$$, '클라이언트는 하드 삭제를 못 함');

select is_definer('public', 'is_space_member', array['uuid'], 'is_space_member는 security definer');
select is_definer('public', 'is_space_writable', array['uuid'], 'is_space_writable는 security definer');
select ok(
  not has_function_privilege('authenticated', 'public.create_space(uuid, uuid)', 'execute')
  and not has_function_privilege('anon', 'public.create_space(uuid, uuid)', 'execute')
  and has_function_privilege('service_role', 'public.create_space(uuid, uuid)', 'execute'),
  'create_space는 service_role(Edge Function)만 부름'
);

select results_eq(
  $$select public, allowed_mime_types from storage.buckets where id = 'photos'$$,
  $$values (false, array['application/octet-stream'])$$,
  'photos 버킷은 비공개, 암호문(octet-stream)만'
);

select * from finish();
rollback;
