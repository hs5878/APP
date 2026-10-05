import {
  candidateAssetIds,
  countCardPhotos,
  getCandidate,
  getCard,
  insertCard,
  insertPhotos,
  insertStops,
  listCardStops,
  maxPhotoSort,
  resequenceStops,
  setCandidateStatus,
  updateCardAfterAppend,
  type NewPhoto,
  type NewStop,
} from '@/db/repos/cards';
import type { KvDb } from '@/db/kv';
import { getRowsByIds, transitionStates, type MediaScanRow } from '@/db/repos/mediaScan';
import { withTransaction } from '@/db/tx';
import { roundCoord } from '@/domain/candidatePlan';
import { buildStops, type PlaceStop } from '@/domain/clustering';
import { templateSummary } from '@/domain/template';
import type { PhotoFilesApi } from '@/platform/photoFiles';
import { archivePhoto, removeArchived, type ArchivedPhoto } from './archive';

export interface ConfirmDeps {
  db: KvDb;
  files: PhotoFilesApi;
  spaceId: string;
  userId: string;
  now(): number;
  /** 그 시각의 기기 UTC 오프셋(분, 동쪽이 +). EXIF 오프셋이 없는 사진에 쓴다. */
  offsetMin(at: number): number;
  newId(): string;
}

/** `new` = 새 카드, `append` = 겹치는 기존 카드(`target_card_id`)에 추가. */
export type ConfirmMode = 'new' | 'append';

export type ConfirmResult =
  | { ok: true; cardId: string; mode: ConfirmMode; added: number; failed: number }
  | { ok: false; reason: 'not_found' | 'no_photos' };

const CONFIRMABLE = ['seen', 'detailed'] as const;

type Item = { row: MediaScanRow; photoId: string; archived: ArchivedPhoto };

/** 보관본을 만든 사진마다 스톱을 이어 붙인다. 스톱 이름은 비워 둔다(장소 조회는 M5). */
function toStops(items: readonly Item[], newId: () => string) {
  const metas = items.map((i) => ({
    id: i.photoId,
    takenAt: i.row.takenAt,
    lat: i.row.lat,
    lng: i.row.lng,
  }));
  const built: PlaceStop[] = buildStops(metas);
  const stops = built.map((s) => ({ id: newId(), stop: s }));
  const stopOfPhoto = new Map<string, string>();
  for (const { id, stop } of stops) for (const pid of stop.photoIds) stopOfPhoto.set(pid, id);
  return { stops, stopOfPhoto };
}

function newStopRows(stops: { id: string; stop: PlaceStop }[], seqOf: (id: string) => number) {
  return stops.map(({ id, stop }): NewStop => ({
    id,
    seq: seqOf(id),
    arrivedAt: stop.startAt,
    leftAt: stop.endAt,
    latC: roundCoord(stop.lat),
    lngC: roundCoord(stop.lng),
  }));
}

/**
 * [기록하기]. 후보 사진마다 보관본·썸네일을 만들고 카드·사진·스톱을 한 트랜잭션으로 저장한다.
 * 만들 수 없는 사진은 건너뛰고 `failed`로 센다. 하나도 못 만들면 후보를 그대로 둔다.
 * 요약은 템플릿 문장이다(AI·장소 조회는 M5).
 */
