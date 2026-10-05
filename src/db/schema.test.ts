import { getTableColumns, getTableName, is } from 'drizzle-orm';
import { SQLiteTable } from 'drizzle-orm/sqlite-core';
import { DEV_SPACE_ID, DEV_USER_ID, getDevUser } from '@/features/devUser';
import { isUuid } from '@/domain/id';
import { runMigrations } from './migrate';
import * as schema from './schema';
import { createTestDb } from './testing';
import { kvGet, kvSet } from './kv';

const S_TABLES = [
  'spaces',
  'member_profiles',
  'anniversaries',
  'date_cards',
  'photos',
  'place_stops',
  'card_notes',
];
const L_TABLES = ['card_candidates', 'media_scan', 'photobooks', 'backups', 'drive_files', 'kv'];

const drizzleTables = (Object.values(schema) as unknown[]).filter((v) =>
  is(v, SQLiteTable),
) as SQLiteTable[];

async function migrated() {
  const t = createTestDb();
  await runMigrations(t.runner);
  return t;
}

describe('로컬 스키마', () => {
  it('마이그레이션 후 모든 테이블이 있다', async () => {
    const { raw } = await migrated();
    const names = (
      raw.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all() as {
        name: string;
      }[]
    ).map((r) => r.name);
    expect(names).toEqual(
      expect.arrayContaining([...S_TABLES, ...L_TABLES, 'members_cache', '__migrations']),
    );
  });

  it('Drizzle 정의와 실제 테이블의 컬럼이 일치한다', async () => {
    const { raw } = await migrated();
    for (const table of drizzleTables) {
      const name = getTableName(table);
      const actual = (raw.prepare(`PRAGMA table_info(${name})`).all() as { name: string }[])
        .map((c) => c.name)
        .sort();
      const declared = Object.values(getTableColumns(table))
        .map((c) => c.name)
        .sort();
      expect({ name, cols: actual }).toEqual({ name, cols: declared });
    }
    expect(drizzleTables).toHaveLength(S_TABLES.length + L_TABLES.length + 1);
  });

  it('모든 S 테이블이 동기화 컬럼(space_id, created_by 포함)을 갖는다', async () => {
    const { raw } = await migrated();
    const sync = [
      'space_id',
      'created_by',
      'created_at',
      'updated_at',
      'deleted_at',
      'rev',
      'dirty',
    ];
    for (const name of S_TABLES) {
      const cols = (raw.prepare(`PRAGMA table_info(${name})`).all() as { name: string }[]).map(
        (c) => c.name,
      );
      expect(cols).toEqual(expect.arrayContaining(sync));
    }
  });

  it('작성자별 UNIQUE 제약이 동작한다', async () => {
    const { raw } = await migrated();
    const ins = raw.prepare(
      `INSERT INTO card_notes (id, card_id, text, space_id, created_by, created_at, updated_at)
       VALUES (?, 'c1', 't', 's', 'u', 1, 1)`,
    );
    ins.run('n1');
    expect(() => ins.run('n2')).toThrow();
  });

  it('kv에 테이블별 커서 키를 저장할 수 있다', async () => {
    const { db } = await migrated();
    await kvSet(db, 'sync_rev.date_cards', '42');
    expect(await kvGet(db, 'sync_rev.date_cards')).toBe('42');
  });
});

describe('개발용 사용자', () => {
  it('고정 UUID를 돌려준다', () => {
    expect(isUuid(DEV_USER_ID)).toBe(true);
    expect(isUuid(DEV_SPACE_ID)).toBe(true);
    expect(getDevUser()).toEqual({ userId: DEV_USER_ID, spaceId: DEV_SPACE_ID });
  });
});
