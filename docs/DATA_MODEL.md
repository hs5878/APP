# DATA_MODEL — 연애기록 앱 MVP

- 버전: v0.3 (2026-10-03, REVIEW.md 수정안 반영)
- 로컬: expo-sqlite + SQLCipher, Drizzle ORM
- 서버: Supabase(Postgres + RLS, Storage, Edge Functions, Realtime)
- 암호: react-native-libsodium. 쓰는 기능은 `crypto_aead_xchacha20poly1305_ietf_*`, `crypto_box_seal(_open)`, `crypto_box_keypair`, `crypto_generichash`(BLAKE2b), `crypto_pwhash`(Argon2id), `randombytes_buf`뿐이다. secretstream과 scrypt는 이 라이브러리 네이티브 구현에 없어서 쓰지 않는다.

## 1. 공통 규칙

| 항목 | 규칙 |
|---|---|
| ID | UUID v7, 클라이언트가 생성한다(오프라인 생성 가능, 시간순 정렬). |
| 시각 | `*_at`은 UTC epoch ms(INTEGER, 서버는 `timestamptz`). 내보내기 JSON에서는 ISO 8601(UTC, `Z`). |
| 날짜 | 기념일·카드 날짜는 로컬 날짜 문자열 `YYYY-MM-DD`. 시간대 변환을 하지 않는다. |
| 촬영 시각 | `taken_at`(UTC ms)과 `tz_offset_min`을 함께 저장해서 촬영지 현지 시각을 복원한다. 오프셋은 EXIF `OffsetTimeOriginal`, 없으면 스캔 시점 기기 오프셋. |
| 삭제 | 동기화 대상 테이블은 소프트 삭제(`deleted_at`). 한 번 삭제된 행은 되살리지 않는다(§5). 서버는 90일 뒤 영구 삭제. |
| 동기화 컬럼 | `space_id`, `created_by`, `created_at`, `updated_at`, `deleted_at`, `rev`(서버가 부여, 로컬은 마지막으로 받은 값), `dirty`(로컬 전용, 0/1). 모든 S 테이블이 로컬에도 `space_id`와 `created_by`를 갖는다. |
| 범위 표기 | **S** = 서버에 동기화, **L** = 로컬 전용, **SV** = 서버 전용(로컬은 읽기 캐시만) |
| 암호화 | S 테이블은 로컬에서는 평문 컬럼으로 저장하고, 서버에는 §5.1의 "봉투" 형태로 올린다. 🔒 컬럼은 서버에서 암호문(`payload`) 안에만 존재한다(D-020). |

## 2. 엔터티 관계

```
users ─┬─< space_members (SV) >─ spaces ─┬─< member_profiles
       │                                  ├─< anniversaries
       │                                  ├─< date_cards ─┬─< photos
       │                                  │               ├─< place_stops
       │                                  │               └─< card_notes
       │                                  ├─< photobooks (L)
       │                                  ├── space_revs (SV)
       │                                  ├─< invites / join_requests / relink_requests (SV)
       │                                  └─< key_grants (SV) >─┐
       └─< devices (SV) ───────────────────────────────────────┘
```

## 3. 테이블

### users (SV)
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | uuid | Supabase auth uid |
| created_at | ts | |

표시 이름은 `member_profiles`(암호화)에만 둔다. 서버 평문에는 이름이 없다.

### spaces (S) — 커플 공간. 연결 전에는 1인 공간이다.
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | uuid | 봉투의 space_id도 이 값 |
| started_on 🔒 | date text | 사귄 날(1일 기준) |
| key_id | int | 현재 공간 키 번호. MVP는 항상 1(재발급 없음) |
| status | text | `active` / `unlinked`. 서버 함수만 바꾼다 |
| unlinked_at | ts? | 해제 시각. 30일 뒤 서버 삭제 |
| + 동기화 컬럼 | | `created_by` = 공간을 만든 사람 |

`spaces` 행은 `create-space`가 만든다(C2). 클라이언트는 `started_on`만 수정한다.

