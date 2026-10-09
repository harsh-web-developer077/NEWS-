'use strict';
/*
 * News website + admin panel.
 * Start with:  npm install   then   npm start
 * Open http://localhost:3000 and the first-time setup page appears.
 */
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const readline = require('node:readline');
const crypto = require('node:crypto');
const express = require('express');
const multer = require('multer');

const db = require('./src/db');
const core = require('./src/core');
const V = require('./src/views');
const A = require('./src/admin-views');
const backup = require('./src/backup');
const mail = require('./src/mail');
const { html, now, VISIBLE, fetchPosts, countPosts } = core;

const PORT = Number(process.env.PORT) || 3000;
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);            // Render (and most hosts) sit behind one proxy

/* ---------- Every response ---------- */
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Content-Security-Policy': "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; font-src 'self'; "
      + "script-src 'self'; frame-src https://www.youtube-nocookie.com; form-action 'self'; base-uri 'self'; frame-ancestors 'self'",
  });
  next();
});
app.get('/healthz', (req, res) => res.type('text').send('ok'));
app.use('/assets', express.static(path.join(__dirname, 'public', 'assets'), { maxAge: '7d', index: false }));

/* ---------- First run: nothing works until an admin exists ---------- */
let installed = false;
app.use(async (req, res, next) => {
  if (!installed) installed = await core.isInstalled();
  if (!installed && !req.path.startsWith('/admin/setup')) return res.redirect('/admin/setup');
  req.ctx = await core.buildCtx(req);
  mail.seen(req.ctx.origin);           // lets due email copies go out; never waits for them
  next();
});

const pageParam = (req) => Math.max(1, parseInt(req.query.page, 10) || 1);
const perPage = (ctx) => Math.max(4, Math.min(40, parseInt(ctx.set('per_page', '10'), 10) || 10));
const str = (v, max) => String(typeof v === 'string' ? v : '').trim().slice(0, max);
const mostRead = (ctx) => fetchPosts(`${VISIBLE} AND p.views > 0 AND p.published_at >= ?`, [ctx.now, ctx.now - 30 * 86400], 5, 0, 'p.views DESC, p.published_at DESC');
/** How many public stories each category has: { categoryId: count }. */
async function categoryCounts(ctx) {
  const out = {};
  for (const r of await db.all("SELECT category_id, COUNT(*) AS n FROM posts p WHERE " + VISIBLE + " AND category_id IS NOT NULL GROUP BY category_id", [ctx.now])) out[r.category_id] = Number(r.n);
  return out;
}
/** Newest stories of every category in one query: [{ cat, posts: [up to 4] }], in menu order. */
async function categoryBlocks(ctx) {
  const rows = await db.all(
    `SELECT * FROM (
       SELECT p.*, c.name AS category_name,
              ROW_NUMBER() OVER (PARTITION BY p.category_id ORDER BY p.published_at DESC, p.id DESC) AS rn
       FROM posts p JOIN categories c ON c.id = p.category_id
       WHERE ${VISIBLE}
     ) t WHERE rn <= 4 ORDER BY published_at DESC, id DESC`, [ctx.now]);
  return ctx.cats
    .map((cat) => ({ cat, posts: rows.filter((r) => r.category_id === cat.id) }))
    .filter((b) => b.posts.length);
}

/* ====================== Public site ====================== */

app.get('/', async (req, res) => {
  const ctx = req.ctx;
  const n = perPage(ctx);
  // Lead story: the newest one marked "top story", otherwise simply the newest.
  const lead = (await fetchPosts(`${VISIBLE} AND p.is_featured = 1`, [ctx.now], 1))[0] || (await fetchPosts(VISIBLE, [ctx.now], 1))[0] || null;
  // Next to the lead: two photo tiles, then a strip of four cards.
  const next = lead ? await fetchPosts(`${VISIBLE} AND p.id != ?`, [ctx.now, lead.id], 6) : [];
  const skip = (lead ? [lead] : []).concat(next).map((p) => Number(p.id));
  const notIn = skip.length ? ` AND p.id NOT IN (${skip.join(',')})` : '';
  const total = await countPosts(VISIBLE + notIn, [ctx.now]);
  const pages = Math.max(1, Math.ceil(total / n));
  const page = Math.min(pageParam(req), pages);
  res.send(V.homePage(ctx, {
    lead, page, pages,
    side: next.slice(0, 2),
    strip: next.slice(2, 6),
    latest: await fetchPosts(VISIBLE + notIn, [ctx.now], n, (page - 1) * n),
    breaking: page === 1 ? await fetchPosts(`${VISIBLE} AND p.is_breaking = 1 AND p.published_at >= ?`, [ctx.now, ctx.now - 86400], 5) : [],
    blocks: page === 1 ? await categoryBlocks(ctx) : [],
    counts: await categoryCounts(ctx),
    mostRead: await mostRead(ctx),
  }));
});

app.get('/news/:id', async (req, res, next) => {
  const ctx = req.ctx;
  const id = /^\d{1,9}$/.test(req.params.id) ? Number(req.params.id) : 0;
  const post = id ? (await fetchPosts('p.id = ?', [id], 1))[0] : null;
  if (!post) return next();
  // Drafts and scheduled stories open only for the logged-in admin (Preview button).
  const isPublic = post.status === 'published' && post.published_at <= ctx.now;
  if (!isPublic && !(await core.readSession(core.readCookies(req).ns))) return next();
  const ua = String(req.get('user-agent') || '').toLowerCase();
  if (isPublic && ua && !/bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp/.test(ua)) {
    await db.run('UPDATE posts SET views = views + 1 WHERE id = ?', [id]);
  }
  if (!isPublic) res.set('Cache-Control', 'no-store');
  res.send(V.articlePage(ctx, {
    post, preview: !isPublic,
    related: post.category_id ? await fetchPosts(`${VISIBLE} AND p.category_id = ? AND p.id != ?`, [ctx.now, post.category_id, id], 3) : [],
    moreNews: await fetchPosts(`${VISIBLE} AND p.id != ?`, [ctx.now, id], 6),
    mostRead: await mostRead(ctx),
  }));
});

