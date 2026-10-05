// 기념일 탭 목록: 자동 기념일과 사용자 기념일을 한 줄로 합친다. 순수 함수.
import { autoAnniversaryLabel } from './homeSummary';
import { nextUserOccurrence, upcomingAutoAnniversaries, type AutoKey } from './anniversaries';
import { compareYmd, diffDays, isValidYmd, type Ymd } from './dates';

export const TITLE_MAX_LENGTH = 30;

export type AnniversaryListItem =
  | { kind: 'auto'; key: AutoKey; label: string; date: Ymd; daysLeft: number }
  | {
      kind: 'user';
      id: string;
      label: string;
      /** 다음 발생일. 반복 없음이고 지났으면 원래 날짜. */
      date: Ymd;
      /** 지났으면 음수. */
      daysLeft: number;
      repeat: 'none' | 'yearly';
      past: boolean;
    };

export interface UserAnniversaryRow {
  id: string;
  title: string;
  date: Ymd;
  repeat: 'none' | 'yearly';
}

/**
 * 앞으로의 기념일(날짜순, 같은 날이면 자동 먼저) 뒤에, 지난 반복 없음 기념일(최근 순)을 붙인다.
 * 자동 기념일은 앞으로 autoLimit개만 보여 준다.
 */
export function buildAnniversaryList(
  startedOn: Ymd,
  users: readonly UserAnniversaryRow[],
  today: Ymd,
  autoLimit = 10,
): AnniversaryListItem[] {
  const upcoming: AnniversaryListItem[] = upcomingAutoAnniversaries(
    startedOn,
    today,
    autoLimit,
  ).map((a) => ({
    kind: 'auto',
    key: a.key,
    label: autoAnniversaryLabel(a.key),
    date: a.date,
    daysLeft: a.daysLeft,
  }));
  const past: AnniversaryListItem[] = [];
  for (const u of users) {
    const next = nextUserOccurrence(u, today);
    const item = {
      kind: 'user' as const,
      id: u.id,
      label: u.title,
      repeat: u.repeat,
    };
    if (next === null) {
      past.push({ ...item, date: u.date, daysLeft: diffDays(today, u.date), past: true });
    } else {
      upcoming.push({ ...item, date: next, daysLeft: diffDays(today, next), past: false });
    }
  }
  // 안정 정렬: 입력 순서(자동 → 사용자)가 같은 날의 우선순위가 된다.
  upcoming.sort((a, b) => compareYmd(a.date, b.date));
  past.sort((a, b) => compareYmd(b.date, a.date));
  return [...upcoming, ...past];
}

export type AnniversaryInputError = 'title' | 'date';

export function validateAnniversaryInput(input: {
  title: string;
  date: string;
}): AnniversaryInputError | null {
  const t = input.title.trim();
  if (t.length === 0 || t.length > TITLE_MAX_LENGTH) return 'title';
  if (!isValidYmd(input.date)) return 'date';
  return null;
}

export const ANNIVERSARY_INPUT_ERROR_MESSAGE: Record<AnniversaryInputError, string> = {
  title: `제목을 1~${TITLE_MAX_LENGTH}자로 입력해 주세요.`,
  date: '날짜를 YYYY-MM-DD 형식으로 입력해 주세요.',
};

export const NOTIFY_LABEL = {
  none: '알림 없음',
  d0: '당일',
  d1: '하루 전',
  d7: '7일 전',
} as const;

/** `D-3`, `D-DAY`, `D+5`(지난 기념일). */
export function formatDday(daysLeft: number): string {
  if (daysLeft === 0) return 'D-DAY';
  return daysLeft > 0 ? `D-${daysLeft}` : `D+${-daysLeft}`;
}
