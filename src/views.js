'use strict';
/* Public pages: what readers see. */
const { html, raw, fmt, isoDate } = require('./core');
const { renderBody, plainExcerpt } = require('./render');

const postUrl = (p) => `/news/${p.id}`;
const catUrl = (id) => `/category/${id}`;
const imgUrl = (name) => `/uploads/${name}`;
const summaryOf = (p, len) => (p.summary !== '' ? p.summary : plainExcerpt(p.body, len));
/** Each category keeps one of six colours, used on its headings, tags and blocks. */
const catClass = (id) => (id ? `c${(Number(id) - 1) % 6}` : 'c0');
const firstLetter = (text) => {
  const t = String(text || '').trim();
  if (!t) return 'N';
  try { return [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(t)][0].segment.toUpperCase(); } catch (e) { return t[0].toUpperCase(); }
};
const lines = (text) => String(text).split(/\r?\n/).map((l, i) => html`${i ? raw('<br>') : ''}${l}`);

/** Photo of a story, or a coloured block with the category name when there is none. */
function photo(ctx, p, lazy = true) {
  if (p.image !== '') return html`<img src="${imgUrl(p.image)}" alt=""${lazy ? raw(' loading="lazy"') : ''}>`;
  return html`<span class="ph" aria-hidden="true"><span>${p.category_name || ctx.set('site_name', 'News')}</span></span>`;
}

