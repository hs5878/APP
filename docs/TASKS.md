# TASKS — Claude Code 작업 단위

- 버전: v0.2 (2026-10-03) · 기준: SPEC v0.3 §6(M0~M8, M4b) + DATA_MODEL v0.3 + DECISIONS D-001~D-027 (REVIEW.md 수정안은 모두 원본에 반영됨)
- 작업 하나 = Claude Code 세션 하나. 42개, 위에서 아래 순서로 진행한다.
- 📱 표시 완료 기준은 실제 기기·시뮬레이터에서 사람이 확인한다(클라우드 세션에서는 못 돌림).

## 1. 넘기는 법

각 세션 첫 메시지에 아래 공통 머리말 + 해당 작업 블록을 붙인다.

```md
너는 연애기록 앱(Expo + TypeScript)을 구현한다. 설계 문서는 docs/SPEC.md, docs/DATA_MODEL.md, docs/DECISIONS.md다.
공통 제약:
- TypeScript strict. 계산 로직은 src/domain의 순수 함수 + 단위 테스트.
- DATA_MODEL을 벗어나는 스키마 변경 금지. 필요하면 멈추고 문서 수정안을 먼저 제시한다.
- 암호 기본 요소를 직접 구현하지 않는다. libsodium(react-native-libsodium)만 쓴다.
- 이번 작업 범위 밖 기능은 만들지 않는다. 끝나면 typecheck·lint·test를 모두 통과시킨다.
- 로그인(T20) 전까지는 개발용 임시 사용자(T03)로 동작한다.
작업: (아래 블록 붙여넣기)
```

## 2. 추천 모델 기준

| 모델 | 쓰는 곳 | 개수 |
|---|---|---|
| **Opus 5.5** | 암호, 동기화, 서버 스키마·RLS, 연결 프로토콜, 키가 걸린 복원 | 7 |
| **Sonnet 5.5** | 일반 기능(화면 + 로직 + 테스트) | 32 |
| **Haiku 4.5** | 작은 기계적 작업(골격 화면, 짧은 순수 함수, 고지 문구) | 3 |

## 3. 폴더 구조 (제안)

```
app/                        expo-router 화면: _layout.tsx, (tabs)/{index,records,anniversaries,settings}, onboarding/, lock.tsx, pair/, restore/
src/domain/                 순수 함수(테스트 대상)
src/db/                     schema.ts, client.ts, migrations/, repos/
src/crypto/                 sodium.ts, envelope.ts, fileCipher.ts, keys.ts
src/sync/                   engine.ts, push.ts, pull.ts, photoQueue.ts
src/platform/               secureStore.ts, notifications.ts, media.ts, network.ts
src/features/<기능>/        화면 밖 로직과 훅
supabase/migrations/        SQL
supabase/functions/<이름>/  Edge Functions
supabase/tests/             pgTAP·함수 테스트
```
테스트는 소스 옆 `*.test.ts`.

## 4. 사람이 미리 준비할 것

| 준비물 | 필요한 작업 |
|---|---|
| Expo 계정, Apple Developer, Google Play 콘솔 | T01(📱 dev build), T42 |
| Supabase 프로젝트(개발은 로컬 `supabase start`로 대체 가능) | T19 |
| 카카오 앱(네이티브 키, REST 키), Apple 로그인 서비스 ID·키 | T20, T31 |
| Anthropic API 키 | T32 |
| Google Cloud OAuth 클라이언트(iOS·Android를 같은 프로젝트에) | T37 |

## 5. 순서 요약

| 단계 | 작업 | 선행 |
|---|---|---|
| M0 기반 | T01~T04 | 없음 |
| M1 보안 | T05~T07 | T04 |
| M2 기념일 | T08~T11 | T03 |
| M3 사진 정리 | T12~T17 | T03 |
| M4 백엔드·동기화 | T18~T23 | T05(libsodium 도입) |
| M4b 연결·승인 | T24~T30 | T21 |
| M5 AI·장소 | T31~T33 | T17, T20 |
| M6 내보내기·백업 | T34~T38 | T22 |
| M7 포토북 | T39~T40 | T11, T16, T35 |
| M8 출시 준비 | T41~T42 | 전체 |

M2·M3은 T03 이후, M4는 T05 이후 서로 순서를 바꿔도 된다. 같은 단계 안은 번호 순이고, 정확한 선행은 각 작업의 "선행" 줄이 기준이다.

---

## M0 기반

