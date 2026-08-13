(function () {
  'use strict';

  var apiBase = String(window.__ZHIQU_API_BASE_URL || 'http://localhost:8080').replace(/\/+$/, '');
  var sessionKey = 'zhiqu.auth.session.v1';
  var browseKey = 'zhiqu.browse.history.v1';
  var tabNames = { play: '游玩记录', watch: '观看记录', browse: '浏览记录' };
  var tabNotes = { play: '来自你的真实游戏记录', watch: '来自课程观看进度', browse: '来自你访问过的内容页面' };
  var state = { play: [], watch: [], browse: [], active: 'play', errors: {} };
  var list = document.getElementById('records-list');
  var panelTitle = document.getElementById('records-panel-title');
  var panelNote = document.getElementById('records-panel-note');

  function session() {
    try { return JSON.parse(window.localStorage.getItem(sessionKey) || 'null'); } catch (_) { return null; }
  }

  function headers() {
    var current = session();
    var result = { Accept: 'application/json' };
    if (current && current.accessToken) result.Authorization = 'Bearer ' + current.accessToken;
    return result;
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char];
    });
  }

  function readBrowseHistory() {
    try {
      var values = JSON.parse(window.localStorage.getItem(browseKey) || '[]');
      var valid = Array.isArray(values) ? values.filter(function (entry) {
        var route = String(entry && entry.path || '');
        return entry && entry.title && (/^\/content\/[^/]+$/.test(route) || /^\/community\/questions\/[^/]+$/.test(route) || /^\/mentor\/[^/]+$/.test(route));
      }).slice(0, 30) : [];
      if (JSON.stringify(valid) !== JSON.stringify(values)) window.localStorage.setItem(browseKey, JSON.stringify(valid));
      return valid;
    } catch (_) { return []; }
  }

  function normalisePlay(item) {
    var raw = item && item.result ? item.result : item;
    var title = raw && (raw.title || raw.name || raw.gameTitle || raw.sourceTitle);
    var sourceId = raw && (raw.sourceId || raw.id || raw.gameCode);
    var date = raw && (raw.completedAt || raw.createdAt || raw.updatedAt || raw.at);
    return { kind: 'play', title: title || '一次探索游戏', meta: raw && (raw.subtitle || raw.status || raw.type || '实践完成') || '实践完成', date: date, href: raw && raw.contentId ? '/content/' + encodeURIComponent(raw.contentId) : (sourceId && String(sourceId).toUpperCase().indexOf('MAGIC') >= 0 ? '/magic/' + encodeURIComponent(sourceId) + '?view=review' : '') };
  }

  function normaliseWatch(item) {
    var content = item && item.content ? item.content : item;
    var id = content && (content.id || content.contentId);
    var title = content && (content.title || content.name);
    var progress = Number(item && (item.progressSeconds || item.watchedSeconds || item.seconds) || 0);
    var duration = Number(content && (content.durationSeconds || 0) || item && (item.durationSeconds || 0) || 0);
    var percent = duration > 0 ? Math.round(Math.min(1, progress / duration) * 100) : null;
    var meta = percent == null ? (item && (item.learningStatus || item.status) || '已观看') : '已观看 ' + percent + '%';
    return { kind: 'watch', title: title || '课程观看记录', meta: meta, date: item && (item.lastViewedAt || item.updatedAt || item.viewedAt), href: id ? '/content/' + encodeURIComponent(id) : '' };
  }

  function normaliseBrowse(item) {
    return { kind: 'browse', title: item.title || item.label || '访问过的页面', meta: item.meta || '浏览过', date: item.at || item.createdAt, href: item.path || '' };
  }

  function formatDate(value) {
    if (!value) return '';
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit' }).format(date);
  }

  function icon(kind) { return kind === 'watch' ? '▶' : kind === 'browse' ? '⌕' : '✦'; }

  function setCount(key, count) {
    var button = document.querySelector('[data-record-tab="' + key + '"] small');
    if (button) button.textContent = String(count);
  }

  function render() {
    var key = state.active;
    var items = state[key] || [];
    panelTitle.textContent = tabNames[key];
    panelNote.textContent = tabNotes[key];
    document.querySelectorAll('[data-record-tab]').forEach(function (button) {
      var selected = button.getAttribute('data-record-tab') === key;
      button.setAttribute('aria-selected', String(selected));
    });
    setCount('play', state.play.length); setCount('watch', state.watch.length); setCount('browse', state.browse.length);
    if (state.errors[key]) {
      list.innerHTML = '<div class="records-empty"><div><strong>暂时无法读取记录</strong><p>请确认已登录后再试一次。</p><button class="records-retry" type="button" data-action="retry">重新加载</button></div></div>';
      return;
    }
    if (!items.length) {
      var emptyCopy = key === 'play' ? '完成一次游戏后，结果会出现在这里。' : key === 'watch' ? '开始一节课程，观看进度会自动同步。' : '打开一篇课程或社区问题详情后，浏览足迹会记录在这里。';
      list.innerHTML = '<div class="records-empty"><div><strong>暂无' + tabNames[key].replace('记录', '') + '记录</strong><p>' + emptyCopy + '</p></div></div>';
      return;
    }
    list.innerHTML = items.map(function (item) {
      var date = formatDate(item.date);
      var meta = [item.meta, date].filter(Boolean).join(' · ');
      return '<button class="records-row" type="button" data-kind="' + escapeHtml(item.kind) + '" data-href="' + escapeHtml(item.href || '') + '"><span class="records-row-mark" aria-hidden="true">' + icon(item.kind) + '</span><span class="records-row-copy"><span class="records-row-title">' + escapeHtml(item.title) + '</span><span class="records-row-meta">' + escapeHtml(meta) + '</span></span><span class="records-row-arrow" aria-hidden="true">›</span></button>';
    }).join('');
  }

  function loadJson(path) {
    return window.fetch(apiBase + path, { headers: headers() }).then(function (response) {
      if (!response.ok) throw new Error(String(response.status));
      return response.json();
    });
  }

  function loadAll() {
    state.browse = readBrowseHistory().map(normaliseBrowse);
    state.errors = {};
    var guest = !session() || !session().accessToken;
    var homeRequest = guest ? Promise.resolve({ recentResults: [] }) : loadJson('/api/home');
    var historyRequest = guest ? Promise.resolve([]) : loadJson('/api/history');
    return Promise.allSettled([homeRequest, historyRequest]).then(function (results) {
      if (results[0].status === 'fulfilled') {
        var home = results[0].value || {};
        state.play = Array.isArray(home.recentResults) ? home.recentResults.map(normalisePlay) : [];
      } else { state.play = []; state.errors.play = true; }
      if (results[1].status === 'fulfilled') {
        var history = results[1].value;
        state.watch = Array.isArray(history) ? history.map(normaliseWatch) : [];
      } else { state.watch = []; state.errors.watch = true; }
      render();
    });
  }

  document.querySelector('[data-action="back"]')?.addEventListener('click', function () {
    if (window.history.length > 1) window.history.back(); else window.location.assign('/');
  });
  document.querySelectorAll('[data-record-tab]').forEach(function (button) {
    button.addEventListener('click', function () { state.active = button.getAttribute('data-record-tab'); render(); });
  });
  list?.addEventListener('click', function (event) {
    var retry = event.target.closest('[data-action="retry"]');
    if (retry) { retry.disabled = true; loadAll(); return; }
    var row = event.target.closest('[data-href]');
    if (row && row.dataset.href) window.location.assign(row.dataset.href);
  });
  loadAll();
})();
