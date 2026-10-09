'use strict';
/* Admin panel pages. */
const { html, raw, toLocalInput, ZONES } = require('./core');

const num = (n) => Number(n).toLocaleString('en-IN');
const csrfField = (a) => html`<input type="hidden" name="csrf" value="${a.csrf}">`;
const sel = (on) => (on ? raw(' selected') : '');
const chk = (on) => (on ? raw(' checked') : '');
const cur = (on) => (on ? raw(' aria-current="page"') : '');

/** a = { ctx, csrf, flash: [[type, msg]], user, warning } */
function layout(a, title, active, content, bare = false) {
  const site = a.ctx.set('site_name', 'News');
  return html`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${title} | ${site} admin</title>
<link rel="stylesheet" href="/assets/css/fonts.css?v=1">
<link rel="stylesheet" href="/assets/css/admin.css?v=5">
</head>
<body${bare ? raw(' class="bare"') : ''}>
${bare ? '' : html`<header class="bar">
  <div class="bar-in">
    <a class="bar-name" href="/admin">${site}</a>
    <nav>
      <a href="/admin"${cur(active === 'news')}>All news</a>
      <a href="/admin/post"${cur(active === 'add')}>Add news</a>
      <a href="/admin/categories"${cur(active === 'categories')}>Categories</a>
      <a href="/admin/pages"${cur(active === 'pages')}>Pages</a>
      <a href="/admin/messages"${cur(active === 'messages')}>Messages${a.unread ? html` <b class="count-badge">${a.unread}</b>` : ''}</a>
      <a href="/admin/settings"${cur(active === 'settings')}>Settings</a>
      <a href="/admin/backup"${cur(active === 'backup')}>Backup</a>
    </nav>
    <div class="bar-end">
      <a href="/" target="_blank" rel="noopener">View site</a>
      <form method="post" action="/admin/logout">${csrfField(a)}<button type="submit" class="link">Log out</button></form>
    </div>
  </div>
</header>`}
<main class="page">
${!bare && a.warning ? html`<div class="flash flash-warn" role="alert">${a.warning}</div>` : ''}
${(a.flash || []).map(([type, msg]) => html`<div class="flash flash-${type === 'error' ? 'error' : 'ok'}" role="status">${msg}</div>`)}
${content}
</main>
<script src="/assets/js/admin.js?v=3" defer></script>
</body>
</html>`.toString();
}

function setupPage(a, v, errors, fresh) {
  return layout(a, 'Set up', '', html`
<div class="card auth">
  <h1>${fresh ? 'Set up your news site' : 'Create a new login'}</h1>
  <p class="hint">${fresh ? 'This takes a minute and happens only once. You will use this username and password to add news every day.' : 'There is no admin login yet. Your news, photos and settings are unchanged.'}</p>
  ${errors.map((e) => html`<div class="flash flash-error">${e}</div>`)}
  <form method="post" action="/admin/setup" autocomplete="off">
    ${csrfField(a)}
    <label>Name of your news site
      <input name="site_name" value="${v.site_name}" maxlength="60" required>
    </label>
    <label>Language of the website
      <select name="lang">
        <option value="hi"${sel(v.lang === 'hi')}>हिन्दी (Hindi)</option>
        <option value="en"${sel(v.lang === 'en')}>English</option>
      </select>
    </label>
    <label>Admin username
      <input name="username" value="${v.username}" maxlength="30" autocapitalize="none" required>
    </label>
    <label>Password <small>at least 8 characters</small>
      <input name="password" type="password" minlength="8" autocomplete="new-password" required>
    </label>
    <label>Password again
      <input name="password2" type="password" minlength="8" autocomplete="new-password" required>
    </label>
    <button class="btn" type="submit">${fresh ? 'Create my site' : 'Create login'}</button>
  </form>
</div>`, true);
}

