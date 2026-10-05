import type { KvDb } from '@/db/kv';
import {
  getCard,
  getPhoto,
  insertManualCard,
  insertPhotos,
  listCardPhotos,
  listCardStops,
  maxPhotoSort,
  movePhotos,
  refreshCardSpan,
  resortPhotos,
  setCardCover,
  softDeleteCard,
  softDeletePhotos,
  updateCardDate,
  updateCardSummary,
  type CardRow,
  type NewPhoto,
} from '@/db/repos/cards';
import { transitionStates } from '@/db/repos/mediaScan';
import { withTransaction } from '@/db/tx';
import { isValidYmd, parseYmd } from '@/domain/dates';
import { templateSummary } from '@/domain/template';
import { archiveUri, removeArchived, type ArchivedPhoto } from '@/features/photos/archive';
import type { PhotoFilesApi } from '@/platform/photoFiles';
import type { PickedPhoto } from '@/platform/photoPicker';

export interface EditDeps {
  db: KvDb;
  files: PhotoFilesApi;
  spaceId: string;
  userId: string;
  now(): number;
  /** 그 시각의 기기 UTC 오프셋(분, 동쪽이 +). */
  offsetMin(at: number): number;
  newId(): string;
}

export type EditResult<T = object> = ({ ok: true } & T) | { ok: false; reason: string };

const fail = (reason: string) => ({ ok: false as const, reason });

/**
 * 템플릿 문장 요약만 현재 사진 수·장소로 다시 만든다. AI·직접 쓴 요약은 사용자가 정한 글이라 건드리지 않는다.
 * 사진을 더하거나 빼거나 옮긴 카드마다 부른다.
 */
async function refreshTemplateSummary(db: KvDb, card: CardRow, now: number): Promise<void> {
  if (card.summarySource !== 'template') return;
  const stops = await listCardStops(db, card.id);
  const summary = templateSummary({
    placeNames: stops.map((s) => s.name),
    region: stops.find((s) => s.region)?.region ?? null,
    photoCount: (await listCardPhotos(db, card.id)).length,
  });
  if (summary !== card.summary) await updateCardSummary(db, card.id, summary, now);
}

/** 표지로 지정한 사진이 카드에서 사라졌으면 지정을 푼다(그러면 첫 사진이 표지). */
async function dropStaleCover(db: KvDb, cardId: string, now: number): Promise<void> {
  const card = await getCard(db, cardId);
  if (!card?.coverPhotoId) return;
  if (!(await listCardPhotos(db, cardId)).some((p) => p.id === card.coverPhotoId)) {
    await setCardCover(db, cardId, null, now);
  }
}

/** 사진이 바뀐 카드를 다시 맞춘다: 순서, 표지, 시간대, 템플릿 요약. */
async function settleCard(db: KvDb, cardId: string, now: number): Promise<void> {
  await resortPhotos(db, cardId, now);
  await dropStaleCover(db, cardId, now);
  await refreshCardSpan(db, cardId, now);
  const card = await getCard(db, cardId);
  if (card) await refreshTemplateSummary(db, card, now);
}

/** 카드 날짜 정오(기기 시간대). 촬영 시각을 알 수 없는 사진의 자리 표시값. */
function noonOf(date: string, offsetMin: (at: number) => number): number {
  const p = parseYmd(date);
  if (!p) return 0;
  const guess = Date.UTC(p.year, p.month - 1, p.day, 12);
  return guess - offsetMin(guess) * 60_000;
}

/** 사진 없이 새 카드를 만든다. 날짜는 `YYYY-MM-DD`. */
export async function createEmptyCard(
  deps: EditDeps,
  date: string,
): Promise<EditResult<{ cardId: string }>> {
  if (!isValidYmd(date)) return fail('bad_date');
  const cardId = deps.newId();
  await insertManualCard(deps.db, {
    id: cardId,
    date,
    spaceId: deps.spaceId,
    userId: deps.userId,
    now: deps.now(),
  });
  return { ok: true, cardId };
}

/** 카드 날짜를 바꾼다. 사진 파일 경로는 처음 쓸 때 정한 대로 둔다(A6). */
export async function changeCardDate(
  deps: EditDeps,
  cardId: string,
  date: string,
): Promise<EditResult> {
  if (!isValidYmd(date)) return fail('bad_date');
  if (!(await getCard(deps.db, cardId))) return fail('not_found');
  await updateCardDate(deps.db, cardId, date, deps.now());
  return { ok: true };
}

/**
 * 갤러리에서 고른 사진을 카드 끝에 더한다. 보관본·썸네일을 만들 수 없는 사진은 건너뛰고 `failed`로 센다.
 * 촬영 시각을 모르면 카드의 마지막 사진 시각(없으면 날짜 정오)으로 둔다.
 */
