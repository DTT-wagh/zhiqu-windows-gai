(() => {
  if (globalThis.__zqHotRecommendationInstalled) return;
  globalThis.__zqHotRecommendationInstalled = true;

  const SESSION_KEY = 'zhiqu.auth.session.v1';
  const EVENTS_KEY_PREFIX = 'zq:recommendation-events:';
  const MAX_EVENTS = 600;
  const HOT_RECOMMENDATION_WEIGHTS = Object.freeze({
    viewCount: 0.20,
    growthVelocity: 0.20,
    completionRate: 0.20,
    favoriteRate: 0.10,
    likeRate: 0.10,
    shareRate: 0.05,
    commentRate: 0.05,
    learningEffect: 0.05,
    freshness: 0.05,
  });
  const HOT_ENDPOINT = '/api/contents/hot';
  const HOT_CACHE_MS = 5 * 60 * 1000;
  const MAX_EARLY_ITEMS_PER_GROUP = 2;

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
      topicKey: String(source.topicKey || source.topic || source.subject || source.categorySlug || fallback.topicKey || source.id || ''),
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
      qualityStatus: status(source.qualityStatus ?? source.contentQualityStatus ?? fallback.qualityStatus, 'UNKNOWN'),
      containsAdvertising: Boolean(source.containsAdvertising || source.advertising || source.isAd || fallback.containsAdvertising),
      containsDangerousInstruction: Boolean(source.containsDangerousInstruction || source.dangerous || source.riskLevel === 'HIGH' || fallback.containsDangerousInstruction),
      externalOnly: Boolean(source.externalOnly || source.externalUrlOnly || source.externalLinkOnly || fallback.externalOnly),
      publishedAt: source.publishedAt || source.createdAt || fallback.publishedAt || '',
      qualityScore: clamp(Number(source.qualityScore ?? source.quality ?? fallback.qualityScore ?? 0.55)),
      editorFeatured: Boolean(source.editorFeatured ?? source.featured ?? fallback.editorFeatured),
      viewCount: Math.max(0, Number(source.viewCount ?? source.totalViewCount ?? source.playCount ?? fallback.viewCount ?? 0)),
      recentViews24h: Math.max(0, Number(source.recentViews24h ?? source.recentViewCount24h ?? fallback.recentViews24h ?? 0)),
      recentViews7d: Math.max(0, Number(source.recentViews7d ?? source.recentViewCount7d ?? fallback.recentViews7d ?? 0)),
      viewerCount: Math.max(0, Number(source.viewerCount ?? source.validViewerCount ?? fallback.viewerCount ?? 0)),
      completedViewerCount: Math.max(0, Number(source.completedViewerCount ?? source.completedViewers ?? fallback.completedViewerCount ?? 0)),
      progressSeconds: Number(source.progressSeconds ?? source.lastPosition ?? fallback.progressSeconds ?? 0),
      watchedPercent: Number(source.watchedPercent ?? source.percent ?? fallback.watchedPercent ?? 0),
      completionRate: Number(source.completionRate ?? source.completionPercent ?? fallback.completionRate ?? 0),
      completed: Boolean(source.completed || source.completedAt || source.learningStatus === 'COMPLETED' || fallback.completed),
      favoriteCount: Math.max(0, Number(source.favoriteCount ?? source.saveCount ?? fallback.favoriteCount ?? 0)),
      likeCount: Math.max(0, Number(source.likeCount ?? source.likes ?? fallback.likeCount ?? 0)),
      shareCount: Math.max(0, Number(source.shareCount ?? source.shares ?? fallback.shareCount ?? 0)),
      commentCount: Math.max(0, Number(source.commentCount ?? source.comments ?? fallback.commentCount ?? 0)),
      quizCount: Math.max(0, Number(source.quizCount ?? source.nodeQuestionCount ?? fallback.quizCount ?? 0)),
      quizAttemptCount: Math.max(0, Number(source.quizAttemptCount ?? source.learningEffectSampleSize ?? fallback.quizAttemptCount ?? 0)),
      quizCorrectCount: Math.max(0, Number(source.quizCorrectCount ?? source.correctQuizCount ?? fallback.quizCorrectCount ?? 0)),
      completionSampleSize: Math.max(0, Number(source.completionSampleSize ?? source.viewerCount ?? fallback.completionSampleSize ?? 0)),
      favoriteSampleSize: Math.max(0, Number(source.favoriteSampleSize ?? source.viewerCount ?? fallback.favoriteSampleSize ?? 0)),
      likeSampleSize: Math.max(0, Number(source.likeSampleSize ?? fallback.likeSampleSize ?? 0)),
      shareSampleSize: Math.max(0, Number(source.shareSampleSize ?? fallback.shareSampleSize ?? 0)),
      commentSampleSize: Math.max(0, Number(source.commentSampleSize ?? fallback.commentSampleSize ?? 0)),
      negativeFeedback: Number(source.negativeFeedback ?? source.notInterestedCount ?? fallback.negativeFeedback ?? 0),
      videoUrlKnown: Boolean(videoUrl),
    };
  }

  function approved(candidate) {
    const reviewed = ['APPROVED', 'PASSED', 'PASS', 'VERIFIED', 'PUBLISHED', 'ACTIVE', 'COMPLETED'];
    const safe = ['SAFE', 'APPROVED', 'PASSED', 'PASS', 'VERIFIED', 'PUBLISHED', 'ACTIVE', 'COMPLETED'];
    const quality = ['QUALIFIED', 'APPROVED', 'PASSED', 'PASS', 'VERIFIED', 'PUBLISHED', 'ACTIVE'];
    return candidate.childSafe === true && reviewed.includes(candidate.reviewStatus) && safe.includes(candidate.safetyStatus)
      && quality.includes(candidate.qualityStatus)
      && !candidate.containsAdvertising && !candidate.containsDangerousInstruction && !candidate.externalOnly;
  }

  function usable(candidate, notInterested) {
    if (!candidate.id || candidate.type !== 'VIDEO' || !candidate.title) return false;
    if ((candidate.coverUrl && !validUrl(candidate.coverUrl)) || (candidate.videoUrlKnown && !validUrl(candidate.videoUrl))) return false;
    if (!['PUBLISHED', 'ACTIVE', 'COMPLETED'].includes(candidate.status) || !approved(candidate)) return false;
    if (!candidate.summary || candidate.negativeFeedback > 3 || notInterested.has(candidate.id)) return false;
    return true;
  }

  function freshness(candidate) {
    if (!candidate.publishedAt) return 0.5;
    const days = Math.max(0, (Date.now() - Date.parse(candidate.publishedAt)) / 86400000);
    return Number.isFinite(days) ? clamp(Math.exp(-days / 30)) : 0.5;
  }

  function normalizedRate(candidate, rateKey, successKey, sampleKey, fallback = 0.5) {
    const explicit = Number(candidate[rateKey]);
    const rate = Number.isFinite(explicit) && explicit > 0 ? (explicit > 1 ? explicit / 100 : explicit) : null;
    const successes = Math.max(0, Number(candidate[successKey]) || 0);
    const sample = Math.max(successes, Number(candidate[sampleKey]) || 0);
    if (rate === null && sample <= 0) return fallback;
    const observed = rate === null ? clamp(successes / Math.max(sample, 1)) : clamp(rate);
    const priorStrength = 20;
    return clamp((observed * sample + fallback * priorStrength) / (sample + priorStrength));
  }

  function logNormalize(values) {
    const transformed = values.map((value) => Math.log1p(Math.max(0, Number(value) || 0)));
    const min = Math.min(...transformed);
    const max = Math.max(...transformed);
    if (!Number.isFinite(min) || !Number.isFinite(max) || max - min < 1e-9) return transformed.map(() => 0.5);
    return transformed.map((value) => clamp((value - min) / (max - min)));
  }

  function scoreCandidates(candidates) {
    const viewNorm = logNormalize(candidates.map((candidate) => candidate.viewCount));
    const growthNorm = logNormalize(candidates.map((candidate) => 0.6 * candidate.recentViews24h + 0.4 * candidate.recentViews7d / 7));
    return candidates.map((candidate, index) => {
      const viewerSample = Math.max(candidate.viewerCount, candidate.viewCount, 0);
      const metrics = {
        viewCount: viewNorm[index],
        growthVelocity: growthNorm[index],
        completionRate: normalizedRate(candidate, 'completionRate', 'completedViewerCount', 'completionSampleSize'),
        favoriteRate: normalizedRate(candidate, 'favoriteRate', 'favoriteCount', 'favoriteSampleSize'),
        likeRate: normalizedRate(candidate, 'likeRate', 'likeCount', 'likeSampleSize'),
        shareRate: normalizedRate(candidate, 'shareRate', 'shareCount', 'shareSampleSize'),
        commentRate: normalizedRate(candidate, 'commentRate', 'commentCount', 'commentSampleSize'),
        learningEffect: candidate.quizCount > 0
          ? normalizedRate(candidate, 'learningEffect', 'quizCorrectCount', 'quizAttemptCount')
          : 0.5,
        freshness: freshness(candidate),
      };
      const hotScore = 100 * Object.entries(HOT_RECOMMENDATION_WEIGHTS)
        .reduce((total, [key, weight]) => total + weight * metrics[key], 0);
      return {
        ...candidate,
        score: hotScore,
        hotScore,
        hotMetrics: metrics,
        exploration: freshness(candidate) >= 0.65 && viewerSample <= 20,
      };
    });
  }

  function score(candidate, batch) {
    return scoreCandidates([candidate], batch)[0];
  }

  function rerank(candidates, count, batch) {
    const desired = Math.min(count, candidates.length);
    if (!desired) return [];
    const maxPerSeries = MAX_EARLY_ITEMS_PER_GROUP;
    const maxPerTopic = MAX_EARLY_ITEMS_PER_GROUP;
    const selected = [];
    const deferred = [];
    const seriesCounts = new Map();
    const topicCounts = new Map();
    const pool = [...candidates].sort((a, b) => b.score - a.score || String(a.id).localeCompare(String(b.id)));
    const take = (candidate) => {
      const seriesCount = seriesCounts.get(candidate.seriesId) || 0;
      const topicCount = topicCounts.get(candidate.topicKey) || 0;
      if (selected.some((item) => item.id === candidate.id) || seriesCount >= maxPerSeries || topicCount >= maxPerTopic) return false;
      selected.push(candidate);
      seriesCounts.set(candidate.seriesId, seriesCount + 1);
      topicCounts.set(candidate.topicKey, topicCount + 1);
      return true;
    };
    for (const candidate of pool) {
      if (selected.length >= desired) break;
      if (!take(candidate)) deferred.push(candidate);
    }
    return [...selected, ...deferred].slice(0, desired);
  }

  function sortFeatured(items, batch = 0) {
    const candidates = array(items).map((item) => normalize(item));
    const filtered = candidates.filter((candidate) => usable(candidate, new Set()));
    const ranked = rerank(scoreCandidates(filtered, batch), filtered.length, batch);
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
      return loadHotVideos().then((hotVideos) => {
        const source = hotVideos.length ? hotVideos : payload.featured.map((item) => normalize(item, {
          reviewStatus: 'APPROVED',
          safetyStatus: 'SAFE',
          childSafe: true,
          qualityStatus: 'QUALIFIED',
        }));
        const headers = new Headers(response.headers);
        headers.set('content-type', 'application/json');
        return new Response(JSON.stringify({ ...payload, featured: sortFeatured(source, batch) }), {
          status: response.status,
          statusText: response.statusText,
          headers,
        });
      });
    }).catch(() => response);
  }

  const originalFetch = typeof window.fetch === 'function' ? window.fetch.bind(window) : null;
  let hotCachePromise = null;
  let hotCacheExpiresAt = 0;

  function apiBase() {
    return String(window.__ZHIQU_API_BASE_URL || 'http://localhost:8080').replace(/\/+$/, '');
  }

  function loadHotVideos() {
    if (!originalFetch) return Promise.resolve([]);
    if (hotCachePromise && Date.now() < hotCacheExpiresAt) return hotCachePromise;
    hotCacheExpiresAt = Date.now() + HOT_CACHE_MS;
    hotCachePromise = originalFetch(`${apiBase()}${HOT_ENDPOINT}`, {
      headers: { Accept: 'application/json' },
    }).then((response) => {
      if (!response.ok) throw new Error(`hot videos failed: ${response.status}`);
      return response.json();
    }).then(array).catch(() => {
      hotCachePromise = null;
      hotCacheExpiresAt = 0;
      return [];
    });
    return hotCachePromise;
  }

  let batch = 0;
  globalThis.__zqHotRecommendations = () => loadHotVideos().then((items) => sortFeatured(items, batch++));
  if (originalFetch) {
    window.fetch = (input, init) => {
      const url = typeof input === 'string' ? input : input?.url || '';
      const result = originalFetch(input, init);
      if (!/\/api\/learning(?:\?|$)/.test(url)) return result;
      return result.then((response) => adaptResponse(response, batch++));
    };
  }

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
    scoreCandidates,
    rerank,
    sortFeatured,
    freshness,
    normalizedRate,
    logNormalize,
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
