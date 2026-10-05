// 로컬 알림 롤링 예약 목록 계산. 순수 함수. 앞으로 60일 안, 최대 50개, 09:00(D-017: 로컬 날짜 문자열).
import {
  nextUserOccurrence,
  upcomingAutoAnniversaries,
  type UserAnniversary,
} from './anniversaries';
import { addDays, compareYmd, type Ymd } from './dates';
import { autoAnniversaryLabel } from './homeSummary';

export const WINDOW_DAYS = 60;
export const MAX_NOTIFICATIONS = 50;
export const NOTIFY_HOUR = 9;
export const HIDDEN_BODY = '새 알림이 있어요';

export type NotifyOffset = 'none' | 'd0' | 'd1' | 'd7';

export interface PlanUserAnniversary extends UserAnniversary {
  notify: NotifyOffset;
}

export interface PlannedNotification {
  /** 같은 입력이면 같은 값. 자동 기념일은 `auto:<key>:<발송일>`, 사용자 기념일은 `user:<id>:<발송일>`. */
  identifier: string;
  /** 발송 날짜(로컬). 시각은 NOTIFY_HOUR:00. */
  date: Ymd;
  hour: number;
  minute: number;
  body: string;
}

export interface NotificationPlanInput {
  startedOn: Ymd;
  userAnniversaries: readonly PlanUserAnniversary[];
  today: Ymd;
  /** 지금 시각(자정부터 분). 오늘 09:00이 지났으면 오늘 알림은 건너뛴다. */
  minutesNow: number;
  anniversaryEnabled: boolean;
  hideContent: boolean;
}

const OFFSET_DAYS: Record<Exclude<NotifyOffset, 'none'>, number> = { d0: 0, d1: 1, d7: 7 };

function userBody(title: string, offset: number): string {
  if (offset === 0) return `오늘은 ${title}이에요`;
  if (offset === 1) return `내일은 ${title}이에요`;
  return `${offset}일 뒤는 ${title}이에요`;
}

export function planNotifications(input: NotificationPlanInput): PlannedNotification[] {
  if (!input.anniversaryEnabled) return [];
  const { today, hideContent } = input;
  const last = addDays(today, WINDOW_DAYS);
  const items: PlannedNotification[] = [];

  const push = (identifier: string, date: Ymd, body: string) => {
    if (compareYmd(date, today) < 0 || compareYmd(date, last) > 0) return;
    if (date === today && input.minutesNow >= NOTIFY_HOUR * 60) return;
    items.push({
      identifier,
      date,
      hour: NOTIFY_HOUR,
      minute: 0,
      body: hideContent ? HIDDEN_BODY : body,
    });
  };

  // 자동 기념일: 당일 알림. 60일 안에는 많아야 몇 개뿐이라 넉넉히 가져와 거른다.
  for (const a of upcomingAutoAnniversaries(input.startedOn, today, 5)) {
    push(`auto:${a.key}:${a.date}`, a.date, `오늘은 ${autoAnniversaryLabel(a.key)} 기념일이에요`);
  }

  // 사용자 기념일: 발생일에서 notify만큼 앞당긴 날. 앞당긴 날이 오늘 이후가 되는 발생일을 모두 찾는다.
  for (const a of input.userAnniversaries) {
    if (a.notify === 'none') continue;
    const offset = OFFSET_DAYS[a.notify];
    // 발생일이 오늘 이후여야 발송일도 오늘 이후일 수 있다. 오늘 이전 발생일은 건너뛴다.
    let from = today;
    for (;;) {
      const occ = nextUserOccurrence(a, from);
      if (occ === null) break;
      const fire = addDays(occ, -offset);
      if (compareYmd(fire, last) > 0) break;
      push(`user:${a.id}:${fire}`, fire, userBody(a.title, offset));
      if (a.repeat === 'none') break;
      from = addDays(occ, 1);
    }
  }

  items.sort((x, y) => compareYmd(x.date, y.date) || (x.identifier < y.identifier ? -1 : 1));
  return items.slice(0, MAX_NOTIFICATIONS);
}
