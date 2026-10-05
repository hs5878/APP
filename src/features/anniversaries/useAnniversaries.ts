import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { getDb } from '@/db/client';
import {
  createAnniversary,
  deleteAnniversary,
  listAnniversaries,
  updateAnniversary,
  type AnniversaryInput,
  type AnniversaryRow,
} from '@/db/repos/anniversaries';
import { uuidv7 } from '@/domain/id';
import { getDevUser } from '@/features/devUser';
import { rescheduleNotifications } from '@/features/notifications/reschedule';
import { useSpace } from '@/features/space/SpaceProvider';

/** 화면이 포커스를 얻을 때마다 다시 읽는다. 편집 화면에서 돌아오면 목록·홈이 갱신된다. */
export function useAnniversaries() {
  const { space } = useSpace();
  const spaceId = space?.id ?? null;
  const [rows, setRows] = useState<AnniversaryRow[]>([]);

  const reload = useCallback(async () => {
    if (!spaceId) return;
    setRows(await listAnniversaries(await getDb(), spaceId));
  }, [spaceId]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  return { rows, reload };
}

/** 쓰기. 호출한 화면이 닫히며 포커스가 돌아올 때 목록이 다시 읽힌다. */
export function useAnniversaryActions() {
  const { space } = useSpace();
  return {
    async add(input: AnniversaryInput) {
      if (!space) return;
      const { userId } = getDevUser(); // T20에서 실제 사용자로 교체
      await createAnniversary(await getDb(), {
        ...input,
        id: uuidv7(),
        spaceId: space.id,
        userId,
        now: Date.now(),
      });
      await rescheduleNotifications();
    },
    async update(id: string, input: AnniversaryInput) {
      await updateAnniversary(await getDb(), id, input, Date.now());
      await rescheduleNotifications();
    },
    async remove(id: string) {
      await deleteAnniversary(await getDb(), id, Date.now());
      await rescheduleNotifications();
    },
  };
}
