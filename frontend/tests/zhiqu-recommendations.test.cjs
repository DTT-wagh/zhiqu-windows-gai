const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'dist', 'zhiqu-recommendations.js'), 'utf8');
const storage = new Map();
const document = {
  readyState: 'complete',
  body: {},
  querySelectorAll() { return []; },
  addEventListener() {},
};
const window = {
  location: { pathname: '/' },
  localStorage: {
    getItem(key) { return storage.has(key) ? storage.get(key) : null; },
    setItem(key, value) { storage.set(key, String(value)); },
  },
  fetch() { return Promise.reject(new Error('fixture fetch not used')); },
  addEventListener() {},
};
const context = {
  window,
  document,
  Headers: class Headers { constructor() {} set() {} },
  Response: class Response {},
  MutationObserver: class MutationObserver { observe() {} },
  console,
  globalThis: null,
};
context.globalThis = context;
vm.runInNewContext(source, context, { filename: 'zhiqu-recommendations.js' });
const rules = context.__zqHotRecommendationTest;
assert.ok(rules, 'recommendation rules should be exposed in development');

const base = (overrides = {}) => ({
  id: 'video-1',
  type: 'VIDEO',
  title: 'Lesson',
  seriesId: 'series-1',
  episodeNo: 1,
  subject: 'Math',
  difficulty: 'BEGINNER',
  ageBand: ['6-8'],
  durationMinutes: 2,
  videoUrl: '/videos/lesson.mp4',
  videoUrlKnown: true,
  coverUrl: '/covers/lesson.jpg',
  summary: 'A safe learning goal',
  status: 'PUBLISHED',
  reviewStatus: 'APPROVED',
  safetyStatus: 'SAFE',
  childSafe: true,
  qualityStatus: 'QUALIFIED',
  qualityScore: 0.8,
  publishedAt: new Date().toISOString(),
  ...overrides,
});