### T01 · 프로젝트 골격 · Sonnet 5.5
- 전체 지시문: [briefs/T01-init.md](briefs/T01-init.md) (CLAUDE.md 구조 항목 포함)
- 목표: Expo dev build 프로젝트, expo-router 하단 탭 4개(빈 화면), ESLint·Prettier, Jest(jest-expo), `npm run check`(typecheck + lint + test).
- 완료 기준: `npm run check` 통과. 탭 4개 이동. EAS `development` 프로필 존재. 📱 iOS·Android dev build 실행.
- 파일: `package.json`, `app.json`/`app.config.ts`, `eas.json`, `tsconfig.json`, `.eslintrc.*`, `jest.config.js`, `app/_layout.tsx`, `app/(tabs)/*`
- 제약: Expo Go 사용 안 함.

### T02 · 암호화 DB와 마이그레이션 · Sonnet 5.5
- 목표: expo-sqlite + SQLCipher + Drizzle. 첫 실행 때 무작위 256비트 키를 만들어 SecureStore `db.key`에 둔다. 마이그레이션 러너, `kv` 테이블과 읽기·쓰기 헬퍼.
- 완료 기준: 키 없이 DB 파일을 열면 실패(테스트 또는 📱 확인). 마이그레이션 2회 실행해도 안전. kv 헬퍼 테스트 통과.
- 파일: `src/db/client.ts`, `src/db/migrations/*`, `src/db/kv.ts`, `src/platform/secureStore.ts`
- 선행: T01 · 근거: SPEC F6, D-011

### T03 · 로컬 스키마 전체 + 개발용 사용자 · Sonnet 5.5
- 목표: DATA_MODEL §3의 로컬 테이블(S 테이블, L 테이블, SV 읽기 캐시 `members_cache`)을 Drizzle로 옮긴다. 모든 S 테이블에 동기화 컬럼(`space_id`, `created_by` 포함). 커서는 테이블별 `sync_rev.{table}` kv 키. 개발용 임시 사용자(고정 UUID)와 UUID v7 생성기.
- 완료 기준: 마이그레이션 적용 후 모든 테이블 존재(테스트). UUID v7 시간순 정렬 테스트.
- 파일: `src/db/schema.ts`, `src/db/migrations/*`, `src/domain/id.ts`, `src/features/devUser.ts`
- 선행: T02

### T04 · 기기 백업 제외와 재설치 정리 · Sonnet 5.5
- 목표: Android `allowBackup=false`(config plugin), iOS 앱 데이터 폴더 `isExcludedFromBackup`. SecureStore 접근성 `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`. `kv['install.id']`가 없으면 SecureStore 항목을 모두 지우고 새로 시작. DB를 못 열면 새 설치로 처리.
- 완료 기준: 📱 재설치 후 남은 키체인으로 옛 상태가 살아나지 않음. 시작 분기 로직 단위 테스트.
- 파일: `plugins/withNoBackup.js`, `app.config.ts`, `src/platform/secureStore.ts`, `src/features/boot.ts`
- 선행: T02

## M1 보안

### T05 · PIN 로직 · Sonnet 5.5
- 목표: react-native-libsodium 설치(이 프로젝트 첫 도입). 6자리 PIN을 Argon2id(`crypto_pwhash`) + salt로 SecureStore `pin.hash`에 저장. 5회 실패 시 30초 대기 상태 기계.
- 완료 기준: 맞는 PIN 통과, 틀린 PIN 실패, 5회 실패 후 30초 동안 입력 거부(가짜 시계로 테스트). DB 키와 무관함을 코드로 확인.
- 파일: `src/crypto/sodium.ts`, `src/features/lock/pin.ts`, `src/domain/lockState.ts`
- 선행: T04 · 근거: SPEC F6, D-011

### T06 · 잠금 화면과 가림 화면 · Sonnet 5.5
- 목표: 잠금 화면(PIN 패드, 선택적 생체인증), 잠금 시점 즉시/1분/5분, 백그라운드 전환 시 가림 화면.
- 완료 기준: 잠금 시점 판정 함수 테스트. 📱 백그라운드 → 복귀 시 설정대로 잠김, 앱 전환기에서 내용 안 보임.
- 파일: `app/lock.tsx`, `app/_layout.tsx`, `src/features/lock/*`, `src/components/PrivacyCover.tsx`
- 선행: T05
- 제약: PIN 분실 재설정은 T20에서.

