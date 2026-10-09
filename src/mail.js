'use strict';
/*
 * Copies to the owner's email.
 *
 * The database stays the place the website reads from. Email only receives copies:
 *   - every story when it goes live (with its main photo attached)
 *   - the full backup file, once a week
 *   - messages readers send from the Contact page
 *
 * Emails go out through Resend's web API, because free hosting (Render Free) blocks normal
 * email ports. It needs RESEND_API_KEY; without it this whole file does nothing.
 */
const db = require('./db');
const core = require('./core');
const backup = require('./backup');
const { renderBody, escapeHtml } = require('./render');

const API_URL = process.env.RESEND_API_URL || 'https://api.resend.com/emails';
const SENDER = process.env.MAIL_FROM || 'onboarding@resend.dev';
const DAILY_LIMIT = 80;                       // stay under the free plan's 100 a day
const PHOTOS_IN_EMAIL_LIMIT = 12 * 1024 * 1024; // above this, the weekly backup goes without photos
const WEEK = 7 * 86400;

let origin = '';                 // address of the site, learned from visits
let sentToday = { day: '', n: 0 };
let running = false;
let lastSweep = 0;

const hasKey = () => Boolean((process.env.RESEND_API_KEY || '').trim());
const validEmail = (v) => /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]+$/.test(String(v || '')) && String(v).length <= 120;
const isOn = (v) => v !== '0';   // choices are on until switched off

async function config() {
  const s = await core.getSettings();
  const email = s.backup_email || (validEmail(process.env.BACKUP_EMAIL) ? process.env.BACKUP_EMAIL.trim() : '');
  return {
    s, email,
    hasKey: hasKey(),
    ready: hasKey() && validEmail(email),
    stories: isOn(s.mail_stories), weekly: isOn(s.mail_weekly), messages: isOn(s.mail_messages),
    site: s.site_name || 'News',
    tz: core.ZONES.includes(s.timezone) ? s.timezone : 'Asia/Kolkata',
    siteUrl: (s.site_url || origin || '').replace(/\/+$/, ''),
  };
}

/** Sends one email. Returns { ok: true } or { ok: false, error: 'readable reason' }. Never throws. */
async function send(cfg, { subject, text, html, attachments }) {
  const day = new Date().toISOString().slice(0, 10);
  if (sentToday.day !== day) sentToday = { day, n: 0 };
  if (sentToday.n >= DAILY_LIMIT) return { ok: false, error: `The daily limit of ${DAILY_LIMIT} emails was reached. Sending starts again tomorrow.` };
  const siteName = cfg.site.replace(/[<>"\r\n]/g, ' ').trim() || 'News';
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 45000);
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      signal: ctl.signal,
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY.trim()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: `${siteName} <${SENDER}>`, to: [cfg.email], subject: subject.slice(0, 200), text, html, attachments }),
    });
    if (res.ok) { sentToday.n++; return { ok: true }; }
    let reason = `The email service answered with error ${res.status}.`;
    try { const body = await res.json(); if (body && body.message) reason = String(body.message).slice(0, 300); } catch (e) { /* keep the generic reason */ }
    return { ok: false, error: reason };
  } catch (e) {
    return { ok: false, error: e.name === 'AbortError' ? 'The email service did not answer in time.' : 'The email service could not be reached.' };
  } finally {
    clearTimeout(timer);
  }
}

const para = (t) => `<p style="margin:0 0 12px">${t}</p>`;
const shell = (inner) => `<div style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;color:#14162b;max-width:640px">${inner}</div>`;

