import { getDb } from '@/db/client';
import { getLocalSpace } from '@/db/repos/spaces';
import type { ScanState } from '@/domain/mediaScan';
import { mediaApi } from '@/platform/media';
import { refreshCandidates } from './candidates';
import { candidateDeps } from './runtime';
import { runScan, type ScanOptions } from './scan';

let running: Promise<ScanState> | null = null;

/** 앱에서 쓰는 진입점. 이미 도는 스캔이 있으면 그것을 돌려준다. */
export function startScan(opts: ScanOptions, onState?: (s: ScanState) => void): Promise<ScanState> {
  if (running) return running;
  running = (async () => {
    const db = await getDb();
    const state = await runScan(
      {
        db,
        media: mediaApi,
        now: () => Date.now(),
        offsetMin: (at) => -new Date(at).getTimezoneOffset(),
        onState,
      },
      opts,
    );
    // 스캔이 끝나면 새로 묶인 사진으로 후보를 맞춘다.
    if (state.phase === 'done') {
      const space = await getLocalSpace(db);
      if (space) await refreshCandidates(await candidateDeps(space.id));
    }
    return state;
  })().finally(() => {
    running = null;
  });
  return running;
}
