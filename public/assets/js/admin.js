// Admin panel behaviour: delete confirmations, editor buttons, photo preview.
(function () {
  // "Are you sure?" before destructive forms.
  document.addEventListener('submit', function (ev) {
    var msg = ev.target.getAttribute('data-confirm');
    if (msg && !window.confirm(msg)) ev.preventDefault();
  });

  // Big phone photos are made smaller in the browser before upload (max 1600px wide, JPEG).
  // If the browser cannot do it, the original file is sent as it is.
  function shrink(file, done) {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return done(file);
    var link = URL.createObjectURL(file);
    var img = new Image();
    img.onerror = function () { URL.revokeObjectURL(link); done(file); };
    img.onload = function () {
      var scale = Math.min(1, 1600 / img.naturalWidth);
      if (scale === 1 && file.type === 'image/jpeg' && file.size < 500 * 1024) { URL.revokeObjectURL(link); return done(file); }
      try {
        var c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.naturalWidth * scale));
        c.height = Math.max(1, Math.round(img.naturalHeight * scale));
        var g = c.getContext('2d');
        g.fillStyle = '#fff';
        g.fillRect(0, 0, c.width, c.height);
        g.drawImage(img, 0, 0, c.width, c.height);
        c.toBlob(function (blob) {
          URL.revokeObjectURL(link);
          done(blob && blob.size < file.size ? new File([blob], 'photo.jpg', { type: 'image/jpeg' }) : file);
        }, 'image/jpeg', 0.84);
      } catch (e) { URL.revokeObjectURL(link); done(file); }
    };
    img.src = link;
  }

  // Main photo: shrink it, put the smaller file back in the form, show a preview.
  var file = document.getElementById('image');
  if (file) {
    file.addEventListener('change', function () {
      var f = file.files && file.files[0];
      if (!f) return;
      shrink(f, function (small) {
        if (small !== f) {
          try { var box = new DataTransfer(); box.items.add(small); file.files = box.files; } catch (e) { small = f; }
        }
        document.getElementById('photo-preview').src = URL.createObjectURL(small);
        document.getElementById('photo-box').hidden = false;
      });
    });
  }

  var tools = document.querySelector('.tools');
  if (!tools) return;
  var area = document.getElementById(tools.getAttribute('data-for'));
  var note = tools.querySelector('.tools-note');

  function replace(start, end, text, selStart, selEnd) {
    area.focus();
    area.setRangeText(text, start, end, 'end');
    if (selStart !== undefined) area.setSelectionRange(selStart, selEnd);
    area.dispatchEvent(new Event('input', { bubbles: true }));
  }

  // Put a block (photo, video) on its own line with blank lines around it.
  function insertBlock(text) {
    var pos = area.selectionEnd;
    var before = area.value.slice(0, pos);
    var after = area.value.slice(pos);
    var pre = before === '' || /\n\n$/.test(before) ? '' : (/\n$/.test(before) ? '\n' : '\n\n');
    var post = /^\n\n/.test(after) ? '' : (/^\n/.test(after) ? '\n' : '\n\n');
    replace(pos, pos, pre + text + post);
  }

  function wrap(mark) {
    var s = area.selectionStart, e = area.selectionEnd;
    var picked = area.value.slice(s, e) || 'text';
    replace(s, e, mark + picked + mark, s + mark.length, s + mark.length + picked.length);
  }

  function prefixLines(prefix) {
    var s = area.selectionStart, e = area.selectionEnd;
    var lineStart = area.value.lastIndexOf('\n', s - 1) + 1;
    var lineEnd = area.value.indexOf('\n', e);
    if (lineEnd === -1) lineEnd = area.value.length;
    var lines = area.value.slice(lineStart, lineEnd).split('\n').map(function (l) { return prefix + l; });
    replace(lineStart, lineEnd, lines.join('\n'));
  }

  var picker = document.createElement('input');
  picker.type = 'file';
  picker.accept = 'image/jpeg,image/png,image/webp,image/gif';
  picker.addEventListener('change', function () {
    var f = picker.files && picker.files[0];
    if (!f) return;
    note.textContent = 'Uploading photo';
    shrink(f, function (small) {
      var data = new FormData();
      data.append('csrf', tools.getAttribute('data-csrf'));
      data.append('photo', small, small.name || 'photo.jpg');
      fetch(tools.getAttribute('data-upload'), { method: 'POST', body: data, credentials: 'same-origin' })
        .then(function (r) { return r.json(); })
        .then(function (res) {
          if (!res.ok) throw new Error(res.error);
          var caption = window.prompt('Photo caption (optional)', '') || '';
          insertBlock('![' + caption.replace(/[\[\]\n]/g, ' ') + '](' + res.path + ')');
          note.textContent = 'Photo added';
        })
        .catch(function (err) {
          note.textContent = '';
          window.alert(err && err.message && err.name === 'Error' ? err.message : 'The photo could not be uploaded. Check your internet and try again.');
        })
        .then(function () { picker.value = ''; });
    });
  });

  tools.addEventListener('click', function (ev) {
    var b = ev.target.closest('button');
    if (!b) return;
    if (b.dataset.wrap) return wrap(b.dataset.wrap);
    if (b.dataset.line) return prefixLines(b.dataset.line);
    if (b.dataset.tool === 'photo') return picker.click();
    if (b.dataset.tool === 'link') {
      var href = window.prompt('Paste the link (starting with https://)', 'https://');
      if (!href || !/^https?:\/\/\S+$/.test(href.trim())) return;
      var s = area.selectionStart, e = area.selectionEnd;
      var label = area.value.slice(s, e) || 'link text';
      return replace(s, e, '[' + label + '](' + href.trim() + ')');
    }
    if (b.dataset.tool === 'youtube') {
      var yt = window.prompt('Paste the YouTube video link', '');
      if (!yt) return;
      if (!/(youtube\.com|youtu\.be)\//.test(yt)) return window.alert('That does not look like a YouTube link.');
      return insertBlock(yt.trim());
    }
  });
})();
