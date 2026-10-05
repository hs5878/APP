import { formatYmdInput, validateStartedOn } from './startedOn';

describe('formatYmdInput', () => {
  it('숫자만 남기고 하이픈을 넣는다', () => {
    expect(formatYmdInput('2025')).toBe('2025');
    expect(formatYmdInput('202503')).toBe('2025-03');
    expect(formatYmdInput('20250314')).toBe('2025-03-14');
    expect(formatYmdInput('2025-03-14')).toBe('2025-03-14');
    expect(formatYmdInput('2025a03b1499')).toBe('2025-03-14');
  });
});

describe('validateStartedOn', () => {
  const today = '2026-10-05';
  it('오늘과 과거는 통과', () => {
    expect(validateStartedOn('2026-10-05', today)).toBeNull();
    expect(validateStartedOn('2024-02-29', today)).toBeNull();
  });
  it('형식 오류와 없는 날짜', () => {
    expect(validateStartedOn('2025-03', today)).toBe('format');
    expect(validateStartedOn('2025-02-29', today)).toBe('format');
    expect(validateStartedOn('', today)).toBe('format');
  });
  it('미래는 거절', () => {
    expect(validateStartedOn('2026-10-06', today)).toBe('future');
  });
});
