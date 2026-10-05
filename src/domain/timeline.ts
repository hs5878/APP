// 기록 탭 타임라인: 카드를 월별로 묶는다. 날짜는 `YYYY-MM-DD` 문자열 그대로 다룬다(D-017).
import { parseYmd, toEpochDay, type Ymd } from './dates';

export type TimelineCard = { id: string; date: Ymd; startAt: number | null };

export type MonthSection<T extends TimelineCard> = {
  /** `YYYY-MM` */
  key: string;
  title: string;
  data: T[];
};

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

function compareCards(a: TimelineCard, b: TimelineCard): number {
  if (a.date !== b.date) return a.date < b.date ? 1 : -1;
  const sa = a.startAt ?? 0;
  const sb = b.startAt ?? 0;
  if (sa !== sb) return sb - sa;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function monthTitle(key: string): string {
  const [y, m] = key.split('-');
  return `${Number(y)}년 ${Number(m)}월`;
}

/** 최근 달이 위, 달 안에서도 최근 날짜가 위. 날짜 형식이 틀린 카드는 묶을 수 없어 뺀다. */
export function groupByMonth<T extends TimelineCard>(cards: readonly T[]): MonthSection<T>[] {
  const sorted = cards.filter((c) => parseYmd(c.date) !== null).sort(compareCards);
  const sections: MonthSection<T>[] = [];
  for (const card of sorted) {
    const key = card.date.slice(0, 7);
    const last = sections[sections.length - 1];
    if (last && last.key === key) last.data.push(card);
    else sections.push({ key, title: monthTitle(key), data: [card] });
  }
  return sections;
}

/** `2026-09-20` → "9월 20일 (일)". 1970-01-01(목)이 epoch day 0. */
export function formatCardDate(date: Ymd): string {
  const p = parseYmd(date);
  if (!p) return date;
  const dow = (((toEpochDay(date) + 4) % 7) + 7) % 7;
  return `${p.month}월 ${p.day}일 (${WEEKDAYS[dow]})`;
}
