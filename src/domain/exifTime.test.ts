import { exifLocalToEpoch, parseExifDateTime } from './exifTime';

describe('parseExifDateTime', () => {
  it('EXIF 형식을 읽는다', () => {
    expect(parseExifDateTime('2026:09:20 14:05:09')).toEqual({
      year: 2026,
      month: 9,
      day: 20,
      hour: 14,
      minute: 5,
      second: 9,
    });
  });

  it('형식이 틀리거나 범위를 벗어나면 null', () => {
    expect(parseExifDateTime('')).toBeNull();
    expect(parseExifDateTime('2026-09-20')).toBeNull();
    expect(parseExifDateTime('0000:00:00 00:00:00')).toBeNull();
    expect(parseExifDateTime('2026:13:20 14:05:09')).toBeNull();
    expect(parseExifDateTime('2026:09:20 25:05:09')).toBeNull();
  });
});

describe('exifLocalToEpoch', () => {
  it('오프셋을 빼서 UTC로 바꾼다', () => {
    const t = parseExifDateTime('2026:09:20 14:00:00')!;
    expect(exifLocalToEpoch(t, 540)).toBe(Date.UTC(2026, 8, 20, 5, 0, 0));
    expect(exifLocalToEpoch(t, 0)).toBe(Date.UTC(2026, 8, 20, 14, 0, 0));
  });
});