### T07 · 설정 탭 골격 · Haiku 4.5
- 목표: SPEC §4 설정 목록대로 설정 항목과 하위 화면 경로를 만든다. 잠금 항목만 T05·T06에 연결하고 나머지는 "준비 중"으로 비활성. 알림 숨김 스위치(`notif.hide`)는 저장까지.
- 완료 기준: 모든 항목이 보이고 잠금·알림 숨김 설정이 저장·복원됨.
- 파일: `app/(tabs)/settings/*`
- 선행: T06

## M2 기념일

### T08 · 날짜·기념일 순수 함수 · Sonnet 5.5
- 목표: `YYYY-MM-DD` 문자열 연산, D+N(사귄 날 = 1일), 자동 기념일(100일 단위, 주년, 2/29 → 평년 2/28), 키(`d100`, `y1`), 사용자 기념일 반복, 다음 기념일 계산.
- 완료 기준: 윤년, 사귄 날 당일, 연말, 2/29 시작 경계 테스트 통과(F1 수용 기준).
- 파일: `src/domain/dates.ts`, `src/domain/anniversaries.ts` + 테스트
- 선행: T01 · 제약: Date 객체로 시간대 변환하지 않음(D-017).

### T09 · 온보딩(로컬)과 홈 · Sonnet 5.5
- 목표: 온보딩(만 14세 이상 확인 → 사귄 날 입력 → 알림 숨김 질문 → 나중에 연결). 1인 공간 로컬 생성. 홈: D+N, 다음 기념일 D-n, 후보 배지 자리, 최근 카드 3개 자리.
- 완료 기준: 첫 실행에 온보딩, 두 번째부터 홈. 사귄 날 수정 시 홈 반영.
- 파일: `app/onboarding/*`, `app/(tabs)/index.tsx`, `src/db/repos/spaces.ts`
- 선행: T03, T08 · 제약: 로그인 단계는 T20에서 앞에 끼운다.

### T10 · 기념일 탭 · Sonnet 5.5
- 목표: 자동·사용자 기념일 통합 목록, 사용자 기념일 추가·수정·삭제(제목, 날짜, 반복, 알림 d0/d1/d7). 소프트 삭제·`dirty` 표시.
- 완료 기준: CRUD 후 목록과 홈 D-n 갱신. repo 테스트.
- 파일: `app/(tabs)/anniversaries/*`, `src/db/repos/anniversaries.ts`
- 선행: T09

### T11 · 로컬 알림 롤링 예약 · Sonnet 5.5
- 목표: 앱 실행·기념일 변경·설정 변경 때 전부 취소 후 앞으로 60일 안 알림만 다시 건다(최대 50개, 09:00). 알림 숨김이면 문구를 "새 알림이 있어요"로.
- 완료 기준: 예약 목록 계산 순수 함수 테스트(50개 상한, 숨김 문구). 📱 알림 수신.
- 파일: `src/domain/notificationPlan.ts`, `src/platform/notifications.ts`
- 선행: T10 · 제약: 이후 동기화 완료(T21)·포토북(T39)도 이 함수를 다시 부르게 훅만 열어 둔다.

## M3 사진 정리

### T12 · 묶음·장소 스톱 순수 함수 · Sonnet 5.5
- 목표: D-007 규칙(04:00 경계, 3시간 간격, 3장 미만 제외, 150m 연속 = 스톱). 오늘(04:00 기준) 묶음은 후보에서 보류. 수치는 상수.
- 완료 기준: 자정 넘김, 04:00 경계, 3시간 간격, 위치 없는 사진, 오늘 보류 테스트. 5,000장 합성 데이터 1단계 묶음 성능 테스트.
- 파일: `src/domain/clustering.ts`, `src/domain/geo.ts` + 테스트
- 선행: T08

### T13 · 사진 권한과 2단계 스캔 · Sonnet 5.5
- 목표: 권한(iOS 제한 접근, Android `ACCESS_MEDIA_LOCATION`, Android 14 부분 접근). 1단계 `getAssetsAsync` 시각만 → 묶음 → 2단계 3장 이상 묶음만 `getAssetInfoAsync`. 스크린샷 제외, `tz_offset_min`(EXIF → 기기 오프셋), 증분 "마지막 스캔 −7일", 중간 저장·이어 하기, `media_scan` 기록.
- 완료 기준: 스캔 상태 기계 테스트. 📱 5,000장 전체 스캔 시간 측정해 `docs/MEASUREMENTS.md`에 기록. 카톡으로 받은 옛 사진이 다음 스캔에 잡힘.
- 파일: `src/platform/media.ts`, `src/features/photos/scan.ts`, `src/db/repos/mediaScan.ts`
- 선행: T12

