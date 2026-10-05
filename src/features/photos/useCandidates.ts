import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { getDb } from '@/db/client';
import {
  candidateAssetIds,
  countPendingCandidates,
  listPendingCandidates,
  type CandidateRow,
} from '@/db/repos/cards';
import { useSpace } from '@/features/space/SpaceProvider';
import { refreshCandidates } from './candidates';
import { confirmCandidate, skipCandidate, type ConfirmMode, type ConfirmResult } from './confirm';
import { photoFilesApi } from '@/platform/photoFiles';
import { candidateDeps, confirmDeps } from './runtime';

export type CandidateItem = CandidateRow & { assets: string[] };

/** 포커스를 얻을 때마다 후보를 다시 계산해 읽는다. 오늘 묶음이 04:00 뒤 후보가 되는 것도 여기서 잡힌다. */
export function useCandidates() {
  const { space } = useSpace();
  const spaceId = space?.id ?? null;
  const [items, setItems] = useState<CandidateItem[] | null>(null);

  const reload = useCallback(async () => {
    if (!spaceId) return;
    await refreshCandidates(await candidateDeps(spaceId));
    const rows = await listPendingCandidates(await getDb());
    setItems(rows.map((r) => ({ ...r, assets: candidateAssetIds(r) })));
  }, [spaceId]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  const confirm = useCallback(
    async (id: string, mode: ConfirmMode): Promise<ConfirmResult> => {
      if (!spaceId) return { ok: false, reason: 'not_found' };
      const result = await confirmCandidate(await confirmDeps(spaceId), id, mode);
      await reload();
      return result;
    },
    [spaceId, reload],
  );

  const skip = useCallback(
    async (id: string) => {
      await skipCandidate(await getDb(), id);
      await reload();
    },
    [reload],
  );

  return { items, reload, confirm, skip };
}

/** 홈 배지용. 대기 후보 수만 읽는다(계산은 후보 화면과 스캔이 한다). */
export function usePendingCandidateCount() {
  const { space } = useSpace();
  const spaceId = space?.id ?? null;
  const [count, setCount] = useState(0);

  useFocusEffect(
    useCallback(() => {
      if (!spaceId) return;
      void (async () => {
        const deps = await candidateDeps(spaceId);
        setCount(await refreshCandidates(deps).then(() => countPendingCandidates(deps.db)));
      })();
    }, [spaceId]),
  );

  return count;
}

/** 후보 카드에 보여 줄 갤러리 사진 미리보기(앞 3장). 읽을 수 없는 사진은 뺀다. */
export function useAssetPreviewUris(assetIds: readonly string[]): string[] {
  const [uris, setUris] = useState<string[]>([]);
  const key = assetIds.slice(0, 3).join(',');
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const found = await Promise.all(
        key.split(',').map((id) => photoFilesApi.resolveAssetUri(id)),
      );
      if (!cancelled) setUris(found.filter((u): u is string => u !== null));
    })();
    return () => {
      cancelled = true;
    };
  }, [key]);
  return uris;
}