export async function addPhotos(
  deps: EditDeps,
  cardId: string,
  picked: readonly PickedPhoto[],
): Promise<EditResult<{ added: number; failed: number }>> {
  const { db } = deps;
  const card = await getCard(db, cardId);
  if (!card) return fail('not_found');
  if (picked.length === 0) return { ok: true, added: 0, failed: 0 };

  const items: { pick: PickedPhoto; id: string; archived: ArchivedPhoto }[] = [];
  for (const pick of picked) {
    const id = deps.newId();
    const archived = await archiveUri(deps.files, pick.uri, id);
    if (archived) items.push({ pick, id, archived });
  }
  const failed = picked.length - items.length;
  if (items.length === 0) return fail('no_photos');

  const now = deps.now();
  const fallbackAt = card.endAt ?? noonOf(card.date, deps.offsetMin);
  try {
    await withTransaction(db, async () => {
      const base = (await maxPhotoSort(db, cardId)) + 1;
      const rows = items.map(({ pick, id, archived }, i): NewPhoto => {
        const takenAt = pick.takenAt ?? fallbackAt;
        return {
          id,
          takenAt,
          tzOffsetMin: deps.offsetMin(takenAt),
          width: archived.width,
          height: archived.height,
          placeStopId: null,
          sort: base + i,
          localAssetId: pick.assetId ?? '',
          localPath: archived.localPath,
          lat: pick.lat,
          lng: pick.lng,
        };
      });
      await insertPhotos(db, cardId, rows, { spaceId: deps.spaceId, userId: deps.userId, now });
      await settleCard(db, cardId, now);
    });
  } catch (e) {
    await removeArchived(
      deps.files,
      items.map((i) => i.archived),
    );
    throw e;
  }
  return { ok: true, added: items.length, failed };
}

/**
 * 카드에서 사진을 뺀다(소프트 삭제). 갤러리 사진은 `skipped`로 남겨 같은 사진이 다시 후보로 뜨지 않게 한다.
 * 이미 만든 보관본·썸네일 파일은 동기화가 삭제를 전하기 전까지 둔다.
 */
export async function removePhotos(
  deps: EditDeps,
  cardId: string,
  photoIds: readonly string[],
): Promise<EditResult<{ removed: number }>> {
  const { db } = deps;
  if (!(await getCard(db, cardId))) return fail('not_found');
  const own = (await listCardPhotos(db, cardId)).filter((p) => photoIds.includes(p.id));
  if (own.length === 0) return { ok: true, removed: 0 };

  const now = deps.now();
  await withTransaction(db, async () => {
    await softDeletePhotos(
      db,
      own.map((p) => p.id),
      now,
    );
    const assetIds = own.map((p) => p.localAssetId).filter((a): a is string => !!a);
    await transitionStates(db, assetIds, ['in_card'], 'skipped');
    await settleCard(db, cardId, now);
  });
  return { ok: true, removed: own.length };
}

/**
 * 사진을 다른 카드로 옮긴다. 옮긴 사진은 그 카드 사진 순서 끝에 붙고 원래 카드는 순서를 다시 매긴다.
 * 장소 스톱은 카드에 속하므로 옮긴 사진은 스톱 없이 간다(스톱 편집은 T31).
 */
export async function movePhotosToCard(
  deps: EditDeps,
  fromCardId: string,
  photoIds: readonly string[],
  toCardId: string,
): Promise<EditResult<{ moved: number }>> {
  const { db } = deps;
  if (fromCardId === toCardId) return fail('same_card');
  if (!(await getCard(db, fromCardId)) || !(await getCard(db, toCardId))) return fail('not_found');
  // 카드 안 순서대로 옮겨 상대 순서를 지킨다.
  const own = (await listCardPhotos(db, fromCardId)).filter((p) => photoIds.includes(p.id));
  if (own.length === 0) return { ok: true, moved: 0 };

  const now = deps.now();
  await withTransaction(db, async () => {
    await movePhotos(
      db,
      own.map((p) => p.id),
      toCardId,
      now,
    );
    await settleCard(db, fromCardId, now);
    await settleCard(db, toCardId, now);
  });
  return { ok: true, moved: own.length };
}

/** 표지 사진을 정한다. 그 카드 안 사진이어야 한다. */
export async function setCover(
  deps: EditDeps,
  cardId: string,
  photoId: string,
): Promise<EditResult> {
  const photo = await getPhoto(deps.db, photoId);
  if (!photo || photo.cardId !== cardId) return fail('not_in_card');
  if (!(await getCard(deps.db, cardId))) return fail('not_found');
  await setCardCover(deps.db, cardId, photoId, deps.now());
  return { ok: true };
}

/** 카드를 지운다(소프트 삭제). 사진은 갤러리에 있던 그대로이고, `skipped`로 남겨 다시 후보로 뜨지 않게 한다. */
export async function deleteCard(deps: EditDeps, cardId: string): Promise<EditResult> {
  const { db } = deps;
  if (!(await getCard(db, cardId))) return fail('not_found');
  const now = deps.now();
  const assetIds = (await listCardPhotos(db, cardId))
    .map((p) => p.localAssetId)
    .filter((a): a is string => !!a);
  await withTransaction(db, async () => {
    await softDeleteCard(db, cardId, now);
    await transitionStates(db, assetIds, ['in_card'], 'skipped');
  });
  return { ok: true };
}