function loginPage(a, username, error) {
  return layout(a, 'Log in', '', html`
<div class="card auth">
  <h1>${a.ctx.set('site_name', 'News')}</h1>
  <p class="hint">Log in to add and manage news.</p>
  ${error ? html`<div class="flash flash-error">${error}</div>` : ''}
  <form method="post" action="/admin/login">
    ${csrfField(a)}
    <label>Username
      <input name="username" value="${username}" autocapitalize="none" autocomplete="username" required autofocus>
    </label>
    <label>Password
      <input name="password" type="password" autocomplete="current-password" required>
    </label>
    <button class="btn" type="submit">Log in</button>
  </form>
  <p class="hint"><a href="/">Back to the website</a></p>
</div>`, true);
}

function listPage(a, d) {
  const { posts, stats, show, q, page, pages, qs } = d;
  const tabs = [['all', 'All'], ['published', 'Published'], ['draft', 'Drafts'], ['scheduled', 'Scheduled']];
  const short = (ts) => a.ctx.date(ts);
  const baseQs = new URLSearchParams();
  if (show !== 'all') baseQs.set('show', show);
  if (q) baseQs.set('q', q);
  const pageLink = (n) => { const u = new URLSearchParams(baseQs); if (n > 1) u.set('page', n); const s = u.toString(); return '/admin' + (s ? '?' + s : ''); };

  return layout(a, 'All news', 'news', html`
<div class="head">
  <h1>All news</h1>
  <a class="btn" href="/admin/post">Add news</a>
</div>
<div class="stats">
  ${stats.map(([label, n]) => html`<div><b>${num(n)}</b><span>${label}</span></div>`)}
</div>
<div class="filters">
  <div class="tabs">
    ${tabs.map(([key, label]) => html`<a href="/admin${key === 'all' ? '' : '?show=' + key}"${cur(show === key)}>${label}</a>`)}
  </div>
  <form method="get" action="/admin" class="find">
    ${show !== 'all' ? html`<input type="hidden" name="show" value="${show}">` : ''}
    <input name="q" type="search" value="${q}" placeholder="Find by headline" aria-label="Find by headline">
    <button class="btn btn-quiet" type="submit">Find</button>
  </form>
</div>
${!posts.length ? html`<div class="card empty">
  ${q !== '' || show !== 'all' ? html`<p>No story matches this filter.</p>` : html`<p>No news yet. Add your first story and it will appear on the website.</p>
  <a class="btn" href="/admin/post">Add news</a>`}
</div>` : html`<div class="card table-card">
<table class="list">
  <thead><tr><th>Headline</th><th>Category</th><th>Date</th><th class="num">Views</th><th></th></tr></thead>
  <tbody>
  ${posts.map((p) => {
    const scheduled = p.status === 'published' && p.published_at > a.ctx.now;
    return html`<tr>
      <td class="title">
        <a href="/admin/post/${p.id}">${p.title}</a>
        <div class="badges">${p.status === 'draft' ? raw('<span class="badge badge-draft">Draft</span>') : ''}${scheduled ? raw('<span class="badge badge-sched">Scheduled</span>') : ''}${p.is_featured ? raw('<span class="badge badge-top">Top story</span>') : ''}${p.is_breaking ? raw('<span class="badge badge-break">Breaking</span>') : ''}</div>
      </td>
      <td data-label="Category">${p.category_name || 'None'}</td>
      <td data-label="Date">${short(p.published_at)}</td>
      <td class="num" data-label="Views">${num(p.views)}</td>
      <td class="acts">
        <a href="/admin/post/${p.id}">Edit</a>
        <a href="/news/${p.id}" target="_blank" rel="noopener">${p.status === 'draft' || scheduled ? 'Preview' : 'View'}</a>
        <form method="post" action="/admin/delete" data-confirm="Delete this story? This cannot be undone.">
          ${csrfField(a)}
          <input type="hidden" name="id" value="${p.id}">
          <input type="hidden" name="back" value="${qs}">
          <button type="submit" class="link danger">Delete</button>
        </form>
      </td>
    </tr>`;
  })}
  </tbody>
</table>
</div>
${pages > 1 ? html`<nav class="pages">
  ${page > 1 ? html`<a class="btn btn-quiet" href="${pageLink(page - 1)}">Newer</a>` : ''}
  <span>Page ${page} of ${pages}</span>
  ${page < pages ? html`<a class="btn btn-quiet" href="${pageLink(page + 1)}">Older</a>` : ''}
</nav>` : ''}`}`);
}