app.get('/category/:id', async (req, res, next) => {
  const ctx = req.ctx;
  const cat = ctx.cats.find((c) => String(c.id) === req.params.id);
  if (!cat) return next();
  const n = Math.ceil(perPage(ctx) / 3) * 3 + 1;       // one large story + full rows of three
  const where = `${VISIBLE} AND p.category_id = ?`;
  const total = await countPosts(where, [ctx.now, cat.id]);
  const pages = Math.max(1, Math.ceil(total / n));
  const page = Math.min(pageParam(req), pages);
  res.send(V.categoryPage(ctx, { cat, total, page, pages, posts: await fetchPosts(where, [ctx.now, cat.id], n, (page - 1) * n), mostRead: await mostRead(ctx), counts: await categoryCounts(ctx) }));
});

app.get('/search', async (req, res) => {
  const ctx = req.ctx;
  const q = str(req.query.q, 80);
  let posts = [];
  let pages = 1;
  let page = 1;
  if (q !== '') {
    const like = core.likeValue(q);
    const where = `${VISIBLE} AND (LOWER(p.title) LIKE ? ESCAPE '\\' OR LOWER(p.summary) LIKE ? ESCAPE '\\' OR LOWER(p.body) LIKE ? ESCAPE '\\')`;
    const params = [ctx.now, like, like, like];
    pages = Math.max(1, Math.ceil((await countPosts(where, params)) / 12));
    page = Math.min(pageParam(req), pages);
    posts = await fetchPosts(where, params, 12, (page - 1) * 12);
  }
  res.send(V.searchPage(ctx, { q, posts, page, pages, mostRead: await mostRead(ctx), counts: await categoryCounts(ctx) }));
});

// Photos are kept in the database and served from here.
app.get('/uploads/:name', async (req, res, next) => {
  const img = await core.loadImage(req.params.name);
  if (!img) return next();
  res.set({ 'Content-Type': img.mime, 'Cache-Control': 'public, max-age=31536000, immutable' });
  res.send(img.data);
});

app.get('/feed.xml', async (req, res) => {
  res.type('application/rss+xml').send(V.feedXml(req.ctx, await fetchPosts(VISIBLE, [req.ctx.now], 20)));
});
app.get('/sitemap.xml', async (req, res) => {
  res.type('application/xml').send(V.sitemapXml(req.ctx, await fetchPosts(VISIBLE, [req.ctx.now], 2000)));
});
app.get('/robots.txt', (req, res) => {
  res.type('text').send(`User-agent: *\nDisallow: /admin\nSitemap: ${req.ctx.origin}/sitemap.xml\n`);
});

/* ====================== Admin panel ====================== */

const admin = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: core.MAX_PHOTO_BYTES, files: 1, fields: 40, fieldSize: 2 * 1024 * 1024 },
});
const TOO_BIG = 'That photo is larger than 6 MB. Use a smaller one.';

admin.use(express.urlencoded({ extended: false, limit: '2mb' }));
admin.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  req.cookies = core.readCookies(req);
  // An anonymous id cookie; form tokens are derived from it (CSRF protection).
  let visitor = req.cookies.nv;
  if (!/^[a-f0-9]{32}$/.test(visitor || '')) {
    visitor = crypto.randomBytes(16).toString('hex');
    core.setCookie(req, res, 'nv', visitor, 30 * 86400);
  }
  req.csrf = core.csrfFor(visitor);
  next();
});

function flash(req, res, msg, type = 'ok') {
  req.flashOut = (req.flashOut || []).concat([[type, msg]]);
  core.setCookie(req, res, 'nf', JSON.stringify(req.flashOut), 60);
}
/** Everything an admin page template needs. Shows waiting messages once. */
function pageArgs(req, res) {
  let waiting = [];
  if (req.cookies.nf) {
    try { waiting = JSON.parse(req.cookies.nf).filter((f) => Array.isArray(f) && f.length === 2).slice(0, 5); } catch (e) { /* ignore */ }
    core.setCookie(req, res, 'nf', '', 0);
  }
  const temporary = process.env.RENDER && db.kind === 'sqlite' && !process.env.DATA_DIR;
  return {
    ctx: req.ctx, csrf: req.csrf, user: req.user, flash: waiting, unread: req.unread || 0,
    warning: temporary ? 'This server does not keep files: news and photos added now will be lost when it restarts. Add a DATABASE_URL to keep them (see DEPLOY-RENDER.md).' : '',
  };
}
function checkCsrf(req, res, next) {
  if (core.safeEqual((req.body && req.body.csrf) || '', req.csrf)) return next();
  res.status(400).send(A.messagePage(pageArgs(req, res), 'This form expired', 'Go back, reload the page and try again.'));
}
async function requireLogin(req, res, next) {
  const user = await core.readSession(req.cookies.ns);
  if (!user) return res.redirect('/admin/login');
  // Keep active admins logged in.
  if (user.sessionEnds - now() < (core.SESSION_HOURS / 2) * 3600) core.setCookie(req, res, 'ns', core.makeSession(user));
  req.user = user;
  next();
}

/* ----- Setup (open only while no admin exists) ----- */
const isFresh = async () => Number((await db.get('SELECT (SELECT COUNT(*) FROM posts) + (SELECT COUNT(*) FROM categories) AS n')).n) === 0;

