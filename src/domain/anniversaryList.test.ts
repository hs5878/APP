import {
  buildAnniversaryList,
  formatDday,
  validateAnniversaryInput,
  type UserAnniversaryRow,
} from './anniversaryList';

const u = (o: Partial<UserAnniversaryRow> & { id: string }): UserAnniversaryRow => ({
  title: o.id,
  date: '2025-01-01',
  repeat: 'none',
  ...o,
});

describe('buildAnniversaryList', () => {
  const started = '2024-01-01'; // d100 = 2024-04-09, d200 = 2024-07-18, y1 = 2025-01-01

  it('사용자 기념일이 없으면 자동 기념일만 날짜순', () => {
    const list = buildAnniversaryList(started, [], '2024-01-02', 4);
    expect(list.map((i) => i.label)).toEqual(['100일', '200일', '300일', '1주년']);
  });

  it('자동·사용자를 날짜순으로 섞고, 같은 날이면 자동이 먼저', () => {
    const list = buildAnniversaryList(
      started,
      [
        u({ id: 'x', title: '여행', date: '2024-04-09' }),
        u({ id: 'y', title: '일찍', date: '2024-02-01' }),
      ],
      '2024-01-02',
      2,
    );
    expect(list.map((i) => i.label)).toEqual(['일찍', '100일', '여행', '200일']);
  });

  it('반복 기념일은 다음 발생일로, 지난 반복 없음은 맨 뒤(최근 순)', () => {
    const list = buildAnniversaryList(
      started,
      [
        u({ id: 'r', title: '생일', date: '2000-03-01', repeat: 'yearly' }),
        u({ id: 'p1', title: '옛날', date: '2024-01-05' }),
        u({ id: 'p2', title: '어제', date: '2024-06-09' }),
      ],
      '2024-06-10',
      1,
    );
    expect(list.map((i) => i.label)).toEqual(['200일', '생일', '어제', '옛날']);
    expect(list[1]).toMatchObject({ date: '2025-03-01', past: false });
    expect(list[2]).toMatchObject({ date: '2024-06-09', daysLeft: -1, past: true });
  });

  it('오늘 기념일은 D-DAY(daysLeft 0)이고 지난 것이 아니다', () => {
    const [first] = buildAnniversaryList(
      started,
      [u({ id: 'a', date: '2024-02-02' })],
      '2024-02-02',
      1,
    );
    expect(first).toMatchObject({ label: 'a', daysLeft: 0, past: false });
  });
});

describe('validateAnniversaryInput', () => {
  it('제목·날짜 검증', () => {
    expect(validateAnniversaryInput({ title: '  ', date: '2025-01-01' })).toBe('title');
    expect(validateAnniversaryInput({ title: 'a'.repeat(31), date: '2025-01-01' })).toBe('title');
    expect(validateAnniversaryInput({ title: '여행', date: '2025-02-30' })).toBe('date');
    expect(validateAnniversaryInput({ title: '여행', date: '2025-02-28' })).toBeNull();
  });
});

describe('formatDday', () => {
  it('형식', () => {
    expect([formatDday(0), formatDday(3), formatDday(-2)]).toEqual(['D-DAY', 'D-3', 'D+2']);
  });
});
