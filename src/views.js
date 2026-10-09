'use strict';
/* Public pages: what readers see. */
const { html, raw, fmt, isoDate } = require('./core');
const { renderBody, plainExcerpt } = require('./render');

const postUrl = (p) => `/news/${p.id}`;
const catUrl = (id) => `/category/${id}`;
const imgUrl = (name) => `/uploads/${name}`;
const summaryOf = (p, len) => (p.summary !== '' ? p.summary : plainExcerpt(p.body, len));

function layout(ctx, o, content) {
  const site = ctx.set('site_name', 'News');
  const tagline = ctx.set('tagline');
  const title = o.title ? `${o.title} | ${site}` : site + (tagline ? ` | ${tagline}` : '');
  const desc = o.description ?? tagline;
  const social = [['Facebook', ctx.s.facebook_url], ['YouTube', ctx.s.youtube_url], ['Instagram', ctx.s.instagram_url], ['WhatsApp', ctx.s.whatsapp_url]].filter((x) => x[1]);
  const hasContact = ctx.set('contact_phone') + ctx.set('contact_email') + ctx.set('address') !== '';
  const lines = (text) => String(text).split(/\r?\n/).map((l, i) => html`${i ? raw('<br>') : ''}${l}`);

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
<link rel="alternate" type="application/rss+xml" title="${site}" href="/feed.xml">
<link rel="stylesheet" href="/assets/css/fonts.css?v=1">
<link rel="stylesheet" href="/assets/css/style.css?v=1">
${o.head || ''}
</head>
<body>
<a class="skip" href="#main">${ctx.lang === 'hi' ? 'सीधे खबरों पर जाएँ' : 'Skip to news'}</a>
<header class="masthead">
  <div class="wrap masthead-in">
    <a class="brand" href="/">
      <span class="brand-name">${site}</span>
      ${tagline ? html`<span class="brand-tag">${tagline}</span>` : ''}
    </a>
    <div class="masthead-side">
      <time class="today" datetime="${isoDate(ctx.now).slice(0, 10)}">${ctx.date(ctx.now, false, true)}</time>
      <form class="search" action="/search" method="get" role="search">
        <label class="sr" for="q">${ctx.t('search')}</label>
        <input id="q" name="q" type="search" placeholder="${ctx.t('search_placeholder')}" value="${o.q || ''}" maxlength="80">
        <button type="submit">${ctx.t('search')}</button>
      </form>
    </div>
  </div>
</header>
<nav class="sections" aria-label="${ctx.t('categories')}">
  <div class="wrap sections-in">
    <a href="/"${o.active === 'home' ? raw(' aria-current="page"') : ''}>${ctx.t('home')}</a>
    ${ctx.cats.map((c) => html`<a href="${catUrl(c.id)}"${o.active === c.id ? raw(' aria-current="page"') : ''}>${c.name}</a>
    `)}
  </div>
</nav>
<main id="main">
${content}
</main>
<footer class="foot">
  <div class="wrap foot-in">
    <div class="foot-about">
      <p class="foot-name">${site}</p>
      ${ctx.set('about') ? html`<p>${lines(ctx.s.about)}</p>` : ''}
    </div>
    <div>
      <h2>${ctx.t('categories')}</h2>
      <ul>${ctx.cats.map((c) => html`<li><a href="${catUrl(c.id)}">${c.name}</a></li>`)}</ul>
    </div>
    ${hasContact ? html`<div>
      <h2>${ctx.t('contact')}</h2>
      <ul>
        ${ctx.set('contact_phone') ? html`<li><a href="tel:${ctx.s.contact_phone.replace(/[^0-9+]/g, '')}">${ctx.s.contact_phone}</a></li>` : ''}
        ${ctx.set('contact_email') ? html`<li><a href="mailto:${ctx.s.contact_email}">${ctx.s.contact_email}</a></li>` : ''}
        ${ctx.set('address') ? html`<li>${lines(ctx.s.address)}</li>` : ''}
      </ul>
    </div>` : ''}
    ${social.length ? html`<div>
      <h2>${ctx.t('follow')}</h2>
      <ul>${social.map(([name, link]) => html`<li><a href="${link}" target="_blank" rel="noopener">${name}</a></li>`)}</ul>
    </div>` : ''}
  </div>
  <div class="wrap foot-base">
    <span>© ${new Date().getFullYear()} ${site}. ${ctx.t('rights')}</span>
    <span><a href="/feed.xml">RSS</a> <a href="/admin">Admin</a></span>
  </div>
</footer>
<script src="/assets/js/site.js?v=1" defer></script>
</body>
</html>`.toString();
}

/** One story in a list: photo on the side, headline, summary, time. */
function storyRow(ctx, p, showSummary = true, showTag = true) {
  const summary = summaryOf(p, 150);
  return html`
  <article class="row${p.image === '' ? ' row-noimg' : ''}">
    ${p.image !== '' ? html`<a class="row-img" href="${postUrl(p)}" tabindex="-1" aria-hidden="true"><img src="${imgUrl(p.image)}" alt="" loading="lazy"></a>` : ''}
    <div class="row-text">
      ${showTag && p.category_name ? html`<a class="tag" href="${catUrl(p.category_id)}">${p.category_name}</a>` : ''}
      <h3><a href="${postUrl(p)}">${p.title}</a></h3>
      ${showSummary && summary !== '' ? html`<p>${summary}</p>` : ''}
      <time datetime="${isoDate(p.published_at)}">${ctx.ago(p.published_at)}</time>
    </div>
  </article>`;
}

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
    <h2>${ctx.t('most_read')}</h2>
    <ol class="ranked">${top.map((p) => html`<li><a href="${postUrl(p)}">${p.title}</a></li>`)}</ol>
  </section>`;
}

