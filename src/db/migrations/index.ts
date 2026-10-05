import m0001 from './0001_kv';
import m0002 from './0002_schema';

export type Migration = { id: string; statements: string[] };

// 순서대로 적용한다. 이미 적용한 id는 건너뛰므로 목록 앞쪽을 바꾸지 말고 뒤에만 추가한다.
export const migrations: Migration[] = [m0001, m0002];
