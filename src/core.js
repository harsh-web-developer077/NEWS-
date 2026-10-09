'use strict';
/* Shared helpers: safe HTML, settings, dates, passwords, cookies, photos. */
const crypto = require('node:crypto');
const { promisify } = require('node:util');
const db = require('./db');
const strings = require('./lang');
const { escapeHtml } = require('./render');

const scrypt = promisify(crypto.scrypt);
const now = () => Math.floor(Date.now() / 1000);

/* ---------- Safe HTML ----------
 * html`...` escapes every inserted value. Only values wrapped in raw()
 * (or produced by another html`...`) are inserted as markup. */
class Raw {
  constructor(s) { this.s = s; }
  toString() { return this.s; }
}
const raw = (s) => new Raw(String(s ?? ''));
function esc(v) {
  if (v === null || v === undefined || v === false) return '';
  if (v instanceof Raw) return v.s;
  if (Array.isArray(v)) return v.map(esc).join('');
  return escapeHtml(v);
}
function html(parts, ...vals) {
  let out = '';
  parts.forEach((p, i) => { out += p; if (i < vals.length) out += esc(vals[i]); });
  return new Raw(out);
}
const fmt = (str, ...args) => { let i = 0; return String(str).replace(/%[sd]/g, () => String(args[i++] ?? '')); };

/* ---------- Settings + categories (kept in memory, refreshed on change) ---------- */
let settingsCache = null;
let catCache = null;

async function getSettings() {
  if (!settingsCache) {
    settingsCache = {};
    for (const r of await db.all('SELECT name, val FROM settings')) settingsCache[r.name] = r.val;
  }
  return settingsCache;
}
async function setSetting(name, val) {
  await db.run('INSERT INTO settings(name, val) VALUES(?, ?) ON CONFLICT(name) DO UPDATE SET val = excluded.val', [name, String(val)]);
  settingsCache = null;
}
async function getCategories() {
  if (!catCache) catCache = await db.all('SELECT * FROM categories ORDER BY sort, name');
  return catCache;
}
const clearCategories = () => { catCache = null; };
async function isInstalled() {
  return Number((await db.get('SELECT COUNT(*) AS n FROM users')).n) > 0;
}

/* ---------- Secret used to sign cookies ---------- */
let secret = null;
async function loadSecret() {
  if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 16) {
    secret = process.env.SESSION_SECRET;
    return;
  }
  const s = await getSettings();
  if (!s._secret) await setSetting('_secret', crypto.randomBytes(32).toString('hex'));
  secret = (await getSettings())._secret;
}
const sign = (text) => crypto.createHmac('sha256', secret).update(text).digest('base64url');
function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/* ---------- Dates in the site's time zone ---------- */
const ZONES = ['Asia/Kolkata', 'Asia/Kathmandu', 'Asia/Dhaka', 'Asia/Dubai', 'Asia/Singapore', 'Europe/London', 'America/New_York', 'UTC'];
const fmtCache = {};
function dateParts(ts, tz) {
  const f = fmtCache[tz] || (fmtCache[tz] = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, hourCycle: 'h23', weekday: 'short', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric',
  }));
  const p = {};
  for (const part of f.formatToParts(new Date(ts * 1000))) p[part.type] = part.value;
  return {
    y: +p.year, m: +p.month, d: +p.day, H: +p.hour % 24, M: +p.minute,
    w: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday),
  };
}
const two = (n) => String(n).padStart(2, '0');
/** Value for <input type="datetime-local">, in the site's time zone. */
function toLocalInput(ts, tz) {
  const p = dateParts(ts, tz);
  return `${p.y}-${two(p.m)}-${two(p.d)}T${two(p.H)}:${two(p.M)}`;
}
/** "2026-10-09T20:30" typed in the site's time zone -> unix seconds. */
function fromLocalInput(str, tz) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(String(str));
  if (!m) return null;
  const want = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  let guess = want;
  for (let i = 0; i < 2; i++) {
    const p = dateParts(Math.floor(guess / 1000), tz);
    guess += want - Date.UTC(p.y, p.m - 1, p.d, p.H, p.M);
  }
  return Math.floor(guess / 1000);
}
function startOfToday(tz) {
  const p = dateParts(now(), tz);
  return fromLocalInput(`${p.y}-${two(p.m)}-${two(p.d)}T00:00`, tz);
}
const MONTHS = {
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  hi: ['जनवरी', 'फ़रवरी', 'मार्च', 'अप्रैल', 'मई', 'जून', 'जुलाई', 'अगस्त', 'सितंबर', 'अक्टूबर', 'नवंबर', 'दिसंबर'],
};
const DAYS = {
  en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  hi: ['रविवार', 'सोमवार', 'मंगलवार', 'बुधवार', 'गुरुवार', 'शुक्रवार', 'शनिवार'],
};
function fmtDate(ts, tz, lang, withTime = true, withDay = false) {
  const p = dateParts(ts, tz);
  let s = `${p.d} ${MONTHS[lang][p.m - 1]} ${p.y}`;
  if (withDay) s = `${DAYS[lang][p.w]}, ${s}`;
  if (withTime) s += `, ${p.H % 12 || 12}:${two(p.M)} ${p.H < 12 ? 'AM' : 'PM'}`;
  return s;
}
const isoDate = (ts) => new Date(ts * 1000).toISOString();

