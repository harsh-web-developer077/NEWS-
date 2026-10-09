'use strict';
/*
 * Turns the plain text typed in the admin editor into safe HTML.
 * Everything is escaped first; only the few marks below become tags.
 *
 *   ## Heading          > Quote            - List item        1. Numbered item
 *   **bold**  *italic*  [text](https://link)
 *   ![caption](uploads/photo.jpg)          a YouTube link alone on a line
 */

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));
}

function inline(text) {
  let s = escapeHtml(text);
  s = s.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/gu, (m, label, href) => `<a href="${href}" target="_blank" rel="noopener nofollow">${label}</a>`);
  s = s.replace(/\*\*(?!\s)(.+?)(?<!\s)\*\*/gu, '<strong>$1</strong>');
  s = s.replace(/(?<![*\p{L}\p{N}_])\*(?![\s*])(.+?)(?<![\s*])\*(?![*\p{L}\p{N}_])/gu, '<em>$1</em>');
  return s;
}

function youtubeId(line) {
  const m = /^(?:https?:\/\/)?(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:\S*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})\S*$/.exec(line);
  return m ? m[1] : null;
}

function renderBody(text) {
  const lines = String(text || '').trim().split(/\r\n|\r|\n/);
  const out = [];
  let para = [];
  let quote = [];
  let list = null; // 'ul' | 'ol'

  const flush = () => {
    if (para.length) { out.push('<p>' + para.map(inline).join('<br>') + '</p>'); para = []; }
    if (list) { out.push(`</${list}>`); list = null; }
    if (quote.length) { out.push('<blockquote><p>' + quote.map(inline).join('<br>') + '</p></blockquote>'); quote = []; }
  };

  for (const raw of lines) {
    const line = raw.trim();
    let m;
    if (line === '') { flush(); continue; }
    if ((m = /^(#{2,3})\s+(.+)$/u.exec(line))) {
      flush();
      const tag = m[1].length === 2 ? 'h2' : 'h3';
      out.push(`<${tag}>${inline(m[2])}</${tag}>`);
      continue;
    }
    if ((m = /^!\[([^\]]*)\]\(uploads\/([A-Za-z0-9._-]+)\)$/u.exec(line))) {
      flush();
      const cap = escapeHtml(m[1]);
      out.push(`<figure><img src="/uploads/${escapeHtml(m[2])}" alt="${cap}" loading="lazy">${m[1] !== '' ? `<figcaption>${cap}</figcaption>` : ''}</figure>`);
      continue;
    }
    const yt = youtubeId(line);
    if (yt) {
      flush();
      out.push(`<div class="video"><iframe src="https://www.youtube-nocookie.com/embed/${yt}" title="YouTube video" loading="lazy" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>`);
      continue;
    }
    if ((m = /^>\s?(.*)$/u.exec(line))) {
      if (para.length || list) flush();
      quote.push(m[1]);
      continue;
    }
    const ul = /^(?:[-•]|\*(?=\s))\s+(.+)$/u.exec(line);
    const ol = ul ? null : /^\d{1,3}[.)]\s+(.+)$/u.exec(line);
    if (ul || ol) {
      const type = ul ? 'ul' : 'ol';
      if (list !== type) { flush(); out.push(`<${type}>`); list = type; }
      out.push('<li>' + inline((ul || ol)[1]) + '</li>');
      continue;
    }
    if (list || quote.length) flush();
    para.push(line);
  }
  flush();
  return out.join('\n');
}

/** Plain-text start of a story, for summaries and link previews. */
function plainExcerpt(body, len = 180) {
  let s = String(body || '')
    .replace(/!\[[^\]]*\]\([^)]*\)/gu, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/gu, '$1')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/^[#>\-•*\s]+/gmu, '')
    .replace(/\*\*|\*/g, '')
    .replace(/\s+/gu, ' ')
    .trim();
  const chars = Array.from(s);
  if (chars.length > len) s = chars.slice(0, len - 1).join('').trimEnd() + '…';
  return s;
}

module.exports = { escapeHtml, renderBody, plainExcerpt };