admin.get('/setup', async (req, res) => {
  if (await core.isInstalled()) return res.redirect('/admin/login');
  req.ctx = req.ctx || await core.buildCtx(req);
  res.send(A.setupPage(pageArgs(req, res), { site_name: req.ctx.set('site_name'), lang: req.ctx.set('lang', 'hi'), username: '' }, [], await isFresh()));
});
admin.post('/setup', checkCsrf, async (req, res) => {
  if (await core.isInstalled()) return res.redirect('/admin/login');
  req.ctx = req.ctx || await core.buildCtx(req);
  const v = { site_name: str(req.body.site_name, 60), lang: req.body.lang === 'en' ? 'en' : 'hi', username: str(req.body.username, 40) };
  const pass = String(req.body.password || '');
  const errors = [];
  if (v.site_name === '') errors.push('Enter a name for your news site.');
  if (!/^[A-Za-z0-9_.-]{3,30}$/.test(v.username)) errors.push('Username must be 3 to 30 letters or numbers, without spaces.');
  if (pass.length < 8) errors.push('Password must be at least 8 characters.');
  else if (pass !== String(req.body.password2 || '')) errors.push('The two passwords do not match.');
  const fresh = await isFresh();
  if (errors.length) return res.send(A.setupPage(pageArgs(req, res), v, errors, fresh));

  const hash = await core.hashPassword(pass);
  if (await core.isInstalled()) return res.redirect('/admin/login');
  await db.run('INSERT INTO users(username, password_hash, created_at) VALUES(?, ?, ?)', [v.username, hash, now()]);
  installed = true;
  const user = await db.get('SELECT * FROM users WHERE LOWER(username) = LOWER(?)', [v.username]);

  if (fresh) {
    const names = v.lang === 'hi' ? ['स्थानीय', 'प्रदेश', 'देश', 'व्यापार', 'खेल', 'मनोरंजन'] : ['Local', 'State', 'National', 'Business', 'Sports', 'Entertainment'];
    for (let i = 0; i < names.length; i++) await db.run('INSERT INTO categories(name, sort) VALUES(?, ?)', [names[i], i + 1]);
    core.clearCategories();
    const first = (await core.getCategories())[0];
    const sample = v.lang === 'hi' ? {
      title: 'आपकी न्यूज़ वेबसाइट तैयार है',
      summary: 'यह एक नमूना खबर है। एडमिन पैनल से इसे हटाएँ और अपनी पहली खबर डालें।',
      body: 'यह खबर सिर्फ़ यह दिखाने के लिए है कि आपकी साइट पर खबर कैसी दिखेगी।\n\n## रोज़ खबर कैसे डालें\n\n1. एडमिन पैनल में **Add news** खोलें।\n2. शीर्षक, खबर और फ़ोटो डालें, फिर श्रेणी चुनें।\n3. **Publish** दबाएँ। खबर तुरंत होम पेज पर आ जाएगी।\n\n> सबसे बड़ी खबर को होम पेज पर सबसे ऊपर दिखाने के लिए “Show as top story” चुनें।\n\nइस नमूना खबर को **All news** से हटा दें।',
    } : {
      title: 'Your news site is ready',
      summary: 'This is a sample story. Delete it from the admin panel and publish your first one.',
      body: 'This story only shows how news will look on your site.\n\n## How to add news every day\n\n1. Open **Add news** in the admin panel.\n2. Type the headline and the story, add a photo and pick a category.\n3. Press **Publish**. The story appears on the home page straight away.\n\n> Tick “Show as top story” to put your biggest story at the top of the home page.\n\nDelete this sample story from **All news**.',
    };
    await db.run(
      "INSERT INTO posts(title, summary, body, category_id, author, status, published_at, created_at, updated_at) VALUES(?, ?, ?, ?, ?, 'published', ?, ?, ?)",
      [sample.title, sample.summary, sample.body, first.id, v.username, now(), now(), now()]);
  }
  await core.setSetting('site_name', v.site_name);
  await core.setSetting('lang', v.lang);
  if (!req.ctx.set('default_author')) await core.setSetting('default_author', v.username);
  await core.ensurePages();

  core.setCookie(req, res, 'ns', core.makeSession(user));
  flash(req, res, fresh ? 'Your site is ready. Add your first story from “Add news”.' : 'New login created. Your news and settings are unchanged.');
  res.redirect('/admin');
});

/* ----- Login / logout ----- */
admin.get('/login', async (req, res) => {
  if (await core.readSession(req.cookies.ns)) return res.redirect('/admin');
  res.send(A.loginPage(pageArgs(req, res), '', ''));
});
admin.post('/login', checkCsrf, async (req, res) => {
  const username = str(req.body.username, 40);
  const keys = ['ip:' + req.ip, 'user:' + username.toLowerCase()];
  await db.run("DELETE FROM login_attempts WHERE ts < ? AND who NOT LIKE 'msg:%'", [now() - 900]);
  // Counted per address and per username, so changing one of them does not help a guesser.
  const count = async (who) => Number((await db.get('SELECT COUNT(*) AS n FROM login_attempts WHERE who = ?', [who])).n);
  if (Math.max(await count(keys[0]), await count(keys[1])) >= 8) {
    return res.send(A.loginPage(pageArgs(req, res), username, 'Too many wrong attempts. Wait 15 minutes and try again.'));
  }

  const user = await db.get('SELECT * FROM users WHERE LOWER(username) = LOWER(?)', [username]);
  const ok = await core.verifyPassword(String(req.body.password || ''), user ? user.password_hash : '');
  if (!user || !ok) {
    for (const who of keys) await db.run('INSERT INTO login_attempts(who, ts) VALUES(?, ?)', [who, now()]);
    return res.send(A.loginPage(pageArgs(req, res), username, 'Wrong username or password.'));
  }
  await db.run('DELETE FROM login_attempts WHERE who = ? OR who = ?', keys);
  core.setCookie(req, res, 'ns', core.makeSession(user));
  res.redirect('/admin');
});
admin.post('/logout', checkCsrf, (req, res) => {
  core.setCookie(req, res, 'ns', '', 0);
  res.redirect('/admin/login');
});

admin.use(requireLogin);
// Number shown next to "Messages" in the admin menu.
admin.use(async (req, res, next) => {
  req.unread = Number((await db.get('SELECT COUNT(*) AS n FROM messages WHERE is_read = 0')).n);
  next();
});

