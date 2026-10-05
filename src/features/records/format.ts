const pad = (n: number) => String(n).padStart(2, '0');

/** 기기 시간대 기준 "HH:MM". */
export function hhmm(ms: number): string {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export type StopLike = {
  id: string;
  seq: number;
  arrivedAt: number;
  leftAt: number;
  name: string | null;
  region: string | null;
};

/** 장소 흐름 한 줄의 이름. 이름이 없으면 동 이름, 그것도 없으면 "장소 N". */
export function stopLabel(s: Pick<StopLike, 'name' | 'region' | 'seq'>): string {
  return s.name?.trim() || s.region?.trim() || `장소 ${s.seq}`;
}

export function stopTimeRange(s: Pick<StopLike, 'arrivedAt' | 'leftAt'>): string {
  const a = hhmm(s.arrivedAt);
  const b = hhmm(s.leftAt);
  return a === b ? a : `${a} – ${b}`;
}
