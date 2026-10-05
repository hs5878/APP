import {
  addDays,
  addYears,
  compareYmd,
  daysInMonth,
  diffDays,
  formatYmd,
  fromEpochDay,
  isLeapYear,
  isValidYmd,
  toEpochDay,
} from './dates';

describe('검증', () => {
  it('유효한 날짜만 통과', () => {
    expect(isValidYmd('2024-02-29')).toBe(true);
    expect(isValidYmd('2023-02-29')).toBe(false);
    expect(isValidYmd('1900-02-29')).toBe(false);
    expect(isValidYmd('2000-02-29')).toBe(true);
    expect(isValidYmd('2024-13-01')).toBe(false);
    expect(isValidYmd('2024-1-01')).toBe(false);
    expect(isValidYmd('2024-04-31')).toBe(false);
  });
  it('윤년', () => {
    expect(isLeapYear(2000) && isLeapYear(2024)).toBe(true);
    expect(isLeapYear(1900) || isLeapYear(2023)).toBe(false);
    expect(daysInMonth(2024, 2)).toBe(29);
  });
});

describe('일수 연산', () => {
  it('epoch 왕복', () => {
    expect(toEpochDay('1970-01-01')).toBe(0);
    expect(toEpochDay('2000-03-01')).toBe(11017);
    for (const d of ['1969-12-31', '2024-02-29', '2100-03-01', '0001-01-01', '9999-12-31']) {
      expect(fromEpochDay(toEpochDay(d))).toBe(d);
    }
  });
  it('addDays: 연말·윤년 경계', () => {
    expect(addDays('2023-12-31', 1)).toBe('2024-01-01');
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDays('2023-02-28', 1)).toBe('2023-03-01');
    expect(addDays('2024-01-01', -1)).toBe('2023-12-31');
    expect(addDays('2024-01-01', 365)).toBe('2024-12-31');
  });
  it('diffDays', () => {
    expect(diffDays('2024-01-01', '2025-01-01')).toBe(366);
    expect(diffDays('2025-01-01', '2024-01-01')).toBe(-366);
    expect(diffDays('2024-05-05', '2024-05-05')).toBe(0);
  });
  it('잘못된 날짜는 예외', () => {
    expect(() => toEpochDay('2023-02-30')).toThrow();
  });
});

describe('addYears', () => {
  it('2/29는 평년에 2/28', () => {
    expect(addYears('2024-02-29', 1)).toBe('2025-02-28');
    expect(addYears('2024-02-29', 4)).toBe('2028-02-29');
    expect(addYears('2024-03-15', 2)).toBe('2026-03-15');
  });
});

describe('기타', () => {
  it('compare·format', () => {
    expect(compareYmd('2024-01-01', '2024-01-02')).toBe(-1);
    expect(compareYmd('2024-01-02', '2024-01-02')).toBe(0);
    expect(formatYmd(5, 1, 2)).toBe('0005-01-02');
  });
});