/* ---------- Per-request context handed to the page templates ---------- */
async function buildCtx(req) {
  const s = await getSettings();
  const lang = s.lang === 'hi' ? 'hi' : 'en';
  const tz = ZONES.includes(s.timezone) ? s.timezone : 'Asia/Kolkata';
  const t = (key) => strings[lang][key] ?? strings.en[key] ?? key;
  let origin = (s.site_url || '').replace(/\/+$/, '');
  if (!origin) {
    const host = /^[A-Za-z0-9.-]+(:\d+)?$/.test(req.get('host') || '') ? req.get('host') : 'localhost';
    origin = `${req.protocol}://${host}`;
  }
  return {
    s, lang, tz, t, origin,
    now: now(),
    cats: await getCategories(),
    set: (k, d = '') => (s[k] ? s[k] : d),
    date: (ts, withTime = true, withDay = false) => fmtDate(Number(ts), tz, lang, withTime, withDay),
    ago: (ts) => {
      const diff = now() - Number(ts);
      if (diff < 60) return t('just_now');
      if (diff < 3600) return fmt(t('min_ago'), Math.floor(diff / 60));
      if (diff < 86400) return fmt(t('hour_ago'), Math.floor(diff / 3600));
      return fmtDate(Number(ts), tz, lang, false);
    },
  };
}

/* ---------- Posts ---------- */
const VISIBLE = "p.status = 'published' AND p.published_at <= ?";
function fetchPosts(where, params = [], limit = 10, offset = 0, order = 'p.published_at DESC, p.id DESC') {
  return db.all(
    `SELECT p.*, c.name AS category_name FROM posts p LEFT JOIN categories c ON c.id = p.category_id
     WHERE ${where} ORDER BY ${order} LIMIT ${limit | 0} OFFSET ${offset | 0}`, params);
}
async function countPosts(where, params = []) {
  return Number((await db.get(`SELECT COUNT(*) AS n FROM posts p WHERE ${where}`, params)).n);
}
const likeValue = (q) => '%' + q.toLowerCase().replace(/[\\%_]/g, (c) => '\\' + c) + '%';

