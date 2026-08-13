(function () {
  'use strict';
  var browseKey = 'zhiqu.browse.history.v1';
  var styleAdded = false;
  function path() { return (window.location.pathname || '/').replace(/\/+$/, '') || '/'; }
  function isRecordable(current) {
    return /^\/content\/[^/]+$/.test(current)
      || /^\/community\/questions\/[^/]+$/.test(current)
      || /^\/mentor\/[^/]+$/.test(current);
  }
  function pageTitle(current) {
    var heading = Array.from(document.querySelectorAll('h1,[role="heading"]')).map(function (element) {
      return String(element.textContent || '').replace(/\s+/g, ' ').trim();
    }).find(function (value) {
      return value && value !== '记录中心' && value !== 'AI 探究手账' && value !== '学习图谱';
    });
    if (heading) return heading;
    var documentTitle = String(document.title || '').replace(/\s*[·|丨-]\s*(智趣|Zhiqu).*$/i, '').trim();
    return documentTitle && documentTitle !== '智趣' ? documentTitle : '';
  }
  function remember() {
    var current = path();
    if (!isRecordable(current)) return;
    var title = pageTitle(current);
    if (!title) return;
    try {
      var entries = JSON.parse(window.localStorage.getItem(browseKey) || '[]');
      entries = Array.isArray(entries) ? entries : [];
      var now = new Date().toISOString();
      entries = [{ path: current, title: title, meta: '浏览过', at: now }].concat(entries.filter(function (entry) { return entry && entry.path !== current && isRecordable(String(entry.path || '')); })).slice(0, 30);
      window.localStorage.setItem(browseKey, JSON.stringify(entries));
    } catch (_) {}
  }
  function addEntry() {
    if (path() !== '/') return;
    var title = Array.from(document.querySelectorAll('div')).find(function (element) { return element.textContent === '最近记录'; });
    if (!title) return;
    if (title.getAttribute('data-zq-records-entry')) {
      Array.from(document.querySelectorAll('button[aria-label="打开画里藏词记录"]')).slice(1).forEach(function (row) { row.style.display = 'none'; });
      return;
    }
    if (!styleAdded) {
      var style = document.createElement('style');
      style.textContent = '.zq-records-view-all{margin-left:auto;padding:5px 9px;border:1px solid #c8d9c3;border-radius:6px;background:#f3f8ee;color:#4d8055;font:800 11px/1 "Microsoft YaHei",sans-serif;cursor:pointer}.zq-records-view-all:hover{background:#e8f2e2}';
      document.head.appendChild(style);
      styleAdded = true;
    }
    var header = title.parentElement;
    if (!header) return;
    title.setAttribute('data-zq-records-entry', 'true');
    var button = document.createElement('button');
    button.type = 'button'; button.className = 'zq-records-view-all'; button.textContent = '查看全部'; button.setAttribute('aria-label', '查看全部记录');
    button.addEventListener('click', function () { window.location.assign('/records'); });
    header.appendChild(button);
    var rows = Array.from(document.querySelectorAll('button[aria-label="打开画里藏词记录"]'));
    rows.slice(1).forEach(function (row) { row.style.display = 'none'; });
  }
  var originalPush = window.history.pushState;
  window.history.pushState = function () { var result = originalPush.apply(this, arguments); window.setTimeout(function () { remember(); addEntry(); }, 0); return result; };
  var originalReplace = window.history.replaceState;
  window.history.replaceState = function () { var result = originalReplace.apply(this, arguments); window.setTimeout(remember, 0); return result; };
  window.setTimeout(remember, 450); addEntry();
  new MutationObserver(addEntry).observe(document.documentElement, { childList: true, subtree: true });
})();