### space_members (SV) — 서버 함수만 쓴다
| 컬럼 | 타입 | 설명 |
|---|---|---|
| space_id | uuid | PK(space_id, user_id) |
| user_id | uuid | |
| role | text | `owner`(공간을 만든 사람) / `member` |
| joined_at | ts | |

- 쓰기는 `create-space`, `approve-join`, `unlink-space`, `delete-account`만 한다. 클라이언트는 읽기만 한다.
- 최대 2명. 서버 트리거로 강제한다.
- 로컬에는 읽기 캐시(`members_cache`, L)로 두고 pull 때마다 통째로 갱신한다.

### member_profiles (S) — 공간 안 표시 이름
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | uuid | |
| space_id | uuid | UNIQUE(space_id, created_by) |
| nickname 🔒 | text | |
| + 동기화 컬럼 | | `created_by` = 본인. 본인만 수정 |

### space_revs (SV) — 공간별 rev 카운터
| 컬럼 | 타입 | 설명 |
|---|---|---|
| space_id | uuid | PK |
| last_rev | bigint | 마지막으로 나눠 준 rev |
| purged_below | bigint | 영구 삭제한 행 중 최대 rev |

### invites (SV)
| 컬럼 | 타입 | 설명 |
|---|---|---|
| code | text | PK, 8자, 혼동 문자 제외 |
| space_id | uuid | |
| created_by | uuid | |
| expires_at | ts | 생성 + 24시간 |
| used_by / used_at | uuid? / ts? | 1회용 |

`create-invite`가 만들고(이전 미사용 코드는 만료 처리), `redeem-invite`가 `join_requests`로 바꾼다.

### devices (SV) — 기기별 공개키
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | uuid | 기기에서 생성, SecureStore에 보관 |
| user_id | uuid | |
| public_key | bytea | X25519 공개키(32바이트) |
| label | text | "iPhone 15" 같은 기기명 |
| status | text | `pending` / `active` / `revoked` |
| push_token | text? | Expo 푸시 토큰. 승인 요청 알림에만 쓴다(D-027) |
| created_at / revoked_at | ts / ts? | |

- 사용자당 `active` 기기는 1대(MVP).
- 새 기기는 `pending`으로 등록한다. 승인(`approve-join`)이 끝나면 `active`가 되고, 그때 이전 기기를 `revoked`로 바꾼다.
- revoke된 기기는 다음 실행 때 로그아웃하고 로컬 데이터를 지운다.

### join_requests (SV) — 연결·새 기기 승인 대기
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | uuid | |
| space_id | uuid | |
| kind | text | `partner`(상대 합류) / `device`(내 새 기기) |
| requester_user_id | uuid | |
| requester_device_id | uuid | |
| invite_code | text? | `partner`일 때 사용한 코드 |
| requester_commit | bytea | `BLAKE2b(pk_R ‖ n_R)` |
| approver_device_id | uuid? | 승인 기기. 자격 있는 기기가 요청을 처음 열면서 `approver_nonce`를 쓸 때 채운다(서버가 한 번만 허용) |
| approver_nonce | bytea? | n_A(32B), 승인 기기가 씀 |
| requester_nonce | bytea? | n_R(32B), `approver_nonce`가 생긴 뒤에만 요청 기기가 씀 |
| status | text | `pending` / `approved` / `rejected` / `expired` |
| expires_at | ts | 생성 + 24시간 |

- 자격 있는 승인 기기: 그 공간 멤버의 `active` 기기 중 요청 기기가 아닌 것. `partner`면 owner의 기기, `device`면 상대 기기 또는 내 예전 기기.
- 확인 숫자 계산은 §5.2.

### relink_requests (SV) — 해제 30일 안 복구 요청 (D-025)
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | uuid | |
| space_id | uuid | |
| requested_by | uuid | |
| status | text | `pending` / `approved` / `rejected` / `expired` |
| created_at | ts | `unlinked_at + 30일`이 지나면 만들 수 없다 |

