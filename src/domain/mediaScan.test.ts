import type { Cluster, PhotoMeta } from './clustering';
import {
  isScreenshot,
  parseOffsetString,
  pickDetailTargets,
  planScanWindow,
  resolveTzOffset,
  scanFraction,
  scanReducer,
  type ScanRowState,
  type ScanState,
} from './mediaScan';

const KST = 540;
const DAY = 86_400_000;

describe('planScanWindow', () => {
  it('스캔 기록이 없으면 사귄 날 0시부터 전체 스캔', () => {
    const w = planScanWindow({ startedOn: '2025-03-01', cursor: null, offsetMin: KST });
    expect(w.mode).toBe('full');
    expect(w.discoverFromMs).toBeNull();
    expect(w.floorMs).toBe(Date.UTC(2025, 2, 1) - KST * 60_000);
  });

  it('시작일을 바꾸면 그 날부터', () => {
    const w = planScanWindow({
      startedOn: '2025-03-01',
      startFrom: '2025-06-01',
      cursor: null,
      offsetMin: 0,
    });
    expect(w.floorMs).toBe(Date.UTC(2025, 5, 1));
  });

  it('증분은 마지막 스캔 날짜 − 7일(월 경계 포함)', () => {
    const w = planScanWindow({ startedOn: '2025-03-01', cursor: '2025-09-03', offsetMin: 0 });
    expect(w.mode).toBe('incremental');
    expect(w.discoverFromMs).toBe(Date.UTC(2025, 7, 27));
    expect(w.floorMs).toBe(Date.UTC(2025, 2, 1));
  });

  it('forceFull이면 기록이 있어도 전체', () => {
    const w = planScanWindow({
      startedOn: '2025-03-01',
      cursor: '2025-09-03',
      offsetMin: 0,
      forceFull: true,
    });
    expect(w.mode).toBe('full');
    expect(w.discoverFromMs).toBeNull();
  });
});

describe('isScreenshot', () => {
  it('iOS mediaSubtypes', () => {
    expect(isScreenshot({ mediaSubtypes: ['hdr', 'screenshot'] })).toBe(true);
    expect(isScreenshot({ mediaSubtypes: ['hdr'], filename: 'IMG_0001.HEIC' })).toBe(false);
  });
  it('Android 앨범·파일명', () => {
    expect(isScreenshot({ inScreenshotAlbum: true })).toBe(true);
    expect(isScreenshot({ filename: 'Screenshot_20260920-120000.jpg' })).toBe(true);
    expect(isScreenshot({ filename: '스크린샷 2026-09-20.png' })).toBe(true);
    expect(isScreenshot({ filename: 'IMG_20260920.jpg' })).toBe(false);
    expect(isScreenshot({ filename: 'my_screenshot_of_cat.jpg' })).toBe(false);
  });
});

describe('오프셋', () => {
  it('문자열 파싱', () => {
    expect(parseOffsetString('+09:00')).toBe(540);
    expect(parseOffsetString('-03:30')).toBe(-210);
    expect(parseOffsetString('Z')).toBe(0);
    expect(parseOffsetString('+0900')).toBe(540);
    expect(parseOffsetString('KST')).toBeNull();
    expect(parseOffsetString('+99:00')).toBeNull();
    expect(parseOffsetString(9)).toBeNull();
  });

  it('EXIF → 기기 오프셋 순서', () => {
    expect(resolveTzOffset({ OffsetTimeOriginal: '+01:00' }, KST)).toBe(60);
    expect(resolveTzOffset({ '{Exif}': { OffsetTimeOriginal: '-08:00' } }, KST)).toBe(-480);
    expect(resolveTzOffset({ OffsetTime: '+05:30' }, KST)).toBe(330);
    expect(resolveTzOffset({ OffsetTimeOriginal: 'bad' }, KST)).toBe(KST);
    expect(resolveTzOffset(null, KST)).toBe(KST);
    expect(resolveTzOffset({}, 0)).toBe(0);
  });
});

describe('pickDetailTargets', () => {
  const p = (id: string): PhotoMeta => ({ id, takenAt: 0 });
  const cluster = (ids: string[]): Cluster => ({
    day: '2026-09-20',
    startAt: 0,
    endAt: DAY,
    photos: ids.map(p),
  });

  it('묶음 안의 seen만 고른다', () => {
    const states = new Map<string, ScanRowState>([
      ['a', 'seen'],
      ['b', 'detailed'],
      ['c', 'seen'],
      ['d', 'seen'],
    ]);
    expect(pickDetailTargets([cluster(['a', 'b', 'c']), cluster(['d'])], states)).toEqual([
      'a',
      'c',
      'd',
    ]);
  });
});

describe('scanReducer', () => {
  const run = (events: Parameters<typeof scanReducer>[1][], from: ScanState = { phase: 'idle' }) =>
    events.reduce(scanReducer, from);

  it('정상 흐름: 권한 → 1단계 → 2단계 → 완료', () => {
    const s = run([
      { type: 'permission', access: 'all', canAskAgain: true },
      { type: 'stage1Page', count: 500 },
      { type: 'stage1Page', count: 120 },
      { type: 'stage1Done', detailTotal: 2 },
      { type: 'detail' },
      { type: 'detail' },
      { type: 'finished', clusters: 1, failed: 0, limited: false },
    ]);
    expect(s).toEqual({ phase: 'done', clusters: 1, detailed: 2, failed: 0, limited: false });
  });

  it('권한 거부는 denied에서 멈추고, 다시 허용하면 재시작', () => {
    const denied = run([{ type: 'permission', access: 'none', canAskAgain: false }]);
    expect(denied).toEqual({ phase: 'denied', canAskAgain: false });
    expect(run([{ type: 'stage1Page', count: 5 }], denied)).toEqual(denied);
    expect(run([{ type: 'permission', access: 'limited', canAskAgain: true }], denied)).toEqual({
      phase: 'stage1',
      scanned: 0,
    });
  });

  it('상세 대상이 없어도 2단계(0/0)를 거쳐 끝난다', () => {
    const s = run([
      { type: 'permission', access: 'all', canAskAgain: true },
      { type: 'stage1Done', detailTotal: 0 },
    ]);
    expect(s).toEqual({ phase: 'stage2', done: 0, total: 0 });
    expect(scanFraction(s)).toBe(0.5);
  });

  it('실패는 어느 단계에서든 error, reset은 idle', () => {
    const s = run([
      { type: 'permission', access: 'all', canAskAgain: true },
      { type: 'failed', message: 'boom' },
    ]);
    expect(s).toEqual({ phase: 'error', message: 'boom' });
    expect(run([{ type: 'reset' }], s)).toEqual({ phase: 'idle' });
  });

  it('순서에 안 맞는 이벤트는 무시', () => {
    expect(run([{ type: 'detail' }])).toEqual({ phase: 'idle' });
    const s1: ScanState = { phase: 'stage1', scanned: 3 };
    expect(run([{ type: 'detail' }], s1)).toEqual(s1);
  });

  it('진행률', () => {
    expect(scanFraction({ phase: 'stage1', scanned: 250 }, 1000)).toBe(0.125);
    expect(scanFraction({ phase: 'stage1', scanned: 250 })).toBe(0);
    expect(scanFraction({ phase: 'stage2', done: 1, total: 4 })).toBe(0.625);
    expect(scanFraction({ phase: 'idle' })).toBe(0);
  });
});
