import {
  HIDDEN_BODY,
  MAX_NOTIFICATIONS,
  planNotifications,
  type NotificationPlanInput,
  type PlanUserAnniversary,
} from './notificationPlan';

const base: NotificationPlanInput = {
  startedOn: '2026-01-01',
  userAnniversaries: [],
  today: '2026-10-05',
  minutesNow: 8 * 60,
  anniversaryEnabled: true,
  hideContent: false,
};

const user = (over: Partial<PlanUserAnniversary>): PlanUserAnniversary => ({
  id: 'u1',
  title: '첫 여행',
  date: '2026-10-20',
  repeat: 'none',
  notify: 'd0',
  ...over,
});

describe('planNotifications', () => {
  it('자동 기념일은 당일 09:00', () => {
    // 2026-01-01 시작 → d300 = 2026-10-27
    const plan = planNotifications(base);
    expect(plan).toEqual([
      {
        identifier: 'auto:d300:2026-10-27',
        date: '2026-10-27',
        hour: 9,
        minute: 0,
        body: '오늘은 300일 기념일이에요',
      },
    ]);
  });

  it('60일 밖은 제외하고 60일째는 포함', () => {
    const edge = planNotifications({ ...base, startedOn: '2026-01-01', today: '2026-08-28' });
    // d300(10-27)은 오늘+60 = 10-27 → 포함
    expect(edge.map((n) => n.date)).toEqual(['2026-10-27']);
    const out = planNotifications({ ...base, today: '2026-08-27' });
    expect(out).toEqual([]);
  });

  it('알림을 끄면 아무것도 걸지 않는다', () => {
    expect(
      planNotifications({ ...base, anniversaryEnabled: false, userAnniversaries: [user({})] }),
    ).toEqual([]);
  });

  it('숨김이면 모든 문구가 새 알림이 있어요', () => {
    const plan = planNotifications({ ...base, hideContent: true, userAnniversaries: [user({})] });
    expect(plan).toHaveLength(2);
    expect(plan.every((n) => n.body === HIDDEN_BODY)).toBe(true);
    expect(HIDDEN_BODY).toBe('새 알림이 있어요');
  });

  it('사용자 기념일 notify 오프셋', () => {
    const d = (notify: PlanUserAnniversary['notify']) =>
      planNotifications({ ...base, userAnniversaries: [user({ notify })] }).filter((n) =>
        n.identifier.startsWith('user:'),
      );
    expect(d('none')).toEqual([]);
    expect(d('d0')[0]).toMatchObject({ date: '2026-10-20', body: '오늘은 첫 여행이에요' });
    expect(d('d1')[0]).toMatchObject({ date: '2026-10-19', body: '내일은 첫 여행이에요' });
    expect(d('d7')[0]).toMatchObject({ date: '2026-10-13', body: '7일 뒤는 첫 여행이에요' });
  });

  it('지난 기념일(반복 없음)은 걸지 않는다', () => {
    const plan = planNotifications({
      ...base,
      userAnniversaries: [user({ date: '2026-09-01' })],
    });
    expect(plan.some((n) => n.identifier.startsWith('user:'))).toBe(false);
  });

  it('오늘 09:00이 지났으면 오늘 알림은 건너뛴다', () => {
    const a = user({ date: '2026-10-05' });
    const before = planNotifications({ ...base, minutesNow: 8 * 60 + 59, userAnniversaries: [a] });
    const after = planNotifications({ ...base, minutesNow: 9 * 60, userAnniversaries: [a] });
    expect(before.some((n) => n.date === '2026-10-05')).toBe(true);
    expect(after.some((n) => n.date === '2026-10-05')).toBe(false);
  });

  it('1주 전 알림이 이미 지났으면 걸지 않는다', () => {
    const plan = planNotifications({
      ...base,
      userAnniversaries: [user({ date: '2026-10-08', notify: 'd7' })],
    });
    expect(plan.some((n) => n.identifier.startsWith('user:'))).toBe(false);
  });

  it('매년 반복: 해가 바뀌는 구간, 다음 해 발생일의 1일 전 알림', () => {
    const plan = planNotifications({
      ...base,
      startedOn: '2020-06-01',
      today: '2026-12-20',
      userAnniversaries: [user({ date: '2024-01-02', repeat: 'yearly', notify: 'd1' })],
    });
    expect(plan.find((n) => n.identifier.startsWith('user:'))).toMatchObject({
      date: '2027-01-01',
    });
  });

  it('매년 반복 2/29는 평년 2/28', () => {
    const plan = planNotifications({
      ...base,
      startedOn: '2020-06-01',
      today: '2027-02-01',
      userAnniversaries: [user({ date: '2024-02-29', repeat: 'yearly', notify: 'd0' })],
    });
    expect(plan.find((n) => n.identifier.startsWith('user:'))?.date).toBe('2027-02-28');
  });

  it('50개 상한: 가까운 것부터 남긴다', () => {
    const many = Array.from({ length: 60 }, (_, i) =>
      user({ id: `u${String(i).padStart(2, '0')}`, date: i < 55 ? '2026-10-10' : '2026-11-01' }),
    );
    const plan = planNotifications({ ...base, userAnniversaries: many });
    expect(plan).toHaveLength(MAX_NOTIFICATIONS);
    expect(plan.every((n) => n.date === '2026-10-10')).toBe(true);
  });

  it('날짜순 정렬, 같은 입력이면 같은 결과', () => {
    const input = {
      ...base,
      userAnniversaries: [
        user({ id: 'b', date: '2026-10-30' }),
        user({ id: 'a', date: '2026-10-10' }),
      ],
    };
    const plan = planNotifications(input);
    expect(plan.map((n) => n.date)).toEqual(['2026-10-10', '2026-10-27', '2026-10-30']);
    expect(planNotifications(input)).toEqual(plan);
  });
});
