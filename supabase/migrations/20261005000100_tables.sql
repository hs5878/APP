-- T19 · 서버 테이블. 기준: DATA_MODEL §3(표), §5.1(봉투), D-020(서버 평문 범위).
--
-- S 테이블은 모두 같은 봉투 모양이다: id, space_id, parent_id, created_by, key_id, payload, rev, created_at,
-- updated_at, deleted_at. 🔒 컬럼은 payload(암호문) 안에만 있고 서버 스키마에는 없다.
-- 예외: spaces는 평문 status, unlinked_at을, photos는 평문 remote_path를 더 가진다.
-- SV 테이블은 서버 전용이다. 서버 평문에는 이름이 없다(users에 nickname 없음).
--
-- 이 스키마가 내는 오류 코드(SQLSTATE). 클라이언트는 error.code로 구분한다.
--   LR001  삭제된 행을 되살리는 update(deleted_at을 지움)
--   LR002  공간 멤버 2명 초과
--   LR003  바꿀 수 없는 컬럼(id, space_id, created_by, created_at 등)을 바꾸려 함
--   LR004  한 번만 쓰는 값(join_requests의 승인 기기·nonce)을 다시 쓰려 함
--   LR005  복구 요청을 만들 수 없는 공간(해제 상태가 아니거나 30일이 지남)
--   LR006  이미 다른 사람이 쓰는 space_id로 공간을 만들려 함

-- 봉투 payload: nonce(24B) ‖ ciphertext(평문 + 태그 16B). 비어 있는 JSON이라도 40바이트는 넘는다.
create domain public.envelope_payload as bytea
  check (octet_length(value) between 40 and 262144);

-- ── SV: 사용자 ──────────────────────────────────────────────────────

-- 표시 이름은 member_profiles(암호화)에만 둔다.
create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- ── S: 커플 공간 ────────────────────────────────────────────────────

-- 봉투의 space_id는 id와 같은 값이다. payload(started_on)는 create-space 뒤 클라이언트가 처음 채우므로 비어 있을 수 있다.
create table public.spaces (
  id uuid primary key,
  space_id uuid not null,
  parent_id uuid,
  created_by uuid not null,
  key_id integer not null default 1,
  payload public.envelope_payload,
  status text not null default 'active',
  unlinked_at timestamptz,
  rev bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint spaces_space_id_is_id check (space_id = id),
  constraint spaces_no_parent check (parent_id is null),
  constraint spaces_key_id_positive check (key_id >= 1),
  constraint spaces_status_valid check (status in ('active', 'unlinked')),
  constraint spaces_unlinked_has_time check (status <> 'unlinked' or unlinked_at is not null)
);
create index spaces_space_rev_idx on public.spaces (space_id, rev);

-- ── SV: 멤버와 rev ──────────────────────────────────────────────────