/* ----- All news ----- */
admin.get('/', async (req, res) => {
  const ctx = req.ctx;
  let show = String(req.query.show || 'all');
  const q = str(req.query.q, 80);
  let where = '1 = 1';
  const params = [];
  if (show === 'published') { where = "p.status = 'published' AND p.published_at <= ?"; params.push(ctx.now); }
  else if (show === 'draft') where = "p.status = 'draft'";
  else if (show === 'scheduled') { where = "p.status = 'published' AND p.published_at > ?"; params.push(ctx.now); }
  else show = 'all';
  if (q !== '') { where += " AND LOWER(p.title) LIKE ? ESCAPE '\\'"; params.push(core.likeValue(q)); }

  const total = await countPosts(where, params);
  const pages = Math.max(1, Math.ceil(total / 20));
  const page = Math.min(pageParam(req), pages);
  const today = core.startOfToday(ctx.tz);
  const qs = new URLSearchParams();
  if (show !== 'all') qs.set('show', show);
  if (q) qs.set('q', q);
  if (page > 1) qs.set('page', page);
  res.send(A.listPage(pageArgs(req, res), {
    show, q, page, pages, qs: qs.toString(),
    posts: await fetchPosts(where, params, 20, (page - 1) * 20),
    stats: [
      ['Published today', await countPosts("p.status = 'published' AND p.published_at >= ? AND p.published_at <= ?", [today, ctx.now])],
      ['Published in total', await countPosts("p.status = 'published' AND p.published_at <= ?", [ctx.now])],
      ['Drafts', await countPosts("p.status = 'draft'")],
      ['Total views', Number((await db.get('SELECT COALESCE(SUM(views), 0) AS n FROM posts')).n)],
    ],
  }));
});
admin.post('/delete', checkCsrf, async (req, res) => {
  const id = parseInt(req.body.id, 10) || 0;
  const post = id ? await db.get('SELECT image FROM posts WHERE id = ?', [id]) : null;
  if (post) {
    await db.run('DELETE FROM posts WHERE id = ?', [id]);
    await core.deleteImage(post.image);
    flash(req, res, 'Story deleted.');
  }
  const back = String(req.body.back || '').replace(/^\?/, '');
  res.redirect('/admin' + (/^[A-Za-z0-9=&%+._-]{1,300}$/.test(back) ? '?' + back : ''));
});

/* ----- Add / edit a story ----- */
const blankPost = (req) => ({
  id: 0, title: '', summary: '', body: '', image: '', image_caption: '', category_id: null,
  author: req.ctx.set('default_author', req.user.username), status: 'draft', is_featured: 0, is_breaking: 0, published_at: now(),
});
const loadPost = (id) => (/^\d{1,9}$/.test(String(id)) ? db.get('SELECT * FROM posts WHERE id = ?', [Number(id)]) : null);

admin.get('/post', (req, res) => res.send(A.postPage(pageArgs(req, res), blankPost(req), [], true)));
admin.get('/post/:id', async (req, res) => {
  const post = await loadPost(req.params.id);
  if (!post) { flash(req, res, 'That story no longer exists.', 'error'); return res.redirect('/admin'); }
  res.send(A.postPage(pageArgs(req, res), post, [], false));
});

// A photo that is too large must not crash the form; send the editor back with a message.
const photoField = (field) => (req, res, next) => upload.single(field)(req, res, (err) => {
  if (!err) return next();
  if (req.path === '/upload') return res.json({ ok: false, error: err.code === 'LIMIT_FILE_SIZE' ? TOO_BIG : 'The photo could not be uploaded. Try again.' });
  flash(req, res, err.code === 'LIMIT_FILE_SIZE' ? TOO_BIG : 'The form could not be read. Try again.', 'error');
  res.redirect(req.originalUrl);
});

async function savePost(req, res) {
  const ctx = req.ctx;
  const isNew = !req.params.id;
  const post = isNew ? blankPost(req) : await loadPost(req.params.id);
  if (!post) { flash(req, res, 'That story no longer exists.', 'error'); return res.redirect('/admin'); }
  const b = req.body;
  const oldImage = post.image;
  const wasDraft = isNew || post.status === 'draft';
  const storedTime = post.published_at;
  const errors = [];

  post.title = str(b.title, 200);
  post.summary = str(b.summary, 400);
  post.body = String(b.body || '').trim();
  post.image_caption = str(b.image_caption, 200);
  post.author = str(b.author, 80);
  post.is_featured = b.is_featured ? 1 : 0;
  post.is_breaking = b.is_breaking ? 1 : 0;
  post.status = b.action === 'publish' ? 'published' : 'draft';
  const cat = ctx.cats.find((c) => String(c.id) === String(b.category_id));
  post.category_id = cat ? cat.id : null;

  // Publish time. A story going live for the first time gets the current time,
  // unless a different date was picked on purpose (back-dating or scheduling).
  const when = str(b.published_at, 16);
  const goingLive = post.status === 'published' && wasDraft;
  if (when === '' || (goingLive && when === core.toLocalInput(storedTime, ctx.tz))) {
    if (isNew || goingLive) post.published_at = now();
  } else {
    const ts = core.fromLocalInput(when, ctx.tz);
    if (ts) post.published_at = ts; else errors.push('The publish date is not valid.');
  }

  if (post.title === '') errors.push('Type a headline.');
  if (post.body === '' && post.status === 'published') errors.push('Type the story before publishing. To finish it later, use “Save as draft”.');

  if (!errors.length && req.file) {
    try { post.image = await core.saveImage(req.file.buffer); } catch (e) { errors.push(e.message); }
  } else if (b.remove_image) {
    post.image = '';
    post.image_caption = '';
  }

  if (errors.length) {
    if (!b.remove_image) post.image = oldImage;    // keep the old photo on screen
    return res.send(A.postPage(pageArgs(req, res), post, errors, isNew));
  }

  const t = now();
  const fields = [post.title, post.summary, post.body, post.image, post.image_caption, post.category_id, post.author, post.status,
    post.is_featured, post.is_breaking, post.published_at, t];
  let id = post.id;
  if (isNew) {
    id = (await db.get(
      `INSERT INTO posts(title, summary, body, image, image_caption, category_id, author, status, is_featured, is_breaking, published_at, updated_at, created_at)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id`, fields.concat([t]))).id;
  } else {
    await db.run(
      `UPDATE posts SET title=?, summary=?, body=?, image=?, image_caption=?, category_id=?, author=?, status=?, is_featured=?, is_breaking=?, published_at=?, updated_at=?
       WHERE id=?`, fields.concat([id]));
  }
  if (oldImage && oldImage !== post.image) await core.deleteImage(oldImage);

  if (post.status === 'draft') flash(req, res, 'Draft saved. It is not on the website yet.');
  else if (post.published_at > t) flash(req, res, `Scheduled. It will appear on the website on ${ctx.date(post.published_at)}.`);
  else flash(req, res, 'Published. The story is live on the website.');
  mail.sweep();                         // email copy of a newly published story, in the background
  res.redirect('/admin/post/' + id);
}
admin.post('/post', photoField('image'), checkCsrf, savePost);
admin.post('/post/:id', photoField('image'), checkCsrf, savePost);

