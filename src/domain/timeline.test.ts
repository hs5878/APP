import { formatCardDate, groupByMonth, monthTitle } from './timeline';

const c = (id: string, date: string, startAt: number | null = null) => ({ id, date, startAt });

describe('groupByMonth', () => {
  it('빈 목록은 빈 배열', () => {
    expect(groupByMonth([])).toEqual([]);
  });
  it('최근 달이 위, 달 안에서도 최근 날짜가 위', () => {
    const out = groupByMonth([
      c('a', '2026-08-30'),
      c('b', '2026-09-02'),
      c('c', '2026-09-20'),
      c('d', '2025-12-25'),
    ]);
    expect(out.map((s) => s.key)).toEqual(['2026-09', '2026-08', '2025-12']);
    expect(out[0]!.data.map((x) => x.id)).toEqual(['c', 'b']);
    expect(out[0]!.title).toBe('2026년 9월');
  });
  it('같은 날은 시작 시각이 늦은 카드가 위, 같으면 id 순', () => {
    const out = groupByMonth([
      c('x', '2026-09-20', 100),
      c('y', '2026-09-20', 200),
      c('z', '2026-09-20', 200),
      c('n', '2026-09-20', null),
    ]);
    expect(out[0]!.data.map((x) => x.id)).toEqual(['y', 'z', 'x', 'n']);
  });
  it('연도가 다른 같은 달은 따로 묶는다', () => {
    expect(groupByMonth([c('a', '2025-09-01'), c('b', '2026-09-01')]).map((s) => s.key)).toEqual([
      '2026-09',
      '2025-09',
    ]);
  });
  it('잘못된 날짜는 빼고 입력을 바꾸지 않는다', () => {
    const input = [c('a', '2026-02-30'), c('b', '2026-02-28')];
    expect(groupByMonth(input).flatMap((s) => s.data.map((x) => x.id))).toEqual(['b']);
    expect(input[0]!.id).toBe('a');
  });
});

describe('formatCardDate', () => {
  it('요일을 붙인다', () => {
    expect(formatCardDate('2026-09-20')).toBe('9월 20일 (일)');
    expect(formatCardDate('2026-10-05')).toBe('10월 5일 (월)');
    expect(formatCardDate('1970-01-01')).toBe('1월 1일 (목)');
  });
  it('잘못된 값은 그대로', () => {
    expect(formatCardDate('x')).toBe('x');
  });
});

describe('monthTitle', () => {
  it('앞자리 0 제거', () => {
    expect(monthTitle('2026-03')).toBe('2026년 3월');
  });
});