function layout(ctx, o, content) {
  const site = ctx.set('site_name', 'News');
  const tagline = ctx.set('tagline');
  const title = o.title ? `${o.title} | ${site}` : site + (tagline ? ` | ${tagline}` : '');
  const desc = o.description ?? tagline;
  const social = [['Facebook', ctx.s.facebook_url], ['YouTube', ctx.s.youtube_url], ['Instagram', ctx.s.instagram_url], ['WhatsApp', ctx.s.whatsapp_url]].filter((x) => x[1]);
  const hasContact = ctx.set('contact_phone') + ctx.set('contact_email') + ctx.set('address') !== '';

  return html`<!doctype html>
<html lang="${ctx.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<meta name="description" content="${desc}">
${o.canonical ? html`<link rel="canonical" href="${o.canonical}">` : ''}
<meta property="og:site_name" content="${site}">
<meta property="og:title" content="${o.title || site}">
<meta property="og:description" content="${desc}">
<meta property="og:type" content="${o.ogType || 'website'}">
${o.canonical ? html`<meta property="og:url" content="${o.canonical}">` : ''}
${o.image ? html`<meta property="og:image" content="${o.image}">
<meta name="twitter:card" content="summary_large_image">` : ''}
${o.noindex ? raw('<meta name="robots" content="noindex">') : ''}
<meta name="theme-color" content="#1f2c7c">
<meta name="google-site-verification" content="stI1yyL92uqnIjdrDb0k9bg0FiOtGK9-fqnFRxk1ZR0" />
<link rel="alternate" type="application/rss+xml" title="${site}" href="/feed.xml">
<link rel="stylesheet" href="/assets/css/fonts.css?v=1">
<link rel="stylesheet" href="/assets/css/style.css?v=4">
${o.head || ''}
</head>
<body>
<a class="skip" href="#main">${ctx.lang === 'hi' ? 'सीधे खबरों पर जाएँ' : 'Skip to news'}</a>
<div class="topbar">
  <div class="wrap topbar-in">
    <time datetime="${isoDate(ctx.now).slice(0, 10)}" class="today">${ctx.date(ctx.now, false, true)}</time>
    <span class="topbar-links">
      ${ctx.pages.map((pg) => html`<a class="topbar-page" href="/${pg.slug}"${o.activePage === pg.id ? raw(' aria-current="page"') : ''}>${pg.title}</a>`)}
      ${social.map(([name, link]) => html`<a href="${link}" target="_blank" rel="noopener">${name}</a>`)}
      <a href="/feed.xml">RSS</a>
    </span>
  </div>
</div>
<header class="masthead">
  <div class="wrap masthead-in">
    <a class="brand" href="/">
      <span class="brand-mark" aria-hidden="true">${firstLetter(site)}</span>
      <span class="brand-words">
        <span class="brand-name">${site}</span>
        ${tagline ? html`<span class="brand-tag">${tagline}</span>` : ''}
      </span>
    </a>
    <form class="search" action="/search" method="get" role="search">
      <label class="sr" for="q">${ctx.t('search')}</label>
      <input id="q" name="q" type="search" placeholder="${ctx.t('search_placeholder')}" value="${o.q || ''}" maxlength="80">
      <button type="submit">${ctx.t('search')}</button>
    </form>
  </div>
</header>
<nav class="sections" aria-label="${ctx.t('categories')}">
  <div class="wrap sections-in">
    <a href="/"${o.active === 'home' ? raw(' aria-current="page"') : ''}>${ctx.t('home')}</a>
    ${ctx.cats.map((c) => html`<a class="${catClass(c.id)}" href="${catUrl(c.id)}"${o.active === c.id ? raw(' aria-current="page"') : ''}>${c.name}</a>
    `)}
  </div>
</nav>
<main id="main">
${content}
</main>
<footer class="foot">
  <div class="wrap foot-in">
    <div class="foot-about">
      <a class="brand" href="/">
        <span class="brand-mark" aria-hidden="true">${firstLetter(site)}</span>
        <span class="brand-words"><span class="brand-name">${site}</span></span>
      </a>
      ${ctx.set('about') ? html`<p>${lines(ctx.s.about)}</p>` : (tagline ? html`<p>${tagline}</p>` : '')}
    </div>
    <div>
      <h2>${ctx.t('categories')}</h2>
      <ul class="foot-cols">${ctx.cats.map((c) => html`<li><a href="${catUrl(c.id)}">${c.name}</a></li>`)}</ul>
    </div>
    ${ctx.pages.length ? html`<div>
      <h2>${ctx.t('info')}</h2>
      <ul>${ctx.pages.map((pg) => html`<li><a href="/${pg.slug}">${pg.title}</a></li>`)}</ul>
    </div>` : ''}
    ${hasContact || social.length ? html`<div>
      ${hasContact ? html`<h2>${ctx.t('contact')}</h2>
      <ul>
        ${ctx.set('contact_phone') ? html`<li><a href="tel:${ctx.s.contact_phone.replace(/[^0-9+]/g, '')}">${ctx.s.contact_phone}</a></li>` : ''}
        ${ctx.set('contact_email') ? html`<li><a href="mailto:${ctx.s.contact_email}">${ctx.s.contact_email}</a></li>` : ''}
        ${ctx.set('address') ? html`<li>${lines(ctx.s.address)}</li>` : ''}
      </ul>` : ''}
      ${social.length ? html`<h2${hasContact ? raw(' class="foot-gap"') : ''}>${ctx.t('follow')}</h2>
      <ul class="foot-social">${social.map(([name, link]) => html`<li><a href="${link}" target="_blank" rel="noopener">${name}</a></li>`)}</ul>` : ''}
    </div>` : ''}
  </div>
  <div class="foot-base">
    <div class="wrap foot-base-in">
      <span>© ${new Date().getFullYear()} ${site}. ${ctx.t('rights')}</span>
      <span><a href="/feed.xml">RSS</a> <a href="/sitemap.xml">Sitemap</a> <a href="/admin">Admin</a></span>
    </div>
  </div>
</footer>
<script src="/assets/js/site.js?v=1" defer></script>
</body>
</html>`.toString();
}

/* ---------- Story pieces ---------- */

/** Photo with the headline printed over it. The whole tile is one link. */
function tile(ctx, p, big = false) {
  return html`
  <article class="tile ${catClass(p.category_id)}${big ? ' tile-big' : ''}">
    <a href="${postUrl(p)}">
      ${photo(ctx, p, false)}
      <div class="tile-text">
        ${p.category_name ? html`<span class="chip">${p.category_name}</span>` : ''}
        <h3>${p.title}</h3>
        <time datetime="${isoDate(p.published_at)}">${ctx.ago(p.published_at)}</time>
      </div>
    </a>
  </article>`;
}

