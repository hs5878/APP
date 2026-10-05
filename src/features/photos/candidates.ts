import { listCardWindows, syncPendingCandidates } from '@/db/repos/cards';
import { listScannable, type MediaScanRow } from '@/db/repos/mediaScan';
import { planCandidates } from '@/domain/candidatePlan';
import { clusterByTime, splitDeferred, type PhotoMeta } from '@/domain/clustering';
import type { KvDb } from '@/db/kv';

export interface CandidateDeps {
  db: KvDb;
  spaceId: string;
  now(): number;
  /** 그 시각의 기기 UTC 오프셋(분, 동쪽이 +). */
  offsetMin(at: number): number;
  newId(): string;
}

function toMeta(r: MediaScanRow): PhotoMeta {
  return { id: r.assetId, takenAt: r.takenAt, tzOffsetMin: r.tzOffsetMin, lat: r.lat, lng: r.lng };
}

/**
 * 스캔 기록(`media_scan`)의 아직 카드·건너뛰기가 아닌 사진으로 후보를 다시 계산해 `card_candidates`에 맞춘다.
 * 오늘(04:00 기준) 묶음은 보류한다. 확정·건너뛴 사진은 `media_scan` 상태가 달라서 다시 묶이지 않는다.
 * 대기 후보 수를 돌려준다.
 */
export async function refreshCandidates(deps: CandidateDeps): Promise<number> {
  const now = deps.now();
  const offset = deps.offsetMin(now);
  const rows = await listScannable(deps.db, 0);
  const clusters = clusterByTime(rows.map(toMeta), offset);
  const { candidates } = splitDeferred(clusters, now, offset);
  const cards = await listCardWindows(deps.db, deps.spaceId);
  const drafts = planCandidates(candidates, cards);
  await syncPendingCandidates(deps.db, drafts, now, deps.newId);
  return drafts.length;
}