### key_grants (SV) — 기기별로 봉인한 공간 키
| 컬럼 | 타입 | 설명 |
|---|---|---|
| space_id | uuid | PK(space_id, device_id, key_id) |
| device_id | uuid | |
| key_id | int | |
| sealed_key | bytea | `crypto_box_seal(공간 키, 기기 공개키)` |
| granted_by_device_id | uuid | |
| created_at | ts | |

RLS: 본인 기기 행만 읽을 수 있다. 쓰기는 그 요청의 `approver_device_id`인 기기만 가능하다.

### ai_usage (SV)
| 컬럼 | 타입 | 설명 |
|---|---|---|
| space_id | uuid | PK(space_id, day_kst) |
| day_kst | date | 한국 시간 기준 날짜 |
| count | int | 하루 30회까지 |

### anniversaries (S) — 사용자 기념일만 저장한다. 자동 기념일(100일 단위, 주년)은 `started_on`으로 계산하고 저장하지 않는다.
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | uuid | |
| title 🔒 | text | |
| date 🔒 | date text | |
| repeat 🔒 | text | `none` / `yearly` |
| notify 🔒 | text | `none` / `d0` / `d1` / `d7` |
| + 동기화 컬럼 | | |

자동 기념일 키: `d100`, `d200`, …, `y1`, `y2`, … (포토북과 알림 식별자로 쓴다)

### date_cards (S)
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | uuid | |
| date 🔒 | date text | 04:00 경계 기준 로컬 날짜 |
| start_at / end_at 🔒 | ts | 첫·마지막 사진 시각(직접 만든 카드는 null 가능) |
| summary 🔒 | text | 최종 요약(승인된 AI 문장, 수정본, 템플릿 문장 중 하나) |
| summary_source 🔒 | text | `ai` / `ai_edited` / `manual` / `template` |
| ai_draft 🔒 | text? | 마지막 AI 원문(비교·재시도용) |
| ai_attempts 🔒 | int | 다시 쓰기 횟수(최대 3). 서버 한도(하루 30회)는 `ai_usage`로 따로 센다 |
| cover_photo_id 🔒 | uuid? | |
| + 동기화 컬럼 | | |

### card_candidates (L) — 확정 전 후보. 서버에 올라가지 않는다.
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | uuid | |
| date | date text | |
| start_at / end_at | ts | |
| asset_ids | json text | 기기 사진 asset id 배열 |
| target_card_id | uuid? | 이미 있는 카드와 시간이 겹치면 그 카드("이 카드에 추가할까요?") |
| status | text | `pending` / `accepted` / `skipped` |
| created_at | ts | |

### media_scan (L) — 스캔 기록. 같은 사진을 다시 제안하지 않고, 끊긴 스캔을 이어 하려고 둔다.
| 컬럼 | 타입 | 설명 |
|---|---|---|
| asset_id | text | PK, 기기 사진 id |
| taken_at | ts | |
| lat, lng | real? | 2단계에서 읽은 위치(정밀 좌표, 기기 전용) |
| tz_offset_min | int? | 2단계에서 읽은 오프셋 |
| state | text | `seen`(1단계만) / `detailed`(2단계 완료) / `in_card` / `skipped` / `ignored`(스크린샷 등) |

`scan_cursor`(마지막 스캔 날짜)는 `kv`에 둔다. 증분 스캔은 `scan_cursor − 7일`부터 다시 본다.

### photos (S, 일부 컬럼 L)
| 컬럼 | 범위 | 타입 | 설명 |
|---|---|---|---|
| id | S | uuid | |
| card_id | S | uuid | 봉투의 parent_id |
| taken_at, tz_offset_min 🔒 | S | ts, int | |
| width, height 🔒 | S | int | 보관본 크기 |
| place_stop_id 🔒 | S | uuid? | |
| sort 🔒 | S | int | 카드 안 순서 |
| remote_path | S | text? | `spaces/{space_id}/photos/{id}.bin`(보관본 암호문), 썸네일은 `{id}.thumb.bin`. 업로드 후 채운다 |
| local_asset_id | L | text? | 본인 사진의 갤러리 asset id. 내보내기 때 원본을 찾는 데 쓴다 |
| local_path | L | text? | 보관본(내 사진) 또는 내려받아 복호화한 보관본(상대 사진) |
| export_path | L | text? | 내보내기·Drive에 처음 쓴 상대 경로. 한 번 정하면 바꾸지 않는다(A6) |
| lat, lng | L | real? | 정밀 좌표. 기기에만 둔다 |
| upload_state | L | text | `pending` / `done` / `failed` |
| download_state | L | text | 상대 사진: `none` / `thumb` / `full` |
| + 동기화 컬럼 | | | `created_by` = 사진을 올린 사람 |

