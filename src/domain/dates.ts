// `YYYY-MM-DD` 문자열 날짜 연산(D-017). Date 객체와 시간대 변환을 쓰지 않고 달력 산술만 한다.

export type Ymd = string;

const YMD_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31;
}

export function parseYmd(s: string): { year: number; month: number; day: number } | null {
  const m = YMD_RE.exec(s);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

export function isValidYmd(s: string): boolean {
  return parseYmd(s) !== null;
}

export function formatYmd(year: number, month: number, day: number): Ymd {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function mustParse(s: string) {
  const p = parseYmd(s);
  if (!p) throw new Error(`잘못된 날짜: ${s}`);
  return p;
}

// 1970-01-01 = 0인 일수. Howard Hinnant의 days_from_civil.
export function toEpochDay(s: Ymd): number {
  const { year, month, day } = mustParse(s);
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

export function fromEpochDay(days: number): Ymd {
  const z = days + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor(
    (doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365,
  );
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const day = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const month = mp < 10 ? mp + 3 : mp - 9;
  const year = yoe + era * 400 + (month <= 2 ? 1 : 0);
  return formatYmd(year, month, day);
}

export function addDays(s: Ymd, n: number): Ymd {
  return fromEpochDay(toEpochDay(s) + n);
}

// b - a (일)
export function diffDays(a: Ymd, b: Ymd): number {
  return toEpochDay(b) - toEpochDay(a);
}

export function compareYmd(a: Ymd, b: Ymd): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

// 연도를 더한다. 2/29가 평년에 해당하면 2/28로 맞춘다.
export function addYears(s: Ymd, years: number): Ymd {
  const { year, month, day } = mustParse(s);
  const y = year + years;
  return formatYmd(y, month, Math.min(day, daysInMonth(y, month)));
}