assert.deepEqual({ ...rules.weights }, {
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

assert.equal(rules.usable(base({ ageBand: ['11-12'] }), new Set()), true, 'age must not filter a hot recommendation');
assert.equal(rules.usable(base({ reviewStatus: 'PENDING' }), new Set()), false, 'unreviewed content must be filtered');
const missingReviewStatus = { ...base() };
delete missingReviewStatus.reviewStatus;
const missingSafetyStatus = { ...base() };
delete missingSafetyStatus.safetyStatus;
const missingChildSafe = { ...base() };
delete missingChildSafe.childSafe;
const missingQualityStatus = { ...base() };
delete missingQualityStatus.qualityStatus;
assert.equal(rules.normalize(missingReviewStatus).reviewStatus, 'UNKNOWN', 'missing review status must fail closed');
assert.equal(rules.normalize(missingSafetyStatus).safetyStatus, 'UNKNOWN', 'missing safety status must fail closed');
assert.equal(rules.normalize(missingChildSafe).childSafe, false, 'missing child-safe flag must fail closed');
assert.equal(rules.normalize(missingQualityStatus).qualityStatus, 'UNKNOWN', 'missing quality status must fail closed');
assert.equal(rules.usable(rules.normalize(missingReviewStatus), new Set()), false, 'missing review status must not be recommended');
assert.equal(rules.usable(rules.normalize(missingSafetyStatus), new Set()), false, 'missing safety status must not be recommended');
assert.equal(rules.usable(rules.normalize(missingChildSafe), new Set()), false, 'missing child-safe flag must not be recommended');
assert.equal(rules.usable(rules.normalize(missingQualityStatus), new Set()), false, 'missing content quality status must not be recommended');
assert.equal(rules.usable(base({ containsAdvertising: true }), new Set()), false, 'advertising content must be filtered');
assert.equal(rules.usable(base({ coverUrl: 'https://cdn.example/cover.jpg' }), new Set()), false, 'placeholder covers must be filtered');
assert.equal(rules.usable(base({ coverUrl: '' }), new Set()), true, 'a missing cover may use the real card fallback');
assert.equal(rules.usable(base({ videoUrl: 'not-a-video-url' }), new Set()), false, 'invalid video URLs must be filtered');
assert.equal(rules.usable(base({ videoUrl: '', videoUrlKnown: false }), new Set()), true, 'catalog cards may defer playback URL validation to the content page');
assert.equal(rules.usable(base({ summary: '' }), new Set()), false, 'content without a learning summary must be filtered');
assert.equal(rules.sortFeatured([base()], 0).length, 1, 'a single real video must remain one original card');

const seriesCandidates = [
  base({ id: 's1-1', seriesId: 's1', topicKey: 'intro', viewCount: 100, episodeNo: 1 }),
  base({ id: 's1-2', seriesId: 's1', topicKey: 'intro', viewCount: 90, episodeNo: 2 }),
  base({ id: 's1-3', seriesId: 's1', topicKey: 'intro', viewCount: 80, episodeNo: 3 }),
  base({ id: 's2-1', seriesId: 's2', topicKey: 'science', viewCount: 70, subject: 'Science' }),
  base({ id: 's3-1', seriesId: 's3', topicKey: 'art', viewCount: 60, subject: 'Art' }),
  base({ id: 's4-1', seriesId: 's4', topicKey: 'music', viewCount: 50, subject: 'Music' }),
];
const seriesScored = rules.scoreCandidates(seriesCandidates.map((candidate) => rules.normalize(candidate)));
const ranked = rules.rerank(seriesScored, 6, 0);
assert.ok(ranked.findIndex((item) => item.id === 's1-3') >= 4, 'a third similar item must move below diverse alternatives');
assert.equal(ranked.length, 6, 'similar items must be moved down rather than deleted');
assert.deepEqual(ranked.map((item) => item.id), rules.rerank(seriesScored, 6, 0).map((item) => item.id), 'same batch should be deterministic');
assert.deepEqual(ranked.map((item) => item.id), rules.rerank(seriesScored, 6, 99).map((item) => item.id), 'hot order must not change between users or refresh batches');

const logValues = rules.logNormalize([0, 10, 10000]);
assert.equal(logValues[0], 0);
assert.equal(logValues[2], 1);
assert.ok(logValues[1] > 0.2, 'log compression must prevent a viral outlier from flattening normal counts');

const smallSampleRate = rules.normalizedRate({ favoriteCount: 1, favoriteSampleSize: 1 }, 'favoriteRate', 'favoriteCount', 'favoriteSampleSize');
assert.ok(smallSampleRate > 0.5 && smallSampleRate < 0.55, 'small samples must be pulled strongly toward the neutral prior');

const metricCandidates = [
  rules.normalize(base({
    id: 'low', viewCount: 10, recentViews24h: 1, recentViews7d: 7,
    viewerCount: 100, completedViewerCount: 30, favoriteCount: 2, likeCount: 2,
    shareCount: 1, commentCount: 1, quizCount: 1, quizAttemptCount: 100, quizCorrectCount: 40,
    likeSampleSize: 100, shareSampleSize: 100, commentSampleSize: 100,
    publishedAt: '2020-01-01T00:00:00.000Z',
  })),
  rules.normalize(base({
    id: 'high', viewCount: 1000, recentViews24h: 100, recentViews7d: 300,
    viewerCount: 100, completedViewerCount: 90, favoriteCount: 20, likeCount: 30,
    shareCount: 10, commentCount: 8, quizCount: 1, quizAttemptCount: 100, quizCorrectCount: 90,
    likeSampleSize: 100, shareSampleSize: 100, commentSampleSize: 100,
  })),
];
const metricScores = rules.scoreCandidates(metricCandidates);
assert.ok(metricScores[1].hotScore > metricScores[0].hotScore, 'all nine non-personalized signals must contribute to the ranking');
assert.ok(metricScores.every((item) => item.hotScore >= 0 && item.hotScore <= 100), 'Hot Score must stay in the 0-100 range');
assert.equal(rules.score(rules.normalize(base({ quizCount: 0 })), 0).hotMetrics.learningEffect, 0.5, 'videos without a quiz must receive a neutral learning-effect value');
const missingInteractionMetrics = rules.score(rules.normalize(base({ viewerCount: 100 })), 0).hotMetrics;
assert.equal(missingInteractionMetrics.likeRate, 0.5, 'missing like data must remain neutral');
assert.equal(missingInteractionMetrics.shareRate, 0.5, 'missing share data must remain neutral');
assert.equal(missingInteractionMetrics.commentRate, 0.5, 'missing comment data must remain neutral');
assert.ok(rules.freshness(base()) > rules.freshness(base({ publishedAt: '2020-01-01T00:00:00.000Z' })), 'freshness must decay continuously with age');

const untouchedProgress = base({ id: 'progress-same', completed: false, progressSeconds: 0, watchedPercent: 0 });
const completedProgress = base({ id: 'progress-same', completed: true, progressSeconds: 120, watchedPercent: 100 });
assert.ok(Math.abs(rules.score(untouchedProgress, 0).score - rules.score(completedProgress, 0).score) < 1e-6, 'personal learning progress must not change hot ranking score');
const youngerAudience = base({ id: 'age-same', ageBand: ['6-8'] });
const olderAudience = base({ id: 'age-same', ageBand: ['11-12'] });
assert.equal(rules.score(youngerAudience, 0).score, rules.score(olderAudience, 0).score, 'age metadata must not change hot ranking score');

storage.set('zq:recommendation-not-interested:anonymous', JSON.stringify(['video-1']));
assert.equal(rules.sortFeatured([base()], 0).length, 1, 'personal not-interested history must not filter the platform hot chart');

storage.clear();
storage.set('zhiqu.auth.session.v1', JSON.stringify({ user: { id: 'student-1', ageBand: ['6-8'] } }));
context.__zqRecommendationTrack('recommendation_impression', { videoId: 'dedupe', position: 0 });
context.__zqRecommendationTrack('recommendation_impression', { videoId: 'dedupe', position: 0 });
assert.equal(JSON.parse(storage.get('zq:recommendation-events:student-1')).length, 1, 'impressions must be deduplicated per account');
assert.equal(storage.has('zq:recommendation-events:anonymous'), false, 'events must not leak to anonymous account storage');

console.log('hot recommendation rules: ok');
