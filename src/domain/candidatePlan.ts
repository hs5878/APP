// 후보 목록 규칙(SPEC F2 "후보 → 확정"): 묶음을 후보로 바꾸고, 확정 카드와 겹치면 대상 카드를 붙인다.
import type { Cluster } from './clustering';
import type { Ymd } from './dates';

/** 카드 시간대 앞뒤 여유. 이 안에서 겹치면 같은 데이트로 본다. */
export const CARD_OVERLAP_MARGIN_MS = 60 * 60 * 1000;
export const ARCHIVE_MAX_EDGE = 2048;
export const ARCHIVE_JPEG_QUALITY = 0.85;
export const THUMB_MAX_EDGE = 400;

export type CardWindow = {
  id: string;
  date: Ymd;
  startAt: number | null;
  endAt: number | null;
  createdAt: number;
};

export type CandidateDraft = {
  date: Ymd;
  startAt: number;
  endAt: number;
  assetIds: string[];
  targetCardId: string | null;
};

/**
 * 같은 날짜이고 시간대가 겹치는(앞뒤 1시간 여유) 카드. 여럿이면 먼저 만든 카드.
 * 시각이 없는 카드(직접 만든 카드)는 겹침을 알 수 없으므로 제외한다.
 */
export function findOverlappingCard(
  range: { day: Ymd; startAt: number; endAt: number },
  cards: readonly CardWindow[],
): string | null {
  let best: CardWindow | null = null;
  for (const c of cards) {
    if (c.date !== range.day || c.startAt === null || c.endAt === null) continue;
    const overlaps =
      range.startAt <= c.endAt + CARD_OVERLAP_MARGIN_MS &&
      range.endAt >= c.startAt - CARD_OVERLAP_MARGIN_MS;
    if (!overlaps) continue;
    if (
      !best ||
      c.createdAt < best.createdAt ||
      (c.createdAt === best.createdAt && c.id < best.id)
    ) {
      best = c;
    }
  }
  return best?.id ?? null;
}

export function planCandidates(
  clusters: readonly Cluster[],
  cards: readonly CardWindow[],
): CandidateDraft[] {
  return clusters.map((c) => ({
    date: c.day,
    startAt: c.startAt,
    endAt: c.endAt,
    assetIds: c.photos.map((p) => p.id),
    targetCardId: findOverlappingCard(c, cards),
  }));
}

/** 긴 변이 `maxEdge`를 넘으면 비율을 지켜 줄인다. 키우지는 않는다. */
export function fitWithin(
  width: number,
  height: number,
  maxEdge: number,
): { width: number; height: number } {
  const long = Math.max(width, height);
  if (long <= maxEdge) return { width, height };
  const scale = maxEdge / long;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** 서버로 가는 장소 좌표는 소수 3자리(약 100m)로 반올림한다. */
export function roundCoord(v: number): number {
  return Math.round(v * 1000) / 1000;
}
