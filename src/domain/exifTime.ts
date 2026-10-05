// EXIF `DateTimeOriginal`("YYYY:MM:DD HH:MM:SS", 시간대 없음)을 읽는다.

const EXIF_RE = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/;

export type ExifLocalTime = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

export function parseExifDateTime(s: string): ExifLocalTime | null {
  const m = EXIF_RE.exec(s.trim());
  if (!m) return null;
  const [year, month, day, hour, minute, second] = m.slice(1).map(Number) as [
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  if (year < 1900 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  if (hour > 23 || minute > 59 || second > 60) return null;
  return { year, month, day, hour, minute, second };
}

/** 시간대 없는 촬영 시각을 UTC epoch ms로. `offsetMin`은 그 시각의 UTC 오프셋(분, 동쪽이 +). */
export function exifLocalToEpoch(t: ExifLocalTime, offsetMin: number): number {
  return Date.UTC(t.year, t.month - 1, t.day, t.hour, t.minute, t.second) - offsetMin * 60_000;
}