/** Photo on top, headline below. */
function card(ctx, p, showTag = true, showSummary = false) {
  const summary = showSummary ? summaryOf(p, 110) : '';
  return html`
  <article class="card ${catClass(p.category_id)}">
    <a class="card-img" href="${postUrl(p)}" tabindex="-1" aria-hidden="true">${photo(ctx, p)}</a>
    <div class="card-text">
      ${showTag && p.category_name ? html`<a class="tag" href="${catUrl(p.category_id)}">${p.category_name}</a>` : ''}
      <h3><a href="${postUrl(p)}">${p.title}</a></h3>
      ${summary !== '' ? html`<p>${summary}</p>` : ''}
      <time datetime="${isoDate(p.published_at)}">${ctx.ago(p.published_at)}</time>
    </div>
  </article>`;
}

/** Photo on the side, headline, summary, time. */
function storyRow(ctx, p, showSummary = true, showTag = true) {
  const summary = summaryOf(p, 150);
  return html`
  <article class="row ${catClass(p.category_id)}${p.image === '' ? ' row-noimg' : ''}">
    ${p.image !== '' ? html`<a class="row-img" href="${postUrl(p)}" tabindex="-1" aria-hidden="true"><img src="${imgUrl(p.image)}" alt="" loading="lazy"></a>` : ''}
    <div class="row-text">
      ${showTag && p.category_name ? html`<a class="tag" href="${catUrl(p.category_id)}">${p.category_name}</a>` : ''}
      <h3><a href="${postUrl(p)}">${p.title}</a></h3>
      ${showSummary && summary !== '' ? html`<p>${summary}</p>` : ''}
      <time datetime="${isoDate(p.published_at)}">${ctx.ago(p.published_at)}</time>
    </div>
  </article>`;
}

const secHead = (title, cls = '', more = null) => html`
  <div class="sec-head ${cls}">
    <h2>${title}</h2>
    ${more ? html`<a class="more" href="${more.href}">${more.label}</a>` : ''}
  </div>`;

function pager(ctx, page, pages, base) {
  if (pages < 2) return '';
  const sep = base.includes('?') ? '&' : '?';
  return html`
  <nav class="pager" aria-label="Pages">
    ${page > 1 ? html`<a href="${page === 2 ? base : `${base}${sep}page=${page - 1}`}">${ctx.t('newer')}</a>` : raw('<span></span>')}
    <span class="pager-pos">${fmt(ctx.t('page_of'), page, pages)}</span>
    ${page < pages ? html`<a href="${base}${sep}page=${page + 1}">${ctx.t('older')}</a>` : raw('<span></span>')}
  </nav>`;
}

function mostReadBox(ctx, top) {
  if (!top || !top.length) return '';
  return html`
  <section class="side-box">
    ${secHead(ctx.t('most_read'))}
    <ol class="ranked">${top.map((p) => html`<li><a href="${postUrl(p)}">${p.title}</a></li>`)}</ol>
  </section>`;
}

function sectionsBox(ctx, counts) {
  if (!ctx.cats.length) return '';
  return html`
  <section class="side-box">
    ${secHead(ctx.t('categories'))}
    <ul class="cat-list">${ctx.cats.map((c) => html`<li class="${catClass(c.id)}"><a href="${catUrl(c.id)}"><span>${c.name}</span>${counts ? html`<b>${counts[c.id] || 0}</b>` : ''}</a></li>`)}</ul>
  </section>`;
}

function moreNewsBox(ctx, posts) {
  if (!posts || !posts.length) return '';
  return html`
  <section class="side-box">
    ${secHead(ctx.t('more_news'))}
    <div class="mini-list">${posts.map((p) => html`<a class="mini ${catClass(p.category_id)}" href="${postUrl(p)}"><b>${p.title}</b><time datetime="${isoDate(p.published_at)}">${ctx.ago(p.published_at)}</time></a>`)}</div>
  </section>`;
}

