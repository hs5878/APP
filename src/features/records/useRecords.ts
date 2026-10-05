import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { getDb } from '@/db/client';
import {
  getCard,
  listCardPhotos,
  listCardStops,
  listTimelineCards,
  type CardRow,
  type PhotoRow,
  type PlaceStopRow,
  type TimelineRow,
} from '@/db/repos/cards';
import { groupByMonth, type MonthSection } from '@/domain/timeline';
import { useSpace } from '@/features/space/SpaceProvider';

/** 포커스를 얻을 때마다 카드를 다시 읽어 월별로 묶는다. null이면 읽는 중. */
export function useTimeline(): MonthSection<TimelineRow>[] | null {
  const { space } = useSpace();
  const spaceId = space?.id ?? null;
  const [rows, setRows] = useState<TimelineRow[] | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!spaceId) return;
      let cancelled = false;
      void (async () => {
        const list = await listTimelineCards(await getDb(), spaceId);
        if (!cancelled) setRows(list);
      })();
      return () => {
        cancelled = true;
      };
    }, [spaceId]),
  );

  return useMemo(() => (rows ? groupByMonth(rows) : null), [rows]);
}

export type CardDetail = { card: CardRow; stops: PlaceStopRow[]; photos: PhotoRow[] };

/** 카드 상세. `undefined`는 읽는 중, `null`은 없는(삭제된) 카드. */
export function useCardDetail(cardId: string): CardDetail | null | undefined {
  const [detail, setDetail] = useState<CardDetail | null | undefined>(undefined);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void (async () => {
        const db = await getDb();
        const card = await getCard(db, cardId);
        const next = card
          ? {
              card,
              stops: await listCardStops(db, cardId),
              photos: await listCardPhotos(db, cardId),
            }
          : null;
        if (!cancelled) setDetail(next);
      })();
      return () => {
        cancelled = true;
      };
    }, [cardId]),
  );

  return detail;
}
