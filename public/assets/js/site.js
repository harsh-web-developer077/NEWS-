// Copy-link button on story pages.
document.addEventListener('click', function (ev) {
  var btn = ev.target.closest('[data-copy]');
  if (!btn) return;
  var link = btn.getAttribute('data-copy');
  var label = btn.textContent;
  function done() {
    btn.textContent = btn.getAttribute('data-done');
    setTimeout(function () { btn.textContent = label; }, 1800);
  }
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(link).then(done);
  } else {
    var box = document.createElement('textarea');
    box.value = link;
    document.body.appendChild(box);
    box.select();
    try { document.execCommand('copy'); done(); } catch (e) {}
    box.remove();
  }
});