### T14 · 템플릿 문장 함수 · Haiku 4.5
- 목표: 장소명 있으면 "장소1 · 장소2 · N곳" → 동 이름만 있으면 "성수동에서" → 없으면 "사진 N장".
- 완료 기준: 세 경우와 장소 1곳·중복 이름 테스트.
- 파일: `src/domain/template.ts` + 테스트
- 선행: T01

### T15 · 후보 목록·확정·보관본 · Sonnet 5.5
- 목표: 데이트 후보 카드 목록, [기록하기]/[건너뛰기]. 기록하기 = 보관본(긴 변 2048px, JPEG 85%)·썸네일(400px) 생성, `date_cards`·`photos`·`place_stops`(이름 없음) 생성, 요약은 T14 템플릿. 확정 카드와 시간 겹치는 새 사진은 "이 카드에 추가할까요?". 홈 후보 배지 연결.
- 완료 기준: 확정·건너뛰기 후 같은 사진이 다시 후보로 안 뜸(테스트). 후보 데이터가 L 테이블에만 있음.
- 파일: `app/(tabs)/records/candidates.tsx`, `src/features/photos/confirm.ts`, `src/features/photos/archive.ts`, `src/db/repos/cards.ts`
- 선행: T13, T14 · 제약: 장소 조회·AI는 M5에서 끼운다.

### T16 · 기록 탭 타임라인과 카드 상세 · Sonnet 5.5
- 목표: 월별 타임라인, 카드 상세(사진 그리드, 장소 흐름, 요약, 한 줄 메모 자리), 사진 전체 화면 보기.
- 완료 기준: 카드 200개에서 스크롤 끊김 없음(📱). 월 그룹핑 함수 테스트.
- 파일: `app/(tabs)/records/index.tsx`, `app/(tabs)/records/[cardId]/index.tsx`, `src/features/records/*`
- 선행: T15

### T17 · 카드 편집 · Sonnet 5.5
- 목표: 사진 추가·삭제, 다른 카드로 이동, 날짜 수정, 카드 삭제, 사진 없이 카드 만들기, 표지 사진 지정.
- 완료 기준: 편집마다 `dirty = 1`, 삭제는 소프트 삭제(repo 테스트). 이동 후 `sort` 재정렬.
- 파일: `app/(tabs)/records/[cardId]/edit.tsx`, `src/features/records/edit.ts`
- 선행: T16 · 제약: 장소 스톱 편집은 T31(SPEC §6 M3).

## M4 백엔드·동기화

### T18 · 암호 모듈과 파일 I/O 측정 · Opus 5.5
- 목표: 공간 키 생성·SecureStore 보관(`space.{id}.key.{key_id}`), 기기 X25519 키쌍(`device.sk`), 행 봉투 암·복호화(AAD = 길이 접두 `테이블명, id, space_id, parent_id, created_by, key_id`), 사진 파일 단발 AEAD(AAD = `"photo" ‖ photo_id ‖ space_id ‖ key_id ‖ "full"|"thumb"`). 파일 바이트를 base64 없이 `Uint8Array`로 읽고 쓰는 경로.
- 완료 기준: AAD 필드 하나만 바꿔도 복호화 실패(필드별 테스트). 📱 0.5MB 보관본 암·복호화 100ms 이내, 측정값을 `docs/MEASUREMENTS.md`에.
- 파일: `src/crypto/*` + 테스트
- 선행: T05 · 제약: secretstream·scrypt 쓰지 않음.

### T19 · Supabase 스키마·RLS·rev · Opus 5.5
- 목표: SV 테이블(users, space_members, space_revs, invites, devices, join_requests, relink_requests, key_grants, ai_usage)과 S 테이블 봉투 스키마(공통 작성자 컬럼 `created_by`, `spaces`·`photos` 평문 예외는 §5.1). 공간별 rev 트리거, 삭제 되돌림 거부 트리거, 멤버 2명 상한 트리거, `is_space_member` security definer, unlinked 공간 읽기 전용, 비공개 Storage 버킷 경로 정책, `create-space` 함수.
- 완료 기준: pgTAP으로 비멤버 접근 거부, 3번째 멤버 거부, 삭제 되돌림 거부, 동시 쓰기 rev 순서 검증. 🔒 컬럼이 서버 스키마에 없음.
- 파일: `supabase/migrations/*`, `supabase/tests/*`, `supabase/config.toml`
- 선행: T03 · 제약: 서버 평문에 이름이 없음(`users`에 nickname 없음).

