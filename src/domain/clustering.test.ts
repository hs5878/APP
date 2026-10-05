import { buildStops, clusterByTime, dayKeyOf, splitDeferred, type PhotoMeta } from './clustering';

const KST = 540;
const MIN = 60_000;
const HOUR = 60 * MIN;

// KST 현지 시각 → UTC ms
const kst = (y: number, mo: number, d: number, h: number, mi = 0) =>
  Date.UTC(y, mo - 1, d, h, mi) - KST * MIN;

const get = <T>(a: readonly T[], i: number): T => {
  const v = a[i];
  if (v === undefined) throw new Error(`인덱스 ${i} 없음`);
  return v;
};

let seq = 0;
const photo = (takenAt: number, extra: Partial<PhotoMeta> = {}): PhotoMeta => ({
  id: `p${seq++}`,
  takenAt,
  ...extra,
});

describe('dayKeyOf', () => {
  it('04:00 경계: 03:59는 전날, 04:00은 당일', () => {
    expect(dayKeyOf(kst(2026, 9, 20, 3, 59), KST)).toBe('2026-09-19');
    expect(dayKeyOf(kst(2026, 9, 20, 4, 0), KST)).toBe('2026-09-20');
  });

  it('자정 넘김: 00:30은 전날, 월 경계도 처리', () => {
    expect(dayKeyOf(kst(2026, 10, 1, 0, 30), KST)).toBe('2026-09-30');
    expect(dayKeyOf(kst(2027, 1, 1, 2, 0), KST)).toBe('2026-12-31');
  });

  it('UTC가 같아도 오프셋에 따라 날짜가 다르다', () => {
    const t = Date.UTC(2026, 8, 20, 20, 0); // KST 21일 05:00, UTC 20일 20:00
    expect(dayKeyOf(t, KST)).toBe('2026-09-21');
    expect(dayKeyOf(t, 0)).toBe('2026-09-20');
  });
});

describe('clusterByTime', () => {
  it('3시간 이하 간격은 한 묶음, 초과하면 분리', () => {
    const base = kst(2026, 9, 20, 12);
    const a = [0, 1, 2].map((i) => photo(base + i * 3 * HOUR)); // 12, 15, 18시: 정확히 3시간 간격
    const b = [0, 1, 2].map((i) => photo(base + 10 * HOUR + i * MIN)); // 22시: 3시간 초과 → 새 묶음(22:00은 같은 날)
    const res = clusterByTime([...a, ...b], KST);
    expect(res).toHaveLength(2);
    expect(get(res, 0).photos).toHaveLength(3);
    expect(get(res, 1).photos).toHaveLength(3);
  });

  it('3시간 + 1ms면 분리', () => {
    const base = kst(2026, 9, 20, 10);
    const first = [0, 1, 2].map((i) => photo(base + i * MIN));
    const second = [0, 1, 2].map((i) => photo(base + 2 * MIN + 3 * HOUR + 1 + i * MIN));
    expect(clusterByTime([...first, ...second], KST)).toHaveLength(2);
  });

  it('3장 미만 묶음은 후보에서 제외', () => {
    const base = kst(2026, 9, 20, 12);
    expect(clusterByTime([photo(base), photo(base + MIN)], KST)).toEqual([]);
    expect(
      clusterByTime([photo(base), photo(base + MIN), photo(base + 2 * MIN)], KST),
    ).toHaveLength(1);
  });

  it('자정을 넘겨도 04:00 전이면 같은 묶음, 날짜는 전날', () => {
    const base = kst(2026, 9, 20, 23, 0);
    const ps = [0, 1, 2, 3].map((i) => photo(base + i * HOUR)); // 23, 00, 01, 02시
    const res = clusterByTime(ps, KST);
    expect(res).toHaveLength(1);
    expect(get(res, 0).day).toBe('2026-09-20');
    expect(get(res, 0).photos).toHaveLength(4);
  });

  it('04:00 경계에서는 간격이 짧아도 분리', () => {
    const base = kst(2026, 9, 21, 3, 50);
    const before = [0, 1, 2].map((i) => photo(base + i * MIN)); // 03:50~03:52
    const after = [0, 1, 2].map((i) => photo(kst(2026, 9, 21, 4, 5) + i * MIN)); // 04:05~
    const res = clusterByTime([...before, ...after], KST);
    expect(res.map((c) => c.day)).toEqual(['2026-09-20', '2026-09-21']);
  });

  it('입력 순서와 무관하고 묶음 안은 시간순', () => {
    const base = kst(2026, 9, 20, 12);
    const ps = [2, 0, 1].map((i) => photo(base + i * MIN));
    const c = get(clusterByTime(ps, KST), 0);
    expect(c.photos.map((p) => p.takenAt)).toEqual([base, base + MIN, base + 2 * MIN]);
    expect(c.startAt).toBe(base);
    expect(c.endAt).toBe(base + 2 * MIN);
  });

  it('사진별 오프셋을 우선, 없으면 기본 오프셋', () => {
    const t = Date.UTC(2026, 8, 20, 20, 0); // UTC 20:00
    const ps = [
      photo(t, { tzOffsetMin: 0 }), // 20일
      photo(t + MIN, { tzOffsetMin: 0 }),
      photo(t + 2 * MIN, { tzOffsetMin: null }), // 기본 KST → 21일 → 분리
    ];
    const res = clusterByTime(ps, KST);
    expect(res).toHaveLength(0); // 2장 + 1장, 모두 3장 미만
    const more = [...ps, photo(t + 3 * MIN), photo(t + 4 * MIN)];
    const res2 = clusterByTime(more, KST);
    expect(res2).toHaveLength(1);
    expect(get(res2, 0).day).toBe('2026-09-21');
  });

  it('위치 없는 사진도 시간만으로 묶인다', () => {
    const base = kst(2026, 9, 20, 12);
    const ps = [0, 1, 2].map((i) => photo(base + i * MIN, { lat: null, lng: null }));
    expect(clusterByTime(ps, KST)).toHaveLength(1);
  });

  it('빈 입력', () => {
    expect(clusterByTime([], KST)).toEqual([]);
  });
});