function postPage(a, post, errors, isNew) {
  const live = post.status === 'published' && post.published_at <= a.ctx.now;
  const status = isNew ? 'Not saved yet' : post.status === 'draft' ? 'Draft' : live ? 'Published' : 'Scheduled';
  const when = isNew && !errors.length ? '' : toLocalInput(post.published_at, a.ctx.tz);
  return layout(a, isNew ? 'Add news' : 'Edit news', isNew ? 'add' : 'news', html`
<div class="head">
  <h1>${isNew ? 'Add news' : 'Edit news'}</h1>
  ${isNew ? '' : html`<a class="btn btn-quiet" href="/news/${post.id}" target="_blank" rel="noopener">${live ? 'View on website' : 'Preview'}</a>`}
</div>
${errors.map((e) => html`<div class="flash flash-error">${e}</div>`)}
<form method="post" action="/admin/post${isNew ? '' : '/' + post.id}" enctype="multipart/form-data" class="editor">
  ${csrfField(a)}
  <div class="editor-main card">
    <label>Headline
      <input name="title" value="${post.title}" maxlength="200" required class="big"${isNew ? raw(' autofocus') : ''}>
    </label>
    <label>Short summary <small>one or two lines shown under the headline (optional)</small>
      <textarea name="summary" rows="2" maxlength="400">${post.summary}</textarea>
    </label>
    <div class="field">
      <label for="body">Full story</label>
      <div class="tools" data-for="body" data-upload="/admin/upload" data-csrf="${a.csrf}">
        <button type="button" data-wrap="**" title="Bold"><b>Bold</b></button>
        <button type="button" data-line="## " title="Sub-heading">Heading</button>
        <button type="button" data-line="&gt; " title="Quote">Quote</button>
        <button type="button" data-line="- " title="Bullet list">List</button>
        <button type="button" data-tool="link">Link</button>
        <button type="button" data-tool="photo">Photo</button>
        <button type="button" data-tool="youtube">YouTube</button>
        <span class="tools-note" aria-live="polite"></span>
      </div>
      <textarea id="body" name="body" rows="18">${post.body}</textarea>
      <p class="hint">Leave an empty line between paragraphs. Use the buttons above for bold text, headings, photos inside the story and YouTube videos.</p>
    </div>
  </div>
  <div class="editor-side">
    <div class="card">
      <div class="status-line">Status: <b>${status}</b></div>
      <button class="btn btn-wide" type="submit" name="action" value="publish">${post.status === 'published' ? 'Save changes' : 'Publish'}</button>
      <button class="btn btn-quiet btn-wide" type="submit" name="action" value="draft">${post.status === 'published' ? 'Unpublish and save as draft' : 'Save as draft'}</button>
    </div>
    <div class="card">
      <label>Category
        <select name="category_id">
          <option value="0">No category</option>
          ${a.ctx.cats.map((c) => html`<option value="${c.id}"${sel(Number(post.category_id) === c.id)}>${c.name}</option>`)}
        </select>
      </label>
      <label class="check"><input type="checkbox" name="is_featured" value="1"${chk(post.is_featured)}> <span>Show as top story <small>biggest spot on the home page</small></span></label>
      <label class="check"><input type="checkbox" name="is_breaking" value="1"${chk(post.is_breaking)}> <span>Breaking news <small>red strip on the home page for 24 hours</small></span></label>
    </div>
    <div class="card">
      <label for="image">Main photo</label>
      <div class="photo-box" id="photo-box"${post.image === '' ? raw(' hidden') : ''}>
        <img id="photo-preview" src="${post.image === '' ? '' : '/uploads/' + post.image}" alt="">
      </div>
      <input id="image" name="image" type="file" accept="image/jpeg,image/png,image/webp,image/gif">
      <p class="hint">JPG or PNG. Big photos are made smaller automatically. Wide photos look best.</p>
      ${post.image !== '' ? html`<label class="check"><input type="checkbox" name="remove_image" value="1"> <span>Remove this photo</span></label>` : ''}
      <label>Photo caption <small>optional</small>
        <input name="image_caption" value="${post.image_caption}" maxlength="200">
      </label>
    </div>
    <div class="card">
      <label>Reporter name
        <input name="author" value="${post.author}" maxlength="80">
      </label>
      <label>Publish date and time <small>${isNew ? 'leave empty to publish now, or pick a future time to schedule' : 'pick a future time to schedule'}</small>
        <input name="published_at" type="datetime-local" value="${when}">
      </label>
    </div>
  </div>
</form>`);
}