### place_stops (S) — 카드 안 장소 흐름
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | uuid | |
| card_id | uuid | 봉투의 parent_id |
| seq 🔒 | int | 방문 순서(도착 시각 순) |
| arrived_at / left_at 🔒 | ts | |
| name 🔒 | text? | 장소명(예: "블루보틀 성수"). 중심에서 50m 밖이면 비운다 |
| name_source 🔒 | text | `auto` / `picked`(후보 중 고름) / `manual` |
| category 🔒 | text? | 카페 / 음식점 / 관광명소 / 문화시설 / 기타 |
| region 🔒 | text? | 동 단위 지역명(예: "성수동") |
| lat_c, lng_c 🔒 | real? | 소수 3자리로 반올림한 좌표(약 100m) |
| + 동기화 컬럼 | | |

### card_notes (S) — 각자 한 줄 메모
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | uuid | |
| card_id | uuid | 봉투의 parent_id. UNIQUE(card_id, created_by) |
| text 🔒 | text | 최대 100자 |
| + 동기화 컬럼 | | `created_by` = 작성자 |

### photobooks (L)
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | uuid | |
| space_id | uuid | |
| anniversary_key | text | `d100`, `y1` 등 |
| range_from / range_to | date text | 포함 기간 |
| card_ids | json text | 포함 카드(편집 반영) |
| cover_photo_id | uuid? | |
| status | text | `scheduled` / `ready` / `failed` |
| pdf_path | text? | 앱 문서 폴더 안 경로 |
| generated_at | ts? | |

### backups (L)
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | uuid | |
| started_at / finished_at | ts | |
| status | text | `ok` / `failed` / `partial` |
| error | text? | |
| photos_uploaded | int | |

사진별 Drive 업로드 여부는 `drive_files(photo_id PK, drive_file_id, uploaded_at)`(L)로 관리한다.

### kv (L) — 설정과 커서
주요 키: `install.id`, `scan_cursor`, `sync_rev.{table}`(테이블별 커서), `lock.enabled`, `lock.biometric`, `lock.timeout`(0/60/300), `notif.hide`, `notif.anniversary`, `ai.enabled`, `place.enabled`, `drive.folder_id`, `backup.last_ok_at`.

비밀값은 kv가 아니라 SecureStore에 둔다.

| SecureStore 키 | 내용 |
|---|---|
| `db.key` | SQLCipher 키 |
| `pin.hash` | PIN 해시(Argon2id `crypto_pwhash` + salt) |
| `pin.lock` | PIN 실패 상태 JSON `{failures, lockedUntil}`. 5회 실패 시 30초 대기를 앱 재시작 뒤에도 유지(기기 시계 기준) |
| `device.id`, `device.sk` | 기기 ID, X25519 키쌍. `device.sk` 값 = base64(개인키 32B ‖ 공개키 32B). 네이티브 libsodium에 개인키로 공개키를 계산하는 함수가 없어 공개키를 함께 둔다 |
| `space.{space_id}.key.{key_id}` | 공간 키(32바이트) |
| `secure.index` | 이 앱이 SecureStore에 쓴 키 이름 목록(JSON). SecureStore는 키 목록을 주지 않아 재설치 정리 때 동적 키까지 지우려고 둔다 |

