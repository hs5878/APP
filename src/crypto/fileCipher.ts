import { File } from 'expo-file-system';
import { isUuid } from '@/domain/id';
import { aeadOpen, aeadSeal, assertKeyId } from './sodium';

// 사진 파일 단발 AEAD(DATA_MODEL §5.1). 보관본이 약 0.5MB라 스트리밍 없이 한 번에 암호화한다.
// 파일 = `nonce(24B) ‖ ciphertext`.

export type PhotoVariant = 'full' | 'thumb';

export type PhotoAadFields = {
  photoId: string;
  spaceId: string;
  keyId: number;
  variant: PhotoVariant;
};

/**
 * 사진 AAD = `"photo" ‖ photo_id ‖ space_id ‖ key_id(10진) ‖ "full"|"thumb"`.
 * 길이 접두 없이 이어 쓰므로 두 ID를 36자 UUID로 고정해 경계가 모호하지 않게 한다.
 */
export function photoAad(f: PhotoAadFields): string {
  if (!isUuid(f.photoId) || !isUuid(f.spaceId))
    throw new Error('photo_id·space_id는 UUID여야 합니다.');
  assertKeyId(f.keyId);
  if (f.variant !== 'full' && f.variant !== 'thumb')
    throw new Error('variant는 full 또는 thumb입니다.');
  return `photo${f.photoId}${f.spaceId}${f.keyId}${f.variant}`;
}

export async function encryptPhoto(
  plain: Uint8Array,
  f: PhotoAadFields,
  key: Uint8Array,
): Promise<Uint8Array> {
  return aeadSeal(plain, photoAad(f), key);
}

/** 인증에 실패하면(다른 사진·공간·구분의 파일이거나 바뀐 파일) `DecryptError`. */
export async function decryptPhoto(
  sealed: Uint8Array,
  f: PhotoAadFields,
  key: Uint8Array,
): Promise<Uint8Array> {
  return aeadOpen(sealed, photoAad(f), key);
}

/** 파일 바이트를 base64를 거치지 않고 읽는다. */
export function readFileBytes(uri: string): Promise<Uint8Array> {
  return new File(uri).bytes();
}

/** 바이트를 임시 파일에 쓴 뒤 제자리로 옮긴다. 쓰다가 죽어도 반쯤 쓴 파일이 최종 위치에 남지 않는다. */
export async function writeFileBytes(uri: string, bytes: Uint8Array): Promise<void> {
  const tmp = new File(`${uri}.tmp`);
  tmp.create({ intermediates: true, overwrite: true });
  tmp.write(bytes);
  await tmp.move(new File(uri), { overwrite: true });
}
