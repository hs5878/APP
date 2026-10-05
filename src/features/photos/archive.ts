import { ARCHIVE_JPEG_QUALITY, ARCHIVE_MAX_EDGE, THUMB_MAX_EDGE } from '@/domain/candidatePlan';
import type { PhotoFilesApi } from '@/platform/photoFiles';

export type ArchivedPhoto = {
  /** 보관본(긴 변 2048px, JPEG 85%) 위치와 크기. */
  localPath: string;
  width: number;
  height: number;
  /** 썸네일(긴 변 400px) 위치. */
  thumbPath: string;
};

/**
 * 갤러리 사진 하나의 보관본과 썸네일을 만든다. 원본 파일은 읽기만 한다.
 * 읽을 수 없는 사진(기기에서 지워짐, iCloud에만 있음, 손상)이면 null. 반쯤 만든 파일은 지운다.
 */
export async function archivePhoto(
  files: PhotoFilesApi,
  assetId: string,
  photoId: string,
): Promise<ArchivedPhoto | null> {
  try {
    const source = await files.resolveAssetUri(assetId);
    return source ? await archiveUri(files, source, photoId) : null;
  } catch {
    return null;
  }
}

/** 읽을 수 있는 이미지 파일 위치에서 보관본과 썸네일을 만든다. 선택기가 준 파일에 쓴다. 실패하면 null. */
export async function archiveUri(
  files: PhotoFilesApi,
  uri: string,
  photoId: string,
): Promise<ArchivedPhoto | null> {
  const created: string[] = [];
  try {
    const image = await files.openImage(uri);

    const full = await image.saveJpeg(ARCHIVE_MAX_EDGE, ARCHIVE_JPEG_QUALITY);
    const localPath = await files.store(full.uri, 'archive', photoId);
    created.push(localPath);

    const thumb = await image.saveJpeg(THUMB_MAX_EDGE, ARCHIVE_JPEG_QUALITY);
    const thumbPath = await files.store(thumb.uri, 'thumb', photoId);
    created.push(thumbPath);

    return { localPath, width: full.width, height: full.height, thumbPath };
  } catch {
    await Promise.all(created.map((p) => files.remove(p)));
    return null;
  }
}

/** 확정이 끝내 실패했을 때 이미 만든 파일을 치운다. */
export async function removeArchived(files: PhotoFilesApi, list: readonly ArchivedPhoto[]) {
  await Promise.all(list.flatMap((a) => [files.remove(a.localPath), files.remove(a.thumbPath)]));
}