- 접근성: `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`(iOS). 화면이 잠긴 동안에도 백그라운드 백업이 DB를 열 수 있고, 기기 밖으로 복사되지 않는다.
- 재설치 정리: 시작 시 `kv['install.id']`가 없으면(새 설치) SecureStore 항목을 모두 지우고 새 기기로 시작한다. iOS는 앱을 지워도 키체인이 남기 때문이다.
- DB를 열 수 없으면(키 없음) 새 설치로 보고 승인·Drive 복원 흐름으로 보낸다.

## 4. 파일 저장 위치(기기)

| 대상 | 경로 | 비고 |
|---|---|---|
| DB | `SQLite/app.db` | SQLCipher, 키는 SecureStore |
| 보관본(내 사진, 상대 사진) | `documents/photos/{photo_id}.jpg` | 긴 변 2048px, JPEG 85%. 상대 사진은 내려받아 복호화한 것 |
| 썸네일 | `cache/thumbs/{photo_id}.jpg` | 400px. 다시 만들거나 다시 받을 수 있음 |
| 포토북·내보내기 | `documents/exports/…` | 공유 후 7일 뒤 정리 |

- OS 기기 백업 제외: Android `allowBackup=false`. iOS는 앱 데이터 폴더에 `isExcludedFromBackup`을 건다(B5).
- 설정 > 저장 공간에서 상대 사진 캐시를 지울 수 있다. 지우면 `download_state`를 `thumb`로 되돌린다.

## 5. 동기화 규칙

- **대상**: S 테이블과 컬럼만. L 컬럼은 서버 스키마에 없다.
- **rev**: 공간별 카운터. 쓰기 트리거가 `update space_revs set last_rev = last_rev + 1 where space_id = … returning last_rev`로 rev를 받는다. 같은 공간의 쓰기는 행 잠금 때문에 커밋 순서대로 rev를 받는다.
- **커서**: 테이블별 `kv['sync_rev.{table}']`.
- **순서**: push 먼저, 그다음 pull.
- **push**: `dirty = 1`인 행을 봉투로 만들어 upsert하고, 성공하면 `dirty = 0`으로 바꾸고 서버 rev를 받는다.
- **pull**: 테이블마다 `where space_id = :sid and rev > :cursor order by rev limit 500`을 빈 결과가 나올 때까지 반복하고, 페이지마다 그 테이블 커서를 갱신한다. 봉투를 복호화해 로컬 행에 반영한다. 복호화나 인증에 실패한 행은 버리고 오류를 기록한다. `space_members`는 매번 통째로 받아 `members_cache`를 갱신한다.
- **pull 중 dirty 행**: 로컬 행이 `dirty = 1`이면 받은 행을 버린다. 다음 push에서 내 수정이 이긴다.
- **충돌**: 행 단위로 서버에 나중에 도착한 쪽이 이긴다. 한 줄 메모와 별명은 작성자별 행이라 충돌하지 않는다.
- **삭제는 되돌리지 않는다**: 서버 트리거가 `deleted_at`이 있는 행에서 `deleted_at`을 지우는 update를 거부한다. 클라이언트는 거부되면 로컬 행도 삭제 처리한다.
- **오래 꺼진 기기**: 커서가 `space_revs.purged_below`보다 작으면 그 공간을 처음부터 다시 받는다.
- **사진 업로드**: 카드가 확정되면 보관본과 400px 썸네일을 각각 암호화해 업로드 대기열에 넣는다.
- **상대 사진 받기**(D-024): 목록에서는 썸네일을 받는다. Wi-Fi 연결 중 앱이 앞에 있으면 보관본을 차례로 받아 복호화해 둔다. 내보내기·백업·포토북은 시작 전에 빠진 보관본을 먼저 받고, 오프라인이면 "상대 사진 N장을 받아야 해요"로 막는다.
- **사진 삭제**: 행을 영구 삭제할 때 Storage 객체(`.bin`, `.thumb.bin`)도 함께 지운다(예약 작업).
- **시점**: 앱 포그라운드 진입, 로컬 변경 후 2초 디바운스, Supabase Realtime 변경 알림.
- **RLS**: `security definer` 함수 `is_space_member(sid uuid)`로 검사한다(정책 안에서 `space_members`를 다시 조회하면 재귀 오류가 난다). 모든 S 테이블과 Storage 경로는 `is_space_member(space_id)`이고, 공간이 `unlinked`이면 읽기만 허용한다.
- **공간 생성**: 첫 로그인 직후 로컬에서 만든 space_id로 `create-space`를 호출한다. spaces 행, owner 멤버, `space_revs`를 한 트랜잭션으로 만든다.
- **연결 시 합치기**: 승인으로 공간 키를 받은 뒤, 합류자의 로컬 행을 새 `space_id`로 바꾸고 새 공간 키로 다시 암호화하도록 `dirty = 1`로 표시해 push한다. 합류자의 예전 1인 공간은 서버에서 삭제한다. 합치지 않기로 하면 D-025대로 1인 공간을 지운 뒤 합류한다.

