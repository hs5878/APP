import * as MediaLibrary from 'expo-media-library/legacy';
import { isScreenshotAlbumTitle, type PhotoAccess } from '@/domain/mediaScan';

export type PhotoPermission = { access: PhotoAccess; canAskAgain: boolean };

export type RawAsset = {
  id: string;
  takenAt: number;
  modifiedAt: number;
  filename: string;
  mediaSubtypes: readonly string[];
  albumId: string | null;
};

export type AssetPage = { assets: RawAsset[]; endCursor: string | null; hasNextPage: boolean };

export type AssetDetail = { lat: number | null; lng: number | null; exif: unknown };

/** 이 모듈을 얇게 감싼 인터페이스. 스캔 로직은 이것만 보고 테스트한다. */
export interface MediaApi {
  getPermission(): Promise<PhotoPermission>;
  requestPermission(): Promise<PhotoPermission>;
  /** iOS 제한 접근·Android 14 부분 접근에서 고른 사진을 바꾸는 시스템 선택기. */
  presentLimitedPicker(): Promise<void>;
  /** 사진만, 수정 시각 내림차순. */
  listPage(opts: {
    after?: string | null;
    first: number;
    createdAfter?: number;
  }): Promise<AssetPage>;
  /** 위치·EXIF. 읽을 수 없으면 null. */
  getDetail(id: string): Promise<AssetDetail | null>;
  /** Android의 Screenshots 앨범 id. iOS는 빈 집합. */
  getScreenshotAlbumIds(): Promise<ReadonlySet<string>>;
}

function toPermission(r: MediaLibrary.PermissionResponse): PhotoPermission {
  const access = r.accessPrivileges ?? (r.granted ? 'all' : 'none');
  return { access: r.granted ? access : 'none', canAskAgain: r.canAskAgain };
}

// 위치를 읽으려고 Android는 ACCESS_MEDIA_LOCATION도 함께 요청한다(app.config.ts 플러그인 설정).
const GRANULAR: MediaLibrary.GranularPermission[] = ['photo'];

export const mediaApi: MediaApi = {
  async getPermission() {
    return toPermission(await MediaLibrary.getPermissionsAsync(false, GRANULAR));
  },
  async requestPermission() {
    return toPermission(await MediaLibrary.requestPermissionsAsync(false, GRANULAR));
  },
  async presentLimitedPicker() {
    await MediaLibrary.presentPermissionsPickerAsync(['photo']);
  },
  async listPage({ after, first, createdAfter }) {
    const page = await MediaLibrary.getAssetsAsync({
      first,
      after: after ?? undefined,
      mediaType: MediaLibrary.MediaType.photo,
      sortBy: [[MediaLibrary.SortBy.modificationTime, false]],
      createdAfter,
    });
    return {
      assets: page.assets.map((a) => ({
        id: a.id,
        takenAt: a.creationTime,
        modifiedAt: a.modificationTime,
        filename: a.filename,
        mediaSubtypes: a.mediaSubtypes ?? [],
        albumId: a.albumId ?? null,
      })),
      endCursor: page.hasNextPage ? page.endCursor : null,
      hasNextPage: page.hasNextPage,
    };
  },
  async getDetail(id) {
    try {
      const info = await MediaLibrary.getAssetInfoAsync(id, { shouldDownloadFromNetwork: false });
      return {
        lat: info.location?.latitude ?? null,
        lng: info.location?.longitude ?? null,
        exif: info.exif ?? null,
      };
    } catch {
      return null;
    }
  },
  async getScreenshotAlbumIds() {
    const albums = await MediaLibrary.getAlbumsAsync();
    return new Set(albums.filter((a) => isScreenshotAlbumTitle(a.title)).map((a) => a.id));
  },
};