/* ---------- Pages ---------- */

function homePage(ctx, d) {
  const { lead, side, strip, latest, breaking, blocks, counts, page, pages, mostRead } = d;
  // The ticker moves; its speed follows the amount of text so it stays readable.
  const tickerSeconds = Math.max(18, Math.round(breaking.reduce((n, b) => n + b.title.length, 0) / 4.5));
  const tickerItems = (hidden) => html`<ul${hidden ? raw(' aria-hidden="true"') : ''}>${breaking.map((b) => html`<li><a href="${postUrl(b)}"${hidden ? raw(' tabindex="-1"') : ''}>${b.title}</a></li>`)}</ul>`;

  const content = html`
${breaking.length && page === 1 ? html`<div class="breaking">
  <div class="wrap breaking-in">
    <strong>${ctx.t('breaking')}</strong>
    <div class="breaking-view"><div class="breaking-track" style="animation-duration:${tickerSeconds}s">${tickerItems(false)}${tickerItems(true)}</div></div>
  </div>
</div>` : ''}
${!lead ? html`<div class="wrap notice"><p>${ctx.t('no_posts')}</p></div>` : html`
${page === 1 ? html`<section class="wrap front${side.length ? '' : ' front-solo'}">
  <article class="lead ${catClass(lead.category_id)}${lead.image === '' ? ' lead-noimg' : ''}">
    ${lead.image !== '' ? html`<a class="lead-img" href="${postUrl(lead)}" tabindex="-1" aria-hidden="true"><img src="${imgUrl(lead.image)}" alt=""></a>` : ''}
    <div class="lead-slab">
      ${lead.category_name ? html`<a class="tag" href="${catUrl(lead.category_id)}">${lead.category_name}</a>` : ''}
      <h1><a href="${postUrl(lead)}">${lead.title}</a></h1>
      <p>${summaryOf(lead, 200)}</p>
      <time datetime="${isoDate(lead.published_at)}">${ctx.ago(lead.published_at)}</time>
    </div>
  </article>
  ${side.length ? html`<div class="front-side">${side.map((p) => tile(ctx, p))}</div>` : ''}
</section>
${strip.length ? html`<section class="wrap strip-zone">
  ${secHead(ctx.t('top_stories'))}
  <div class="strip">${strip.map((p) => card(ctx, p))}</div>
</section>` : ''}` : ''}

<div class="wrap columns">
  <section class="col-main">
    ${latest.length ? html`${secHead(ctx.t('latest'))}
    ${latest.map((p) => storyRow(ctx, p))}
    ${pager(ctx, page, pages, '/')}` : ''}
  </section>
  <aside class="col-side">
    ${mostReadBox(ctx, mostRead)}
    ${sectionsBox(ctx, counts)}
  </aside>
</div>

${page === 1 && blocks.length ? html`<section class="catzone">
  <div class="wrap">
    <h2 class="zone-title">${ctx.t('by_section')}</h2>
    <div class="blocks">
      ${blocks.map(({ cat, posts }) => html`<section class="block ${catClass(cat.id)}">
        ${secHead(cat.name, '', { href: catUrl(cat.id), label: ctx.t('see_all') })}
        <article class="block-main">
          <a class="block-img" href="${postUrl(posts[0])}" tabindex="-1" aria-hidden="true">${photo(ctx, posts[0])}</a>
          <div>
            <h3><a href="${postUrl(posts[0])}">${posts[0].title}</a></h3>
            <p>${summaryOf(posts[0], 110)}</p>
            <time datetime="${isoDate(posts[0].published_at)}">${ctx.ago(posts[0].published_at)}</time>
          </div>
        </article>
        ${posts.length > 1 ? html`<ul class="block-list">${posts.slice(1).map((p) => html`<li><a href="${postUrl(p)}">${p.title}</a><time datetime="${isoDate(p.published_at)}">${ctx.ago(p.published_at)}</time></li>`)}</ul>` : ''}
      </section>`)}
    </div>
  </div>
</section>` : ''}`}`;
  return layout(ctx, { active: 'home', canonical: ctx.origin + (page > 1 ? `/?page=${page}` : '/') }, content);
}