### 5.1 서버 행 봉투 (D-020)

S 테이블의 서버 스키마는 모두 같은 모양이다.

| 컬럼 | 평문 여부 | 설명 |
|---|---|---|
| id, space_id | 평문 | |
| parent_id | 평문 | 상위 참조(photos·place_stops·card_notes의 card_id). 없으면 null |
| created_by | 평문 | 봉투의 author_id |
| key_id | 평문 | 어느 공간 키로 암호화했는지 |
| payload | 암호문 | 🔒 컬럼을 JSON으로 묶어 XChaCha20-Poly1305(`crypto_aead_xchacha20poly1305_ietf_encrypt`)로 암호화. `nonce(24B) ‖ ciphertext` |
| rev, created_at, updated_at, deleted_at | 평문 | 동기화용 |

예외: `spaces`는 평문 `status`, `unlinked_at`을 더 가진다(서버 함수만 씀). `photos`는 평문 `remote_path`를 더 가진다(서버가 서명 URL을 만들어야 함, 경로에는 ID만 들어감).

- **행 AAD**: 길이 접두 인코딩(각 필드 앞에 2바이트 길이)으로 `테이블명, id, space_id, parent_id(없으면 빈 값), created_by, key_id`. 서버가 payload를 다른 행으로 옮기거나, 사진을 다른 카드로 옮기거나, 작성자를 바꾸면 복호화가 실패한다. 사진을 다른 카드로 옮길 때는 클라이언트가 payload를 다시 암호화한다.
- **AAD 문자 제한**: react-native-libsodium 네이티브 바인딩은 AAD를 문자열(UTF-8)로만 받는다. 바이트가 그대로 유지되도록 AAD 필드는 출력 가능한 ASCII, 필드당 127바이트 이하로 제한한다(길이 접두 2바이트도 ASCII 범위에 든다). key_id는 10진 문자열로 넣는다. 사진 AAD는 길이 접두가 없으므로 photo_id·space_id를 36자 UUID로 고정한다.
- **사진 파일**: 단발 AEAD(`crypto_aead_xchacha20poly1305_ietf_encrypt`). 파일 = `nonce(24B) ‖ ciphertext`. AAD = `"photo" ‖ photo_id ‖ space_id ‖ key_id ‖ "full" 또는 "thumb"`. 보관본이 약 0.5MB라 스트리밍이 필요 없다.
- **파일 I/O**: base64를 거치지 않고 `Uint8Array`로 바로 읽고 쓴다(expo-file-system `File` API). 100ms 목표는 M4 첫 작업에서 측정한다.
- **한계(고지)**: 서버는 행을 지우거나 예전 암호문으로 되돌릴 수 있다. MVP에서는 막지 않는다.
- **키 재발급**(key_id 증가)은 MVP에서 하지 않는다. 모든 행이 key_id를 갖고 있어서 v1.1에서 추가할 수 있다.

### 5.2 연결·새 기기 승인 흐름 (D-019, D-022)

두 기기가 같은 시점에 온라인이어야 한다. 단계 전환은 Realtime으로 알린다.

