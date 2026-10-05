import { aeadOpen, aeadSeal, assertAadField, assertKeyId, DecryptError, getSodium } from './sodium';

// 서버 행 봉투(DATA_MODEL §5.1, D-020). 🔒 컬럼을 JSON으로 묶어 payload = `nonce(24B) ‖ ciphertext`로 만든다.

/** 행 AAD에 묶는 평문 컬럼. 서버가 하나라도 바꾸면 복호화가 실패한다. */
export type RowAadFields = {
  table: string;
  id: string;
  spaceId: string;
  /** photos·place_stops·card_notes의 card_id. 없으면 null(빈 값으로 인코딩). */
  parentId: string | null;
  createdBy: string;
  keyId: number;
};

// 길이 접두의 두 바이트가 모두 ASCII 범위(0x00~0x7f)여야 UTF-8로 넘길 때 바이트가 그대로 유지된다.
// 그래서 필드 길이를 127바이트로 묶는다(UUID 36자, 테이블명·key_id는 훨씬 짧다).
const MAX_FIELD = 0x7f;

/**
 * 행 AAD: 각 필드 앞에 2바이트 빅엔디언 길이를 붙여 이어 쓴다.
 * 순서 `table, id, space_id, parent_id(없으면 빈 값), created_by, key_id(10진)`.
 * 반환값은 바이트와 1:1인 ASCII 문자열(libsodium 네이티브 바인딩이 문자열 AAD만 받는다).
 */
export function rowAad(f: RowAadFields): string {
  assertKeyId(f.keyId);
  const fields: [string, string][] = [
    ['table', f.table],
    ['id', f.id],
    ['space_id', f.spaceId],
    ['parent_id', f.parentId ?? ''],
    ['created_by', f.createdBy],
    ['key_id', String(f.keyId)],
  ];
  let out = '';
  for (const [name, value] of fields) {
    assertAadField(name, value, MAX_FIELD);
    out += String.fromCharCode(value.length >> 8, value.length & 0xff) + value;
  }
  return out;
}

/** 🔒 컬럼 객체를 봉투 payload로 암호화한다. */
export async function encryptRow(
  f: RowAadFields,
  payload: Record<string, unknown>,
  key: Uint8Array,
): Promise<Uint8Array> {
  return aeadSeal(JSON.stringify(payload), rowAad(f), key);
}

/** payload를 복호화해 🔒 컬럼 객체를 돌려준다. 인증 실패나 형식 오류는 `DecryptError`. */
export async function decryptRow(
  f: RowAadFields,
  sealed: Uint8Array,
  key: Uint8Array,
): Promise<Record<string, unknown>> {
  const plain = await aeadOpen(sealed, rowAad(f), key);
  const s = await getSodium();
  let parsed: unknown;
  try {
    parsed = JSON.parse(s.to_string(plain));
  } catch {
    throw new DecryptError('payload가 JSON이 아닙니다.');
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new DecryptError('payload가 객체가 아닙니다.');
  }
  return parsed as Record<string, unknown>;
}
