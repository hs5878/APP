import { Directory, File, Paths } from 'expo-file-system';
import {
  decryptPhoto,
  encryptPhoto,
  readFileBytes,
  writeFileBytes,
  type PhotoAadFields,
} from './fileCipher';
import { AEAD_KEY_BYTES, getSodium } from './sodium';

// 개발용 측정(T18 완료 기준, docs/MEASUREMENTS.md). 0.5MB 보관본의 파일 읽기 → 암·복호화 → 파일 쓰기 시간을 잰다.
// 측정용 무작위 키와 임시 파일만 쓰고, 끝나면 지운다.

export const BENCH_BYTES = 512 * 1024;

export type Stats = { median: number; max: number };
export type BenchResult = {
  runs: number;
  bytes: number;
  /** 파일 읽기 + 암호화 + 파일 쓰기 */
  encrypt: Stats;
  /** 파일 읽기 + 복호화 + 파일 쓰기 */
  decrypt: Stats;
  /** 암·복호화만(파일 I/O 제외) */
  encryptOnly: Stats;
  decryptOnly: Stats;
};

function stats(values: number[]): Stats {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    median: sorted[Math.floor(sorted.length / 2)] ?? 0,
    max: sorted[sorted.length - 1] ?? 0,
  };
}

export function formatBenchResult(r: BenchResult): string {
  const f = (x: Stats) => `중앙 ${x.median.toFixed(1)}ms / 최대 ${x.max.toFixed(1)}ms`;
  return [
    `${(r.bytes / 1024).toFixed(0)}KB × ${r.runs}회`,
    `암호화(읽기+암호화+쓰기) ${f(r.encrypt)}`,
    `복호화(읽기+복호화+쓰기) ${f(r.decrypt)}`,
    `암호화만 ${f(r.encryptOnly)}`,
    `복호화만 ${f(r.decryptOnly)}`,
  ].join('\n');
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export async function benchmarkPhotoCipher(runs = 10): Promise<BenchResult> {
  const s = await getSodium();
  const key = s.randombytes_buf(AEAD_KEY_BYTES);
  const fields: PhotoAadFields = {
    photoId: '01900000-0000-7000-8000-0000000be001',
    spaceId: '01900000-0000-7000-8000-0000000be002',
    keyId: 1,
    variant: 'full',
  };
  const dir = new Directory(Paths.cache, 'crypto-bench');
  dir.create({ intermediates: true, idempotent: true });
  const plainUri = new File(dir, 'plain.jpg').uri;
  const sealedUri = new File(dir, 'sealed.bin').uri;
  const outUri = new File(dir, 'out.jpg').uri;

  const enc: number[] = [];
  const dec: number[] = [];
  const encOnly: number[] = [];
  const decOnly: number[] = [];
  try {
    await writeFileBytes(plainUri, s.randombytes_buf(BENCH_BYTES));
    // 첫 회는 JIT·캐시 준비라 버린다.
    for (let i = 0; i <= runs; i++) {
      const e0 = now();
      const plain = await readFileBytes(plainUri);
      const e1 = now();
      const sealed = await encryptPhoto(plain, fields, key);
      const e2 = now();
      await writeFileBytes(sealedUri, sealed);
      const e3 = now();

      const d0 = now();
      const sealedRead = await readFileBytes(sealedUri);
      const d1 = now();
      const opened = await decryptPhoto(sealedRead, fields, key);
      const d2 = now();
      await writeFileBytes(outUri, opened);
      const d3 = now();

      if (opened.length !== BENCH_BYTES) throw new Error('복호화 결과 길이가 다릅니다.');
      if (i === 0) continue;
      enc.push(e3 - e0);
      encOnly.push(e2 - e1);
      dec.push(d3 - d0);
      decOnly.push(d2 - d1);
    }
  } finally {
    dir.delete();
  }
  return {
    runs,
    bytes: BENCH_BYTES,
    encrypt: stats(enc),
    decrypt: stats(dec),
    encryptOnly: stats(encOnly),
    decryptOnly: stats(decOnly),
  };
}
