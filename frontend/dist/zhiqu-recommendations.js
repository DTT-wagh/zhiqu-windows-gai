(() => {
  if (globalThis.__zqHotRecommendationInstalled) return;
  globalThis.__zqHotRecommendationInstalled = true;

  const SESSION_KEY = 'zhiqu.auth.session.v1';
  const EVENTS_KEY_PREFIX = 'zq:recommendation-events:';
  const NOT_INTERESTED_KEY_PREFIX = 'zq:recommendation-not-interested:';
  const MAX_EVENTS = 600;
  const HOT_RECOMMENDATION_WEIGHTS = Object.freeze({
    recentValidWatch: 0.40,
    completionQuality: 0.25,
    highQualityInteraction: 0.20,
    freshness: 0.10,
    exploration: 0.05,
  });

  function readJson(key, fallback) {
    try {
      const raw = window.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function writeJson(key, value) {
    try { window.localStorage.setItem(key, JSON.stringify(value)); } catch {}
  }

  function array(value) {
    return Array.isArray(value) ? value : [];
  }

  function session() {
    try {
      const raw = window.localStorage.getItem(SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function currentUserId() {
    const user = session()?.user || {};
    return String(user.id || user.username || 'anonymous');
  }

  function events() {
    return array(readJson(`${EVENTS_KEY_PREFIX}${currentUserId()}`, []))
      .filter((event) => event && event.createdAt);
  }

  function track(eventType, data = {}) {
    const event = {
      userId: currentUserId(),
      ageBand: data.ageBand || [],
      videoId: data.videoId || '',
      seriesId: data.seriesId || '',
      section: 'featured',
      position: Number.isFinite(data.position) ? data.position : null,
      eventType,
      createdAt: new Date().toISOString(),
    };
    const dedupeKey = `${event.eventType}|${event.videoId}|${event.position}`;
    const previous = events();
    if (previous.some((item) => item.dedupeKey === dedupeKey)) return;
    writeJson(`${EVENTS_KEY_PREFIX}${currentUserId()}`, [...previous, { ...event, dedupeKey }].slice(-MAX_EVENTS));
  }

  globalThis.__zqRecommendationTrack = track;

  function hash(value) {
    let result = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
      result ^= value.charCodeAt(index);
      result = Math.imul(result, 16777619);
    }
    return result >>> 0;
  }

  function clamp(value, min = 0, max = 1) {
    return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
  }

  function ageBands(value) {
    const bands = (Array.isArray(value) ? value : [value])
      .filter((item) => item !== null && item !== undefined && String(item).trim())
      .map((item) => String(item).replace(/[岁\s]/g, ''));
    if (bands.length === 2 && bands.every((band) => /^\d+$/.test(band))) return [`${bands[0]}-${bands[1]}`];
    if (bands.length === 1 && /^\d+$/.test(bands[0])) {
      const age = Number(bands[0]);
      return [age <= 8 ? '6-8' : age <= 10 ? '9-10' : '11-12'];
    }
    return bands;
  }

  function validUrl(value) {
    return typeof value === 'string' && /^(https?:\/\/|\/)/.test(value) && !value.includes('cdn.example/');
  }

  function status(value, fallback = 'UNKNOWN') {
    if (value === null || value === undefined || String(value).trim() === '') return fallback;
    return String(value).toUpperCase();
  }

  function normalize(value, fallback = {}) {
    const source = value || {};
    const duration = Number(source.duration ?? source.durationSeconds ?? (source.durationMinutes ? source.durationMinutes * 60 : fallback.duration) ?? 0);
    const videoUrl = source.videoUrl || source.playbackUrl || source.mediaUrl || source.video?.url || fallback.videoUrl || '';
    return {
      ...source,
      id: String(source.id || source.videoId || source.contentId || fallback.id || ''),
      type: String(source.type || source.contentType || fallback.type || 'VIDEO').toUpperCase(),
      title: String(source.title || source.name || fallback.title || ''),
      seriesId: String(source.seriesId || source.series?.id || source.courseId || fallback.seriesId || source.id || ''),
      episodeNo: Number(source.episodeNo ?? source.episode ?? fallback.episodeNo ?? 1),
      sortOrder: Number(source.sortOrder ?? fallback.sortOrder ?? 1),
      subject: String(source.subject || source.categoryName || source.category || fallback.subject || '其他'),
      difficulty: String(source.difficulty || fallback.difficulty || 'BEGINNER').toUpperCase(),
      ageBand: ageBands(source.ageBand || source.ageBands || fallback.ageBand),
      duration: Number.isFinite(duration) ? duration : 0,
      videoUrl,
      coverUrl: source.coverUrl || source.poster || source.thumbnail || source.imageUrl || fallback.coverUrl || '',
      summary: String(source.summary || source.description || source.aiSummary || source.learningGoal || fallback.summary || ''),
      status: status(source.status || source.publishStatus || fallback.status, 'PUBLISHED'),
      reviewStatus: status(source.reviewStatus ?? source.moderationStatus ?? fallback.reviewStatus, 'UNKNOWN'),
      safetyStatus: status(source.safetyStatus ?? source.childSafetyStatus ?? fallback.safetyStatus, 'UNKNOWN'),
      childSafe: (source.childSafe ?? source.forChildren ?? fallback.childSafe ?? fallback.forChildren) === true,
      containsAdvertising: Boolean(source.containsAdvertising || source.advertising || source.isAd || fallback.containsAdvertising),
      containsDangerousInstruction: Boolean(source.containsDangerousInstruction || source.dangerous || source.riskLevel === 'HIGH' || fallback.containsDangerousInstruction),
      externalOnly: Boolean(source.externalOnly || source.externalUrlOnly || source.externalLinkOnly || fallback.externalOnly),
      publishedAt: source.publishedAt || source.createdAt || fallback.publishedAt || '',
      qualityScore: clamp(Number(source.qualityScore ?? source.quality ?? fallback.qualityScore ?? 0.55)),
      editorFeatured: Boolean(source.editorFeatured ?? source.featured ?? fallback.editorFeatured),
      progressSeconds: Number(source.progressSeconds ?? source.lastPosition ?? fallback.progressSeconds ?? 0),
      watchedPercent: Number(source.watchedPercent ?? source.percent ?? fallback.watchedPercent ?? 0),
      completionRate: Number(source.completionRate ?? source.completionPercent ?? fallback.completionRate ?? 0),
      completed: Boolean(source.completed || source.completedAt || source.learningStatus === 'COMPLETED' || fallback.completed),
      recentValidWatch: Number(source.recentValidWatch ?? source.recentValidWatchCount ?? source.recentViews ?? source.recentViewerCount ?? fallback.recentValidWatch ?? 0),
      saveCount: Number(source.saveCount ?? source.favoriteCount ?? fallback.saveCount ?? 0),
      shareCount: Number(source.shareCount ?? fallback.shareCount ?? 0),
      qualityInteractionCount: Number(source.qualityInteractionCount ?? source.commentCount ?? source.questionCount ?? source.answerCount ?? fallback.qualityInteractionCount ?? 0),
      exposureCount: Number(source.exposureCount ?? fallback.exposureCount ?? 0),
      negativeFeedback: Number(source.negativeFeedback ?? source.notInterestedCount ?? fallback.negativeFeedback ?? 0),
      videoUrlKnown: Boolean(videoUrl),
    };
  }

  function approved(candidate) {
    const reviewed = ['APPROVED', 'PASSED', 'PASS', 'VERIFIED', 'PUBLISHED', 'ACTIVE', 'COMPLETED'];
    const safe = ['SAFE', 'APPROVED', 'PASSED', 'PASS', 'VERIFIED', 'PUBLISHED', 'ACTIVE', 'COMPLETED'];
    return candidate.childSafe === true && reviewed.includes(candidate.reviewStatus) && safe.includes(candidate.safetyStatus)
      && !candidate.containsAdvertising && !candidate.containsDangerousInstruction && !candidate.externalOnly;
  }

  function usable(candidate, notInterested) {
    if (!candidate.id || candidate.type !== 'VIDEO' || !candidate.title) return false;
    if (!validUrl(candidate.coverUrl) || (candidate.videoUrlKnown && !validUrl(candidate.videoUrl))) return false;
    if (!['PUBLISHED', 'ACTIVE', 'COMPLETED'].includes(candidate.status) || !approved(candidate)) return false;
    if (!candidate.summary || candidate.negativeFeedback > 3 || notInterested.has(candidate.id)) return false;
    return true;
  }

  function freshness(candidate) {
    if (!candidate.publishedAt) return 0.4;
    const days = Math.max(0, (Date.now() - Date.parse(candidate.publishedAt)) / 86400000);
    return Number.isFinite(days) ? Math.exp(-days / 30) : 0.4;
  }

  function quality(candidate) {
    const completion = candidate.completionRate > 1 ? candidate.completionRate / 100 : candidate.completionRate;
    return clamp(candidate.qualityScore * 0.7 + clamp(completion || 0) * 0.3);
  }

  function score(candidate, batch) {
    const recentWatch = clamp(candidate.recentValidWatch / 20);
    const completion = quality(candidate);
    const interaction = clamp((candidate.saveCount + candidate.shareCount * 1.5 + candidate.qualityInteractionCount) / 20);
    const fresh = freshness(candidate);
    const exploration = clamp(freshness(candidate) * 0.55 + (candidate.exposureCount === 0 ? 0.45 : 1 / (1 + candidate.exposureCount)));
    let value = HOT_RECOMMENDATION_WEIGHTS.recentValidWatch * recentWatch
      + HOT_RECOMMENDATION_WEIGHTS.completionQuality * completion
      + HOT_RECOMMENDATION_WEIGHTS.highQualityInteraction * interaction
      + HOT_RECOMMENDATION_WEIGHTS.freshness * fresh
      + HOT_RECOMMENDATION_WEIGHTS.exploration * exploration;
    value -= (Number(candidate.negativeFeedback) || 0) * 0.04;
    value += (hash(`${candidate.id}|${batch}`) % 1000) / 100000;
    return { ...candidate, score: value, exploration: exploration >= 0.45 };
  }

  function rerank(candidates, count, batch) {
    const desired = Math.min(count, candidates.length);
    if (!desired) return [];
    const maxPerSeries = Math.max(1, Math.min(2, Math.floor(desired * 0.4)));
    const selected = [];
    const seriesCounts = new Map();
    const subjects = new Set();
    const pool = [...candidates].sort((a, b) => b.score - a.score || hash(`${a.id}|${batch}`) - hash(`${b.id}|${batch}`));
    const take = (candidate) => {
      const seriesCount = seriesCounts.get(candidate.seriesId) || 0;
      if (selected.some((item) => item.id === candidate.id) || seriesCount >= maxPerSeries) return false;
      selected.push(candidate);
      seriesCounts.set(candidate.seriesId, seriesCount + 1);
      subjects.add(candidate.subject);
      return true;
    };
    for (const candidate of pool) {
      if (selected.length >= desired || subjects.size >= Math.min(3, desired)) break;
      if (!subjects.has(candidate.subject)) take(candidate);
    }
    for (const candidate of pool) {
      if (selected.length >= desired) break;
      take(candidate);
    }
    const explorationTarget = Math.ceil(desired * 0.3);
    for (const explorer of pool.filter((candidate) => candidate.exploration && !selected.some((item) => item.id === candidate.id))) {
      if (selected.filter((item) => item.exploration).length >= explorationTarget) break;
      const replaceIndex = selected.findIndex((item) => !item.exploration && (seriesCounts.get(explorer.seriesId) || 0) < maxPerSeries);
      if (replaceIndex < 0) continue;
      const previous = selected[replaceIndex];
      seriesCounts.set(previous.seriesId, Math.max(0, (seriesCounts.get(previous.seriesId) || 1) - 1));
      selected[replaceIndex] = explorer;
      seriesCounts.set(explorer.seriesId, (seriesCounts.get(explorer.seriesId) || 0) + 1);
    }
    return selected.slice(0, desired);
  }

  function sortFeatured(items, batch = 0) {
    const notInterested = new Set(array(readJson(`${NOT_INTERESTED_KEY_PREFIX}${currentUserId()}`, [])).map(String));
    const candidates = array(items).map((item) => normalize(item));
    const filtered = candidates.filter((candidate) => usable(candidate, notInterested));
    const ranked = rerank(filtered.map((candidate) => score(candidate, batch)), filtered.length, batch);
    ranked.forEach((candidate, position) => track('recommendation_impression', {
      videoId: candidate.id,
      seriesId: candidate.seriesId,
      position,
    }));
    return ranked;
  }

  function adaptResponse(response, batch) {
    if (!response || !response.ok) return Promise.resolve(response);
    return response.clone().json().then((payload) => {
      if (!payload || !Array.isArray(payload.featured)) return response;
      const headers = new Headers(response.headers);
      headers.set('content-type', 'application/json');
      return new Response(JSON.stringify({ ...payload, featured: sortFeatured(payload.featured, batch) }), {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    }).catch(() => response);
  }

  const originalFetch = window.fetch.bind(window);
  let batch = 0;
  window.fetch = (input, init) => {
    const url = typeof input === 'string' ? input : input?.url || '';
    const result = originalFetch(input, init);
    if (!/\/api\/learning(?:\?|$)/.test(url)) return result;
    return result.then((response) => adaptResponse(response, batch++));
  };

  function bindVideo(video) {
    if (video.dataset.zqHotRecommendationEvents === '1') return;
    video.dataset.zqHotRecommendationEvents = '1';
    const contentId = (window.location.pathname.match(/^\/content\/([^/]+)/) || [])[1] || '';
    if (!contentId) return;
    const sent = new Set();
    const trackVideo = (eventType) => {
      if (sent.has(eventType)) return;
      sent.add(eventType);
      track(eventType, { videoId: decodeURIComponent(contentId) });
    };
    let started = false;
    video.addEventListener('play', () => { started = true; trackVideo('video_play_start'); });
    video.addEventListener('timeupdate', () => {
      if (!started || !video.duration) return;
      const percent = video.currentTime / video.duration;
      if (percent >= 0.25) trackVideo('video_progress_25');
      if (percent >= 0.5) trackVideo('video_progress_50');
      if (percent >= 0.75) trackVideo('video_progress_75');
    });
    video.addEventListener('ended', () => trackVideo('video_complete'));
    video.addEventListener('pause', () => {
      if (started && video.duration && video.currentTime / video.duration < 0.2) trackVideo('video_skip');
    });
  }

  globalThis.__zqHotRecommendationTest = Object.freeze({
    weights: HOT_RECOMMENDATION_WEIGHTS,
    normalize,
    usable,
    score,
    rerank,
    sortFeatured,
  });

  function observeVideos() {
    if (!document.body) return;
    const observer = new MutationObserver(() => document.querySelectorAll('video').forEach(bindVideo));
    observer.observe(document.body, { childList: true, subtree: true });
    document.querySelectorAll('video').forEach(bindVideo);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', observeVideos, { once: true });
  else observeVideos();
})();