### T20 · 로그인·기기 등록·PIN 재설정 · Sonnet 5.5
- 목표: 카카오·Apple 로그인(Supabase Auth). Android는 Apple 웹 OAuth. 첫 작업으로 Supabase 카카오 공급자의 이메일 동의 요구를 확인해 기록. 온보딩 앞에 로그인 삽입, 개발용 사용자 제거. 로그인 후 `devices`에 공개키 등록, `create-space` 호출. PIN 분실 = 재로그인 + 기기 잠금 인증.
- 완료 기준: 📱 양 플랫폼에서 두 수단 로그인. 재로그인만으로는 PIN 재설정 불가(테스트).
- 파일: `src/features/auth/*`, `app/onboarding/login.tsx`, `src/features/lock/reset.ts`, `app.config.ts`
- 선행: T19, T18

### T21 · 동기화 엔진 · Opus 5.5
- 목표: push 먼저, pull 다음. 테이블별 커서, pull 중 dirty 행은 받은 행 버림, 삭제 거부 시 로컬도 삭제, `purged_below`보다 커서가 작으면 전체 재수신, 복호화 실패 행 버리고 기록. `space_members`는 매번 통째로 받아 `members_cache` 갱신. 트리거: 포그라운드, 변경 후 2초 디바운스, Realtime. 동기화 후 T11 알림 재예약 호출.
- 완료 기준: 두 클라이언트 동시 쓰기 1,000회 후 행 누락 0(로컬 Supabase 통합 테스트). 오프라인 편집 후 재연결 반영. 삭제된 카드가 오프라인 수정으로 되살아나지 않음.
- 파일: `src/sync/*`, `src/sync/*.test.ts`
- 선행: T20

### T22 · 사진 암호화 업로드·다운로드 · Sonnet 5.5
- 목표: 확정 카드의 보관본·썸네일을 T18로 암호화해 업로드 대기열(`upload_state`, 재시도). 상대 사진은 목록에서 썸네일, 열 때 보관본을 1시간 서명 URL로 받아 복호화 후 캐시. 설정 > 동기화 상태(대기·실패 재시도) 화면.
- 완료 기준: 오프라인 확정 → 온라인 시 자동 업로드. 업로드 파일을 다른 사진 경로로 바꾸면 복호화 실패(테스트).
- 파일: `src/sync/photoQueue.ts`, `src/features/photos/remote.ts`, `app/(tabs)/settings/sync.tsx`
- 선행: T21

### T23 · 평문 유출 검사 테스트 · Sonnet 5.5
- 목표: 테스트 데이터에 표식 문자열을 넣고 동기화한 뒤 서버 DB 전체 덤프와 Storage 객체에서 표식을 찾는 자동 테스트. payload를 다른 행과 맞바꾸면 복호화 실패하는 테스트.
- 완료 기준: CI에서 돌고, 평문 하나라도 보이면 실패.
- 파일: `supabase/tests/e2e-plaintext.test.ts`, `scripts/seed-marker.ts`
- 선행: T22 · 근거: SPEC §6 M4 완료 기준

## M4b 연결·승인

### T24 · 확인 숫자(커밋-공개) · Opus 5.5
- 목표: `commit = BLAKE2b(pk_R ‖ n_R)`, 공개 후 검증, 숫자 = `BLAKE2b(pk_A ‖ pk_R ‖ n_A ‖ n_R ‖ request_id)` 앞 8바이트 BE uint64 mod 10⁶, 6자리 0 채움. 단계 상태 기계(요청자·승인자).
- 완료 기준: 두 쪽 숫자 일치. 공개키 바꿔치기 시 불일치. commit과 다른 n_R이면 거절. n_A 전 n_R 공개 시도 차단.
- 파일: `src/domain/sas.ts`, `src/domain/pairingState.ts` + 테스트
- 선행: T18

