import { clusterByTime } from './clustering';
import {
  CARD_OVERLAP_MARGIN_MS,
  fitWithin,
  findOverlappingCard,
  planCandidates,
  roundCoord,
  type CardWindow,
} from './candidatePlan';

const KST = 540;
const MIN = 60_000;
const kst = (d: number, h: number, mi = 0) => Date.UTC(2026, 8, d, h, mi) - KST * MIN;

const card = (over: Partial<CardWindow> = {}): CardWindow => ({
  id: 'c1',
  date: '2026-09-20',
  startAt: kst(20, 14),
  endAt: kst(20, 16),
  createdAt: 1,
  ...over,
});

describe('findOverlappingCard', () => {
  const range = (startH: number, endH: number, day = '2026-09-20') => ({
    day,
    startAt: kst(20, startH),
    endAt: kst(20, endH),
  });

  it('시간대가 겹치면 그 카드를 돌려준다', () => {
    expect(findOverlappingCard(range(15, 17), [card()])).toBe('c1');
  });

  it('앞뒤 1시간 여유 안이면 겹침으로 본다', () => {
    expect(findOverlappingCard(range(17, 18), [card()])).toBe('c1'); // 카드 끝 + 1시간 = 17:00
    expect(findOverlappingCard(range(12, 13), [card()])).toBe('c1'); // 카드 시작 - 1시간 = 13:00
  });

  it('여유를 1분이라도 넘으면 겹치지 않는다', () => {
    expect(
      findOverlappingCard({ day: '2026-09-20', startAt: kst(20, 17, 1), endAt: kst(20, 18) }, [
        card(),
      ]),
    ).toBeNull();
    expect(
      findOverlappingCard({ day: '2026-09-20', startAt: kst(20, 12), endAt: kst(20, 12, 59) }, [
        card(),
      ]),
    ).toBeNull();
    expect(CARD_OVERLAP_MARGIN_MS).toBe(3_600_000);
  });

  it('날짜가 다르면 겹치지 않는다', () => {
    expect(findOverlappingCard(range(15, 17, '2026-09-21'), [card()])).toBeNull();
  });

  it('시각이 없는 카드는 건너뛴다', () => {
    expect(findOverlappingCard(range(15, 17), [card({ startAt: null, endAt: null })])).toBeNull();
  });

  it('여럿이면 먼저 만든 카드', () => {
    const cards = [card({ id: 'late', createdAt: 9 }), card({ id: 'early', createdAt: 2 })];
    expect(findOverlappingCard(range(15, 17), cards)).toBe('early');
  });
});

describe('planCandidates', () => {
  const photos = (day: number, prefix: string) =>
    [0, 20, 40].map((m, i) => ({ id: `${prefix}${i}`, takenAt: kst(day, 14, m) }));

  it('묶음마다 후보를 만들고 겹치는 카드를 대상으로 붙인다', () => {
    const clusters = clusterByTime([...photos(20, 'a'), ...photos(22, 'b')], KST);
    const drafts = planCandidates(clusters, [card()]);
    expect(drafts).toHaveLength(2);
    expect(drafts[0]).toMatchObject({
      date: '2026-09-20',
      assetIds: ['a0', 'a1', 'a2'],
      targetCardId: 'c1',
    });
    expect(drafts[1]).toMatchObject({ date: '2026-09-22', targetCardId: null });
  });
});

describe('fitWithin', () => {
  it('긴 변을 맞추고 비율을 지킨다', () => {
    expect(fitWithin(4000, 3000, 2048)).toEqual({ width: 2048, height: 1536 });
    expect(fitWithin(3000, 4000, 400)).toEqual({ width: 300, height: 400 });
  });
  it('작은 사진은 키우지 않는다', () => {
    expect(fitWithin(800, 600, 2048)).toEqual({ width: 800, height: 600 });
  });
  it('매우 가는 사진도 한 변이 0이 되지 않는다', () => {
    expect(fitWithin(10000, 1, 2048).height).toBe(1);
  });
});

describe('roundCoord', () => {
  it('소수 3자리로 반올림한다', () => {
    expect(roundCoord(37.56649)).toBe(37.566);
    expect(roundCoord(127.0005)).toBe(127.001);
  });
});
