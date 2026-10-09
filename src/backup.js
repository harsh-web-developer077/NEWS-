'use strict';
/* Builds the backup file: one JSON record per line, so a large backup never has to fit in memory at once. */
const db = require('./db');
const core = require('./core');

// Settings that travel with a backup. Private ones (the cookie secret, the backup email) stay out.
const SETTING_KEYS = ['site_name', 'tagline', 'lang', 'about', 'default_author', 'contact_phone', 'contact_email', 'address', 'per_page', 'timezone',
  'facebook_url', 'youtube_url', 'instagram_url', 'whatsapp_url', 'site_url'];

async function* records(withPhotos) {
  const s = await core.getSettings();
  yield { type: 'news-backup', version: 1, created: new Date().toISOString(), site: s.site_name || 'News', photos: withPhotos };
  for (const k of SETTING_KEYS) if (s[k]) yield { type: 'setting', name: k, val: s[k] };
  for (const c of await db.all('SELECT * FROM categories ORDER BY sort, name')) yield { type: 'category', id: c.id, name: c.name, sort: c.sort };
  for (const g of await db.all('SELECT * FROM pages ORDER BY sort, id')) yield { type: 'page', slug: g.slug, title: g.title, body: g.body, show_form: g.show_form, sort: g.sort };
  for (let last = 0; ;) {
    const batch = await db.all('SELECT * FROM posts WHERE id > ? ORDER BY id LIMIT 100', [last]);
    if (!batch.length) break;
    for (const p of batch) yield { type: 'post', ...p };
    last = batch[batch.length - 1].id;
  }
  if (withPhotos) {
    for (const { name } of await db.all('SELECT name FROM images ORDER BY created_at, name')) {
      const row = await db.get('SELECT mime, data FROM images WHERE name = ?', [name]);
      if (row) yield { type: 'image', name, mime: row.mime, data: Buffer.from(row.data).toString('base64') };
    }
  }
}

/** The whole backup as one Buffer (used for email, where the file must be small anyway). */
async function build(withPhotos) {
  const parts = [];
  for await (const r of records(withPhotos)) parts.push(JSON.stringify(r) + '\n');
  return Buffer.from(parts.join(''), 'utf8');
}

async function stats() {
  const img = await db.get('SELECT COUNT(*) AS n, COALESCE(SUM(size), 0) AS bytes FROM images');
  return { posts: Number((await db.get('SELECT COUNT(*) AS n FROM posts')).n), images: Number(img.n), bytes: Number(img.bytes) };
}

const fileName = (tz, withPhotos) => `news-backup-${core.toLocalInput(core.now(), tz).slice(0, 10)}${withPhotos ? '-with-photos' : ''}.txt`;

module.exports = { SETTING_KEYS, records, build, stats, fileName };