-- 쓰기는 서버 함수만 한다(create-space, approve-join, unlink-space, delete-account). 최대 2명(트리거).
create table public.space_members (
  space_id uuid not null references public.spaces (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  role text not null,
  joined_at timestamptz not null default now(),
  primary key (space_id, user_id),
  constraint space_members_role_valid check (role in ('owner', 'member'))
);
create index space_members_user_idx on public.space_members (user_id);

-- 공간별 rev 카운터. create-space가 spaces 행보다 먼저 만들므로 FK 검사는 커밋 때 한다.
create table public.space_revs (
  space_id uuid primary key
    references public.spaces (id) on delete cascade deferrable initially deferred,
  last_rev bigint not null default 0,
  purged_below bigint not null default 0,
  constraint space_revs_order check (purged_below >= 0 and purged_below <= last_rev)
);

-- ── S: 봉투 테이블 ──────────────────────────────────────────────────

create table public.member_profiles (
  id uuid primary key,
  space_id uuid not null references public.spaces (id) on delete cascade,
  parent_id uuid,
  created_by uuid not null,
  key_id integer not null,
  payload public.envelope_payload not null,
  rev bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint member_profiles_no_parent check (parent_id is null),
  constraint member_profiles_key_id_positive check (key_id >= 1),
  constraint member_profiles_space_author unique (space_id, created_by)
);
create index member_profiles_space_rev_idx on public.member_profiles (space_id, rev);

create table public.anniversaries (
  id uuid primary key,
  space_id uuid not null references public.spaces (id) on delete cascade,
  parent_id uuid,
  created_by uuid not null,
  key_id integer not null,
  payload public.envelope_payload not null,
  rev bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint anniversaries_no_parent check (parent_id is null),
  constraint anniversaries_key_id_positive check (key_id >= 1)
);
create index anniversaries_space_rev_idx on public.anniversaries (space_id, rev);

create table public.date_cards (
  id uuid primary key,
  space_id uuid not null references public.spaces (id) on delete cascade,
  parent_id uuid,
  created_by uuid not null,
  key_id integer not null,
  payload public.envelope_payload not null,
  rev bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint date_cards_no_parent check (parent_id is null),
  constraint date_cards_key_id_positive check (key_id >= 1)
);
create index date_cards_space_rev_idx on public.date_cards (space_id, rev);

-- parent_id = card_id. 카드와 push 순서가 바뀔 수 있어 FK를 걸지 않는다(AAD가 parent_id를 묶는다).
-- remote_path는 Storage 버킷 `photos` 안의 객체 이름이고 ID만 들어간다.
create table public.photos (
  id uuid primary key,
  space_id uuid not null references public.spaces (id) on delete cascade,
  parent_id uuid not null,
  created_by uuid not null,
  key_id integer not null,
  payload public.envelope_payload not null,
  remote_path text,
  rev bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint photos_key_id_positive check (key_id >= 1),
  constraint photos_remote_path_ids_only check (
    remote_path is null or remote_path = 'spaces/' || space_id || '/photos/' || id || '.bin'
  )
);
create index photos_space_rev_idx on public.photos (space_id, rev);

create table public.place_stops (
  id uuid primary key,
  space_id uuid not null references public.spaces (id) on delete cascade,
  parent_id uuid not null,
  created_by uuid not null,
  key_id integer not null,
  payload public.envelope_payload not null,
  rev bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint place_stops_key_id_positive check (key_id >= 1)
);
create index place_stops_space_rev_idx on public.place_stops (space_id, rev);

create table public.card_notes (
  id uuid primary key,
  space_id uuid not null references public.spaces (id) on delete cascade,
  parent_id uuid not null,
  created_by uuid not null,
  key_id integer not null,
  payload public.envelope_payload not null,
  rev bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint card_notes_key_id_positive check (key_id >= 1),
  constraint card_notes_card_author unique (parent_id, created_by)
);
create index card_notes_space_rev_idx on public.card_notes (space_id, rev);

-- ── SV: 초대·기기·승인 ──────────────────────────────────────────────

-- 코드 문자 집합(혼동 문자 제외)은 create-invite가 정한다. 여기서는 8자 영대문자·숫자만 확인한다.
create table public.invites (
  code text primary key,
  space_id uuid not null references public.spaces (id) on delete cascade,
  created_by uuid not null references public.users (id) on delete cascade,
  expires_at timestamptz not null default now() + interval '24 hours',
  used_by uuid references public.users (id) on delete set null,
  used_at timestamptz,
  constraint invites_code_format check (code ~ '^[A-Z0-9]{8}$'),
  constraint invites_used_has_time check (used_by is null or used_at is not null)
);
create index invites_space_idx on public.invites (space_id);

create table public.devices (
  id uuid primary key,
  user_id uuid not null references public.users (id) on delete cascade,
  public_key bytea not null,
  label text not null,
  status text not null default 'pending',
  push_token text,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  constraint devices_public_key_len check (octet_length(public_key) = 32),
  constraint devices_label_len check (char_length(label) between 1 and 100),
  constraint devices_status_valid check (status in ('pending', 'active', 'revoked')),
  constraint devices_revoked_has_time check (status <> 'revoked' or revoked_at is not null)
);
-- 사용자당 active 기기는 1대(MVP). 승인 때 이전 기기를 먼저 revoke해야 새 기기를 active로 바꿀 수 있다.
create unique index devices_one_active_per_user on public.devices (user_id) where status = 'active';

-- 확인 숫자 흐름은 DATA_MODEL §5.2. invite_code는 초대가 정리돼도 남도록 FK를 걸지 않는다.
create table public.join_requests (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  kind text not null,
  requester_user_id uuid not null references public.users (id) on delete cascade,
  requester_device_id uuid not null references public.devices (id) on delete cascade,
  invite_code text,
  requester_commit bytea not null,
  approver_device_id uuid references public.devices (id) on delete cascade,
  approver_nonce bytea,
  requester_nonce bytea,
  status text not null default 'pending',
  expires_at timestamptz not null default now() + interval '24 hours',
  constraint join_requests_kind_valid check (kind in ('partner', 'device')),
  constraint join_requests_partner_has_code check (kind <> 'partner' or invite_code is not null),
  constraint join_requests_commit_len check (octet_length(requester_commit) = 32),
  constraint join_requests_approver_nonce_len check (octet_length(approver_nonce) = 32),
  constraint join_requests_requester_nonce_len check (octet_length(requester_nonce) = 32),
  constraint join_requests_approver_pair check ((approver_device_id is null) = (approver_nonce is null)),
  -- n_R은 n_A가 올라온 뒤에만 공개한다.
  constraint join_requests_reveal_after_claim check (requester_nonce is null or approver_nonce is not null),
  constraint join_requests_status_valid check (status in ('pending', 'approved', 'rejected', 'expired'))
);
create index join_requests_space_idx on public.join_requests (space_id);
create index join_requests_requester_idx on public.join_requests (requester_user_id);

create table public.relink_requests (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  requested_by uuid not null references public.users (id) on delete cascade,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  constraint relink_requests_status_valid check (status in ('pending', 'approved', 'rejected', 'expired'))
);
create index relink_requests_space_idx on public.relink_requests (space_id);

-- sealed_key = crypto_box_seal(공간 키 32B, 기기 공개키) = 32 + crypto_box_SEALBYTES(48).
-- granted_by_device_id는 승인 기기가 지워져도 기록으로 남도록 FK를 걸지 않는다.
create table public.key_grants (
  space_id uuid not null references public.spaces (id) on delete cascade,
  device_id uuid not null references public.devices (id) on delete cascade,
  key_id integer not null,
  sealed_key bytea not null,
  granted_by_device_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (space_id, device_id, key_id),
  constraint key_grants_key_id_positive check (key_id >= 1),
  constraint key_grants_sealed_len check (octet_length(sealed_key) = 80)
);
create index key_grants_device_idx on public.key_grants (device_id);

-- ai-draft만 쓴다. 하루 30회 판단은 함수가 한다.
create table public.ai_usage (
  space_id uuid not null references public.spaces (id) on delete cascade,
  day_kst date not null,
  count integer not null default 0,
  primary key (space_id, day_kst),
  constraint ai_usage_count_nonnegative check (count >= 0)
);