function homePage(ctx, d) {
  const { lead, top, latest, breaking, page, pages, mostRead } = d;
  const content = html`
${breaking.length && page === 1 ? html`<div class="breaking">
  <div class="wrap breaking-in">
    <strong>${ctx.t('breaking')}</strong>
    <ul>${breaking.map((b) => html`<li><a href="${postUrl(b)}">${b.title}</a></li>`)}</ul>
  </div>
</div>` : ''}
${!lead ? html`<div class="wrap notice"><p>${ctx.t('no_posts')}</p></div>` : html`
${page === 1 ? html`<section class="wrap front${top.length ? '' : ' front-solo'}">
  <article class="lead${lead.image === '' ? ' lead-noimg' : ''}">
    ${lead.image !== '' ? html`<a class="lead-img" href="${postUrl(lead)}" tabindex="-1" aria-hidden="true"><img src="${imgUrl(lead.image)}" alt=""></a>` : ''}
    <div class="lead-slab">
      ${lead.category_name ? html`<a class="tag" href="${catUrl(lead.category_id)}">${lead.category_name}</a>` : ''}
      <h1><a href="${postUrl(lead)}">${lead.title}</a></h1>
      <p>${summaryOf(lead, 200)}</p>
      <time datetime="${isoDate(lead.published_at)}">${ctx.ago(lead.published_at)}</time>
    </div>
  </article>
  ${top.length ? html`<div class="front-side">${top.map((p) => storyRow(ctx, p, false))}</div>` : ''}
</section>` : ''}
<div class="wrap columns">
  <section class="col-main">
    ${latest.length ? html`<h2 class="heading">${ctx.t('latest')}</h2>
    ${latest.map((p) => storyRow(ctx, p))}
    ${pager(ctx, page, pages, '/')}` : ''}
  </section>
  <aside class="col-side">
    ${mostReadBox(ctx, mostRead)}
    <section class="side-box">
      <h2>${ctx.t('categories')}</h2>
      <ul class="plain">${ctx.cats.map((c) => html`<li><a href="${catUrl(c.id)}">${c.name}</a></li>`)}</ul>
    </section>
  </aside>
</div>`}`;
  return layout(ctx, { active: 'home', canonical: ctx.origin + (page > 1 ? `/?page=${page}` : '/') }, content);
}

