import initSqlJs from 'sql.js';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DB_PATH = join(__dirname, '..', '..', 'dli.db');

let db = null;

export async function initDb() {
  const SQL = await initSqlJs();

  if (existsSync(DB_PATH)) {
    const buffer = readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS tweets (
      id TEXT PRIMARY KEY,
      author_username TEXT NOT NULL,
      author_display_name TEXT DEFAULT '',
      text TEXT NOT NULL,
      likes INTEGER DEFAULT 0,
      retweets INTEGER DEFAULT 0,
      replies INTEGER DEFAULT 0,
      views INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      scraped_at TEXT NOT NULL DEFAULT (datetime('now')),
      media_url TEXT DEFAULT NULL,
      avatar_url TEXT DEFAULT NULL
    );

    CREATE TABLE IF NOT EXISTS authors (
      username TEXT PRIMARY KEY,
      display_name TEXT DEFAULT '',
      total_mentions INTEGER DEFAULT 0,
      total_likes_received INTEGER DEFAULT 0,
      first_seen TEXT NOT NULL,
      last_seen TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS scrape_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      finished_at TEXT,
      tweets_found INTEGER DEFAULT 0,
      status TEXT DEFAULT 'running'
    );

    CREATE TABLE IF NOT EXISTS api_usage_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      endpoint TEXT NOT NULL,
      tweets_requested INTEGER DEFAULT 0,
      tweets_returned INTEGER DEFAULT 0,
      estimated_cost REAL DEFAULT 0
    );
  `);

  // Migrations for existing DBs
  try { db.run("ALTER TABLE tweets ADD COLUMN media_url TEXT DEFAULT NULL"); } catch {}
  try { db.run("ALTER TABLE tweets ADD COLUMN avatar_url TEXT DEFAULT NULL"); } catch {}

  db.run("CREATE INDEX IF NOT EXISTS idx_tweets_created ON tweets(created_at)");
  db.run("CREATE INDEX IF NOT EXISTS idx_tweets_likes ON tweets(likes DESC)");
  db.run("CREATE INDEX IF NOT EXISTS idx_tweets_author ON tweets(author_username)");
  db.run("CREATE INDEX IF NOT EXISTS idx_authors_mentions ON authors(total_mentions DESC)");

  saveDb();
  console.log('[db] initialized');
  return db;
}

export function getDb() {
  if (!db) throw new Error('Database not initialized. Call initDb() first.');
  return db;
}

export function saveDb() {
  if (!db) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  writeFileSync(DB_PATH, buffer);
}

// Helper: run a SELECT and return array of row objects
export function queryAll(sql, params = []) {
  const stmt = db.prepare(sql);
  if (params.length) stmt.bind(params);
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

// Helper: run a SELECT and return first row object or null
export function queryOne(sql, params = []) {
  const rows = queryAll(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

// Helper: run INSERT/UPDATE/DELETE
export function execute(sql, params = []) {
  db.run(sql, params);
  saveDb();
  return { changes: db.getRowsModified(), lastInsertRowid: queryOne("SELECT last_insert_rowid() as id")?.id };
}
