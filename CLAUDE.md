# CLAUDE.md

## 프로젝트

연애기록 앱. Expo(SDK 57) + TypeScript, iOS/Android. expo-router, Expo Go 미사용(dev build 전용).
한국어만 지원. 설계 문서는 `docs/`(SPEC, DATA_MODEL, DECISIONS, TASKS). 딥링크 scheme은 `loverecord://`(예: `loverecord://join/CODE`).
번들 ID/패키지는 `APP_ID` 환경 변수, 없으면 `com.example.loverecord`.

## 명령어

```bash
npm run typecheck   # tsc --noEmit
npm run lint        # eslint .
npm run format      # prettier --write .
npm run test        # jest (jest-expo)
npm run check       # typecheck → lint → test. 푸시 전 필수
npx expo install <패키지>   # 패키지는 항상 이걸로 설치(SDK 호환 버전)
npx expo-doctor
```

## 구조

```
app/                          화면(expo-router). 화면 파일에는 UI와 훅 호출만 둔다.
  _layout.tsx                 루트: 부팅 분기(T04), 잠금·가림 화면(T06)
  lock.tsx                    잠금 화면
  onboarding/                 로그인, 만 14세 확인, 사귄 날, 알림 숨김 질문
  pair/                       초대 코드, 연결 요청·확인 숫자·승인, 새 기기 승인
  restore/                    승인할 기기 없음, Drive 복원
  (tabs)/
    index.tsx                 홈: D+N, 다음 기념일, 후보 배지, 최근 카드
    records/                  index(타임라인), candidates, merge, [cardId]/index, [cardId]/edit
    anniversaries/            index(목록·편집), photobook/
    settings/                 index, sync, storage, export, backup, connection, account, promise

src/
  domain/                     순수 함수. React·Expo·DB import 금지(lint로 강제). 테스트 필수.
                              dates, anniversaries, clustering, geo, template, sas, pairingState,
                              cardMerge, placePick, notificationPlan, photobook, exportFormat, id, lockState
  db/                         client.ts(SQLCipher 연결), schema.ts(Drizzle), kv.ts, migrations/, repos/<테이블>.ts
  crypto/                     sodium.ts(libsodium 초기화), keys.ts(공간 키·기기 키), envelope.ts(행 봉투), fileCipher.ts(사진 파일)
  sync/                       engine.ts, push.ts, pull.ts, photoQueue.ts, prefetch.ts
  platform/                   Expo 네이티브 모듈을 감싸는 얇은 층: secureStore, notifications, media, network, push
  features/<기능>/            화면 밖 로직과 훅. auth, lock, photos, records, places, ai, pairing,
                              unlink, export, backup, photobook, account
  components/                 여러 화면이 쓰는 UI
  content/                    고지·약속 문구

plugins/                      Expo config plugin(예: withNoBackup.js)
supabase/
  migrations/                 SQL(스키마, RLS, 트리거)
  functions/<이름>/index.ts   Edge Functions. 공용 코드는 functions/_shared/
  tests/                      pgTAP, 함수 통합 테스트
scripts/                      개발용 스크립트(시드 등)
store/                        스토어 문구 초안
docs/                         설계 문서(SPEC, DATA_MODEL, DECISIONS, TASKS), MEASUREMENTS.md

의존 방향: app → features → (domain, db, crypto, sync, platform). domain은 아무것도 import하지 않는다.
테스트는 소스 옆 `*.test.ts`. 경로 별칭 `@/` = `src/`.
```

## 규칙

- TypeScript strict. 계산 로직은 `src/domain`의 순수 함수 + 단위 테스트.
- DATA_MODEL을 벗어나는 스키마 변경 금지. 필요하면 멈추고 문서 수정안을 먼저 제시한다.
- 암호 기본 요소를 직접 구현하지 않는다. libsodium(react-native-libsodium)만 쓴다.
- 이번 작업 범위 밖 기능은 만들지 않는다. 끝나면 typecheck·lint·test를 모두 통과시킨다.
- 로그인(T20) 전까지는 개발용 임시 사용자(T03)로 동작한다.
- 아직 쓰지 않는 폴더는 만들지 않는다(구조는 위 목록에만 둔다).
