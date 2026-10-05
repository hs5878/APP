import {
  autoAnniversaryDate,
  dayCount,
  nextAnniversary,
  nextUserOccurrence,
  occurrenceInYear,
  parseAutoKey,
  upcomingAutoAnniversaries,
} from './anniversaries';

describe('dayCount', () => {
  it('사귄 날 당일은 1일', () => {
    expect(dayCount('2024-03-01', '2024-03-01')).toBe(1);
    expect(dayCount('2024-03-01', '2024-03-02')).toBe(2);
  });
  it('윤년·연말을 지난다', () => {
    expect(dayCount('2023-12-31', '2024-01-01')).toBe(2);
    expect(dayCount('2024-01-01', '2024-12-31')).toBe(366);
    expect(dayCount('2024-01-01', '2025-01-01')).toBe(367);
  });
  it('사귄 날 이전은 0 이하', () => {
    expect(dayCount('2024-03-01', '2024-02-29')).toBe(0);
  });
});

describe('키', () => {
  it('파싱', () => {
    expect(parseAutoKey('d100')).toEqual({ unit: 'd', n: 100 });
    expect(parseAutoKey('y3')).toEqual({ unit: 'y', n: 3 });
    for (const k of ['d150', 'd0', 'y0', 'x1', 'd', 'y01', 'd100x']) {
      expect(parseAutoKey(k)).toBeNull();
    }
  });
  it('날짜: 100일은 사귄 날 + 99일', () => {
    expect(autoAnniversaryDate('2024-01-01', 'd100')).toBe('2024-04-09');
    expect(autoAnniversaryDate('2024-01-01', 'd200')).toBe('2024-07-18');
    expect(autoAnniversaryDate('2024-01-01', 'y1')).toBe('2025-01-01');
    expect(autoAnniversaryDate('2024-01-01', 'bad')).toBeNull();
  });
  it('2/29 시작: 평년 주년은 2/28, 윤년 주년은 2/29', () => {
    expect(autoAnniversaryDate('2024-02-29', 'y1')).toBe('2025-02-28');
    expect(autoAnniversaryDate('2024-02-29', 'y4')).toBe('2028-02-29');
    expect(autoAnniversaryDate('2024-02-29', 'd100')).toBe('2024-06-07');
  });
  it('연말 시작 100일', () => {
    expect(autoAnniversaryDate('2023-12-31', 'd100')).toBe('2024-04-08');
  });
});

describe('upcomingAutoAnniversaries', () => {
  it('사귄 날 당일: 다음은 d100', () => {
    expect(upcomingAutoAnniversaries('2024-01-01', '2024-01-01')[0]).toEqual({
      kind: 'auto',
      key: 'd100',
      date: '2024-04-09',
      daysLeft: 99,
    });
  });
  it('100일 당일은 오늘 포함', () => {
    expect(upcomingAutoAnniversaries('2024-01-01', '2024-04-09')[0]).toMatchObject({
      key: 'd100',
      daysLeft: 0,
    });
    expect(upcomingAutoAnniversaries('2024-01-01', '2024-04-10')[0]).toMatchObject({ key: 'd200' });
  });
  it('사귄 날 이전이면 d100부터', () => {
    expect(upcomingAutoAnniversaries('2024-01-01', '2023-06-01')[0]).toMatchObject({ key: 'd100' });
  });
  it('날짜순으로 100일·주년이 섞여 나온다', () => {
    const keys = upcomingAutoAnniversaries('2024-01-01', '2024-01-01', 5).map((a) => a.key);
    expect(keys).toEqual(['d100', 'd200', 'd300', 'y1', 'd400']);
    const dates = upcomingAutoAnniversaries('2024-01-01', '2024-01-01', 30).map((a) => a.date);
    expect([...dates].sort()).toEqual(dates);
  });
  it('2/29 시작 경계', () => {
    const r = upcomingAutoAnniversaries('2024-02-29', '2024-12-01', 3);
    expect(r.map((a) => a.key)).toEqual(['d300', 'y1', 'd400']);
    expect(r[1]!.date).toBe('2025-02-28');
  });
  it('연말', () => {
    expect(upcomingAutoAnniversaries('2020-12-31', '2021-12-31')[0]).toMatchObject({
      key: 'y1',
      date: '2021-12-31',
      daysLeft: 0,
    });
  });
});

describe('사용자 기념일', () => {
  const yearly = { id: 'a', title: '첫 여행', date: '2023-05-10', repeat: 'yearly' as const };
  it('반복 없음', () => {
    const once = { ...yearly, repeat: 'none' as const };
    expect(nextUserOccurrence(once, '2023-05-10')).toBe('2023-05-10');
    expect(nextUserOccurrence(once, '2023-05-11')).toBeNull();
    expect(nextUserOccurrence(once, '2020-01-01')).toBe('2023-05-10');
  });
  it('매년 반복', () => {
    expect(nextUserOccurrence(yearly, '2024-05-10')).toBe('2024-05-10');
    expect(nextUserOccurrence(yearly, '2024-05-11')).toBe('2025-05-10');
    expect(nextUserOccurrence(yearly, '2024-01-01')).toBe('2024-05-10');
    expect(nextUserOccurrence(yearly, '2020-01-01')).toBe('2023-05-10');
  });
  it('2/29 반복은 평년 2/28', () => {
    const leap = { ...yearly, date: '2024-02-29' };
    expect(occurrenceInYear('2024-02-29', 2027)).toBe('2027-02-28');
    expect(nextUserOccurrence(leap, '2025-01-01')).toBe('2025-02-28');
    expect(nextUserOccurrence(leap, '2027-03-01')).toBe('2028-02-29');
  });
});

describe('nextAnniversary', () => {
  const user = [{ id: 'u1', title: '첫 여행', date: '2024-02-10', repeat: 'yearly' as const }];
  it('사용자 기념일이 더 가까우면 그것', () => {
    expect(nextAnniversary('2024-01-01', user, '2024-02-01')).toMatchObject({
      kind: 'user',
      id: 'u1',
      daysLeft: 9,
    });
  });
  it('자동이 더 가까우면 자동', () => {
    expect(nextAnniversary('2024-01-01', user, '2024-04-01')).toMatchObject({
      kind: 'auto',
      key: 'd100',
    });
  });
  it('같은 날이면 자동이 우선', () => {
    const same = [{ id: 'u2', title: 'x', date: '2024-04-09', repeat: 'none' as const }];
    expect(nextAnniversary('2024-01-01', same, '2024-04-01')).toMatchObject({
      kind: 'auto',
      key: 'd100',
    });
  });
  it('기념일 없음이면 자동만', () => {
    expect(nextAnniversary('2024-01-01', [], '2024-01-01')).toMatchObject({ key: 'd100' });
  });
});
