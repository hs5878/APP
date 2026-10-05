export default {
  id: '0001_kv',
  statements: [
    `CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL)`,
  ],
};
