// 데이트 묶음 규칙(D-007, SPEC F2). 촬영 시각과 위치 메타데이터만 쓴다.
import { fromEpochDay, type Ymd } from './dates';
import { distanceMeters, isValidLatLng } from './geo';

export const DAY_BOUNDARY_HOUR = 4;
export const MAX_GAP_MS = 3 * 60 * 60 * 1000;
export const MIN_CLUSTER_SIZE = 3;
export const STOP_RADIUS_M = 150;

const MIN_MS = 60_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

export type PhotoMeta = {
  id: string;
  takenAt: number; // UTC ms
  tzOffsetMin?: number | null; // 없으면 기본 오프셋을 쓴다
  lat?: number | null;
  lng?: number | null;
};

export type PlaceStop = {
  photoIds: string[];
  lat: number; // 첫 위치 사진 좌표
  lng: number;
  startAt: number;
  endAt: number;
};

export type Cluster<P extends PhotoMeta = PhotoMeta> = {
  day: Ymd; // 04:00 경계 기준 날짜
  startAt: number;
  endAt: number;
  photos: P[]; // 촬영 시각 오름차순
};

// 04:00 경계 기준 날짜. 현지 시각에서 4시간을 뺀 날짜다(새벽 2시 → 전날).
export function dayKeyOf(takenAt: number, tzOffsetMin: number): Ymd {
  const local = takenAt + tzOffsetMin * MIN_MS - DAY_BOUNDARY_HOUR * HOUR_MS;
  return fromEpochDay(Math.floor(local / DAY_MS));
}

// 1단계: 시간만으로 묶는다. 같은 날(04:00 경계) 안에서 앞 사진과 3시간 이하면 같은 묶음.
// 3장 미만 묶음은 뺀다. 입력 순서는 상관없다.
export function clusterByTime<P extends PhotoMeta>(
  photos: readonly P[],
  defaultOffsetMin: number,
): Cluster<P>[] {
  const sorted = photos
    .slice()
    .sort((a, b) => a.takenAt - b.takenAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const out: Cluster<P>[] = [];
  let cur: Cluster<P> | null = null;
  for (const p of sorted) {
    const day = dayKeyOf(p.takenAt, p.tzOffsetMin ?? defaultOffsetMin);
    if (cur && cur.day === day && p.takenAt - cur.endAt <= MAX_GAP_MS) {
      cur.photos.push(p);
      cur.endAt = p.takenAt;
    } else {
      if (cur && cur.photos.length >= MIN_CLUSTER_SIZE) out.push(cur);
      cur = { day, startAt: p.takenAt, endAt: p.takenAt, photos: [p] };
    }
  }
  if (cur && cur.photos.length >= MIN_CLUSTER_SIZE) out.push(cur);
  return out;
}

export type CandidateSplit<P extends PhotoMeta = PhotoMeta> = {
  candidates: Cluster<P>[];
  deferred: Cluster<P>[]; // 오늘(04:00 기준) 묶음. 다음 날 04:00 이후 후보가 된다.
};

export function splitDeferred<P extends PhotoMeta>(
  clusters: readonly Cluster<P>[],
  now: number,
  nowOffsetMin: number,
): CandidateSplit<P> {
  const today = dayKeyOf(now, nowOffsetMin);
  const candidates: Cluster<P>[] = [];
  const deferred: Cluster<P>[] = [];
  for (const c of clusters) (c.day >= today ? deferred : candidates).push(c);
  return { candidates, deferred };
}

// 2단계: 묶음 안에서 장소 스톱을 만든다. 스톱의 첫 위치 사진에서 150m 이내인 연속 사진이 같은 스톱.
// 위치 없는 사진은 흐름을 끊지 않고 직전 스톱에 붙는다(맨 앞이면 첫 스톱). 위치가 하나도 없으면 스톱 없음.
export function buildStops(photos: readonly PhotoMeta[]): PlaceStop[] {
  const sorted = photos.slice().sort((a, b) => a.takenAt - b.takenAt);
  const stops: PlaceStop[] = [];
  let leading: PhotoMeta[] = [];
  for (const p of sorted) {
    const last = stops[stops.length - 1];
    if (!isValidLatLng(p.lat, p.lng)) {
      if (last) {
        last.photoIds.push(p.id);
        last.endAt = p.takenAt;
      } else {
        leading.push(p);
      }
      continue;
    }
    const here = { lat: p.lat, lng: p.lng as number };
    if (last && distanceMeters(last, here) <= STOP_RADIUS_M) {
      last.photoIds.push(p.id);
      last.endAt = p.takenAt;
    } else {
      const stop: PlaceStop = {
        photoIds: [...leading.map((l) => l.id), p.id],
        lat: here.lat,
        lng: here.lng,
        startAt: leading[0]?.takenAt ?? p.takenAt,
        endAt: p.takenAt,
      };
      leading = [];
      stops.push(stop);
    }
  }
  return stops;
}