export async function confirmCandidate(
  deps: ConfirmDeps,
  candidateId: string,
  mode: ConfirmMode = 'new',
): Promise<ConfirmResult> {
  const { db } = deps;
  const cand = await getCandidate(db, candidateId);
  if (!cand || cand.status !== 'pending') return { ok: false, reason: 'not_found' };

  const rows = (await getRowsByIds(db, candidateAssetIds(cand)))
    .filter((r) => (CONFIRMABLE as readonly string[]).includes(r.state))
    .sort((a, b) => a.takenAt - b.takenAt);
  const target =
    mode === 'append' && cand.targetCardId ? await getCard(db, cand.targetCardId) : null;

  const items: Item[] = [];
  for (const row of rows) {
    const photoId = deps.newId();
    const archived = await archivePhoto(deps.files, row.assetId, photoId);
    if (archived) items.push({ row, photoId, archived });
  }
  const failed = rows.length - items.length;
  if (items.length === 0) return { ok: false, reason: 'no_photos' };

  const now = deps.now();
  const owner = { spaceId: deps.spaceId, userId: deps.userId, now };
  const { stops, stopOfPhoto } = toStops(items, deps.newId);
  const firstAt = items[0]!.row.takenAt;
  const lastAt = items[items.length - 1]!.row.takenAt;

  try {
    const cardId = await withTransaction(db, async () => {
      const base = target ? (await maxPhotoSort(db, target.id)) + 1 : 0;
      const photoRows = items.map((i, idx): NewPhoto => ({
        id: i.photoId,
        takenAt: i.row.takenAt,
        tzOffsetMin: i.row.tzOffsetMin ?? deps.offsetMin(i.row.takenAt),
        width: i.archived.width,
        height: i.archived.height,
        placeStopId: stopOfPhoto.get(i.photoId) ?? null,
        sort: base + idx,
        localAssetId: i.row.assetId,
        localPath: i.archived.localPath,
        lat: i.row.lat,
        lng: i.row.lng,
      }));

      let id: string;
      if (target) {
        id = target.id;
        await appendToCard(deps, target, { stops, photoRows, firstAt, lastAt, owner });
      } else {
        id = deps.newId();
        await insertCard(db, {
          ...owner,
          id,
          date: cand.date,
          startAt: firstAt,
          endAt: lastAt,
          summary: templateSummary({ placeNames: [], photoCount: items.length }),
          coverPhotoId: items[0]!.photoId,
          stops: newStopRows(stops, (sid) => stops.findIndex((s) => s.id === sid) + 1),
          photos: photoRows,
        });
      }
      await transitionStates(
        db,
        items.map((i) => i.row.assetId),
        CONFIRMABLE,
        'in_card',
      );
      await setCandidateStatus(db, cand.id, 'accepted');
      return id;
    });
    return { ok: true, cardId, mode: target ? 'append' : 'new', added: items.length, failed };
  } catch (e) {
    await removeArchived(
      deps.files,
      items.map((i) => i.archived),
    );
    throw e;
  }
}

async function appendToCard(
  deps: ConfirmDeps,
  card: NonNullable<Awaited<ReturnType<typeof getCard>>>,
  add: {
    stops: { id: string; stop: PlaceStop }[];
    photoRows: NewPhoto[];
    firstAt: number;
    lastAt: number;
    owner: { spaceId: string; userId: string; now: number };
  },
): Promise<void> {
  const { db } = deps;
  const existing = await listCardStops(db, card.id);

  // 스톱은 도착 시각 순으로 순서를 다시 매긴다. 새 스톱을 기존 스톱과 합치는 일은 같은 날 카드 합치기(C4)의 몫이다.
  const order = [
    ...existing.map((s) => ({ id: s.id, at: s.arrivedAt })),
    ...add.stops.map((s) => ({ id: s.id, at: s.stop.startAt })),
  ]
    .sort((a, b) => a.at - b.at)
    .map((s) => s.id);
  await insertStops(
    db,
    card.id,
    newStopRows(add.stops, (sid) => order.indexOf(sid) + 1),
    add.owner,
  );
  await resequenceStops(db, card.id, order, add.owner.now);
  await insertPhotos(db, card.id, add.photoRows, add.owner);

  // 템플릿 요약만 새 사진 수로 다시 만든다. AI·직접 쓴 요약은 사용자가 정한 글이라 두고 다시 쓰기를 제안하는 쪽(M5)이 맡는다.
  const summary =
    card.summarySource === 'template'
      ? templateSummary({
          placeNames: existing.map((s) => s.name),
          region: existing.find((s) => s.region)?.region ?? null,
          photoCount: await countCardPhotos(db, card.id),
        })
      : undefined;
  await updateCardAfterAppend(db, card.id, {
    startAt: Math.min(card.startAt ?? add.firstAt, add.firstAt),
    endAt: Math.max(card.endAt ?? add.lastAt, add.lastAt),
    summary,
    coverPhotoId: card.coverPhotoId ? undefined : add.photoRows[0]!.id,
    now: add.owner.now,
  });
}

/** [건너뛰기]. 사진을 `skipped`로 남겨 같은 사진이 다시 후보로 뜨지 않게 한다. */
export async function skipCandidate(db: KvDb, candidateId: string): Promise<boolean> {
  const cand = await getCandidate(db, candidateId);
  if (!cand || cand.status !== 'pending') return false;
  await withTransaction(db, async () => {
    await transitionStates(db, candidateAssetIds(cand), CONFIRMABLE, 'skipped');
    await setCandidateStatus(db, cand.id, 'skipped');
  });
  return true;
}
