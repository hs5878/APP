import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as MediaLibrary from 'expo-media-library/legacy';
import { fitWithin } from '@/domain/candidatePlan';

export type SavedImage = { uri: string; width: number; height: number };

export interface ImageHandle {
  /** 열어 본 원본의 실제 크기(EXIF 회전 반영). */
  readonly width: number;
  readonly height: number;
  /** 긴 변을 `maxEdge` 이하로 줄여(키우지 않음) JPEG 임시 파일로 쓴다. */
  saveJpeg(maxEdge: number, quality: number): Promise<SavedImage>;
}

export type StoredKind = 'archive' | 'thumb';

/** 보관본·썸네일 파일을 만드는 얇은 층. 보관 로직(`features/photos/archive`)은 이것만 보고 테스트한다. */
export interface PhotoFilesApi {
  /** 갤러리 사진의 읽을 수 있는 파일 위치. 기기에 없으면(iCloud에만 있음 등) null. */
  resolveAssetUri(assetId: string): Promise<string | null>;
  openImage(uri: string): Promise<ImageHandle>;
  /** 임시 파일을 제자리로 옮기고 최종 위치를 돌려준다. 보관본 `documents/photos/{id}.jpg`, 썸네일 `cache/thumbs/{id}.jpg`. */
  store(tmpUri: string, kind: StoredKind, photoId: string): Promise<string>;
  remove(uri: string): Promise<void>;
}

function targetFor(kind: StoredKind, photoId: string): { dir: Directory; file: File } {
  const dir =
    kind === 'archive'
      ? new Directory(Paths.document, 'photos')
      : new Directory(Paths.cache, 'thumbs');
  return { dir, file: new File(dir, `${photoId}.jpg`) };
}

export const photoFilesApi: PhotoFilesApi = {
  async resolveAssetUri(assetId) {
    try {
      // 네트워크에서 받아 와야 하는 사진은 건너뛴다(스캔과 같은 정책).
      const info = await MediaLibrary.getAssetInfoAsync(assetId, {
        shouldDownloadFromNetwork: false,
      });
      return info.localUri ?? null;
    } catch {
      return null;
    }
  },
  async openImage(uri) {
    const ref = await ImageManipulator.manipulate(uri).renderAsync();
    return {
      width: ref.width,
      height: ref.height,
      async saveJpeg(maxEdge, quality) {
        const target = fitWithin(ref.width, ref.height, maxEdge);
        const ctx = ImageManipulator.manipulate(ref);
        if (target.width !== ref.width || target.height !== ref.height) {
          ctx.resize(
            target.width >= target.height ? { width: target.width } : { height: target.height },
          );
        }
        const out = await (
          await ctx.renderAsync()
        ).saveAsync({
          format: SaveFormat.JPEG,
          compress: quality,
        });
        return { uri: out.uri, width: out.width, height: out.height };
      },
    };
  },
  async store(tmpUri, kind, photoId) {
    const { dir, file } = targetFor(kind, photoId);
    dir.create({ intermediates: true, idempotent: true });
    await new File(tmpUri).move(file, { overwrite: true });
    return file.uri;
  },
  async remove(uri) {
    try {
      const f = new File(uri);
      if (f.exists) f.delete();
    } catch {
      // 지우지 못해도 기록에는 영향이 없다.
    }
  },
};
