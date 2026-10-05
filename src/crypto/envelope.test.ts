import { decryptRow, encryptRow, rowAad, type RowAadFields } from './envelope';
import { aeadSeal, DecryptError } from './sodium';

// 네이티브(JSI) 모듈은 Jest에서 못 쓰므로 같은 API의 wasm 구현(libsodium-wrappers-sumo)으로 바꾼다.
jest.mock('react-native-libsodium', () => ({
  __esModule: true,
  default: jest.requireActual('libsodium-wrappers-sumo'),
}));

const key = new Uint8Array(32).fill(7);
const fields: RowAadFields = {
  table: 'card_notes',
  id: '01900000-0000-7000-8000-000000000a01',
  spaceId: '01900000-0000-7000-8000-000000000a02',
  parentId: '01900000-0000-7000-8000-000000000a03',
  createdBy: '01900000-0000-7000-8000-000000000a04',
  keyId: 1,
};
const payload = { text: '한강에서 라면 🍜', place: '여의도' };

describe('rowAad', () => {
  it('각 필드 앞에 2바이트 빅엔디언 길이를 붙인다', () => {
    const bytes = new TextEncoder().encode(rowAad({ ...fields, table: 'photos', parentId: null }));
    const expected: number[] = [];
    for (const v of ['photos', fields.id, fields.spaceId, '', fields.createdBy, '1']) {
      expected.push(v.length >> 8, v.length & 0xff, ...Array.from(v, (c) => c.charCodeAt(0)));
    }
    expect(Array.from(bytes)).toEqual(expected);
  });

  it('필드 경계를 옮기면 다른 AAD가 된다', () => {
    const a = rowAad({ ...fields, table: 'ab', id: 'c' });
    const b = rowAad({ ...fields, table: 'a', id: 'bc' });
    expect(a).not.toBe(b);
  });

  it('ASCII가 아니거나 127자를 넘는 필드, 잘못된 key_id는 거부한다', () => {
    expect(() => rowAad({ ...fields, table: '카드' })).toThrow();
    expect(() => rowAad({ ...fields, id: 'x'.repeat(128) })).toThrow();
    expect(() => rowAad({ ...fields, id: 'x'.repeat(127) })).not.toThrow();
    expect(() => rowAad({ ...fields, keyId: 0 })).toThrow();
    expect(() => rowAad({ ...fields, keyId: 1.5 })).toThrow();
  });
});

describe('행 봉투', () => {
  it('암호화한 payload를 같은 AAD와 키로 되돌린다', async () => {
    const sealed = await encryptRow(fields, payload, key);
    expect(sealed.length).toBeGreaterThan(24 + 16);
    expect(await decryptRow(fields, sealed, key)).toEqual(payload);
  });

  it('같은 내용도 매번 다른 nonce로 암호화한다', async () => {
    const a = await encryptRow(fields, payload, key);
    const b = await encryptRow(fields, payload, key);
    expect(Buffer.from(a.subarray(0, 24)).equals(Buffer.from(b.subarray(0, 24)))).toBe(false);
  });

  const changes: [string, Partial<RowAadFields>][] = [
    ['table', { table: 'anniversaries' }],
    ['id', { id: '01900000-0000-7000-8000-000000000b01' }],
    ['space_id', { spaceId: '01900000-0000-7000-8000-000000000b02' }],
    ['parent_id(다른 카드)', { parentId: '01900000-0000-7000-8000-000000000b03' }],
    ['parent_id(없음)', { parentId: null }],
    ['created_by', { createdBy: '01900000-0000-7000-8000-000000000b04' }],
    ['key_id', { keyId: 2 }],
  ];

  it.each(changes)('AAD의 %s만 바꿔도 복호화에 실패한다', async (_name, change) => {
    const sealed = await encryptRow(fields, payload, key);
    await expect(decryptRow({ ...fields, ...change }, sealed, key)).rejects.toBeInstanceOf(
      DecryptError,
    );
  });

  it('parent_id가 없던 행에 parent_id를 붙여도 실패한다', async () => {
    const orphan = { ...fields, parentId: null };
    const sealed = await encryptRow(orphan, payload, key);
    await expect(decryptRow(fields, sealed, key)).rejects.toBeInstanceOf(DecryptError);
  });

  it('다른 키, 바뀐 암호문·nonce, 너무 짧은 입력은 실패한다', async () => {
    const sealed = await encryptRow(fields, payload, key);
    const otherKey = new Uint8Array(32).fill(8);
    await expect(decryptRow(fields, sealed, otherKey)).rejects.toBeInstanceOf(DecryptError);

    const body = sealed.slice();
    body[body.length - 1]! ^= 1;
    await expect(decryptRow(fields, body, key)).rejects.toBeInstanceOf(DecryptError);

    const nonce = sealed.slice();
    nonce[0]! ^= 1;
    await expect(decryptRow(fields, nonce, key)).rejects.toBeInstanceOf(DecryptError);

    await expect(decryptRow(fields, sealed.subarray(0, 39), key)).rejects.toBeInstanceOf(
      DecryptError,
    );
  });

  it('두 행의 payload를 맞바꾸면 둘 다 실패한다', async () => {
    const other = { ...fields, id: '01900000-0000-7000-8000-000000000c01' };
    const a = await encryptRow(fields, { text: 'A' }, key);
    const b = await encryptRow(other, { text: 'B' }, key);
    await expect(decryptRow(fields, b, key)).rejects.toBeInstanceOf(DecryptError);
    await expect(decryptRow(other, a, key)).rejects.toBeInstanceOf(DecryptError);
  });

  it('인증은 통과해도 객체가 아니면 DecryptError', async () => {
    const sealed = await aeadSeal('[1,2]', rowAad(fields), key);
    await expect(decryptRow(fields, sealed, key)).rejects.toBeInstanceOf(DecryptError);
  });

  it('키 길이가 32바이트가 아니면 거부한다', async () => {
    await expect(encryptRow(fields, payload, new Uint8Array(16))).rejects.toThrow();
  });
});