### T25 · 연결·승인 서버 함수 · Opus 5.5
- 목표: `create-invite`(8자, 혼동 문자 제외, 24시간, 이전 코드 만료), `redeem-invite`(commit 포함, 시간당 10회 제한, request_id 반환), `request-device`(commit 포함, 승인할 기기가 없으면 그 사실 반환), `claim-join`(요청을 처음 연 자격 있는 기기를 `approver_device_id`로 한 번만 기록, n_A 저장), `approve-join`/`reject-join`(key_grants 존재 확인, 기기 활성화, 이전 기기 revoke와 다른 세션 종료). 요청이 생기면 자격 있는 승인 기기들에 Expo 푸시(`devices.push_token`, 숨김 문구 따름). key_grants 쓰기는 `approver_device_id` 기기만.
- 완료 기준: 함수별 테스트(만료 코드, 재사용 코드, 정원 초과, 시도 제한, 두 번째 `claim-join` 거부, 자격 없는 기기의 claim 거부, key_grants 없는 승인 거부, 승인자가 아닌 기기의 key_grants 쓰기 거부).
- 파일: `supabase/functions/{create-invite,redeem-invite,request-device,claim-join,approve-join,reject-join}/*`, `supabase/functions/_shared/push.ts`, `supabase/migrations/*`
- 선행: T19, T24

### T26 · 연결 요청·승인 화면 · Opus 5.5
- 목표: 초대 코드 만들기·공유(코드 + `loverecord://join/CODE` 딥링크), 코드 입력, 승인 기기가 요청을 열면 `claim-join`으로 n_A 등록 → 요청 기기가 n_R 공개 → commit 확인 → 양쪽 확인 숫자 화면(Realtime으로 단계 진행), 승인 → 공간 키 봉인 → `approve-join`, 요청 기기는 key_grants 열어 저장 후 전체 pull. 사귄 날이 다르면 초대한 쪽 값 확인.
- 완료 기준: 📱 두 기기 연결 후 한쪽 카드가 30초 안에 다른 기기에 보임(F1). 거절·만료 처리.
- 파일: `app/pair/*`, `src/features/pairing/*`
- 선행: T25

### T27 · 새 기기 승인과 승인 요청 푸시 · Sonnet 5.5
- 목표: 폰 교체 흐름(T26 화면 재사용, kind=`device`). 승인할 활성 기기가 없으면 "기기를 승인해 줄 사람이 없어요" → [Drive 백업에서 복원](T38로 연결) / [새로 시작]. 푸시 권한 1회 요청, 토큰 등록, 푸시 탭 시 승인 화면.
- 완료 기준: 📱 예전 기기 승인 후 새 기기에서 전체 데이터 보임, 예전 기기는 다음 실행 때 로그아웃·초기화.
- 파일: `app/pair/device.tsx`, `app/restore/no-approver.tsx`, `src/features/pairing/device.ts`, `src/platform/push.ts`
- 선행: T26

### T28 · 기록 합치기와 같은 날 카드 합치기 · Sonnet 5.5
- 목표: 합류자 "내 기록도 합칠까요?" 예 = 로컬 행 space_id 교체 + dirty push + 예전 1인 공간 서버 데이터 삭제, 아니오 = 내보내기 권유 후 1인 공간 삭제. 같은 날 시간 겹치는 카드 감지 → "합칠까요?" → 사진·메모 이동, 장소 스톱 합치기(150m·±30분).
- 완료 기준: 합치기 판정·스톱 합치기 순수 함수 테스트. 합친 뒤 사진·메모 수 보존.
- 파일: `src/domain/cardMerge.ts`, `src/features/pairing/mergeRecords.ts`, `app/(tabs)/records/merge.tsx`
- 선행: T26

### T29 · 연결 해제와 30일 복구 · Sonnet 5.5
- 목표: `unlink-space`, `request-relink`/`approve-relink`(`relink_requests`). 해제 후 기기에서 읽기 전용 "지난 기록", 홈 [복구 요청] [내보내기] [새로 시작]. 30일 뒤 서버 삭제 예약 작업.
- 완료 기준: 해제 즉시 쓰기 거부(RLS 테스트), 둘 다 동의 시 active 복귀, 30일 초과 복구 거부.
- 파일: `supabase/functions/{unlink-space,request-relink,approve-relink}/*`, `supabase/migrations/*`, `src/features/unlink/*`, `app/(tabs)/settings/connection.tsx`
- 선행: T26

### T30 · 계정 삭제와 로그아웃 · Sonnet 5.5
- 목표: `delete-account`(커플이면 해제 후 계정·기기·key_grants·member_profiles 즉시 삭제, 공간 데이터는 30일 뒤; 1인이면 즉시 전부. Apple 토큰 폐기 REST 호출). 로그아웃 = 기기 데이터 삭제 확인 후 초기화.
- 완료 기준: 삭제 후 서버에 해당 사용자 행 없음(테스트). Apple 토큰 폐기 호출 확인.
- 파일: `supabase/functions/delete-account/*`, `src/features/account/*`, `app/(tabs)/settings/account.tsx`
- 선행: T29 · 근거: SPEC §6 M4b, DATA_MODEL §5.3

