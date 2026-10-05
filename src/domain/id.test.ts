import { isUuid, uuidv7, uuidv7Time } from './id';

describe('uuidv7', () => {
  it('v7·variant 형식의 UUID를 만든다', () => {
    const id = uuidv7(1_700_000_000_000);
    expect(isUuid(id)).toBe(true);
    expect(id[14]).toBe('7');
    expect('89ab').toContain(id[19]);
  });

  it('시각을 되읽을 수 있다', () => {
    const t = 1_788_000_000_123;
    expect(uuidv7Time(uuidv7(t))).toBe(t);
  });

  it('시간이 늘어나면 문자열 정렬도 같은 순서다', () => {
    const base = 1_800_000_000_000;
    const ids = Array.from({ length: 200 }, (_, i) => uuidv7(base + i * 7));
    expect([...ids].sort()).toEqual(ids);
  });

  it('같은 ms 안에서도 증가한다', () => {
    const t = 1_900_000_000_000;
    const ids = Array.from({ length: 5000 }, () => uuidv7(t));
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual(ids);
  });

  it('시계가 뒤로 가도 이전보다 작은 ID를 만들지 않는다', () => {
    const a = uuidv7(2_000_000_000_000);
    const b = uuidv7(2_000_000_000_000 - 5000);
    expect(b > a).toBe(true);
  });

  it('난수 소스를 주입할 수 있다', () => {
    const fill = (b: Uint8Array) => b.fill(0xab);
    const id = uuidv7(2_100_000_000_000, fill);
    expect(isUuid(id)).toBe(true);
    expect(id.slice(24)).toBe('abababababab');
  });
});
