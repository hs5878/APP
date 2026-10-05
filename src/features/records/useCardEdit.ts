import { useCallback, useEffect, useState } from 'react';
import { getDb } from '@/db/client';
import {
  getCard,
  listCardPhotos,
  listTimelineCards,
  type CardRow,
  type PhotoRow,
  type TimelineRow,
} from '@/db/repos/cards';
import { uuidv7 } from '@/domain/id';
import { getDevUser } from '@/features/devUser';
import { useSpace } from '@/features/space/SpaceProvider';
import { photoFilesApi } from '@/platform/photoFiles';
import { photoPickerApi } from '@/platform/photoPicker';
import {
  addPhotos,
  changeCardDate,
  createEmptyCard,
  deleteCard,
  movePhotosToCard,
  removePhotos,
  setCover,
  type EditDeps,
  type EditResult,
} from './edit';

const offsetMin = (at: number) => -new Date(at).getTimezoneOffset();
const PICK_LIMIT = 30;

/** 앱에서 쓰는 편집 의존성. 로그인(T20) 전에는 개발용 임시 사용자로 만든다. */
export async function editDeps(spaceId: string): Promise<EditDeps> {
  const { userId } = getDevUser(); // T20에서 실제 사용자로 교체
  return {
    db: await getDb(),
    files: photoFilesApi,
    spaceId,
    userId,
    now: () => Date.now(),
    offsetMin,
    newId: () => uuidv7(),
  };
}

/** 사진 없는 새 카드를 만들고 id를 돌려준다. 실패하면 null. */
export function useCreateEmptyCard() {
  const { space } = useSpace();
  return useCallback(
    async (date: string): Promise<string | null> => {
      if (!space) return null;
      const r = await createEmptyCard(await editDeps(space.id), date);
      return r.ok ? r.cardId : null;
    },
    [space],
  );
}

export type EditState = {
  card: CardRow;
  photos: PhotoRow[];
  /** 사진을 옮길 수 있는 다른 카드. */
  others: TimelineRow[];
};

/** 편집 화면용. `undefined`는 읽는 중, `null`은 없는(삭제된) 카드. 편집마다 다시 읽는다. */
export function useCardEdit(cardId: string) {
  const { space } = useSpace();
  const spaceId = space?.id ?? null;
  const [state, setState] = useState<EditState | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (): Promise<EditState | null | undefined> => {
    if (!spaceId) return undefined;
    const db = await getDb();
    const card = await getCard(db, cardId);
    if (!card) return null;
    const [photos, all] = await Promise.all([
      listCardPhotos(db, cardId),
      listTimelineCards(db, spaceId),
    ]);
    return { card, photos, others: all.filter((c) => c.id !== cardId) };
  }, [cardId, spaceId]);

  const reload = useCallback(async () => {
    setState(await load());
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    void load().then((next) => {
      if (!cancelled) setState(next);
    });
    return () => {
      cancelled = true;
    };
  }, [load]);

  /** 편집 하나를 한 번에 하나씩 돌리고 끝나면 다시 읽는다. */
  const run = useCallback(
    async <T extends EditResult>(task: (deps: EditDeps) => Promise<T>): Promise<T | null> => {
      if (!spaceId || busy) return null;
      setBusy(true);
      try {
        const result = await task(await editDeps(spaceId));
        await reload();
        return result;
      } finally {
        setBusy(false);
      }
    },
    [spaceId, busy, reload],
  );

  return {
    state,
    busy,
    setDate: (date: string) => run((d) => changeCardDate(d, cardId, date)),
    setCover: (photoId: string) => run((d) => setCover(d, cardId, photoId)),
    remove: (photoIds: readonly string[]) => run((d) => removePhotos(d, cardId, photoIds)),
    move: (photoIds: readonly string[], toCardId: string) =>
      run((d) => movePhotosToCard(d, cardId, photoIds, toCardId)),
    removeCard: () => run((d) => deleteCard(d, cardId)),
    /** 갤러리에서 사진을 골라 더한다. 고르지 않고 닫으면 null. */
    addFromGallery: async () => {
      const picked = await photoPickerApi.pick(PICK_LIMIT);
      if (picked.length === 0) return null;
      return run((d) => addPhotos(d, cardId, picked));
    },
  };
}