function categoryPage(ctx, d) {
  const { cat, posts, total, page, pages, mostRead, counts } = d;
  const first = page === 1 ? posts[0] : null;
  const rest = first ? posts.slice(1) : posts;
  const content = html`
<header class="cat-hero ${catClass(cat.id)}">
  <div class="wrap">
    <p class="crumbs"><a href="/">${ctx.t('home')}</a><span aria-hidden="true">/</span>${cat.name}</p>
    <h1>${cat.name}</h1>
    <p class="cat-count">${fmt(ctx.t('stories'), total)}</p>
  </div>
</header>
<div class="wrap columns ${catClass(cat.id)}">
  <section class="col-main">
    ${!posts.length ? html`<p class="empty">${ctx.t('no_posts')}</p>` : html`
      ${first ? html`<div class="cat-first">${tile(ctx, first, true)}</div>` : ''}
      ${rest.length ? html`<div class="grid">${rest.map((p) => card(ctx, p, false, true))}</div>` : ''}
      ${pager(ctx, page, pages, catUrl(cat.id))}`}
  </section>
  <aside class="col-side">${mostReadBox(ctx, mostRead)}${sectionsBox(ctx, counts)}</aside>
</div>`;
  return layout(ctx, { title: cat.name, active: cat.id, canonical: ctx.origin + catUrl(cat.id) + (page > 1 ? `?page=${page}` : '') }, content);
}

function searchPage(ctx, d) {
  const { q, posts, page, pages, mostRead, counts } = d;
  const content = html`
<div class="wrap columns page-top">
  <section class="col-main">
    ${q === '' ? html`${secHead(ctx.t('search'), 'sec-head-page')}
      <p class="empty">${ctx.t('search_prompt')}</p>` : html`
      ${secHead(fmt(ctx.t('search_results'), q), 'sec-head-page')}
      ${!posts.length ? html`<p class="empty">${fmt(ctx.t('no_results'), q)}</p>` : html`
        ${posts.map((p) => storyRow(ctx, p))}
        ${pager(ctx, page, pages, '/search?q=' + encodeURIComponent(q))}`}`}
  </section>
  <aside class="col-side">${mostReadBox(ctx, mostRead)}${sectionsBox(ctx, counts)}</aside>
</div>`;
  return layout(ctx, { title: ctx.t('search'), q, noindex: true }, content);
}

