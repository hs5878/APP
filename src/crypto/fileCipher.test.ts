import {
  decryptPhoto,
  encryptPhoto,
  photoAad,
  readFileBytes,
  writeFileBytes,
  type PhotoAadFields,
} from './fileCipher';
import { DecryptError } from './sodium';

jest.mock('react-native-libsodium', () => ({
  __esModule: true,
  default: jest.requireActual('libsodium-wrappers-sumo'),
}));

// expo-file-system `File`을 메모리 맵으로 흉내 낸다. 바이트 API만 쓰는지(base64·문자열 없음) 함께 본다.
const mockFiles = new Map<string, Uint8Array>();
jest.mock('expo-file-system', () => ({
  File: class {
    uri: string;
    constructor(uri: string) {
      this.uri = uri;
    }
    create() {
      mockFiles.set(this.uri, new Uint8Array(0));
    }
    write(content: unknown) {
      if (!(content instanceof Uint8Array)) throw new Error('바이트가 아닌 쓰기');
      mockFiles.set(this.uri, content.slice());
    }
    async bytes() {
      const b = mockFiles.get(this.uri);
      if (!b) throw new Error('없는 파일');
      return b.slice();
    }
    async move(dest: { uri: string }) {
      const b = mockFiles.get(this.uri);
      if (!b) throw new Error('없는 파일');
      mockFiles.delete(this.uri);
      mockFiles.set(dest.uri, b);
    }
  },
}));

const key = new Uint8Array(32).fill(3);
const fields: PhotoAadFields = {
  photoId: '01900000-0000-7000-8000-000000000a01',
  spaceId: '01900000-0000-7000-8000-000000000a02',
  keyId: 1,
  variant: 'full',
};

function randomBytes(n: number): Uint8Array {
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i += 65536) crypto.getRandomValues(out.subarray(i, i + 65536));
  return out;
}

describe('photoAad', () => {
  it('"photo" ‖ photo_id ‖ space_id ‖ key_id ‖ 구분', () => {
    expect(photoAad(fields)).toBe(`photo${fields.photoId}${fields.spaceId}1full`);
    expect(photoAad({ ...fields, variant: 'thumb', keyId: 12 })).toBe(
      `photo${fields.photoId}${fields.spaceId}12thumb`,
    );
  });

  it('UUID가 아닌 ID, 잘못된 key_id·구분은 거부한다', () => {
    expect(() => photoAad({ ...fields, photoId: 'abc' })).toThrow();
    expect(() => photoAad({ ...fields, spaceId: fields.spaceId.toUpperCase() })).toThrow();
    expect(() => photoAad({ ...fields, keyId: 0 })).toThrow();
    expect(() => photoAad({ ...fields, variant: 'big' as never })).toThrow();
  });
});

describe('사진 파일 AEAD', () => {
  const plain = randomBytes(512 * 1024);

  it('0.5MB 보관본을 암호화하고 되돌린다', async () => {
    const sealed = await encryptPhoto(plain, fields, key);
    expect(sealed.length).toBe(24 + plain.length + 16);
    const opened = await decryptPhoto(sealed, fields, key);
    expect(Buffer.from(opened).equals(Buffer.from(plain))).toBe(true);
  });

  const changes: [string, Partial<PhotoAadFields>][] = [
    ['photo_id', { photoId: '01900000-0000-7000-8000-000000000b01' }],
    ['space_id', { spaceId: '01900000-0000-7000-8000-000000000b02' }],
    ['key_id', { keyId: 2 }],
    ['구분(full → thumb)', { variant: 'thumb' }],
  ];

  it.each(changes)('AAD의 %s만 바꿔도 복호화에 실패한다', async (_name, change) => {
    const sealed = await encryptPhoto(plain.subarray(0, 4096), fields, key);
    await expect(decryptPhoto(sealed, { ...fields, ...change }, key)).rejects.toBeInstanceOf(
      DecryptError,
    );
  });

  it('다른 키나 바뀐 바이트는 실패한다', async () => {
    const sealed = await encryptPhoto(plain.subarray(0, 4096), fields, key);
    await expect(decryptPhoto(sealed, fields, new Uint8Array(32))).rejects.toBeInstanceOf(
      DecryptError,
    );
    const tampered = sealed.slice();
    tampered[100]! ^= 0x80;
    await expect(decryptPhoto(tampered, fields, key)).rejects.toBeInstanceOf(DecryptError);
  });
});

describe('파일 바이트 I/O', () => {
  beforeEach(() => mockFiles.clear());

  it('임시 파일에 쓴 뒤 제자리로 옮기고, 같은 바이트로 읽는다', async () => {
    const uri = 'file:///docs/photos/x.bin';
    const bytes = randomBytes(1000);
    await writeFileBytes(uri, bytes);
    expect([...mockFiles.keys()]).toEqual([uri]);
    expect(Buffer.from(await readFileBytes(uri)).equals(Buffer.from(bytes))).toBe(true);
  });

  it('파일 → 암호화 → 파일 → 복호화 경로가 이어진다', async () => {
    const bytes = randomBytes(2048);
    await writeFileBytes('file:///plain.jpg', bytes);
    await writeFileBytes(
      'file:///sealed.bin',
      await encryptPhoto(await readFileBytes('file:///plain.jpg'), fields, key),
    );
    const opened = await decryptPhoto(await readFileBytes('file:///sealed.bin'), fields, key);
    expect(Buffer.from(opened).equals(Buffer.from(bytes))).toBe(true);
  });
});