## M5 AI·장소

### T31 · 장소 조회 · Sonnet 5.5
- 목표: `places-lookup`(POST 본문으로 좌표 소수 4자리, 카카오 로컬 API, 저장·로그 없음). 확정 시 스톱 이름·카테고리·동 채움, 50m 밖이면 동 이름만. `lat_c/lng_c` 소수 3자리. 카드 편집에 장소 스톱 편집(이름 바꾸기, 주변 후보 3곳 중 고르기, 직접 입력, 삭제, `name_source` 기록, 바꾸면 [다시 쓰기] 제안). `place.enabled` 끄기.
- 완료 기준: 함수가 좌표를 로그에 남기지 않음(테스트). 자동 선택 규칙 테스트.
- 파일: `supabase/functions/places-lookup/*`, `src/features/places/*`, `src/domain/placePick.ts`
- 선행: T17, T20 · 제약: API 키는 앱에 넣지 않음.

### T32 · AI 초안 서버 함수 · Sonnet 5.5
- 목표: `ai-draft`(멤버 확인, `ai_usage(space_id, day_kst)`로 하루 30회, Claude API, 모델 ID는 환경 변수, 저장·로그 없음). 프롬프트: 한국어 1~2문장 80자 이내, 흐름형 허용, 감정·사실 지어내지 않기. 클라이언트 요청 빌더.
- 완료 기준: 요청 페이로드에 이미지·좌표·이름 필드 없음(F3 테스트). 31번째 요청 거부. 80자 초과 응답은 잘라내거나 재요청.
- 파일: `supabase/functions/ai-draft/*`, `src/features/ai/request.ts` + 테스트
- 선행: T20

### T33 · AI 초안 화면 동작 · Sonnet 5.5
- 목표: 확정 시 초안 요청, [좋아요]/직접 수정/[다시 쓰기] 3회/한 줄 메모(각자 1행, 100자). 실패·오프라인·끔이면 템플릿, 온라인 되면 재시도. `summary_source` 기록. 장소 바꾸면 다시 쓰기 제안.
- 완료 기준: 각 상태 전이 테스트(ai → ai_edited, template → ai). 4번째 다시 쓰기 버튼 비활성.
- 파일: `app/(tabs)/records/[cardId]/index.tsx`, `src/features/ai/draft.ts`, `src/db/repos/notes.ts`
- 선행: T31, T32

## M6 내보내기·백업

### T34 · data.json 직렬화와 복원 합치기 · Sonnet 5.5
- 목표: 삭제 안 된 모든 S 행을 평문으로(🔒 컬럼, `created_by`, `updated_at` 포함, 정밀 좌표 제외, ISO 8601 UTC). 복원은 id 기준 합치기, `updated_at` 최신 우선. `version` 마이그레이션 자리.
- 완료 기준: 내보낸 data.json만으로 복원한 DB가 원본과 S 컬럼 기준 동일(왕복 테스트).
- 파일: `src/domain/exportFormat.ts`, `src/features/export/restoreMerge.ts` + 테스트
- 선행: T21

### T35 · 상대 사진 Wi-Fi 선다운로드 · Sonnet 5.5
- 목표: Wi-Fi + 포그라운드일 때 빠진 상대 보관본을 차례로 받아 복호화. 내보내기·백업·포토북 시작 전 빠진 보관본 확인, 오프라인이면 "상대 사진 N장을 받아야 해요". 설정 > 저장 공간(캐시 정리).
- 완료 기준: 네트워크 상태별 큐 동작 테스트. 셀룰러에서 받지 않음.
- 파일: `src/sync/prefetch.ts`, `src/platform/network.ts`, `app/(tabs)/settings/storage.tsx`
- 선행: T22

### T36 · ZIP 내보내기 · Sonnet 5.5
- 목표: 기간 선택, 예상 크기 표시, 남은 공간 2배 미만이면 차단, 4GB 넘으면 분할. `photos/YYYY-MM-DD/{photo_id}.{ext}`(내 사진 원본 형식, iCloud 원본 받기 실패 시 보관본), `records.pdf`, `data.json`. 네이티브 ZIP(`react-native-zip-archive`), 진행률·취소, 공유 시트.
- 완료 기준: 📱 1,000장 공간 내보내기 후 다른 기기 복원 시 카드·사진·메모 수 일치(F4).
- 파일: `src/features/export/*`, `app/(tabs)/settings/export.tsx`
- 선행: T34, T35