function categoriesPage(a, rows) {
  return layout(a, 'Categories', 'categories', html`
<div class="head"><h1>Categories</h1></div>
<p class="hint lead-hint">Categories are the sections in the website menu. The order number decides which comes first.</p>
<div class="card">
  <form method="post" action="/admin/categories" class="inline-form">
    ${csrfField(a)}
    <input type="hidden" name="action" value="add">
    <label class="grow">New category
      <input name="name" maxlength="40" required>
    </label>
    <button class="btn" type="submit">Add category</button>
  </form>
</div>
${!rows.length ? html`<div class="card empty"><p>No categories yet. Add one above to create the website menu.</p></div>` : html`<div class="card">
  ${rows.map((c) => html`<div class="cat-row">
    <form method="post" action="/admin/categories" class="inline-form grow">
      ${csrfField(a)}
      <input type="hidden" name="action" value="save">
      <input type="hidden" name="id" value="${c.id}">
      <label class="grow">Name
        <input name="name" value="${c.name}" maxlength="40" required>
      </label>
      <label class="narrow">Order
        <input name="sort" type="number" min="0" max="999" value="${c.sort}">
      </label>
      <span class="count">${c.n} ${Number(c.n) === 1 ? 'story' : 'stories'}</span>
      <button class="btn btn-quiet" type="submit">Save</button>
    </form>
    <form method="post" action="/admin/categories" data-confirm="Delete the category “${c.name}”? Its stories stay on the site without a category.">
      ${csrfField(a)}
      <input type="hidden" name="action" value="delete">
      <input type="hidden" name="id" value="${c.id}">
      <button class="link danger" type="submit">Delete</button>
    </form>
  </div>`)}
</div>`}`);
}

function settingsPage(a) {
  const s = (k, d = '') => a.ctx.set(k, d);
  return layout(a, 'Settings', 'settings', html`
<div class="head"><h1>Settings</h1></div>
<form method="post" action="/admin/settings" class="card form-grid">
  ${csrfField(a)}
  <h2>Website</h2>
  <label>Site name
    <input name="site_name" value="${s('site_name')}" maxlength="60" required>
  </label>
  <label>Tagline <small>short line under the name</small>
    <input name="tagline" value="${s('tagline')}" maxlength="120">
  </label>
  <label>Language of the website
    <select name="lang">
      <option value="hi"${sel(a.ctx.lang === 'hi')}>हिन्दी (Hindi)</option>
      <option value="en"${sel(a.ctx.lang === 'en')}>English</option>
    </select>
  </label>
  <label>Stories per page
    <input name="per_page" type="number" min="4" max="40" value="${s('per_page', '10')}">
  </label>
  <label>Default reporter name <small>filled in on every new story</small>
    <input name="default_author" value="${s('default_author')}" maxlength="80">
  </label>
  <label>Time zone
    <select name="timezone">${ZONES.map((z) => html`<option${sel(a.ctx.tz === z)}>${z}</option>`)}</select>
  </label>
  <label class="full">About the site <small>shown in the footer</small>
    <textarea name="about" rows="3" maxlength="600">${s('about')}</textarea>
  </label>
  <h2>Contact</h2>
  <label>Phone
    <input name="contact_phone" value="${s('contact_phone')}" maxlength="40">
  </label>
  <label>Email
    <input name="contact_email" type="email" value="${s('contact_email')}">
  </label>
  <label class="full">Address
    <textarea name="address" rows="2" maxlength="300">${s('address')}</textarea>
  </label>
  <h2>Social links <small>full links starting with https://</small></h2>
  <label>Facebook page
    <input name="facebook_url" type="url" value="${s('facebook_url')}" placeholder="https://">
  </label>
  <label>YouTube channel
    <input name="youtube_url" type="url" value="${s('youtube_url')}" placeholder="https://">
  </label>
  <label>Instagram
    <input name="instagram_url" type="url" value="${s('instagram_url')}" placeholder="https://">
  </label>
  <label>WhatsApp channel or group
    <input name="whatsapp_url" type="url" value="${s('whatsapp_url')}" placeholder="https://">
  </label>
  <label class="full">Website address <small>optional, for example https://www.yoursite.com. Used in links shared on WhatsApp and Facebook.</small>
    <input name="site_url" type="url" value="${s('site_url')}" placeholder="https://">
  </label>
  <div class="full"><button class="btn" type="submit">Save settings</button></div>
</form>
<form method="post" action="/admin/password" class="card form-grid" autocomplete="off">
  ${csrfField(a)}
  <h2>Change password <small>logged in as ${a.user.username}</small></h2>
  <label class="full">Current password
    <input name="current_password" type="password" autocomplete="current-password" required>
  </label>
  <label>New password <small>at least 8 characters</small>
    <input name="new_password" type="password" minlength="8" autocomplete="new-password" required>
  </label>
  <label>New password again
    <input name="new_password2" type="password" minlength="8" autocomplete="new-password" required>
  </label>
  <div class="full"><button class="btn" type="submit">Change password</button></div>
</form>`);
}