1. **요청 기기**: 로그인 → `devices`에 `pending`으로 공개키 등록 → 무작위 n_R(32B) 생성 → `commit = BLAKE2b(pk_R ‖ n_R)`와 함께 `redeem-invite`(상대 합류) 또는 `request-device`(내 새 기기) 호출 → `join_requests` 생성. 서버가 자격 있는 승인 기기들에 푸시를 보낸다(D-027).
2. **승인 기기**: 요청을 열면 무작위 n_A(32B)를 올린다(`claim-join`). 이때 `approver_device_id`가 정해진다.
3. **요청 기기**: n_A가 올라온 것을 확인한 뒤에만 n_R을 공개한다. 승인 기기 공개키 pk_A는 이때 받는다.
4. **승인 기기**: `BLAKE2b(pk_R ‖ n_R) == commit`을 확인한다. 다르면 요청을 거절한다. 같을 때만 숫자를 보여준다.
5. **확인 숫자**: `BLAKE2b(pk_A ‖ pk_R ‖ n_A ‖ n_R ‖ request_id)`의 앞 8바이트(빅엔디언 uint64) mod 10⁶, 6자리 0 채움. 두 기기가 각자 계산해 보여주고, 사용자가 같은지 비교한다. 서버가 숫자를 미리 맞출 확률은 100만분의 1이다.
6. **승인**: 승인 기기가 공간 키를 pk_R로 봉인해 `key_grants`에 넣고 `approve-join`을 호출한다. 서버는 요청 기기를 `active`로 바꾸고, `partner`면 `space_members`에 추가한다.
7. **세션 정리**(`device`일 때): 서버가 그 사용자의 이전 기기를 `revoked`로 바꾸고 다른 세션을 모두 끊는다(Supabase Admin `signOut(scope: 'others')`, 새 기기 세션 제외).
8. **요청 기기**: `key_grants`를 열어 공간 키를 SecureStore에 저장하고 전체 pull을 한다.

- **승인할 기기가 없을 때**: 자격 있는 활성 기기가 없으면(1인 공간 분실, 둘 다 분실) 요청을 만들지 않고 [Drive 백업에서 복원] / [새로 시작]으로 보낸다(D-023).
- **한계(고지)**: 분실 기기 안의 로컬 데이터와 공간 키는 OS 잠금과 앱 PIN으로만 보호된다. 키 재발급은 v1.1.

### 5.3 해제·복구·삭제 흐름

| 상황 | 처리 |
|---|---|
| 연결 해제 (D-025) | `unlink-space`: `status = unlinked`, `unlinked_at` 기록. 30일 동안 두 사람 모두 읽기만 가능, 30일 뒤 서버 행·Storage 삭제. 기기에서는 읽기 전용 "지난 기록" |
| 해제 복구 (D-025) | `request-relink` → 상대가 `approve-relink` → `active`로 되돌림. 30일 안에만 |
| 새로 시작 (D-025) | 기기의 지난 기록을 지우고(내보내기 권유) 새 1인 공간을 만든다. MVP는 기기당 공간 1개 |
| 둘 다 분실 (D-023) | 새 space_id·새 공간 키로 Drive 백업을 복원하고 전체 push. 옛 공간은 `reset-space`로 즉시 삭제. 상대는 다시 초대 |
| 계정 삭제 (D-026) | 커플 공간이면 먼저 해제하고, 계정·기기·key_grants·member_profiles는 바로 삭제. 공간 데이터는 30일 뒤 삭제(복구 불가). 1인 공간이면 서버 데이터 즉시 삭제. 기기 데이터도 지운다 |

## 6. 내보내기·백업 JSON (`data.json`)