describe('splitDeferred (오늘 보류)', () => {
  const mk = (d: number, h: number) =>
    get(
      clusterByTime(
        [0, 1, 2].map((i) => photo(kst(2026, 9, d, h) + i * MIN)),
        KST,
      ),
      0,
    );

  it('오늘(04:00 기준) 묶음은 보류, 이전 날은 후보', () => {
    const now = kst(2026, 9, 21, 15);
    const { candidates, deferred } = splitDeferred([mk(20, 14), mk(21, 10)], now, KST);
    expect(candidates.map((c) => c.day)).toEqual(['2026-09-20']);
    expect(deferred.map((c) => c.day)).toEqual(['2026-09-21']);
  });

  it('새벽 02시에는 아직 전날이 "오늘"이라 보류', () => {
    const now = kst(2026, 9, 21, 2);
    const { candidates, deferred } = splitDeferred([mk(20, 20)], now, KST);
    expect(candidates).toEqual([]);
    expect(deferred).toHaveLength(1);
  });

  it('다음 날 04:00이 지나면 후보가 된다', () => {
    const c = mk(20, 20);
    expect(splitDeferred([c], kst(2026, 9, 21, 3, 59), KST).candidates).toEqual([]);
    expect(splitDeferred([c], kst(2026, 9, 21, 4, 0), KST).candidates).toHaveLength(1);
  });
});

describe('buildStops', () => {
  const base = kst(2026, 9, 20, 12);
  const at = (i: number, lat: number | null, lng: number | null) =>
    photo(base + i * MIN, { lat, lng });

  it('150m 이내 연속 사진은 한 스톱', () => {
    const ps = [at(0, 37.5, 127), at(1, 37.5005, 127), at(2, 37.5, 127.0005)]; // 약 55m
    const stops = buildStops(ps);
    expect(stops).toHaveLength(1);
    expect(get(stops, 0).photoIds).toHaveLength(3);
  });

  it('150m 넘으면 새 스톱, 돌아와도 연속이 아니면 별도 스톱', () => {
    const ps = [at(0, 37.5, 127), at(1, 37.5, 127), at(2, 37.51, 127), at(3, 37.5, 127)];
    const stops = buildStops(ps);
    expect(stops.map((s) => s.photoIds.length)).toEqual([2, 1, 1]);
    expect(get(stops, 0).startAt).toBe(base);
    expect(get(stops, 0).endAt).toBe(base + MIN);
  });

  it('위치 없는 사진은 직전 스톱에 붙고 흐름을 끊지 않는다', () => {
    const ps = [at(0, 37.5, 127), at(1, null, null), at(2, 37.5001, 127)];
    const stops = buildStops(ps);
    expect(stops).toHaveLength(1);
    expect(get(stops, 0).photoIds).toHaveLength(3);
  });

  it('맨 앞의 위치 없는 사진은 첫 스톱에 붙는다', () => {
    const ps = [at(0, null, null), at(1, 37.5, 127)];
    const stops = buildStops(ps);
    expect(stops).toHaveLength(1);
    expect(get(stops, 0).photoIds).toHaveLength(2);
    expect(get(stops, 0).startAt).toBe(base);
  });

  it('위치가 하나도 없으면 스톱 없음', () => {
    expect(buildStops([at(0, null, null), at(1, null, null)])).toEqual([]);
    expect(buildStops([])).toEqual([]);
  });

  it('입력 순서와 무관', () => {
    const ps = [at(2, 37.51, 127), at(0, 37.5, 127), at(1, 37.5, 127)];
    expect(buildStops(ps).map((s) => s.photoIds.length)).toEqual([2, 1]);
  });
});

describe('성능', () => {
  it('5,000장 합성 데이터 1단계 묶음', () => {
    // 100일 동안 하루 50장, 3시간 이상 비는 구간 포함
    const start = kst(2026, 1, 1, 9);
    const ps: PhotoMeta[] = [];
    for (let d = 0; d < 100; d++) {
      for (let i = 0; i < 50; i++) {
        const t = start + d * 24 * HOUR + (i < 25 ? i * 5 * MIN : 6 * HOUR + (i - 25) * 5 * MIN);
        ps.push({ id: `s${d}-${i}`, takenAt: t });
      }
    }
    expect(ps).toHaveLength(5000);
    // 역순으로 섞어서 정렬 비용도 포함
    ps.reverse();
    const t0 = performance.now();
    const res = clusterByTime(ps, KST);
    const elapsed = performance.now() - t0;
    expect(res).toHaveLength(200);
    expect(elapsed).toBeLessThan(500);
  });
});