// "Photo" button in the story editor. Answers in JSON.
admin.post('/upload', photoField('photo'), async (req, res) => {
  if (!core.safeEqual((req.body && req.body.csrf) || '', req.csrf)) return res.status(400).json({ ok: false, error: 'This page expired. Save your text, reload and try again.' });
  if (!req.file) return res.json({ ok: false, error: 'No photo was received. Try again.' });
  try {
    res.json({ ok: true, path: 'uploads/' + await core.saveImage(req.file.buffer) });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

/* ----- Categories ----- */
admin.get('/categories', async (req, res) => {
  res.send(A.categoriesPage(pageArgs(req, res),
    await db.all('SELECT c.*, (SELECT COUNT(*) FROM posts p WHERE p.category_id = c.id) AS n FROM categories c ORDER BY c.sort, c.name')));
});
admin.post('/categories', checkCsrf, async (req, res) => {
  const id = parseInt(req.body.id, 10) || 0;
  const name = str(req.body.name, 40);
  const sort = Math.max(0, Math.min(999, parseInt(req.body.sort, 10) || 0));
  try {
    if (req.body.action === 'add') {
      if (name === '') flash(req, res, 'Type a category name.', 'error');
      else {
        const next = Number((await db.get('SELECT COALESCE(MAX(sort), 0) + 1 AS n FROM categories')).n);
        await db.run('INSERT INTO categories(name, sort) VALUES(?, ?)', [name, next]);
        flash(req, res, 'Category added.');
      }
    } else if (req.body.action === 'save' && id) {
      if (name === '') flash(req, res, 'A category needs a name.', 'error');
      else { await db.run('UPDATE categories SET name = ?, sort = ? WHERE id = ?', [name, sort, id]); flash(req, res, 'Category saved.'); }
    } else if (req.body.action === 'delete' && id) {
      await db.run('UPDATE posts SET category_id = NULL WHERE category_id = ?', [id]);
      await db.run('DELETE FROM categories WHERE id = ?', [id]);
      flash(req, res, 'Category deleted. Its stories are kept, without a category.');
    }
  } catch (e) {
    if (!/unique/i.test(String(e.message))) throw e;
    flash(req, res, 'A category with that name already exists.', 'error');
  }
  core.clearCategories();
  res.redirect('/admin/categories');
});

/* ----- Settings + password ----- */
admin.get('/settings', (req, res) => res.send(A.settingsPage(pageArgs(req, res))));
admin.post('/settings', checkCsrf, async (req, res) => {
  const b = req.body;
  const cleanUrl = (v) => (/^https?:\/\/[^\s<>"']+$/i.test(str(v, 300)) ? str(v, 300) : '');
  const name = str(b.site_name, 60);
  if (name === '') flash(req, res, 'The site name cannot be empty.', 'error');
  else {
    const email = str(b.contact_email, 120);
    const values = {
      site_name: name,
      tagline: str(b.tagline, 120),
      lang: b.lang === 'hi' ? 'hi' : 'en',
      about: str(b.about, 600),
      default_author: str(b.default_author, 80),
      contact_phone: str(b.contact_phone, 40),
      contact_email: /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/.test(email) ? email : '',
      address: str(b.address, 300),
      per_page: String(Math.max(4, Math.min(40, parseInt(b.per_page, 10) || 10))),
      timezone: core.ZONES.includes(b.timezone) ? b.timezone : 'Asia/Kolkata',
    };
    for (const k of ['facebook_url', 'youtube_url', 'instagram_url', 'whatsapp_url', 'site_url']) values[k] = cleanUrl(b[k]);
    for (const [k, v] of Object.entries(values)) await core.setSetting(k, v);
    flash(req, res, 'Settings saved.');
  }
  res.redirect('/admin/settings');
});
admin.post('/password', checkCsrf, async (req, res) => {
  const fresh = String(req.body.new_password || '');
  if (!(await core.verifyPassword(String(req.body.current_password || ''), req.user.password_hash))) flash(req, res, 'The current password is wrong.', 'error');
  else if (fresh.length < 8) flash(req, res, 'The new password must be at least 8 characters.', 'error');
  else if (fresh !== String(req.body.new_password2 || '')) flash(req, res, 'The two new passwords do not match.', 'error');
  else {
    const hash = await core.hashPassword(fresh);
    await db.run('UPDATE users SET password_hash = ? WHERE id = ?', [hash, req.user.id]);
    core.setCookie(req, res, 'ns', core.makeSession({ id: req.user.id, password_hash: hash }));
    flash(req, res, 'Password changed.');
  }
  res.redirect('/admin/settings');
});

/* ----- Backup: download everything as one file, and put it back ----- */
const SETTING_KEYS = backup.SETTING_KEYS;

async function backupPageData() {
  const cfg = await mail.config();
  return {
    kind: db.kind, ...(await backup.stats()),
    mail: {
      hasKey: cfg.hasKey, email: cfg.email, stories: cfg.stories, weekly: cfg.weekly, messages: cfg.messages,
      lastBackup: Number(cfg.s._last_backup_mail || 0),
      copies: Number((await db.get('SELECT COUNT(*) AS n FROM mailed_posts')).n),
    },
  };
}
admin.get('/backup', async (req, res) => res.send(A.backupPage(pageArgs(req, res), await backupPageData())));

admin.get('/backup/download', async (req, res) => {
  const withPhotos = req.query.photos === '1';
  res.set({ 'Content-Type': 'text/plain; charset=utf-8', 'Content-Disposition': `attachment; filename="${backup.fileName(req.ctx.tz, withPhotos)}"` });
  for await (const record of backup.records(withPhotos)) {
    if (!res.write(JSON.stringify(record) + '\n')) await new Promise((resolve) => res.once('drain', resolve));
  }
  res.end();
});

/* ----- Copies to the owner's email ----- */
admin.post('/backup/email', checkCsrf, async (req, res) => {
  const email = str(req.body.backup_email, 120);
  if (email !== '' && !mail.validEmail(email)) flash(req, res, 'That email address does not look right. Check it and save again.', 'error');
  else {
    await core.setSetting('backup_email', email);
    await core.setSetting('mail_stories', req.body.mail_stories ? '1' : '0');
    await core.setSetting('mail_weekly', req.body.mail_weekly ? '1' : '0');
    await core.setSetting('mail_messages', req.body.mail_messages ? '1' : '0');
    flash(req, res, email ? 'Email choices saved.' : 'Email address removed. No copies will be sent.');
  }
  res.redirect('/admin/backup');
});
admin.post('/backup/email-now', checkCsrf, async (req, res) => {
  const cfg = await mail.config();
  if (!cfg.hasKey) flash(req, res, 'Email is not set up on this server yet. Follow the steps shown on this page first.', 'error');
  else if (!cfg.ready) flash(req, res, 'Type your email address and save it first.', 'error');
  else {
    const r = await mail.mailBackup(cfg);
    if (r.ok) flash(req, res, `Backup sent to ${cfg.email} with ${r.stories} stories${r.withPhotos ? ' and all photos' : ' (photos are too large for email)'}. Check your inbox, and the Spam folder the first time.`);
    else flash(req, res, `The email was not sent. The email service says: ${r.error}`, 'error');
  }
  res.redirect('/admin/backup');
});

const backupUpload = multer({ dest: os.tmpdir(), limits: { fileSize: 500 * 1024 * 1024, files: 1, fields: 5 } });
const backupField = (req, res, next) => backupUpload.single('backup')(req, res, (err) => {
  if (!err) return next();
  flash(req, res, err.code === 'LIMIT_FILE_SIZE' ? 'That file is larger than 500 MB and cannot be restored here.' : 'The file could not be read. Try again.', 'error');
  res.redirect('/admin/backup');
});

admin.post('/backup/restore', backupField, checkCsrf, async (req, res) => {
  if (!req.file) { flash(req, res, 'Choose a backup file first.', 'error'); return res.redirect('/admin/backup'); }
  const text = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
  const int = (v, d = 0) => (Number.isFinite(Number(v)) ? Math.trunc(Number(v)) : d);
  const added = { posts: 0, images: 0, cats: 0, pages: 0 };
  let already = 0;
  let isBackup = false;
  let firstLine = true;
  const catIds = {};                      // id in the file -> id on this site
  const byName = new Map((await db.all('SELECT id, name FROM categories')).map((c) => [c.name.toLowerCase(), c.id]));
  const current = await core.getSettings();
  try {
    const reader = readline.createInterface({ input: fs.createReadStream(req.file.path, 'utf8'), crlfDelay: Infinity });
    for await (const raw of reader) {
      if (!raw.trim()) continue;
      let r;
      try { r = JSON.parse(raw); } catch (e) { if (firstLine) break; continue; }
      if (firstLine) {
        firstLine = false;
        if (!r || r.type !== 'news-backup') break;
        isBackup = true;
        continue;
      }
      if (!r || typeof r !== 'object') continue;
      if (r.type === 'category') {
        const name = text(r.name, 40).trim();
        if (!name) continue;
        if (!byName.has(name.toLowerCase())) {
          const row = await db.get('INSERT INTO categories(name, sort) VALUES(?, ?) RETURNING id', [name, Math.max(0, Math.min(999, int(r.sort)))]);
          byName.set(name.toLowerCase(), row.id);
          added.cats++;
        }
        catIds[r.id] = byName.get(name.toLowerCase());
      } else if (r.type === 'post') {
        const title = text(r.title, 200).trim();
        const published = int(r.published_at, now());
        if (!title) continue;
        if (await db.get('SELECT id FROM posts WHERE title = ? AND published_at = ?', [title, published])) { already++; continue; }
        const image = /^[A-Za-z0-9._-]{5,80}$/.test(String(r.image || '')) ? r.image : '';
        await db.run(
          `INSERT INTO posts(title, summary, body, image, image_caption, category_id, author, status, is_featured, is_breaking, views, published_at, created_at, updated_at)
           VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [title, text(r.summary, 400), text(r.body, 500000), image, text(r.image_caption, 200), catIds[r.category_id] || null, text(r.author, 80),
            r.status === 'published' ? 'published' : 'draft', r.is_featured ? 1 : 0, r.is_breaking ? 1 : 0, Math.max(0, int(r.views)),
            published, int(r.created_at, published), int(r.updated_at, published)]);
        added.posts++;
      } else if (r.type === 'image') {
        if (typeof r.data === 'string' && await core.restoreImage(r.name, Buffer.from(r.data, 'base64'))) added.images++;
      } else if (r.type === 'page') {
        const title = text(r.title, 80).trim();
        if (title && core.validSlug(r.slug) && !(await db.get('SELECT id FROM pages WHERE slug = ?', [r.slug]))) {
          await db.run('INSERT INTO pages(slug, title, body, show_form, sort, updated_at) VALUES(?, ?, ?, ?, ?, ?)',
            [r.slug, title, text(r.body, 200000), r.show_form ? 1 : 0, Math.max(0, Math.min(999, int(r.sort))), now()]);
          added.pages++;
        }
      } else if (r.type === 'setting') {
        // Settings are filled in only where this site has none, so a restore never changes your current setup.
        if (SETTING_KEYS.includes(r.name) && !current[r.name] && typeof r.val === 'string' && r.val.length <= 600) {
          const isLink = r.name.endsWith('_url');
          if (!isLink || /^https?:\/\/[^\s<>"']+$/i.test(r.val)) await core.setSetting(r.name, r.val);
        }
      }
    }
  } finally {
    fs.unlink(req.file.path, () => {});
    core.clearCategories();
    core.clearPages();
  }
  if (!isBackup) flash(req, res, 'That is not a backup file made by this site. Choose a file downloaded from this page.', 'error');
  else {
    const n = (count, one, many) => `${count} ${count === 1 ? one : many}`;
    flash(req, res, `Restore finished: ${n(added.posts, 'story', 'stories')}, ${n(added.images, 'photo', 'photos')}, ${n(added.cats, 'category', 'categories')} and ${n(added.pages, 'page', 'pages')} added.`
      + (already ? ` ${n(already, 'story was', 'stories were')} already on the site and left unchanged.` : ''));
  }
  res.redirect('/admin/backup');
});

/* ----- Pages (About, Contact, ...) ----- */
admin.get('/pages', async (req, res) => {
  res.send(A.pagesPage(pageArgs(req, res), await db.all('SELECT * FROM pages ORDER BY sort, id')));
});
const blankPage = async () => ({ id: 0, slug: '', title: '', body: '', show_form: 0, sort: Number((await db.get('SELECT COALESCE(MAX(sort), 0) + 1 AS n FROM pages')).n) });
const loadPage = (id) => (/^\d{1,9}$/.test(String(id)) ? db.get('SELECT * FROM pages WHERE id = ?', [Number(id)]) : null);

admin.get('/page', async (req, res) => res.send(A.pageEditPage(pageArgs(req, res), await blankPage(), [], true)));
admin.get('/page/:id', async (req, res) => {
  const page = await loadPage(req.params.id);
  if (!page) { flash(req, res, 'That page no longer exists.', 'error'); return res.redirect('/admin/pages'); }
  res.send(A.pageEditPage(pageArgs(req, res), page, [], false));
});
async function savePage(req, res) {
  const isNew = !req.params.id;
  const page = isNew ? await blankPage() : await loadPage(req.params.id);
  if (!page) { flash(req, res, 'That page no longer exists.', 'error'); return res.redirect('/admin/pages'); }
  const errors = [];
  page.title = str(req.body.title, 80);
  page.slug = str(req.body.slug, 60).toLowerCase().replace(/[\s_]+/g, '-');
  page.body = String(req.body.body || '').trim().slice(0, 200000);
  page.show_form = req.body.show_form ? 1 : 0;
  page.sort = Math.max(0, Math.min(999, parseInt(req.body.sort, 10) || 0));
  if (page.title === '') errors.push('Type a title for the page.');
  if (!core.validSlug(page.slug)) errors.push('The page address can only have small English letters, numbers and hyphens (for example: about-us), and must not be a word the site already uses, such as "admin" or "news".');
  else {
    const taken = await db.get('SELECT id FROM pages WHERE slug = ?', [page.slug]);
    if (taken && taken.id !== page.id) errors.push('Another page already uses that address. Choose a different one.');
  }
  if (errors.length) return res.send(A.pageEditPage(pageArgs(req, res), page, errors, isNew));
  let id = page.id;
  if (isNew) {
    id = (await db.get('INSERT INTO pages(slug, title, body, show_form, sort, updated_at) VALUES(?, ?, ?, ?, ?, ?) RETURNING id',
      [page.slug, page.title, page.body, page.show_form, page.sort, now()])).id;
  } else {
    await db.run('UPDATE pages SET slug = ?, title = ?, body = ?, show_form = ?, sort = ?, updated_at = ? WHERE id = ?',
      [page.slug, page.title, page.body, page.show_form, page.sort, now(), id]);
  }
  core.clearPages();
  flash(req, res, isNew ? 'Page published. Its link now shows at the top and bottom of the website.' : 'Page saved.');
  res.redirect('/admin/page/' + id);
}
admin.post('/page', checkCsrf, savePage);
admin.post('/page/:id', checkCsrf, savePage);
admin.post('/pages/delete', checkCsrf, async (req, res) => {
  const id = parseInt(req.body.id, 10) || 0;
  if (id && await db.run('DELETE FROM pages WHERE id = ?', [id])) flash(req, res, 'Page deleted.');
  core.clearPages();
  res.redirect('/admin/pages');
});

/* ----- Messages from the contact form ----- */
admin.get('/messages', async (req, res) => {
  const total = Number((await db.get('SELECT COUNT(*) AS n FROM messages')).n);
  const pages = Math.max(1, Math.ceil(total / 30));
  const page = Math.min(pageParam(req), pages);
  res.send(A.messagesPage(pageArgs(req, res), {
    total, page, pages,
    rows: await db.all(`SELECT * FROM messages ORDER BY created_at DESC, id DESC LIMIT 30 OFFSET ${(page - 1) * 30}`),
  }));
});
admin.post('/messages', checkCsrf, async (req, res) => {
  const id = parseInt(req.body.id, 10) || 0;
  if (id && req.body.action === 'delete') { await db.run('DELETE FROM messages WHERE id = ?', [id]); flash(req, res, 'Message deleted.'); }
  else if (id && (req.body.action === 'read' || req.body.action === 'unread')) await db.run('UPDATE messages SET is_read = ? WHERE id = ?', [req.body.action === 'read' ? 1 : 0, id]);
  const back = parseInt(req.body.back, 10) || 1;
  res.redirect('/admin/messages' + (back > 1 ? '?page=' + back : ''));
});

app.use('/admin', admin);

/* ====================== Pages on the public site (About, Contact, ...) ====================== */
// These come after every other address, so a page can never hide a part of the site.
const findPage = (slug) => (/^[a-z0-9][a-z0-9-]{1,58}$/.test(slug) ? db.get('SELECT * FROM pages WHERE slug = ?', [slug]) : null);
const pageData = async (ctx, page, extra) => ({
  page, sent: false, errors: [], values: { name: '', contact: '', message: '' },
  token: page.show_form ? core.formToken() : '',
  moreNews: await fetchPosts(VISIBLE, [ctx.now], 6),
  ...extra,
});

app.get('/:slug', async (req, res, next) => {
  const page = await findPage(req.params.slug);
  if (!page) return next();
  res.send(V.staticPage(req.ctx, await pageData(req.ctx, page, { sent: req.query.sent === '1' })));
});

// A reader sends a message from a page that has the form.
app.post('/:slug', express.urlencoded({ extended: false, limit: '20kb' }), async (req, res, next) => {
  const ctx = req.ctx;
  const page = await findPage(req.params.slug);
  if (!page || !page.show_form) return next();
  const values = { name: str(req.body.name, 80), contact: str(req.body.contact, 120), message: String(req.body.message || '').trim().slice(0, 2000) };
  const fail = async (key) => res.status(400).send(V.staticPage(ctx, await pageData(ctx, page, { errors: [ctx.t(key)], values })));

  // Spam checks: a hidden field people never fill in, and a form that was opened a moment ago by this site.
  const age = core.formTokenAge(req.body.t);
  if (req.body.website) return res.redirect(`/${page.slug}?sent=1#message`);       // pretend it worked; nothing is saved
  if (age === null || age < 2 || age > 6 * 3600) return fail('err_form');
  if (values.name.length < 2 || values.contact.length < 5 || values.message.length < 5) return fail('err_fields');

  const who = 'msg:' + req.ip;
  await db.run("DELETE FROM login_attempts WHERE who LIKE 'msg:%' AND ts < ?", [now() - 3600]);
  if (Number((await db.get('SELECT COUNT(*) AS n FROM login_attempts WHERE who = ?', [who])).n) >= 20) return fail('err_many');
  await db.run('INSERT INTO login_attempts(who, ts) VALUES(?, ?)', [who, now()]);

  await db.run('INSERT INTO messages(name, contact, body, created_at) VALUES(?, ?, ?, ?)', [values.name, values.contact, values.message, now()]);
  mail.mailMessage({ name: values.name, contact: values.contact, body: values.message });   // background; the reader does not wait
  // Keep the newest 2000 so the inbox can never fill the database.
  const old = await db.get('SELECT id FROM messages ORDER BY id DESC LIMIT 1 OFFSET 2000');
  if (old) await db.run('DELETE FROM messages WHERE id <= ?', [old.id]);
  res.redirect(`/${page.slug}?sent=1#message`);
});

/* ---------- Not found + errors ---------- */
app.use((req, res) => res.status(404).send(V.notFoundPage(req.ctx)));
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  if (err && err.type === 'entity.too.large') return res.status(413).type('text').send('That form was too large. Go back and shorten the text.');
  console.error('Error on', req.method, req.originalUrl, '-', err && err.stack ? err.stack : err);
  if (res.headersSent) return res.destroy();        // a download that failed half-way
  res.status(500).send(html`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Something went wrong</title>
<body style="font-family:system-ui,sans-serif;max-width:560px;margin:12vh auto;padding:0 20px;line-height:1.6"><h1 style="font-size:22px">Something went wrong</h1>
<p>The page could not be shown. Reload in a moment. If it keeps happening, check the server log.</p></body>`.toString());
});

/* ---------- Start ---------- */
async function start() {
  let kind;
  try {
    kind = await db.init();
    await core.loadSecret();
    if (await core.isInstalled()) await core.ensurePages();     // adds About and Contact to sites made before pages existed
  } catch (e) {
    console.error('\nThe site could not open its database.');
    console.error(process.env.DATABASE_URL ? 'Check that DATABASE_URL is the full connection string from your database provider.' : 'Check that the "data" folder can be written to.');
    console.error('Details:', e.message, '\n');
    process.exit(1);
  }

  // Forgot the password? Set ADMIN_PASSWORD_RESET to a new password, restart, log in, then remove it.
  const reset = process.env.ADMIN_PASSWORD_RESET;
  if (reset) {
    const first = await db.get('SELECT id, username FROM users ORDER BY id LIMIT 1');
    if (reset.length < 8) console.warn('ADMIN_PASSWORD_RESET ignored: it must be at least 8 characters.');
    else if (first) {
      await db.run('UPDATE users SET password_hash = ? WHERE id = ?', [await core.hashPassword(reset), first.id]);
      await db.run('DELETE FROM login_attempts');
      console.warn(`Password for "${first.username}" was reset from ADMIN_PASSWORD_RESET. Remove that variable now.`);
    }
  }

  // Scheduled stories and the weekly backup also go out when nobody is using the admin panel.
  setInterval(() => mail.seen(''), 10 * 60 * 1000).unref();

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`News site running on port ${PORT} (${kind === 'postgres' ? 'PostgreSQL database' : 'SQLite file in ' + (process.env.DATA_DIR || './data')})`);
    if (kind === 'sqlite' && process.env.RENDER && !process.env.DATA_DIR) {
      console.warn('WARNING: no DATABASE_URL set. On Render, news and photos will be lost on every restart. See DEPLOY-RENDER.md.');
    }
  });
  const stop = () => {
    setTimeout(() => process.exit(0), 5000).unref();     // never hang on shutdown
    server.close(() => { Promise.resolve(db.close()).finally(() => process.exit(0)); });
    if (server.closeIdleConnections) server.closeIdleConnections();
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}
start();
