// 기념일 계산. 사귄 날이 1일(D-017). 자동 기념일은 100일 단위(`d100`…)와 주년(`y1`…).
import { addDays, addYears, compareYmd, diffDays, parseYmd, type Ymd } from './dates';

const MAX_YEARS = 200;

export type AutoKey = `d${number}` | `y${number}`;

export type UserAnniversary = { id: string; title: string; date: Ymd; repeat: 'none' | 'yearly' };

export type AutoAnniversary = { kind: 'auto'; key: AutoKey; date: Ymd; daysLeft: number };

export type UpcomingAnniversary =
  AutoAnniversary | { kind: 'user'; id: string; title: string; date: Ymd; daysLeft: number };

// 사귄 날 당일 = 1. 사귄 날 이전이면 0 이하.
export function dayCount(startedOn: Ymd, today: Ymd): number {
  return diffDays(startedOn, today) + 1;
}

export function parseAutoKey(key: string): { unit: 'd' | 'y'; n: number } | null {
  const m = /^([dy])([1-9]\d*)$/.exec(key);
  if (!m) return null;
  const n = Number(m[2]);
  if (m[1] === 'd') return n % 100 === 0 ? { unit: 'd', n } : null;
  return { unit: 'y', n };
}

export function dayKey(n: number): AutoKey {
  return `d${n}`;
}

export function yearKey(n: number): AutoKey {
  return `y${n}`;
}

// 키가 가리키는 날짜. 잘못된 키는 null.
export function autoAnniversaryDate(startedOn: Ymd, key: string): Ymd | null {
  const p = parseAutoKey(key);
  if (!p) return null;
  return p.unit === 'd' ? addDays(startedOn, p.n - 1) : addYears(startedOn, p.n);
}

// 반복 기념일의 해당 연도 발생일. 2/29는 평년에 2/28.
export function occurrenceInYear(date: Ymd, year: number): Ymd {
  const p = parseYmd(date);
  if (!p) throw new Error(`잘못된 날짜: ${date}`);
  return addYears(date, year - p.year);
}

// from 이상의 가장 가까운 자동 기념일들(날짜순, 같은 날이면 100일 단위가 먼저).
export function upcomingAutoAnniversaries(startedOn: Ymd, from: Ymd, limit = 1): AutoAnniversary[] {
  const out: AutoAnniversary[] = [];
  let k = Math.max(1, Math.ceil(dayCount(startedOn, from) / 100));
  let y = 1;
  while (y <= MAX_YEARS && addYears(startedOn, y) < from) y++;
  while (out.length < limit) {
    const dDate = addDays(startedOn, k * 100 - 1);
    const yDate = y <= MAX_YEARS ? addYears(startedOn, y) : null;
    if (yDate === null || compareYmd(dDate, yDate) <= 0) {
      out.push({
        kind: 'auto',
        key: dayKey(k * 100),
        date: dDate,
        daysLeft: diffDays(from, dDate),
      });
      k++;
    } else {
      out.push({ kind: 'auto', key: yearKey(y), date: yDate, daysLeft: diffDays(from, yDate) });
      y++;
    }
  }
  return out;
}

// from 이상의 사용자 기념일 다음 발생일. 반복 없음이고 지났으면 null.
export function nextUserOccurrence(a: UserAnniversary, from: Ymd): Ymd | null {
  if (a.repeat === 'none') return compareYmd(a.date, from) >= 0 ? a.date : null;
  const f = parseYmd(from);
  if (!f) throw new Error(`잘못된 날짜: ${from}`);
  if (compareYmd(a.date, from) >= 0) return a.date;
  const thisYear = occurrenceInYear(a.date, f.year);
  return compareYmd(thisYear, from) >= 0 ? thisYear : occurrenceInYear(a.date, f.year + 1);
}

// 오늘(from) 포함 가장 가까운 기념일 하나. 같은 날이면 자동 → 사용자(입력 순) 순서.
export function nextAnniversary(
  startedOn: Ymd,
  userAnniversaries: readonly UserAnniversary[],
  from: Ymd,
): UpcomingAnniversary {
  let best: UpcomingAnniversary = upcomingAutoAnniversaries(startedOn, from, 1)[0]!;
  for (const a of userAnniversaries) {
    const date = nextUserOccurrence(a, from);
    if (date !== null && compareYmd(date, best.date) < 0) {
      best = { kind: 'user', id: a.id, title: a.title, date, daysLeft: diffDays(from, date) };
    }
  }
  return best;
}
