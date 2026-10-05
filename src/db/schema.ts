import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  unique,
} from 'drizzle-orm/sqlite-core';

// DATA_MODEL §3 기준. 시각은 UTC epoch ms(integer), 날짜는 'YYYY-MM-DD' 문자열.
// 🔒 컬럼도 로컬에서는 평문으로 둔다(DB 전체가 SQLCipher로 암호화됨).

/** S 테이블 공통 동기화 컬럼(§1). rev는 마지막으로 받은 서버 값, dirty는 로컬 전용. */
const syncColumns = {
  spaceId: text('space_id').notNull(),
  createdBy: text('created_by').notNull(),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  deletedAt: integer('deleted_at'),
  rev: integer('rev').notNull().default(0),
  dirty: integer('dirty').notNull().default(0),
};

// ── L: 설정과 커서 ─────────────────────────────────────────────

export const kv = sqliteTable('kv', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

// ── SV 읽기 캐시 ───────────────────────────────────────────────

/** space_members의 읽기 캐시. pull 때마다 통째로 갱신한다. */
export const membersCache = sqliteTable(
  'members_cache',
  {
    spaceId: text('space_id').notNull(),
    userId: text('user_id').notNull(),
    role: text('role', { enum: ['owner', 'member'] }).notNull(),
    joinedAt: integer('joined_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.spaceId, t.userId] })],
);

// ── S: 동기화 대상 ─────────────────────────────────────────────

/** 커플 공간. id가 곧 space_id이고, 동기화 컬럼의 space_id는 id와 같은 값이다. */
export const spaces = sqliteTable('spaces', {
  id: text('id').primaryKey(),
  startedOn: text('started_on').notNull(),
  keyId: integer('key_id').notNull().default(1),
  status: text('status', { enum: ['active', 'unlinked'] })
    .notNull()
    .default('active'),
  unlinkedAt: integer('unlinked_at'),
  ...syncColumns,
});

export const memberProfiles = sqliteTable(
  'member_profiles',
  {
    id: text('id').primaryKey(),
    nickname: text('nickname').notNull(),
    ...syncColumns,
  },
  (t) => [unique('member_profiles_space_author').on(t.spaceId, t.createdBy)],
);

export const anniversaries = sqliteTable(
  'anniversaries',
  {
    id: text('id').primaryKey(),
    title: text('title').notNull(),
    date: text('date').notNull(),
    repeat: text('repeat', { enum: ['none', 'yearly'] })
      .notNull()
      .default('none'),
    notify: text('notify', { enum: ['none', 'd0', 'd1', 'd7'] })
      .notNull()
      .default('none'),
    ...syncColumns,
  },
  (t) => [index('anniversaries_space_idx').on(t.spaceId)],
);

export const dateCards = sqliteTable(
  'date_cards',
  {
    id: text('id').primaryKey(),
    date: text('date').notNull(),
    startAt: integer('start_at'),
    endAt: integer('end_at'),
    summary: text('summary').notNull().default(''),
    summarySource: text('summary_source', {
      enum: ['ai', 'ai_edited', 'manual', 'template'],
    })
      .notNull()
      .default('manual'),
    aiDraft: text('ai_draft'),
    aiAttempts: integer('ai_attempts').notNull().default(0),
    coverPhotoId: text('cover_photo_id'),
    ...syncColumns,
  },
  (t) => [index('date_cards_space_date_idx').on(t.spaceId, t.date)],
);

export const photos = sqliteTable(
  'photos',
  {
    id: text('id').primaryKey(),
    cardId: text('card_id').notNull(),
    takenAt: integer('taken_at').notNull(),
    tzOffsetMin: integer('tz_offset_min').notNull().default(0),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    placeStopId: text('place_stop_id'),
    sort: integer('sort').notNull().default(0),
    remotePath: text('remote_path'),
    // 여기부터 L 컬럼(서버로 올라가지 않는다)
    localAssetId: text('local_asset_id'),
    localPath: text('local_path'),
    exportPath: text('export_path'),
    lat: real('lat'),
    lng: real('lng'),
    uploadState: text('upload_state', { enum: ['pending', 'done', 'failed'] })
      .notNull()
      .default('pending'),
    downloadState: text('download_state', { enum: ['none', 'thumb', 'full'] })
      .notNull()
      .default('none'),
    ...syncColumns,
  },
  (t) => [index('photos_card_idx').on(t.cardId), index('photos_space_idx').on(t.spaceId)],
);

export const placeStops = sqliteTable(
  'place_stops',
  {
    id: text('id').primaryKey(),
    cardId: text('card_id').notNull(),
    seq: integer('seq').notNull(),
    arrivedAt: integer('arrived_at').notNull(),
    leftAt: integer('left_at').notNull(),
    name: text('name'),
    nameSource: text('name_source', { enum: ['auto', 'picked', 'manual'] })
      .notNull()
      .default('auto'),
    category: text('category'),
    region: text('region'),
    latC: real('lat_c'),
    lngC: real('lng_c'),
    ...syncColumns,
  },
  (t) => [index('place_stops_card_idx').on(t.cardId)],
);

export const cardNotes = sqliteTable(
  'card_notes',
  {
    id: text('id').primaryKey(),
    cardId: text('card_id').notNull(),
    text: text('text').notNull(),
    ...syncColumns,
  },
  (t) => [unique('card_notes_card_author').on(t.cardId, t.createdBy)],
);

// ── L: 로컬 전용 ───────────────────────────────────────────────

export const cardCandidates = sqliteTable(
  'card_candidates',
  {
    id: text('id').primaryKey(),
    date: text('date').notNull(),
    startAt: integer('start_at').notNull(),
    endAt: integer('end_at').notNull(),
    assetIds: text('asset_ids').notNull().default('[]'),
    targetCardId: text('target_card_id'),
    status: text('status', { enum: ['pending', 'accepted', 'skipped'] })
      .notNull()
      .default('pending'),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [index('card_candidates_status_idx').on(t.status, t.date)],
);

export const mediaScan = sqliteTable(
  'media_scan',
  {
    assetId: text('asset_id').primaryKey(),
    takenAt: integer('taken_at').notNull(),
    lat: real('lat'),
    lng: real('lng'),
    tzOffsetMin: integer('tz_offset_min'),
    state: text('state', {
      enum: ['seen', 'detailed', 'in_card', 'skipped', 'ignored'],
    })
      .notNull()
      .default('seen'),
  },
  (t) => [index('media_scan_taken_idx').on(t.takenAt)],
);

export const photobooks = sqliteTable('photobooks', {
  id: text('id').primaryKey(),
  spaceId: text('space_id').notNull(),
  anniversaryKey: text('anniversary_key').notNull(),
  rangeFrom: text('range_from').notNull(),
  rangeTo: text('range_to').notNull(),
  cardIds: text('card_ids').notNull().default('[]'),
  coverPhotoId: text('cover_photo_id'),
  status: text('status', { enum: ['scheduled', 'ready', 'failed'] })
    .notNull()
    .default('scheduled'),
  pdfPath: text('pdf_path'),
  generatedAt: integer('generated_at'),
});

export const backups = sqliteTable('backups', {
  id: text('id').primaryKey(),
  startedAt: integer('started_at').notNull(),
  finishedAt: integer('finished_at'),
  status: text('status', { enum: ['ok', 'failed', 'partial'] }).notNull(),
  error: text('error'),
  photosUploaded: integer('photos_uploaded').notNull().default(0),
});

export const driveFiles = sqliteTable('drive_files', {
  photoId: text('photo_id').primaryKey(),
  driveFileId: text('drive_file_id').notNull(),
  uploadedAt: integer('uploaded_at').notNull(),
});
