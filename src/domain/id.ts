// UUID v7(RFC 9562): 앞 48비트가 ms 시각이라 문자열 정렬이 생성 순서와 같다.
// ID는 비밀이 아니므로 난수는 crypto.getRandomValues가 있으면 쓰고 없으면 Math.random으로 채운다.

type RandomFill = (bytes: Uint8Array) => void;

const HEX = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, '0'));

const defaultRandom: RandomFill = (bytes) => {
  const c = (globalThis as { crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array } }).crypto;
  if (c?.getRandomValues) {
    c.getRandomValues(bytes);
    return;
  }
  for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
};

let lastMs = -1;
let lastSeq = 0;

/**
 * 새 UUID v7. 같은 ms 안에서 여러 번 불러도 증가하도록 12비트 카운터(rand_a)를 쓴다.
 * 시계가 뒤로 가도 이전 값보다 작은 ID는 만들지 않는다.
 */
export function uuidv7(now: number = Date.now(), random: RandomFill = defaultRandom): string {
  const bytes = new Uint8Array(16);
  random(bytes);

  let ms = Math.floor(now);
  if (ms > lastMs) {
    lastMs = ms;
    // 새 ms의 카운터는 낮은 값에서 시작해서 같은 ms 안에서 올릴 여유를 둔다.
    lastSeq = (((bytes[6] ?? 0) << 8) | (bytes[7] ?? 0)) & 0x3ff;
  } else {
    lastSeq += 1;
    if (lastSeq > 0xfff) {
      lastMs += 1;
      lastSeq = 0;
    }
    ms = lastMs;
  }

  bytes[0] = Math.floor(ms / 2 ** 40) & 0xff;
  bytes[1] = Math.floor(ms / 2 ** 32) & 0xff;
  bytes[2] = (ms >>> 24) & 0xff;
  bytes[3] = (ms >>> 16) & 0xff;
  bytes[4] = (ms >>> 8) & 0xff;
  bytes[5] = ms & 0xff;
  bytes[6] = 0x70 | (lastSeq >> 8);
  bytes[7] = lastSeq & 0xff;
  bytes[8] = 0x80 | ((bytes[8] ?? 0) & 0x3f);

  let out = '';
  for (let i = 0; i < 16; i++) {
    if (i === 4 || i === 6 || i === 8 || i === 10) out += '-';
    out += HEX[bytes[i] ?? 0];
  }
  return out;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function isUuid(s: string): boolean {
  return UUID_RE.test(s);
}

/** UUID v7에 담긴 생성 시각(ms). */
export function uuidv7Time(id: string): number {
  return parseInt(id.replace(/-/g, '').slice(0, 12), 16);
}
