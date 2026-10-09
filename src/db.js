'use strict';
/*
 * Database layer. Two modes, chosen automatically:
 *
 *   DATABASE_URL is set  -> PostgreSQL (Neon, Supabase, Render Postgres...).
 *                           Use this on Render's Free plan: data lives outside the server.
 *   DATABASE_URL not set -> a SQLite file in DATA_DIR (default ./data).
 *                           For your own computer, or a server with a persistent disk.
 *
 * Queries are written once with "?" placeholders and work in both.
 */
const path = require('node:path');
const fs = require('node:fs');

let impl = null;

const toPg = (sql) => { let i = 0; return sql.replace(/\?/g, () => '$' + (++i)); };

async function init() {
  const url = (process.env.DATABASE_URL || '').trim();
  if (url) {
    const { Pool, types } = require('pg');
    types.setTypeParser(20, (v) => parseInt(v, 10));     // BIGINT comes back as a number
    types.setTypeParser(1700, (v) => parseFloat(v));     // NUMERIC (from SUM)
    const pool = new Pool({ connectionString: url, max: 5, idleTimeoutMillis: 30000, connectionTimeoutMillis: 20000 });
    // Cloud databases close idle connections; that must not stop the site.
    pool.on('error', (err) => console.error('Database connection dropped:', err.message));
    await pool.query('SELECT 1');
    impl = {
      kind: 'postgres',
      all: async (sql, p = []) => (await pool.query(toPg(sql), p)).rows,
      get: async (sql, p = []) => (await pool.query(toPg(sql), p)).rows[0],
      run: async (sql, p = []) => (await pool.query(toPg(sql), p)).rowCount,
      exec: async (sql) => { await pool.query(sql); },
      close: () => pool.end(),
    };
  } else {
    const { DatabaseSync } = require('node:sqlite');
    const dir = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
    fs.mkdirSync(dir, { recursive: true });
    const db = new DatabaseSync(path.join(dir, 'news.sqlite'));
    db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
    impl = {
      kind: 'sqlite',
      all: async (sql, p = []) => db.prepare(sql).all(...p),
      get: async (sql, p = []) => db.prepare(sql).get(...p),
      run: async (sql, p = []) => Number(db.prepare(sql).run(...p).changes),
      exec: async (sql) => { db.exec(sql); },
      close: () => db.close(),
    };
  }
  await migrate();
  return impl.kind;
}

async function migrate() {
  const pg = impl.kind === 'postgres';
  const ID = pg ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT';
  const BLOB = pg ? 'BYTEA' : 'BLOB';
  await impl.exec(`
    CREATE TABLE IF NOT EXISTS settings (name TEXT PRIMARY KEY, val TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS users (
      id ${ID}, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, created_at BIGINT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS categories (
      id ${ID}, name TEXT NOT NULL UNIQUE, sort INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS posts (
      id ${ID},
      title TEXT NOT NULL,
      summary TEXT NOT NULL DEFAULT '',
      body TEXT NOT NULL DEFAULT '',
      image TEXT NOT NULL DEFAULT '',
      image_caption TEXT NOT NULL DEFAULT '',
      category_id INTEGER,
      author TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'draft',
      is_featured INTEGER NOT NULL DEFAULT 0,
      is_breaking INTEGER NOT NULL DEFAULT 0,
      views INTEGER NOT NULL DEFAULT 0,
      published_at BIGINT NOT NULL,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_posts_pub ON posts(status, published_at);
    CREATE INDEX IF NOT EXISTS idx_posts_cat ON posts(category_id);
    CREATE TABLE IF NOT EXISTS images (
      name TEXT PRIMARY KEY, mime TEXT NOT NULL, data ${BLOB} NOT NULL, size INTEGER NOT NULL, created_at BIGINT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS login_attempts (who TEXT NOT NULL, ts BIGINT NOT NULL);
  `);
}

module.exports = {
  init,
  get kind() { return impl ? impl.kind : null; },
  all: (sql, p) => impl.all(sql, p),
  get: (sql, p) => impl.get(sql, p),
  run: (sql, p) => impl.run(sql, p),
  close: () => (impl ? impl.close() : undefined),
};