function backupPage(a, d) {
  const mb = (bytes) => (bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0);
  return layout(a, 'Backup', 'backup', html`
<div class="head"><h1>Backup</h1></div>
<div class="card">
  <h2>Where your news is stored</h2>
  <p class="para">${d.kind === 'postgres'
    ? 'Every story, photo and setting is saved in your PostgreSQL database (the DATABASE_URL of this site). It stays there when the site restarts or is updated.'
    : 'Every story, photo and setting is saved in the file news.sqlite in the data folder of this server.'}</p>
  <div class="stats stats-3">
    <div><b>${num(d.posts)}</b><span>Stories</span></div>
    <div><b>${num(d.images)}</b><span>Photos</span></div>
    <div><b>${mb(d.bytes)} MB</b><span>Size of all photos</span></div>
  </div>
</div>
<div class="card">
  <h2>Copies to your email</h2>
  <p class="para">The website always reads its news from the database. Email is a second, safe copy: each story is emailed to you when it is published, and the full backup file arrives once a week.</p>
  ${d.mail.hasKey ? html`<p class="para"><b>Email is switched on.</b> ${d.mail.email ? '' : 'Type your address below to start.'}
    ${d.mail.lastBackup ? `Last backup emailed on ${a.ctx.date(d.mail.lastBackup)}.` : ''} ${d.mail.copies ? `${num(d.mail.copies)} ${d.mail.copies === 1 ? 'story' : 'stories'} emailed so far.` : ''}</p>` : html`<div class="steps">
    <p><b>Email is not switched on yet.</b> It needs a free account with the email service Resend:</p>
    <ol>
      <li>Open resend.com and create an account <b>with the same email address where you want the copies</b>.</li>
      <li>In Resend, open “API Keys”, create a key and copy it (it starts with re_).</li>
      <li>In Render, open this site &gt; Environment, add a variable named <b>RESEND_API_KEY</b> with that key as its value, and save.</li>
    </ol>
    <p>The site restarts on its own. Then come back to this page.</p>
  </div>`}
  <form method="post" action="/admin/backup/email" class="mail-form">
    ${csrfField(a)}
    <label>Your email address
      <input name="backup_email" type="email" value="${d.mail.email}" maxlength="120" placeholder="name@gmail.com" autocomplete="email">
    </label>
    <label class="check"><input type="checkbox" name="mail_stories" value="1"${chk(d.mail.stories)}> <span>Email me every story when it is published <small>with its main photo attached</small></span></label>
    <label class="check"><input type="checkbox" name="mail_weekly" value="1"${chk(d.mail.weekly)}> <span>Email me the full backup file every week <small>photos are included while they fit in an email</small></span></label>
    <label class="check"><input type="checkbox" name="mail_messages" value="1"${chk(d.mail.messages)}> <span>Email me messages from the Contact page</span></label>
    <button class="btn" type="submit">Save email choices</button>
  </form>
  <form method="post" action="/admin/backup/email-now" class="mail-now">
    ${csrfField(a)}
    <button class="btn btn-quiet" type="submit">Email a backup now</button>
    <span class="hint">Sends the backup file to your address straight away. Use it once to check that email works.</span>
  </form>
</div>
<div class="card">
  <h2>Download a backup</h2>
  <p class="para">A backup is one file with a copy of everything. Keep it outside this site: email it to yourself or put it in Google Drive. Download a new one every week or so.</p>
  <div class="choices">
    <div>
      <a class="btn" href="/admin/backup/download">Download stories</a>
      <p class="hint">All stories, categories and settings, without photos. A small file that fits in an email.</p>
    </div>
    <div>
      <a class="btn btn-quiet" href="/admin/backup/download?photos=1">Download stories and photos</a>
      <p class="hint">Everything, about ${mb(d.bytes * 1.37 + 200000)} MB now. Most email services accept attachments up to 20 or 25 MB; use Google Drive when it is larger.</p>
    </div>
  </div>
</div>
<div class="card">
  <h2>Restore from a backup</h2>
  <p class="para">Adds the stories, categories and photos from a backup file that are missing here. Nothing on the site is deleted or replaced.</p>
  <form method="post" action="/admin/backup/restore" enctype="multipart/form-data" class="inline-form" data-confirm="Add everything from this backup file to the site?">
    ${csrfField(a)}
    <label class="grow">Backup file
      <input name="backup" type="file" accept=".txt,text/plain" required>
    </label>
    <button class="btn" type="submit">Restore</button>
  </form>
</div>`);
}