```json
{
  "schema": "loverecord.export",
  "version": 1,
  "exported_at": "2026-10-03T12:00:00Z",
  "space": { "id": "…", "started_on": "2025-03-14", "created_by": "…", "updated_at": "…" },
  "member_profiles": [{ "id": "…", "created_by": "…", "nickname": "…", "updated_at": "…" }],
  "anniversaries": [{ "id": "…", "title": "…", "date": "…", "repeat": "yearly", "notify": "d1", "created_by": "…", "updated_at": "…" }],
  "cards": [
    {
      "id": "…", "date": "2026-09-20", "start_at": "…", "end_at": "…",
      "summary": "…", "summary_source": "ai_edited", "ai_draft": "…", "ai_attempts": 1,
      "cover_photo_id": "…", "created_by": "…", "created_at": "…", "updated_at": "…",
      "places": [{ "id": "…", "seq": 1, "arrived_at": "…", "left_at": "…", "name": "…", "name_source": "auto", "category": "카페", "region": "성수동", "lat_c": 37.544, "lng_c": 127.056, "updated_at": "…" }],
      "notes": [{ "id": "…", "created_by": "…", "text": "…", "updated_at": "…" }],
      "photos": [{ "id": "…", "file": "photos/2026-09-20/0192….heic", "taken_at": "…", "tz_offset_min": 540, "width": 2048, "height": 1536, "place_stop_id": "…", "sort": 0, "created_by": "…", "updated_at": "…" }]
    }
  ]
}
```

- data.json은 삭제되지 않은 모든 S 테이블 행을 평문으로 담는다(🔒 컬럼, `created_by`, `created_at`, `updated_at` 포함). 빼는 것은 L 컬럼과 정밀 좌표(`lat`, `lng`)뿐이다. 예시는 구조만 보여주며, 필드 목록은 §3 표가 기준이다.
- 사진 파일 경로는 `photos/YYYY-MM-DD/{photo_id}.{ext}`이고, 처음 쓸 때 정한 뒤 바꾸지 않는다(`photos.export_path`). 카드 날짜가 바뀌어도 파일은 그대로이고, `file` 값이 기준이다.
- 복원은 id 기준으로 합치고, 같은 id면 `updated_at`이 최신인 쪽을 남긴다. `version`이 올라가면 복원기에 마이그레이션을 추가한다.

## 7. 서버 Edge Functions

| 이름 | 입력 | 하는 일 |
|---|---|---|
| `create-space` | space_id | spaces 행, owner 멤버, space_revs를 한 트랜잭션으로 생성 |
| `create-invite` | space_id | 코드 생성(중복 검사), 이전 미사용 코드 만료 |
| `redeem-invite` | code, device_id, commit | 코드 검증, 정원 확인, `join_requests(partner)` 생성, 승인 기기에 푸시. request_id를 돌려준다. 사용자당 시간당 10회로 시도를 제한한다 |
| `request-device` | device_id, commit | 새 기기용 `join_requests(device)` 생성, 승인 기기에 푸시. 승인할 기기가 없으면 그 사실을 돌려준다 |
| `claim-join` | request_id, n_A | 자격 있는 기기인지 확인하고 `approver_device_id`, `approver_nonce`를 한 번만 기록 |
| `approve-join` / `reject-join` | request_id | 승인 기기의 `key_grants` 존재 확인 후 기기 활성화, 멤버 추가, 이전 기기 revoke와 세션 정리(§5.2) |
| `unlink-space` | space_id | 해제, 30일 뒤 삭제 예약 |
| `request-relink` / `approve-relink` | space_id | 해제 30일 안 복구 |
| `reset-space` | space_id | 둘 다 분실 시 옛 공간 즉시 삭제 |
| `delete-account` | — | D-026 처리. Apple 로그인 사용자는 Apple REST API로 토큰을 폐기한다 |
| `places-lookup` | 좌표 목록(소수 4자리) | 카카오 로컬 API로 행정동과 주변 후보 3곳(카페·음식점·관광명소·문화시설) 조회. 좌표는 POST 본문으로만 받고, 저장하지도 로그에 남기지도 않는다(E2E 예외, D-020) |
| `ai-draft` | space_id, 날짜, 요일, 장소 스톱, 사진 수 | 멤버 확인 후 `ai_usage`로 하루 30회를 센다. Claude API 호출. 입력과 출력을 저장하지도 로그에 남기지도 않는다(E2E 예외, D-020) |

예약 작업: 해제 30일 경과 공간 삭제, 소프트 삭제 90일 경과 행·Storage 영구 삭제(`purged_below` 갱신), 만료된 초대·요청 정리.
