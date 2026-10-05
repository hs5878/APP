import { getDb } from '@/db/client';
import type { ScanState } from '@/domain/mediaScan';
import { mediaApi } from '@/platform/media';
import { runScan, type ScanOptions } from './scan';

let running: Promise<ScanState> | null = null;

/** 앱에서 쓰는 진입점. 이미 도는 스캔이 있으면 그것을 돌려준다. */
export function startScan(opts: ScanOptions, onState?: (s: ScanState) => void): Promise<ScanState> {
  if (running) return running;
  running = (async () => {
    const db = await getDb();
    return runScan(
      {
        db,
        media: mediaApi,
        now: () => Date.now(),
        offsetMin: (at) => -new Date(at).getTimezoneOffset(),
        onState,
      },
      opts,
    );
  })().finally(() => {
    running = null;
  });
  return running;
}