function pagesPage(a, rows) {
  return layout(a, 'Pages', 'pages', html`
<div class="head">
  <h1>Pages</h1>
  <a class="btn" href="/admin/page">Add page</a>
</div>
<p class="hint lead-hint">Pages hold information that does not change every day, such as About us and Contact. Links to them appear at the top and bottom of the website.</p>
${!rows.length ? html`<div class="card empty"><p>No pages yet. Add an About or Contact page for your readers.</p><a class="btn" href="/admin/page">Add page</a></div>` : html`<div class="card table-card">
<table class="list">
  <thead><tr><th>Title</th><th>Address</th><th>Contact form</th><th class="num">Order</th><th></th></tr></thead>
  <tbody>
  ${rows.map((p) => html`<tr>
    <td class="title"><a href="/admin/page/${p.id}">${p.title}</a></td>
    <td data-label="Address">/${p.slug}</td>
    <td data-label="Contact form">${p.show_form ? 'Yes' : 'No'}</td>
    <td class="num" data-label="Order">${p.sort}</td>
    <td class="acts">
      <a href="/admin/page/${p.id}">Edit</a>
      <a href="/${p.slug}" target="_blank" rel="noopener">View</a>
      <form method="post" action="/admin/pages/delete" data-confirm="Delete the page “${p.title}”? This cannot be undone.">
        ${csrfField(a)}
        <input type="hidden" name="id" value="${p.id}">
        <button type="submit" class="link danger">Delete</button>
      </form>
    </td>
  </tr>`)}
  </tbody>
</table>
</div>`}`);
}

