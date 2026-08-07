(() => {
  if (globalThis.__zqVideoNextInstalled) return;
  globalThis.__zqVideoNextInstalled = true;

  // The generated Expo bundle already owns playback, HLS, subtitles and server progress.
  // This adapter only adds the series UI and delegates episode changes back to the
  // existing /content/[id] route so the original player lifecycle is reused.
  const API_BASE_URL = String(globalThis.__ZHIQU_API_BASE_URL || '').replace(/\/+$/, '');
  const SESSION_KEY = 'zhiqu.auth.session.v1';
  const instances = new WeakMap();
  let activeInstance = null;
  let scanTimer = 0;

  function currentContentId() {
    const match = window.location.pathname.match(/^\/content\/([^/]+)/);
    return match ? decodeURIComponent(match[1]) : '';
  }

  function readSession() {
    try {
      const raw = window.localStorage.getItem(SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  async function requestJson(path, options = {}) {
    const session = readSession();
    const headers = new Headers(options.headers || {});
    headers.set('Accept', 'application/json');
    if (session?.accessToken) headers.set('Authorization', `Bearer ${session.accessToken}`);
    const url = /^https?:\/\//i.test(path) ? path : `${API_BASE_URL}${path}` || path;
    const response = await fetch(url, {
      ...options,
      headers,
      credentials: 'omit',
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }

  function normalizeEpisode(value, fallback = {}) {
    const source = value || {};
    return {
      id: String(source.id || fallback.id || ''),
      title: String(source.title || fallback.title || '未命名视频'),
      seriesId: source.seriesId || fallback.seriesId || '',
      seriesTitle: source.seriesTitle || fallback.seriesTitle || '',
      episodeNo: Number.isFinite(Number(source.episodeNo)) ? Number(source.episodeNo) : (fallback.episodeNo || 1),
      sortOrder: Number.isFinite(Number(source.sortOrder)) ? Number(source.sortOrder) : (fallback.sortOrder || 1),
      duration: Number(source.duration || source.durationSeconds || fallback.duration || 0),
      videoUrl: source.videoUrl || source.mediaUrl || source.playbackUrl || '',
      coverUrl: source.coverUrl || source.poster || fallback.coverUrl || '',
      summary: String(source.summary || fallback.summary || ''),
      ageBand: Array.isArray(source.ageBand) ? source.ageBand : (fallback.ageBand || []),
      subject: source.subject || source.categoryName || fallback.subject || '',
      difficulty: source.difficulty || fallback.difficulty || '',
      status: source.status || 'PUBLISHED',
      nextActionType: source.nextActionType || fallback.nextActionType || '',
      linkedPracticeId: source.linkedPracticeId || fallback.linkedPracticeId || null,
      linkedGameId: source.linkedGameId || fallback.linkedGameId || null,
      nextActionUrl: source.nextActionUrl || source.practiceUrl || source.gameUrl || fallback.nextActionUrl || '',
      learningStatus: source.learningStatus || fallback.learningStatus || 'NOT_STARTED',
    };
  }

  function findTitle() {
    const heading = document.querySelector('h1, h2, [role="heading"]');
    return heading?.textContent?.trim() || '';
  }

  function findContentHeading() {
    return Array.from(document.querySelectorAll('h1, h2, [role="heading"]'))
      .find((heading) => heading.textContent?.trim() === '学习内容') || null;
  }

  function returnFromContent() {
    if (document.referrer) {
      try {
        const current = new URL(window.location.href);
        const previous = new URL(document.referrer);
        const currentPath = `${current.pathname}${current.search}${current.hash}`;
        const previousPath = `${previous.pathname}${previous.search}${previous.hash}`;
        if (previous.origin === current.origin && previousPath !== currentPath) {
          window.history.back();
          return;
        }
      } catch {
        // A malformed referrer falls back to the course catalog.
      }
    }
    window.location.assign('/categories');
  }

  function removeContentBackButton() {
    document.querySelectorAll('[data-zq-content-back="true"]').forEach((element) => {
      const host = element.parentElement;
      element.remove();
      host?.classList.remove('zq-content-back-row');
    });
  }

  function ensureContentBackButton(contentId) {
    if (!contentId) {
      removeContentBackButton();
      return;
    }
    if (document.querySelector('[data-zq-content-back="true"]')) return;
    const heading = findContentHeading();
    const host = heading?.parentElement;
    if (!heading || !host) return;
    const backButton = document.createElement('button');
    backButton.type = 'button';
    backButton.className = 'zq-content-back-button';
    backButton.setAttribute('data-zq-content-back', 'true');
    backButton.setAttribute('aria-label', '返回上一页');
    backButton.setAttribute('title', '返回');
    backButton.textContent = '←';
    backButton.addEventListener('click', returnFromContent);
    host.classList.add('zq-content-back-row');
    host.insertBefore(backButton, heading);
  }

  function restoreStandaloneVideoCover() {
    document.querySelectorAll('[data-zq-video-standalone-cover="true"]').forEach((cover) => {
      cover.classList.remove('zq-video-standalone-cover-hidden');
      cover.removeAttribute('data-zq-video-standalone-cover');
      cover.removeAttribute('aria-hidden');
    });
  }

  function ensureVideoCoverLayout(video, contentId) {
    if (!video || !contentId) {
      restoreStandaloneVideoCover();
      return;
    }
    const cover = document.querySelector('[data-expoimage="true"]');
    if (!cover || cover.contains(video)) return;
    const image = cover.querySelector('img');
    const coverUrl = image?.currentSrc || image?.src || '';
    if (!video.poster && coverUrl) video.poster = coverUrl;
    cover.classList.add('zq-video-standalone-cover-hidden');
    cover.setAttribute('data-zq-video-standalone-cover', 'true');
    cover.setAttribute('aria-hidden', 'true');
  }

  function getEpisodeSource(content, supplied) {
    const source = supplied || content || {};
    const series = source.series || source.seriesInfo || source.videoSeries || {};
    const episodes = Array.isArray(source.episodes)
      ? source.episodes
      : Array.isArray(source.seriesEpisodes)
        ? source.seriesEpisodes
        : Array.isArray(source.catalog?.episodes)
          ? source.catalog.episodes
          : Array.isArray(series.episodes)
            ? series.episodes
            : [];
    return {
      source,
      series,
      episodes,
      seriesId: source.seriesId || series.id || series.seriesId || '',
      seriesTitle: source.seriesTitle || series.title || series.name || '',
    };
  }

  function applyLearningStatus(episode) {
    return {
      ...episode,
      learningStatus: episode.learningStatus || 'NOT_STARTED',
    };
  }

  function buildCatalog(contentId, content, supplied) {
    const sourceInfo = getEpisodeSource(content, supplied);
    const fallback = normalizeEpisode({
      id: contentId,
      title: content?.title || findTitle() || '当前视频',
      seriesId: sourceInfo.seriesId,
      seriesTitle: sourceInfo.seriesTitle,
      duration: Number(content?.durationSeconds || 0),
      coverUrl: content?.coverUrl || '',
      summary: content?.summary || '',
      subject: content?.subject || content?.categoryName || '',
      difficulty: content?.difficulty || '',
      episodeNo: content?.episodeNo || 1,
      sortOrder: content?.sortOrder || 1,
      nextActionType: content?.nextActionType || '',
      linkedPracticeId: content?.linkedPracticeId,
      linkedGameId: content?.linkedGameId,
      nextActionUrl: content?.nextActionUrl,
    });
    const rawEpisodes = sourceInfo.episodes.length ? sourceInfo.episodes : [fallback];
    const episodes = rawEpisodes
      .map((episode) => applyLearningStatus(normalizeEpisode(episode, fallback)))
      .filter((episode) => episode.id);
    if (!episodes.some((episode) => episode.id === contentId)) episodes.unshift(applyLearningStatus(fallback));
    const current = episodes.find((episode) => episode.id === contentId) || applyLearningStatus(fallback);
    const sortedEpisodes = episodes
      .filter((episode, index, all) => all.findIndex((candidate) => candidate.id === episode.id) === index)
      .sort((a, b) => (a.sortOrder - b.sortOrder) || (a.episodeNo - b.episodeNo));
    const currentIndex = Math.max(0, sortedEpisodes.findIndex((episode) => episode.id === current.id));
    const seriesTitle = sourceInfo.seriesTitle || current.seriesTitle || current.title;
    return {
      seriesId: sourceInfo.seriesId || current.seriesId,
      seriesTitle,
      episodes: sortedEpisodes,
      current,
      currentIndex,
      suppliedNext: supplied?.nextEpisode || supplied?.next || null,
    };
  }

  function isPublished(episode) {
    return !episode.status || episode.status === 'PUBLISHED';
  }

  function hasPlayableReference(episode) {
    return Boolean(episode.videoUrl || episode.playbackUrl || episode.mediaUrl);
  }

  async function resolveNext(catalog) {
    const current = catalog.current;
    const candidates = catalog.episodes
      .filter((episode) => episode.id !== current.id && isPublished(episode) && episode.episodeNo > current.episodeNo)
      .sort((a, b) => (a.episodeNo - b.episodeNo) || (a.sortOrder - b.sortOrder));
    if (catalog.suppliedNext) candidates.unshift(normalizeEpisode(catalog.suppliedNext, current));
    for (const candidate of candidates) {
      if (hasPlayableReference(candidate)) return candidate;
      try {
        // Probe only a known catalog episode. No guessed next URL is requested.
        const playback = await requestJson(`/api/contents/${encodeURIComponent(candidate.id)}/playback`);
        if (playback?.playbackUrl) return normalizeEpisode({ ...candidate, ...playback }, candidate);
      } catch {
        // An unpublished or unavailable episode must not become a broken button.
      }
    }
    return null;
  }

  function addStyles() {
    if (document.getElementById('zq-video-next-style')) return;
    const style = document.createElement('style');
    style.id = 'zq-video-next-style';
    style.textContent = `
      .zq-video-next-root { width: 100%; display: grid; gap: 12px; margin-top: 12px; color: #1b332b; }
      .zq-content-back-row { display: flex !important; flex-direction: row !important; align-items: center !important; gap: 8px; min-height: 64px; }
      .zq-content-back-button { box-sizing: border-box; display: grid; flex: 0 0 44px; place-items: center; width: 44px; height: 44px; padding: 0; border: 1px solid #d5d9d3; border-radius: 8px; color: #243139; background: #fffdf8; font: inherit; font-size: 27px; line-height: 1; cursor: pointer; }
      .zq-content-back-button:hover { border-color: #9ebeb2; background: #f3f7f3; }
      .zq-content-back-button:focus-visible { border-color: #176b64; outline: 3px solid rgba(23, 107, 100, .18); outline-offset: 1px; }
      .zq-video-standalone-cover-hidden { display: none !important; }
      .zq-video-next-card, .zq-video-series { box-sizing: border-box; width: 100%; border: 1px solid #c8d5cc; border-radius: 10px; background: #fffdf7; box-shadow: 0 5px 15px rgba(28, 52, 43, .08); }
      .zq-video-next-card { display: grid; gap: 14px; padding: 18px; }
      .zq-video-next-card[hidden], .zq-video-series[hidden] { display: none; }
      .zq-video-next-kicker, .zq-video-series-kicker { color: #176b64; font-size: 11px; font-weight: 800; letter-spacing: .04em; }
      .zq-video-next-title { margin: 2px 0 0; color: #1b332b; font-size: 20px; line-height: 1.35; font-weight: 850; overflow-wrap: anywhere; }
      .zq-video-next-copy { margin: 0; color: #5e6b64; font-size: 14px; line-height: 1.55; }
      .zq-video-next-preview { display: grid; grid-template-columns: 112px minmax(0, 1fr); gap: 12px; align-items: center; padding: 10px; border: 1px solid #d8e3dc; border-radius: 8px; background: #f4f8f3; }
      .zq-video-next-preview img, .zq-video-next-preview-placeholder { width: 112px; height: 70px; border-radius: 6px; object-fit: cover; background: #dcebe5; }
      .zq-video-next-preview-placeholder { display: grid; place-items: center; color: #176b64; font-size: 24px; font-weight: 800; }
      .zq-video-next-preview-title { margin: 0; color: #1b332b; font-size: 15px; line-height: 1.35; font-weight: 800; overflow-wrap: anywhere; }
      .zq-video-next-preview-meta { margin: 4px 0 0; color: #6b7a72; font-size: 12px; line-height: 1.45; }
      .zq-video-next-actions { display: flex; flex-wrap: wrap; gap: 8px; }
      .zq-video-next-button { min-width: 44px; min-height: 44px; padding: 10px 14px; border: 1px solid #9ebeb2; border-radius: 7px; color: #1b3d34; background: #e4f1ec; font: inherit; font-size: 13px; font-weight: 800; cursor: pointer; }
      .zq-video-next-button:hover, .zq-video-next-button:focus-visible { border-color: #176b64; outline: 3px solid rgba(23, 107, 100, .18); }
      .zq-video-next-button:disabled { cursor: default; opacity: .58; }
      .zq-video-next-button-primary { border-color: #10534e; color: #fffdf7; background: #237a71; }
      .zq-video-next-button-secondary { color: #176b64; background: #fffdf7; }
      .zq-video-series { padding: 14px; }
      .zq-video-series-header { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
      .zq-video-series-title { min-width: 0; margin: 2px 0 0; color: #1b332b; font-size: 16px; line-height: 1.35; font-weight: 850; overflow-wrap: anywhere; }
      .zq-video-series-toggle { flex: 0 0 auto; min-height: 44px; padding: 8px 12px; border: 1px solid #b6c8bd; border-radius: 7px; color: #176b64; background: #fffdf7; font: inherit; font-size: 12px; font-weight: 800; cursor: pointer; }
      .zq-video-series-list { display: grid; gap: 6px; margin: 12px 0 0; padding: 0; list-style: none; }
      .zq-video-series-item { display: grid; grid-template-columns: 36px minmax(0, 1fr) auto; gap: 8px; align-items: center; min-height: 48px; padding: 6px 8px; border: 1px solid transparent; border-radius: 7px; background: #f7faf6; }
      .zq-video-series-item-current { border-color: #7da99f; background: #e4f1ec; }
      .zq-video-series-episode { color: #176b64; font-size: 12px; font-weight: 850; }
      .zq-video-series-item button { min-width: 0; padding: 5px 0; border: 0; color: #1b332b; background: transparent; font: inherit; font-size: 13px; line-height: 1.35; text-align: left; cursor: pointer; overflow-wrap: anywhere; }
      .zq-video-series-item button:disabled { cursor: default; }
      .zq-video-series-status { color: #6b7a72; font-size: 11px; white-space: nowrap; }
      @media (max-width: 560px) {
        .zq-video-next-card { padding: 14px; }
        .zq-video-next-preview { grid-template-columns: 88px minmax(0, 1fr); }
        .zq-video-next-preview img, .zq-video-next-preview-placeholder { width: 88px; height: 58px; }
        .zq-video-next-actions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .zq-video-next-button { width: 100%; padding: 9px 8px; }
        .zq-video-next-actions .zq-video-next-button-primary { grid-column: 1 / -1; }
        .zq-video-series-header { align-items: flex-start; }
        .zq-video-series-item { grid-template-columns: 31px minmax(0, 1fr); }
        .zq-video-series-status { grid-column: 2; }
      }
      @media (prefers-reduced-motion: reduce) { .zq-video-next-card, .zq-video-series { scroll-behavior: auto; } }
    `;
    document.head.appendChild(style);
  }

  function button(label, action, variant = 'secondary') {
    const element = document.createElement('button');
    element.type = 'button';
    element.className = `zq-video-next-button zq-video-next-button-${variant}`;
    element.setAttribute('aria-label', label);
    element.textContent = label;
    element.addEventListener('click', action);
    return element;
  }

  function returnToCourse() {
    const referrer = document.referrer;
    if (referrer) {
      try {
        const url = new URL(referrer);
        if (url.origin === window.location.origin && !url.pathname.startsWith('/content/')) {
          window.history.back();
          return;
        }
      } catch {
        // Fall through to the course home.
      }
    }
    window.location.assign('/');
  }

  function navigateToEpisode(id, currentId) {
    if (!id || id === currentId) return;
    try {
      window.sessionStorage.setItem('zq:video-next:navigation', JSON.stringify({ from: currentId, to: id, at: Date.now() }));
    } catch {
      // Navigation still works when session storage is unavailable.
    }
    window.location.assign(`/content/${encodeURIComponent(id)}`);
  }

  function renderPreview(container, next, catalog) {
    if (!next) return;
    const preview = document.createElement('div');
    preview.className = 'zq-video-next-preview';
    if (next.coverUrl && !next.coverUrl.includes('cdn.example/')) {
      const image = document.createElement('img');
      image.alt = `${next.title}封面`;
      image.src = next.coverUrl;
      image.addEventListener('error', () => image.replaceWith(createPlaceholder()));
      preview.appendChild(image);
    } else {
      preview.appendChild(createPlaceholder());
    }
    const copy = document.createElement('div');
    const title = document.createElement('p');
    title.className = 'zq-video-next-preview-title';
    title.textContent = next.title;
    const meta = document.createElement('p');
    meta.className = 'zq-video-next-preview-meta';
    const episode = next.episodeNo ? `第 ${next.episodeNo}/${catalog.episodes.length} 集` : '下一集';
    const duration = next.duration > 0 ? ` · 约 ${Math.max(1, Math.round(next.duration / 60))} 分钟` : '';
    meta.textContent = `${episode}${duration}`;
    copy.append(title, meta);
    preview.appendChild(copy);
    container.appendChild(preview);
  }

  function createPlaceholder() {
    const placeholder = document.createElement('div');
    placeholder.className = 'zq-video-next-preview-placeholder';
    placeholder.setAttribute('aria-hidden', 'true');
    placeholder.textContent = '▶';
    return placeholder;
  }

  function renderCatalog(container, state) {
    container.replaceChildren();
    const header = document.createElement('div');
    header.className = 'zq-video-series-header';
    const copy = document.createElement('div');
    const kicker = document.createElement('div');
    kicker.className = 'zq-video-series-kicker';
    kicker.textContent = '系列目录';
    const title = document.createElement('div');
    title.className = 'zq-video-series-title';
    title.textContent = state.catalog.seriesTitle;
    copy.append(kicker, title);
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'zq-video-series-toggle';
    toggle.setAttribute('aria-label', '查看课程目录');
    toggle.textContent = state.catalog.episodes.length > 1 ? (state.catalogOpen ? '收起目录' : '查看课程目录') : '课程目录';
    toggle.addEventListener('click', () => {
      state.catalogOpen = !state.catalogOpen;
      list.hidden = !state.catalogOpen;
      toggle.textContent = state.catalogOpen ? '收起目录' : '查看课程目录';
    });
    header.append(copy, toggle);
    container.appendChild(header);
    const list = document.createElement('ol');
    list.className = 'zq-video-series-list';
    list.hidden = !state.catalogOpen;
    state.catalog.episodes.forEach((episode) => {
      const item = document.createElement('li');
      item.className = `zq-video-series-item${episode.id === state.contentId ? ' zq-video-series-item-current' : ''}`;
      const number = document.createElement('span');
      number.className = 'zq-video-series-episode';
      number.textContent = `第 ${episode.episodeNo}`;
      const episodeButton = document.createElement('button');
      episodeButton.type = 'button';
      episodeButton.setAttribute('aria-label', `打开${episode.title}`);
      episodeButton.textContent = episode.title;
      const isCurrent = episode.id === state.contentId;
      episodeButton.disabled = isCurrent;
      if (!isCurrent) episodeButton.addEventListener('click', () => navigateToEpisode(episode.id, state.contentId));
      const status = document.createElement('span');
      status.className = 'zq-video-series-status';
      status.textContent = isCurrent ? '正在学习' : episode.learningStatus === 'COMPLETED' ? '已完成' : episode.learningStatus === 'IN_PROGRESS' ? '学习中' : '未开始';
      item.append(number, episodeButton, status);
      list.appendChild(item);
    });
    container.appendChild(list);
  }

  function renderEndCard(state) {
    const card = state.card;
    card.replaceChildren();
    const header = document.createElement('div');
    const kicker = document.createElement('div');
    kicker.className = 'zq-video-next-kicker';
    kicker.textContent = state.next ? '接着学习' : '本系列学习完成';
    const title = document.createElement('h3');
    title.className = 'zq-video-next-title';
    title.textContent = state.next ? '准备好进入下一集了吗？' : '本系列暂时只有这一集';
    const copy = document.createElement('p');
    copy.className = 'zq-video-next-copy';
    copy.textContent = state.next ? '按你的节奏继续，下一集会从自己的保存进度开始。' : '你可以重新观看当前视频，或返回课程继续探索其他内容。';
    header.append(kicker, title, copy);
    card.appendChild(header);
    if (state.next) renderPreview(card, state.next, state.catalog);
    const actions = document.createElement('div');
    actions.className = 'zq-video-next-actions';
    if (state.next) {
      actions.appendChild(button('继续下一集', () => navigateToEpisode(state.next.id, state.contentId), 'primary'));
    }
    actions.appendChild(button('重新观看', () => restartVideo(state), 'secondary'));
    if (state.catalog.episodes.length > 1) {
      actions.appendChild(button('查看课程目录', () => {
        state.catalogOpen = true;
        renderCatalog(state.catalogRoot, state);
        state.catalogRoot.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }, 'secondary'));
    }
    actions.appendChild(button('返回课程', returnToCourse, 'secondary'));
    if (state.current.nextActionUrl) {
      const label = state.current.nextActionType === 'GAME' ? '开始游戏' : state.current.nextActionType === 'PRACTICE' ? '去做练习' : '打开下一步';
      actions.appendChild(button(label, () => window.location.assign(state.current.nextActionUrl), 'secondary'));
    }
    card.appendChild(actions);
  }

  function restartVideo(state) {
    state.endReached = false;
    state.card.hidden = true;
    const video = state.video;
    try {
      video.currentTime = 0;
      video.play().catch(() => {});
    } catch {
      // The browser may reject a seek while a source is being replaced.
    }
  }

  function createInstance(video, contentId) {
    addStyles();
    const host = video.parentElement;
    const parent = host?.parentElement;
    if (!host || !parent) return null;
    const root = document.createElement('section');
    root.className = 'zq-video-next-root';
    root.setAttribute('aria-label', '视频后续学习');
    const catalogRoot = document.createElement('section');
    catalogRoot.className = 'zq-video-series';
    const card = document.createElement('section');
    card.className = 'zq-video-next-card';
    card.setAttribute('aria-live', 'polite');
    card.hidden = true;
    root.append(catalogRoot, card);
    parent.appendChild(root);
    const fallback = normalizeEpisode({ id: contentId, title: findTitle() || '当前视频', episodeNo: 1, sortOrder: 1 });
    const state = {
      video,
      contentId,
      root,
      catalogRoot,
      card,
      catalogOpen: true,
      catalog: { seriesTitle: fallback.title, episodes: [applyLearningStatus(fallback)], current: fallback, currentIndex: 0 },
      current: fallback,
      next: null,
      endReached: false,
      destroyed: false,
    };
    renderCatalog(catalogRoot, state);
    renderEndCard(state);

    const onTimeUpdate = () => {
      const duration = Number.isFinite(video.duration) ? video.duration : 0;
      const ratio = duration > 0 ? video.currentTime / duration : 0;
      if (ratio < 0.85) state.endReached = false;
      if (ratio >= 0.9 && !state.endReached) {
        state.endReached = true;
        renderEndCard(state);
        state.card.hidden = false;
      }
    };
    const onEnded = () => {
      state.endReached = true;
      renderEndCard(state);
      state.card.hidden = false;
    };
    const onPlay = () => {
      if (!video.ended && state.endReached && video.currentTime < video.duration * 0.85) state.card.hidden = true;
    };
    const onSeeking = () => {
      if (video.currentTime < video.duration * 0.85) state.card.hidden = true;
    };
    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('ended', onEnded);
    video.addEventListener('play', onPlay);
    video.addEventListener('seeking', onSeeking);
    const hydrate = async () => {
      let content = null;
      try { content = await requestJson(`/api/contents/${encodeURIComponent(contentId)}`); } catch {}
      let supplied = null;
      const provider = globalThis.__zqVideoCatalogProvider;
      if (typeof provider === 'function') {
        try { supplied = await provider({ contentId, content }); } catch {}
      } else if (globalThis.__zqVideoCatalog) {
        supplied = globalThis.__zqVideoCatalog[contentId] || globalThis.__zqVideoCatalog;
      }
      if (state.destroyed) return;
      state.catalog = buildCatalog(contentId, content, supplied);
      state.current = state.catalog.current;
      state.next = await resolveNext(state.catalog);
      if (state.destroyed) return;
      renderCatalog(catalogRoot, state);
      if (!card.hidden) renderEndCard(state);
    };
    hydrate();

    return {
      destroy() {
        if (state.destroyed) return;
        state.destroyed = true;
        instances.delete(video);
        video.removeEventListener('timeupdate', onTimeUpdate);
        video.removeEventListener('ended', onEnded);
        video.removeEventListener('play', onPlay);
        video.removeEventListener('seeking', onSeeking);
        root.remove();
      },
    };
  }

  function scan() {
    scanTimer = 0;
    const contentId = currentContentId();
    addStyles();
    ensureContentBackButton(contentId);
    const video = contentId ? document.querySelector('video') : null;
    ensureVideoCoverLayout(video, contentId);
    if (!video) {
      if (activeInstance) { activeInstance.destroy(); activeInstance = null; }
      return;
    }
    if (activeInstance && (activeInstance.video !== video || activeInstance.contentId !== contentId)) {
      activeInstance.destroy();
      activeInstance = null;
    }
    if (!instances.has(video)) {
      const instance = createInstance(video, contentId);
      if (instance) {
        instances.set(video, instance);
        activeInstance = { ...instance, video, contentId };
      }
    }
  }

  function scheduleScan() {
    if (scanTimer) return;
    scanTimer = window.setTimeout(scan, 0);
  }

  ['pushState', 'replaceState'].forEach((method) => {
    const original = window.history[method];
    if (typeof original !== 'function') return;
    window.history[method] = function (...args) {
      const result = original.apply(this, args);
      scheduleScan();
      return result;
    };
  });
  window.addEventListener('popstate', scheduleScan);
  window.addEventListener('hashchange', scheduleScan);
  const observer = new MutationObserver(scheduleScan);
  observer.observe(document.body, { childList: true, subtree: true });
  scheduleScan();
})();