/** One published story as an email, with its main photo attached. */
async function mailStory(cfg, post) {
  const link = cfg.siteUrl ? `${cfg.siteUrl}/news/${post.id}` : '';
  const when = core.fmtDate(Number(post.published_at), cfg.tz, 'en');
  const meta = [post.category_name, when, post.author ? `By ${post.author}` : ''].filter(Boolean).join(' | ');
  const bodyHtml = renderBody(post.body).replace(/src="\/uploads\//g, `src="${cfg.siteUrl}/uploads/`);
  const html = shell(
    `<p style="margin:0 0 6px;color:#5b6079;font-size:14px">${escapeHtml(meta)}</p>`
    + `<h1 style="font-size:26px;line-height:1.25;margin:0 0 12px">${escapeHtml(post.title)}</h1>`
    + (post.summary ? para(`<b>${escapeHtml(post.summary)}</b>`) : '')
    + bodyHtml
    + '<hr style="border:0;border-top:1px solid #d8dcec;margin:20px 0">'
    + (link ? para(`On the website: <a href="${escapeHtml(link)}">${escapeHtml(link)}</a>`) : '')
    + para('<span style="color:#5b6079;font-size:14px">This copy was sent by your news site when the story was published.</span>'));
  const text = [post.title, post.summary, meta, post.body, link].filter(Boolean).join('\n\n');
  const attachments = [];
  if (post.image) {
    const img = await core.loadImage(post.image);
    if (img && img.data.length <= 5 * 1024 * 1024) attachments.push({ filename: post.image, content: img.data.toString('base64') });
  }
  let result = await send(cfg, { subject: `${cfg.site}: ${post.title}`, text, html, attachments });
  if (!result.ok && attachments.length) result = await send(cfg, { subject: `${cfg.site}: ${post.title}`, text, html });   // try once without the photo
  return result;
}

/** The full backup file as an email attachment. Photos are included while they are small enough for email. */
async function mailBackup(cfg) {
  const st = await backup.stats();
  const withPhotos = st.bytes <= PHOTOS_IN_EMAIL_LIMIT;
  const file = await backup.build(withPhotos);
  const mb = (n) => (n / 1024 / 1024).toFixed(1);
  const lines = [
    `Backup of ${cfg.site}, made on ${core.fmtDate(core.now(), cfg.tz, 'en')}.`,
    `It holds ${st.posts} stories` + (withPhotos ? ` and ${st.images} photos.` : `. The ${st.images} photos (${mb(st.bytes)} MB) are too large for email: download them from Admin > Backup > "Download stories and photos".`),
    'Keep this email. To bring everything back, open Admin > Backup on the website and choose the attached file under "Restore from a backup".',
  ];
  const result = await send(cfg, {
    subject: `${cfg.site}: backup ${core.toLocalInput(core.now(), cfg.tz).slice(0, 10)}`,
    text: lines.join('\n\n'),
    html: shell(lines.map((l) => para(escapeHtml(l))).join('')),
    attachments: [{ filename: backup.fileName(cfg.tz, withPhotos), content: file.toString('base64') }],
  });
  if (result.ok) await core.setSetting('_last_backup_mail', String(core.now()));
  return { ...result, withPhotos, stories: st.posts };
}

/** Tells the owner about a message from the Contact page. Runs in the background. */
async function mailMessage(msg) {
  try {
    const cfg = await config();
    if (!cfg.ready || !cfg.messages) return;
    const inbox = cfg.siteUrl ? `${cfg.siteUrl}/admin/messages` : '';
    await send(cfg, {
      subject: `${cfg.site}: message from ${msg.name}`,
      text: [`From: ${msg.name}`, `Phone or email: ${msg.contact}`, msg.body, inbox ? `All messages: ${inbox}` : ''].filter(Boolean).join('\n\n'),
      html: shell(para(`<b>${escapeHtml(msg.name)}</b> &lt;${escapeHtml(msg.contact)}&gt; wrote from your Contact page:`)
        + para(escapeHtml(msg.body).replace(/\r?\n/g, '<br>'))
        + (inbox ? para(`<a href="${escapeHtml(inbox)}">Open all messages</a>`) : '')),
    });
  } catch (e) {
    console.error('Email for a contact message failed:', e.message);
  }
}

/**
 * Background round: emails stories that went live since the last round (this also catches scheduled
 * stories), and the weekly backup when it is due. Safe to call often; it does nothing while a round runs.
 */
async function sweep() {
  if (running) return;
  running = true;
  lastSweep = Date.now();
  try {
    const cfg = await config();
    if (!cfg.ready) return;
    const t = core.now();
    // Only stories published after email copies were switched on are sent one by one; older ones are in the backup file.
    if (!cfg.s._mail_since) await core.setSetting('_mail_since', String(t));
    const since = Number(cfg.s._mail_since || t);

    if (cfg.stories) {
      const posts = await db.all(
        `SELECT p.*, c.name AS category_name FROM posts p LEFT JOIN categories c ON c.id = p.category_id
         WHERE ${core.VISIBLE} AND p.published_at >= ? AND p.id NOT IN (SELECT post_id FROM mailed_posts)
         ORDER BY p.published_at, p.id LIMIT 5`, [t, since]);
      for (const post of posts) {
        const r = await mailStory(cfg, post);
        if (!r.ok) { console.error(`Email copy of story ${post.id} failed: ${r.error}`); break; }
        await db.run('INSERT INTO mailed_posts(post_id, ts) VALUES(?, ?)', [post.id, t]);
      }
    }

    const lastOk = Number(cfg.s._last_backup_mail || 0);
    const lastTry = Number(cfg.s._last_backup_try || 0);
    if (cfg.weekly && t - lastOk > WEEK && t - lastTry > 6 * 3600) {
      await core.setSetting('_last_backup_try', String(t));
      const r = await mailBackup(cfg);
      if (!r.ok) console.error(`Weekly backup email failed: ${r.error}`);
    }
  } catch (e) {
    console.error('Email round failed:', e.message);
  } finally {
    running = false;
  }
}

/** Called on visits: remembers the site address and starts a round at most every 10 minutes. */
function seen(siteOrigin) {
  if (siteOrigin) origin = siteOrigin;
  if (hasKey() && Date.now() - lastSweep > 10 * 60 * 1000) sweep();
}

module.exports = { config, validEmail, mailBackup, mailMessage, sweep, seen };