function articlePage(ctx, d) {
  const { post, related, preview, mostRead, moreNews } = d;
  const summary = summaryOf(post, 180);
  const link = ctx.origin + postUrl(post);
  const image = post.image !== '' ? ctx.origin + imgUrl(post.image) : '';
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: post.title,
    description: summary,
    datePublished: isoDate(post.published_at),
    dateModified: isoDate(post.updated_at),
    mainEntityOfPage: link,
    publisher: { '@type': 'Organization', name: ctx.set('site_name', 'News') },
  };
  if (post.author !== '') ld.author = { '@type': 'Person', name: post.author };
  if (image) ld.image = [image];
  const head = raw('<script type="application/ld+json">' + JSON.stringify(ld).replace(/</g, '\\u003c').replace(/&/g, '\\u0026') + '</script>');
  const enc = encodeURIComponent;

  const content = html`
${preview ? html`<div class="preview-bar"><div class="wrap">${ctx.t('preview')}</div></div>` : ''}
<div class="wrap columns page-top ${catClass(post.category_id)}">
  <article class="col-main story">
    <p class="crumbs"><a href="/">${ctx.t('home')}</a>${post.category_name ? html`<span aria-hidden="true">/</span><a href="${catUrl(post.category_id)}">${post.category_name}</a>` : ''}</p>
    <h1>${post.title}</h1>
    ${post.summary !== '' ? html`<p class="story-summary">${post.summary}</p>` : ''}
    <div class="story-meta">
      <div class="byline">
        ${post.author !== '' ? html`<span class="byline-mark" aria-hidden="true">${firstLetter(post.author)}</span>` : ''}
        <span>
          ${post.author !== '' ? html`<span class="story-author">${ctx.t('by')} ${post.author}</span>` : ''}
          <time datetime="${isoDate(post.published_at)}">${ctx.date(post.published_at)}</time>
        </span>
      </div>
      <div class="share" aria-label="${ctx.t('share')}">
        <a class="share-wa" href="https://wa.me/?text=${enc(post.title + ' ' + link)}" target="_blank" rel="noopener">WhatsApp</a>
        <a class="share-fb" href="https://www.facebook.com/sharer/sharer.php?u=${enc(link)}" target="_blank" rel="noopener">Facebook</a>
        <a class="share-x" href="https://twitter.com/intent/tweet?text=${enc(post.title)}&amp;url=${enc(link)}" target="_blank" rel="noopener">X</a>
        <button type="button" data-copy="${link}" data-done="${ctx.t('copied')}">${ctx.t('copy_link')}</button>
      </div>
    </div>
    ${post.image !== '' ? html`<figure class="story-photo">
      <img src="${imgUrl(post.image)}" alt="${post.image_caption}">
      ${post.image_caption !== '' ? html`<figcaption>${post.image_caption}</figcaption>` : ''}
    </figure>` : ''}
    <div class="story-body">${raw(renderBody(post.body))}</div>
    <div class="share share-end" aria-label="${ctx.t('share')}">
      <span>${ctx.t('share')}</span>
      <a class="share-wa" href="https://wa.me/?text=${enc(post.title + ' ' + link)}" target="_blank" rel="noopener">WhatsApp</a>
      <a class="share-fb" href="https://www.facebook.com/sharer/sharer.php?u=${enc(link)}" target="_blank" rel="noopener">Facebook</a>
    </div>
    ${related.length ? html`<section class="related">
      ${secHead(fmt(ctx.t('related'), post.category_name), '', { href: catUrl(post.category_id), label: ctx.t('see_all') })}
      <div class="grid">${related.map((p) => card(ctx, p, false))}</div>
    </section>` : ''}
  </article>
  <aside class="col-side">${mostReadBox(ctx, mostRead)}${moreNewsBox(ctx, moreNews)}</aside>
</div>`;
  return layout(ctx, {
    title: post.title, description: summary, image, canonical: link, ogType: 'article',
    active: post.category_id || null, noindex: preview, head,
  }, content);
}

/** Box with the phone, email, address and social links from Admin > Settings. */
function contactBox(ctx) {
  const social = [['Facebook', ctx.s.facebook_url], ['YouTube', ctx.s.youtube_url], ['Instagram', ctx.s.instagram_url], ['WhatsApp', ctx.s.whatsapp_url]].filter((x) => x[1]);
  const phone = ctx.set('contact_phone');
  const email = ctx.set('contact_email');
  const address = ctx.set('address');
  if (!phone && !email && !address && !social.length) return '';
  return html`
  <section class="side-box">
    ${secHead(ctx.t('contact_details'))}
    <dl class="info">
      ${phone ? html`<div><dt>${ctx.t('phone')}</dt><dd><a href="tel:${phone.replace(/[^0-9+]/g, '')}">${phone}</a></dd></div>` : ''}
      ${email ? html`<div><dt>${ctx.t('email')}</dt><dd><a href="mailto:${email}">${email}</a></dd></div>` : ''}
      ${address ? html`<div><dt>${ctx.t('address')}</dt><dd>${lines(address)}</dd></div>` : ''}
      ${social.length ? html`<div><dt>${ctx.t('follow')}</dt><dd class="info-links">${social.map(([name, link]) => html`<a href="${link}" target="_blank" rel="noopener">${name}</a>`)}</dd></div>` : ''}
    </dl>
  </section>`;
}