/* ---------- Passwords ---------- */
async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`;
}
async function verifyPassword(password, stored) {
  const [kind, salt, hash] = String(stored || '').split('$');
  // Always do the slow work, so a wrong username takes as long as a wrong password.
  const key = await scrypt(password, Buffer.from(salt || 'AAAAAAAAAAAAAAAAAAAAAA==', 'base64'), 64);
  if (kind !== 'scrypt' || !hash) return false;
  const want = Buffer.from(hash, 'base64');
  return want.length === key.length && crypto.timingSafeEqual(want, key);
}
const passwordMark = (hash) => crypto.createHash('sha256').update(String(hash)).digest('hex').slice(0, 12);

/* ---------- Cookies ---------- */
function readCookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) {
      try { out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); } catch (e) { /* ignore broken cookie */ }
    }
  }
  return out;
}
function setCookie(req, res, name, value, maxAgeSec) {
  let c = `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax`;
  if (maxAgeSec !== undefined) c += `; Max-Age=${maxAgeSec}`;
  if (req.secure) c += '; Secure';
  res.append('Set-Cookie', c);
}

const SESSION_HOURS = 12;
function makeSession(user) {
  const payload = Buffer.from(JSON.stringify({ u: user.id, e: now() + SESSION_HOURS * 3600, p: passwordMark(user.password_hash) })).toString('base64url');
  return `${payload}.${sign('session:' + payload)}`;
}
/** Returns the logged-in user row, or null. Changing the password ends old logins. */
async function readSession(cookieValue) {
  const [payload, sig] = String(cookieValue || '').split('.');
  if (!payload || !sig || !safeEqual(sig, sign('session:' + payload))) return null;
  let data;
  try { data = JSON.parse(Buffer.from(payload, 'base64url').toString()); } catch (e) { return null; }
  if (!data || data.e < now()) return null;
  const user = await db.get('SELECT * FROM users WHERE id = ?', [data.u]);
  if (!user || passwordMark(user.password_hash) !== data.p) return null;
  user.sessionEnds = data.e;
  return user;
}
const csrfFor = (visitorId) => sign('csrf:' + visitorId);

/* ---------- Photos (stored in the database, so they survive restarts) ---------- */
const MAX_PHOTO_BYTES = 6 * 1024 * 1024;
function sniffImage(buf) {
  if (!buf || buf.length < 16) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { ext: 'jpg', mime: 'image/jpeg' };
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { ext: 'png', mime: 'image/png' };
  if (buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') return { ext: 'webp', mime: 'image/webp' };
  if (/^GIF8[79]a/.test(buf.toString('latin1', 0, 6))) return { ext: 'gif', mime: 'image/gif' };
  return null;
}
const imageCache = new Map();           // name -> { mime, data }
let imageCacheBytes = 0;
const IMAGE_CACHE_LIMIT = 48 * 1024 * 1024;

/** Stores an uploaded photo. Returns its name. Throws Error with a readable message. */
async function saveImage(buf) {
  const kind = sniffImage(buf);
  if (!kind) throw new Error('Only JPG, PNG, WEBP or GIF photos can be uploaded.');
  if (buf.length > MAX_PHOTO_BYTES) throw new Error('The photo is larger than 6 MB. Use a smaller one.');
  const d = new Date();
  const name = `${d.getUTCFullYear()}${two(d.getUTCMonth() + 1)}-${crypto.randomBytes(8).toString('hex')}.${kind.ext}`;
  await db.run('INSERT INTO images(name, mime, data, size, created_at) VALUES(?, ?, ?, ?, ?)', [name, kind.mime, buf, buf.length, now()]);
  return name;
}
/** Puts back a photo from a backup file under its original name. Returns true when it was added. */
async function restoreImage(name, buf) {
  const kind = sniffImage(buf);
  if (!/^[A-Za-z0-9._-]{5,80}$/.test(String(name)) || !kind || buf.length > MAX_PHOTO_BYTES) return false;
  if (await db.get('SELECT name FROM images WHERE name = ?', [name])) return false;
  await db.run('INSERT INTO images(name, mime, data, size, created_at) VALUES(?, ?, ?, ?, ?)', [name, kind.mime, buf, buf.length, now()]);
  return true;
}
async function loadImage(name) {
  if (!/^[A-Za-z0-9._-]{5,80}$/.test(name)) return null;
  if (imageCache.has(name)) return imageCache.get(name);
  const row = await db.get('SELECT mime, data FROM images WHERE name = ?', [name]);
  if (!row) return null;
  const img = { mime: row.mime, data: Buffer.from(row.data) };
  if (img.data.length < IMAGE_CACHE_LIMIT / 4) {
    while (imageCacheBytes + img.data.length > IMAGE_CACHE_LIMIT && imageCache.size) {
      const oldest = imageCache.keys().next().value;
      imageCacheBytes -= imageCache.get(oldest).data.length;
      imageCache.delete(oldest);
    }
    imageCache.set(name, img);
    imageCacheBytes += img.data.length;
  }
  return img;
}
async function deleteImage(name) {
  if (!name) return;
  await db.run('DELETE FROM images WHERE name = ?', [name]);
  if (imageCache.has(name)) {
    imageCacheBytes -= imageCache.get(name).data.length;
    imageCache.delete(name);
  }
}

module.exports = {
  now, raw, html, esc, fmt, Raw,
  getSettings, setSetting, getCategories, clearCategories, isInstalled,
  loadSecret, safeEqual,
  ZONES, toLocalInput, fromLocalInput, startOfToday, fmtDate, isoDate, buildCtx,
  VISIBLE, fetchPosts, countPosts, likeValue,
  hashPassword, verifyPassword,
  readCookies, setCookie, makeSession, readSession, csrfFor, SESSION_HOURS,
  MAX_PHOTO_BYTES, saveImage, restoreImage, loadImage, deleteImage,
};
