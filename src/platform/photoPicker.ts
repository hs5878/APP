import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library/legacy';
import { exifLocalToEpoch, parseExifDateTime } from '@/domain/exifTime';

/** 선택기에서 고른 사진 하나. 촬영 시각·위치를 알 수 없으면 null. */
export type PickedPhoto = {
  uri: string;
  /** 갤러리 asset id. 시스템 선택기가 주지 않으면 null. */
  assetId: string | null;
  takenAt: number | null;
  lat: number | null;
  lng: number | null;
};

/** 카드 편집이 갤러리에서 사진을 고르는 데 쓰는 인터페이스. */
export interface PhotoPickerApi {
  /** 취소하면 빈 배열. */
  pick(limit: number): Promise<PickedPhoto[]>;
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function exifTakenAt(exif: Record<string, unknown> | null | undefined): number | null {
  const raw = exif?.DateTimeOriginal ?? exif?.DateTime;
  const t = typeof raw === 'string' ? parseExifDateTime(raw) : null;
  if (!t) return null;
  // 시간대가 없는 값이라 기기 시간대로 읽는다.
  const guess = new Date(t.year, t.month - 1, t.day, t.hour, t.minute, t.second);
  return exifLocalToEpoch(t, -guess.getTimezoneOffset());
}

function exifCoord(exif: Record<string, unknown> | null | undefined) {
  const lat = num(exif?.GPSLatitude);
  const lng = num(exif?.GPSLongitude);
  if (lat === null || lng === null) return { lat: null, lng: null };
  const south = exif?.GPSLatitudeRef === 'S';
  const west = exif?.GPSLongitudeRef === 'W';
  return { lat: south ? -Math.abs(lat) : lat, lng: west ? -Math.abs(lng) : lng };
}

async function libraryTakenAt(assetId: string | null): Promise<number | null> {
  if (!assetId) return null;
  try {
    const info = await MediaLibrary.getAssetInfoAsync(assetId, {
      shouldDownloadFromNetwork: false,
    });
    return info.creationTime || null;
  } catch {
    return null;
  }
}

export const photoPickerApi: PhotoPickerApi = {
  async pick(limit) {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: limit,
      exif: true,
      quality: 1,
    });
    if (result.canceled) return [];
    const out: PickedPhoto[] = [];
    for (const a of result.assets) {
      const exif = (a.exif ?? null) as Record<string, unknown> | null;
      out.push({
        uri: a.uri,
        assetId: a.assetId ?? null,
        takenAt: (await libraryTakenAt(a.assetId ?? null)) ?? exifTakenAt(exif),
        ...exifCoord(exif),
      });
    }
    return out;
  },
};