function staticPage(ctx, d) {
  const { page, sent, errors, values, token, moreNews } = d;
  const content = html`
<header class="cat-hero page-hero">
  <div class="wrap">
    <p class="crumbs"><a href="/">${ctx.t('home')}</a><span aria-hidden="true">/</span>${page.title}</p>
    <h1>${page.title}</h1>
  </div>
</header>
<div class="wrap columns">
  <article class="col-main">
    ${page.body.trim() !== '' ? html`<div class="story-body">${raw(renderBody(page.body))}</div>` : ''}
    ${page.show_form ? html`<section class="form-card" id="message">
      ${secHead(ctx.t('send_title'))}
      ${sent ? html`<p class="note note-ok" role="status">${ctx.t('sent')}</p>` : ''}
      ${errors.map((e) => html`<p class="note note-err" role="alert">${e}</p>`)}
      <form method="post" action="/${page.slug}#message">
        <input type="hidden" name="t" value="${token}">
        <p class="hp" aria-hidden="true"><label>Website <input name="website" tabindex="-1" autocomplete="off"></label></p>
        <div class="form-two">
          <label>${ctx.t('your_name')}
            <input name="name" value="${values.name}" maxlength="80" required autocomplete="name">
          </label>
          <label>${ctx.t('your_contact')}
            <input name="contact" value="${values.contact}" maxlength="120" required>
          </label>
        </div>
        <label>${ctx.t('your_message')}
          <textarea name="message" rows="6" maxlength="2000" required>${values.message}</textarea>
        </label>
        <button class="btn" type="submit">${ctx.t('send')}</button>
      </form>
    </section>` : ''}
  </article>
  <aside class="col-side">
    ${contactBox(ctx)}
    ${moreNewsBox(ctx, moreNews)}
  </aside>
</div>`;
  return layout(ctx, { title: page.title, description: plainExcerpt(page.body, 160), canonical: `${ctx.origin}/${page.slug}`, activePage: page.id }, content);
}

function notFoundPage(ctx) {
  const content = html`<div class="wrap notice"><h1>${ctx.t('not_found_title')}</h1><p>${ctx.t('not_found_text')}</p>
<p><a class="btn" href="/">${ctx.t('back_home')}</a></p></div>`;
  return layout(ctx, { title: ctx.t('not_found_title'), noindex: true }, content);
}

const xml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));

function feedXml(ctx, posts) {
  const site = ctx.set('site_name', 'News');
  const items = posts.map((p) => {
    const link = ctx.origin + postUrl(p);
    return `  <item>
    <title>${xml(p.title)}</title>
    <link>${xml(link)}</link>
    <guid isPermaLink="true">${xml(link)}</guid>
    <pubDate>${new Date(p.published_at * 1000).toUTCString()}</pubDate>
${p.category_name ? `    <category>${xml(p.category_name)}</category>\n` : ''}    <description>${xml(summaryOf(p, 300))}</description>
  </item>`;
  }).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
  <title>${xml(site)}</title>
  <link>${xml(ctx.origin + '/')}</link>
  <description>${xml(ctx.set('tagline', site))}</description>
  <language>${ctx.lang}</language>
${items}
</channel>
</rss>
`;
}

function sitemapXml(ctx, posts) {
  const urls = [`  <url><loc>${xml(ctx.origin + '/')}</loc></url>`]
    .concat(ctx.cats.map((c) => `  <url><loc>${xml(ctx.origin + catUrl(c.id))}</loc></url>`))
    .concat(ctx.pages.map((pg) => `  <url><loc>${xml(`${ctx.origin}/${pg.slug}`)}</loc></url>`))
    .concat(posts.map((p) => `  <url><loc>${xml(ctx.origin + postUrl(p))}</loc><lastmod>${isoDate(p.updated_at)}</lastmod></url>`));
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
}

module.exports = { homePage, categoryPage, searchPage, articlePage, staticPage, notFoundPage, feedXml, sitemapXml, postUrl };
