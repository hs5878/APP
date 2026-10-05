import { formatYmd, type Ymd } from '@/domain/dates';

/** 기기의 달력상 오늘. 시간대 변환 없이 로컬 연·월·일을 그대로 쓴다(D-017). */
export function todayYmd(now: Date = new Date()): Ymd {
  return formatYmd(now.getFullYear(), now.getMonth() + 1, now.getDate());
}
