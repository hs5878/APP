// 사귄 날 입력 보조. 숫자만 받아 YYYY-MM-DD로 맞추고, 검증한다(D-017: Date 객체 없이 문자열로만).
import { compareYmd, isValidYmd, type Ymd } from './dates';

/** 입력에서 숫자만 남겨 `YYYY-MM-DD` 모양으로 끊어 준다(최대 8자리). */
export function formatYmdInput(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 8);
  if (d.length <= 4) return d;
  if (d.length <= 6) return `${d.slice(0, 4)}-${d.slice(4)}`;
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}`;
}

export type StartedOnError = 'format' | 'future';

/** 올바른 날짜이고 오늘 이전(오늘 포함)이면 null, 아니면 오류 종류. */
export function validateStartedOn(input: string, today: Ymd): StartedOnError | null {
  if (!isValidYmd(input)) return 'format';
  if (compareYmd(input, today) > 0) return 'future';
  return null;
}

export const STARTED_ON_ERROR_MESSAGE: Record<StartedOnError, string> = {
  format: '날짜를 YYYY-MM-DD 형식으로 입력해 주세요.',
  future: '오늘 이후 날짜는 사귄 날로 쓸 수 없어요.',
};
