import { dayCount, nextAnniversary, parseAutoKey, type UserAnniversary } from './anniversaries';
import type { Ymd } from './dates';

export interface HomeSummary {
  /** D+N. 사귄 날이 1일이다. */
  dayCount: number;
  next: { label: string; date: Ymd; daysLeft: number };
}

/** `d100` → "100일", `y1` → "1주년". */
export function autoAnniversaryLabel(key: string): string {
  const p = parseAutoKey(key);
  if (!p) return key;
  return p.unit === 'd' ? `${p.n}일` : `${p.n}주년`;
}

export function buildHomeSummary(
  startedOn: Ymd,
  today: Ymd,
  userAnniversaries: readonly UserAnniversary[] = [],
): HomeSummary {
  const next = nextAnniversary(startedOn, userAnniversaries, today);
  return {
    dayCount: dayCount(startedOn, today),
    next: {
      label: next.kind === 'auto' ? autoAnniversaryLabel(next.key) : next.title,
      date: next.date,
      daysLeft: next.daysLeft,
    },
  };
}