### T37 · Drive 연결과 자동 백업 · Sonnet 5.5
- 목표: 첫 작업으로 iOS·Android OAuth 클라이언트가 같은 GCP 프로젝트일 때 다른 기기에서 `drive.file` 파일이 보이는지 확인. "연애기록 백업" 폴더, 보관본 증분 업로드(`drive_files`), data.json 스냅샷 최근 7개, `backups` 기록. 앱 실행 때 24시간 지났고 Wi-Fi면 시작, iOS 백그라운드는 data.json만. 연결 직후·설정에서 백업 안내(D-021).
- 완료 기준: 두 번째 백업에서 이미 올린 사진 재업로드 0. 마지막 성공 시각·실패 사유 표시.
- 파일: `src/features/backup/*`, `app/(tabs)/settings/backup.tsx`
- 선행: T34, T35 · 제약: `drive.file` 범위만.

### T38 · Drive 복원과 새 공간 복원 · Opus 5.5
- 목표: 백업 목록에서 골라 복원(T34 합치기). 승인할 기기가 없으면 새 space_id·새 공간 키로 복원 → 전체 push → `reset-space`로 옛 공간 즉시 삭제 → 상대 재초대 안내.
- 완료 기준: 복원 후 카드·사진·메모 수 일치. 새 공간 데이터가 새 키로만 복호화됨. 옛 공간 서버 행·Storage 삭제 확인.
- 파일: `src/features/backup/restore.ts`, `app/restore/*`, `supabase/functions/reset-space/*`
- 선행: T37, T27

## M7 포토북

### T39 · 포토북 대상·알림·사진 고르기 · Sonnet 5.5
- 목표: 자동 기념일 중 직전 포토북 이후 카드 5개 이상이면 대상, D-14 09:00 알림(T11 예약 계획에 포함). 쪽 구성(표지 → 카드별 1~2쪽, 사진 최대 4장 → 통계, 최대 40쪽)과 사진 자동 선택 순수 함수. `photobooks` 행 관리.
- 완료 기준: 대상 판정·쪽 구성 테스트(40쪽 상한, 카드 4개면 대상 아님).
- 파일: `src/domain/photobook.ts`, `src/features/photobook/schedule.ts` + 테스트
- 선행: T11, T16

### T40 · 포토북 PDF 생성과 편집 · Sonnet 5.5
- 목표: 첫 단계로 40쪽 메모리 측정. 200×200mm HTML → expo-print, 사진은 배치 크기로 축소(한 장 1600px, 네 장 800px), 필요하면 10쪽씩 만들어 `pdf-lib`로 합침. 알림 이후 첫 실행 때 생성, 알림 탭 시 진행률과 함께 즉시 생성. 미리보기, 카드 넣기·빼기, 표지 사진 바꾸기, 저장·공유, 인쇄 안내 링크.
- 완료 기준: 📱 Android 중급 기기에서 40쪽 생성 시 죽지 않음, 카드 30개 30초 이내(F5).
- 파일: `src/features/photobook/*`, `app/(tabs)/anniversaries/photobook/*`
- 선행: T39, T35

## M8 출시 준비

### T41 · 데이터 약속과 법적 고지 화면 · Haiku 4.5
- 목표: 설정 > 데이터 약속(종료 3개월 전 공지, 내보내기 기간, 사진 AI 미전송, E2E, 서버가 아는 것과 AI·장소 조회 때 지나가는 정보 표). 개인정보처리방침·위치정보 고지 링크 자리.
- 완료 기준: 문구가 SPEC F4 "데이터 약속"과 D-020 서버 평문 목록과 일치.
- 파일: `app/(tabs)/settings/promise.tsx`, `src/content/promise.ts`
- 선행: T07 · 제약: 약관 본문은 법률 검토본을 받아 넣는다(D-014, D-015).

### T42 · EAS 빌드·제출 준비 · Sonnet 5.5
- 목표: EAS `preview`/`production` 프로필, Submit 설정, iOS 암호화 수출 항목(`ITSAppUsesNonExemptEncryption`)과 신고 메모, iOS 개인정보 매니페스트, Android 데이터 보안 양식 초안, 스토어 문구 초안, 권한 사용 문구 점검.
- 완료 기준: 📱 양 스토어 내부 테스트 배포.
- 파일: `eas.json`, `app.config.ts`, `store/*.md`, `docs/RELEASE.md`
- 선행: 전체 · 제약: D-014 위치정보법 확인이 끝나기 전에는 공개 출시하지 않는다.