function pageEditPage(a, page, errors, isNew) {
  return layout(a, isNew ? 'Add page' : 'Edit page', 'pages', html`
<div class="head">
  <h1>${isNew ? 'Add page' : 'Edit page'}</h1>
  ${isNew ? '' : html`<a class="btn btn-quiet" href="/${page.slug}" target="_blank" rel="noopener">View on website</a>`}
</div>
${errors.map((e) => html`<div class="flash flash-error">${e}</div>`)}
<form method="post" action="/admin/page${isNew ? '' : '/' + page.id}" class="editor">
  ${csrfField(a)}
  <div class="editor-main card">
    <label>Page title
      <input name="title" id="page-title" value="${page.title}" maxlength="80" required class="big"${isNew ? raw(' autofocus') : ''}>
    </label>
    <div class="field">
      <label for="body">Page text</label>
      <div class="tools" data-for="body" data-upload="/admin/upload" data-csrf="${a.csrf}">
        <button type="button" data-wrap="**" title="Bold"><b>Bold</b></button>
        <button type="button" data-line="## " title="Sub-heading">Heading</button>
        <button type="button" data-line="&gt; " title="Quote">Quote</button>
        <button type="button" data-line="- " title="Bullet list">List</button>
        <button type="button" data-tool="link">Link</button>
        <button type="button" data-tool="photo">Photo</button>
        <button type="button" data-tool="youtube">YouTube</button>
        <span class="tools-note" aria-live="polite"></span>
      </div>
      <textarea id="body" name="body" rows="16">${page.body}</textarea>
      <p class="hint">Leave an empty line between paragraphs. Phone, email and address are added to the page automatically from Settings.</p>
    </div>
  </div>
  <div class="editor-side">
    <div class="card">
      <button class="btn btn-wide" type="submit">${isNew ? 'Publish page' : 'Save changes'}</button>
    </div>
    <div class="card">
      <label>Page address <small>small English letters, numbers and hyphens</small>
        <input name="slug" id="page-slug" value="${page.slug}" maxlength="60" required autocapitalize="none" pattern="[a-z0-9][a-z0-9\\-]{1,58}"${isNew ? raw(' data-auto="1"') : ''}>
      </label>
      <p class="hint">The page opens at yoursite.com/<b id="slug-show">${page.slug || 'address'}</b></p>
    </div>
    <div class="card">
      <label class="check"><input type="checkbox" name="show_form" value="1"${chk(page.show_form)}> <span>Show a message form on this page <small>readers can write to you; messages arrive in Messages</small></span></label>
      <label>Order <small>smaller numbers come first in the links</small>
        <input name="sort" type="number" min="0" max="999" value="${page.sort}">
      </label>
    </div>
  </div>
</form>`);
}

function messagesPage(a, d) {
  const { rows, page, pages, total } = d;
  return layout(a, 'Messages', 'messages', html`
<div class="head"><h1>Messages</h1></div>
<p class="hint lead-hint">Messages that readers send from the form on your Contact page. ${total ? `${num(total)} in all.` : ''}</p>
${!rows.length ? html`<div class="card empty"><p>No messages yet. When a reader writes to you from the Contact page, it shows here.</p></div>` : html`
${rows.map((m) => html`<article class="card msg${m.is_read ? '' : ' msg-new'}">
  <header>
    <div><b>${m.name}</b> <span class="msg-contact">${m.contact}</span>${m.is_read ? '' : raw(' <span class="badge badge-sched">New</span>')}</div>
    <time>${a.ctx.date(m.created_at)}</time>
  </header>
  <p>${m.body.split(/\r?\n/).map((l, i) => html`${i ? raw('<br>') : ''}${l}`)}</p>
  <footer>
    <form method="post" action="/admin/messages">
      ${csrfField(a)}
      <input type="hidden" name="id" value="${m.id}">
      <input type="hidden" name="back" value="${page}">
      <button class="link" type="submit" name="action" value="${m.is_read ? 'unread' : 'read'}">${m.is_read ? 'Mark as new' : 'Mark as read'}</button>
    </form>
    <form method="post" action="/admin/messages" data-confirm="Delete this message?">
      ${csrfField(a)}
      <input type="hidden" name="id" value="${m.id}">
      <input type="hidden" name="back" value="${page}">
      <button class="link danger" type="submit" name="action" value="delete">Delete</button>
    </form>
  </footer>
</article>`)}
${pages > 1 ? html`<nav class="pages">
  ${page > 1 ? html`<a class="btn btn-quiet" href="/admin/messages${page > 2 ? '?page=' + (page - 1) : ''}">Newer</a>` : ''}
  <span>Page ${page} of ${pages}</span>
  ${page < pages ? html`<a class="btn btn-quiet" href="/admin/messages?page=${page + 1}">Older</a>` : ''}
</nav>` : ''}`}`);
}

function messagePage(a, title, text) {
  return layout(a, title, '', html`<div class="card auth"><h1>${title}</h1><p class="hint">${text}</p><p class="hint"><a href="/admin">Back to the admin panel</a></p></div>`, true);
}

module.exports = { setupPage, loginPage, listPage, postPage, categoriesPage, settingsPage, backupPage, pagesPage, pageEditPage, messagesPage, messagePage };
