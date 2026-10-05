import { autoAnniversaryLabel, buildHomeSummary } from './homeSummary';

describe('buildHomeSummary', () => {
  it('사귄 날 당일은 D+1, 다음은 100일', () => {
    const s = buildHomeSummary('2026-10-05', '2026-10-05');
    expect(s.dayCount).toBe(1);
    expect(s.next).toEqual({ label: '100일', date: '2027-01-12', daysLeft: 99 });
  });
  it('사용자 기념일이 더 가까우면 그것을 고른다', () => {
    const s = buildHomeSummary('2026-10-05', '2026-10-05', [
      { id: 'a', title: '첫 여행', date: '2026-10-20', repeat: 'none' },
    ]);
    expect(s.next).toEqual({ label: '첫 여행', date: '2026-10-20', daysLeft: 15 });
  });
  it('사귄 날을 바꾸면 결과가 바뀐다', () => {
    expect(buildHomeSummary('2026-09-05', '2026-10-05').dayCount).toBe(31);
  });
});

describe('autoAnniversaryLabel', () => {
  it('일·주년 라벨', () => {
    expect(autoAnniversaryLabel('d300')).toBe('300일');
    expect(autoAnniversaryLabel('y2')).toBe('2주년');
  });
});
