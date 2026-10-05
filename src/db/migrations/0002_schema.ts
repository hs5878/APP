// DATA_MODEL §3 로컬 테이블 전체. schema.ts와 같은 모양이어야 한다(schema.test.ts가 확인).
const SYNC = `space_id TEXT NOT NULL,
    created_by TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER,
    rev INTEGER NOT NULL DEFAULT 0,
    dirty INTEGER NOT NULL DEFAULT 0`;

export default {
  id: '0002_schema',
  statements: [
    `CREATE TABLE members_cache (
    space_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    role TEXT NOT NULL,
    joined_at INTEGER NOT NULL,
    PRIMARY KEY (space_id, user_id)
  )`,
    `CREATE TABLE spaces (
    id TEXT PRIMARY KEY NOT NULL,
    started_on TEXT NOT NULL,
    key_id INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'active',
    unlinked_at INTEGER,
    ${SYNC}
  )`,
    `CREATE TABLE member_profiles (
    id TEXT PRIMARY KEY NOT NULL,
    nickname TEXT NOT NULL,
    ${SYNC},
    CONSTRAINT member_profiles_space_author UNIQUE (space_id, created_by)
  )`,
    `CREATE TABLE anniversaries (
    id TEXT PRIMARY KEY NOT NULL,
    title TEXT NOT NULL,
    date TEXT NOT NULL,
    repeat TEXT NOT NULL DEFAULT 'none',
    notify TEXT NOT NULL DEFAULT 'none',
    ${SYNC}
  )`,
    `CREATE INDEX anniversaries_space_idx ON anniversaries (space_id)`,
    `CREATE TABLE date_cards (
    id TEXT PRIMARY KEY NOT NULL,
    date TEXT NOT NULL,
    start_at INTEGER,
    end_at INTEGER,
    summary TEXT NOT NULL DEFAULT '',
    summary_source TEXT NOT NULL DEFAULT 'manual',
    ai_draft TEXT,
    ai_attempts INTEGER NOT NULL DEFAULT 0,
    cover_photo_id TEXT,
    ${SYNC}
  )`,
    `CREATE INDEX date_cards_space_date_idx ON date_cards (space_id, date)`,
    `CREATE TABLE photos (
    id TEXT PRIMARY KEY NOT NULL,
    card_id TEXT NOT NULL,
    taken_at INTEGER NOT NULL,
    tz_offset_min INTEGER NOT NULL DEFAULT 0,
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    place_stop_id TEXT,
    sort INTEGER NOT NULL DEFAULT 0,
    remote_path TEXT,
    local_asset_id TEXT,
    local_path TEXT,
    export_path TEXT,
    lat REAL,
    lng REAL,
    upload_state TEXT NOT NULL DEFAULT 'pending',
    download_state TEXT NOT NULL DEFAULT 'none',
    ${SYNC}
  )`,
    `CREATE INDEX photos_card_idx ON photos (card_id)`,
    `CREATE INDEX photos_space_idx ON photos (space_id)`,
    `CREATE TABLE place_stops (
    id TEXT PRIMARY KEY NOT NULL,
    card_id TEXT NOT NULL,
    seq INTEGER NOT NULL,
    arrived_at INTEGER NOT NULL,
    left_at INTEGER NOT NULL,
    name TEXT,
    name_source TEXT NOT NULL DEFAULT 'auto',
    category TEXT,
    region TEXT,
    lat_c REAL,
    lng_c REAL,
    ${SYNC}
  )`,
    `CREATE INDEX place_stops_card_idx ON place_stops (card_id)`,
    `CREATE TABLE card_notes (
    id TEXT PRIMARY KEY NOT NULL,
    card_id TEXT NOT NULL,
    text TEXT NOT NULL,
    ${SYNC},
    CONSTRAINT card_notes_card_author UNIQUE (card_id, created_by)
  )`,
    `CREATE TABLE card_candidates (
    id TEXT PRIMARY KEY NOT NULL,
    date TEXT NOT NULL,
    start_at INTEGER NOT NULL,
    end_at INTEGER NOT NULL,
    asset_ids TEXT NOT NULL DEFAULT '[]',
    target_card_id TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at INTEGER NOT NULL
  )`,
    `CREATE INDEX card_candidates_status_idx ON card_candidates (status, date)`,
    `CREATE TABLE media_scan (
    asset_id TEXT PRIMARY KEY NOT NULL,
    taken_at INTEGER NOT NULL,
    lat REAL,
    lng REAL,
    tz_offset_min INTEGER,
    state TEXT NOT NULL DEFAULT 'seen'
  )`,
    `CREATE INDEX media_scan_taken_idx ON media_scan (taken_at)`,
    `CREATE TABLE photobooks (
    id TEXT PRIMARY KEY NOT NULL,
    space_id TEXT NOT NULL,
    anniversary_key TEXT NOT NULL,
    range_from TEXT NOT NULL,
    range_to TEXT NOT NULL,
    card_ids TEXT NOT NULL DEFAULT '[]',
    cover_photo_id TEXT,
    status TEXT NOT NULL DEFAULT 'scheduled',
    pdf_path TEXT,
    generated_at INTEGER
  )`,
    `CREATE TABLE backups (
    id TEXT PRIMARY KEY NOT NULL,
    started_at INTEGER NOT NULL,
    finished_at INTEGER,
    status TEXT NOT NULL,
    error TEXT,
    photos_uploaded INTEGER NOT NULL DEFAULT 0
  )`,
    `CREATE TABLE drive_files (
    photo_id TEXT PRIMARY KEY NOT NULL,
    drive_file_id TEXT NOT NULL,
    uploaded_at INTEGER NOT NULL
  )`,
  ],
};
