import { getDb } from '@/db/client';
import { uuidv7 } from '@/domain/id';
import { getDevUser } from '@/features/devUser';
import { photoFilesApi } from '@/platform/photoFiles';
import type { CandidateDeps } from './candidates';
import type { ConfirmDeps } from './confirm';

const offsetMin = (at: number) => -new Date(at).getTimezoneOffset();

/** 앱에서 쓰는 후보 계산 의존성. */
export async function candidateDeps(spaceId: string): Promise<CandidateDeps> {
  return { db: await getDb(), spaceId, now: () => Date.now(), offsetMin, newId: () => uuidv7() };
}

/** 앱에서 쓰는 확정 의존성. 로그인(T20) 전에는 개발용 임시 사용자로 만든다. */
export async function confirmDeps(spaceId: string): Promise<ConfirmDeps> {
  const { userId } = getDevUser(); // T20에서 실제 사용자로 교체
  return {
    db: await getDb(),
    files: photoFilesApi,
    spaceId,
    userId,
    now: () => Date.now(),
    offsetMin,
    newId: () => uuidv7(),
  };
}