function categoryPage(ctx, d) {
  const { cat, posts, total, page, pages, mostRead } = d;
  const content = html`
<div class="wrap columns">
  <section class="col-main">
    <h1 class="heading heading-page">${cat.name} <small>${fmt(ctx.t('stories'), total)}</small></h1>
    ${!posts.length ? html`<p class="empty">${ctx.t('no_posts')}</p>` : html`
      ${posts.map((p) => storyRow(ctx, p, true, false))}
      ${pager(ctx, page, pages, catUrl(cat.id))}`}
  </section>
  <aside class="col-side">${mostReadBox(ctx, mostRead)}</aside>
</div>`;
  return layout(ctx, { title: cat.name, active: cat.id, canonical: ctx.origin + catUrl(cat.id) + (page > 1 ? `?page=${page}` : '') }, content);
}

function searchPage(ctx, d) {
  const { q, posts, page, pages, mostRead } = d;
  const content = html`
<div class="wrap columns">
  <section class="col-main">
    ${q === '' ? html`<h1 class="heading heading-page">${ctx.t('search')}</h1>
      <p class="empty">${ctx.t('search_prompt')}</p>` : html`
      <h1 class="heading heading-page">${fmt(ctx.t('search_results'), q)}</h1>
      ${!posts.length ? html`<p class="empty">${fmt(ctx.t('no_results'), q)}</p>` : html`
        ${posts.map((p) => storyRow(ctx, p))}
        ${pager(ctx, page, pages, '/search?q=' + encodeURIComponent(q))}`}`}
  </section>
  <aside class="col-side">${mostReadBox(ctx, mostRead)}</aside>
</div>`;
  return layout(ctx, { title: ctx.t('search'), q, noindex: true }, content);
}

function articlePage(ctx, d) {
  const { post, related, preview, mostRead } = d;
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
<div class="wrap columns">
  <article class="col-main story">
    ${post.category_name ? html`<a class="tag" href="${catUrl(post.category_id)}">${post.category_name}</a>` : ''}
    <h1>${post.title}</h1>
    ${post.summary !== '' ? html`<p class="story-summary">${post.summary}</p>` : ''}
    <div class="story-meta">
      <div>
        ${post.author !== '' ? html`<span class="story-author">${ctx.t('by')} ${post.author}</span>` : ''}
        <time datetime="${isoDate(post.published_at)}">${ctx.date(post.published_at)}</time>
      </div>
      <div class="share" aria-label="${ctx.t('share')}">
        <a class="share-wa" href="https://wa.me/?text=${enc(post.title + ' ' + link)}" target="_blank" rel="noopener">WhatsApp</a>
        <a href="https://www.facebook.com/sharer/sharer.php?u=${enc(link)}" target="_blank" rel="noopener">Facebook</a>
        <a href="https://twitter.com/intent/tweet?text=${enc(post.title)}&amp;url=${enc(link)}" target="_blank" rel="noopener">X</a>
        <button type="button" data-copy="${link}" data-done="${ctx.t('copied')}">${ctx.t('copy_link')}</button>
      </div>
    </div>
    ${post.image !== '' ? html`<figure class="story-photo">
      <img src="${imgUrl(post.image)}" alt="${post.image_caption}">
      ${post.image_caption !== '' ? html`<figcaption>${post.image_caption}</figcaption>` : ''}
    </figure>` : ''}
    <div class="story-body">${raw(renderBody(post.body))}</div>
    ${related.length ? html`<section class="related">
      <h2 class="heading">${fmt(ctx.t('related'), post.category_name)}</h2>
      ${related.map((p) => storyRow(ctx, p, false, false))}
    </section>` : ''}
  </article>
  <aside class="col-side">${mostReadBox(ctx, mostRead)}</aside>
</div>`;
  return layout(ctx, {
    title: post.title, description: summary, image, canonical: link, ogType: 'article',
    active: post.category_id || null, noindex: preview, head,
  }, content);
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
    .concat(posts.map((p) => `  <url><loc>${xml(ctx.origin + postUrl(p))}</loc><lastmod>${isoDate(p.updated_at)}</lastmod></url>`));
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
}

module.exports = { homePage, categoryPage, searchPage, articlePage, notFoundPage, feedXml, sitemapXml, postUrl };
