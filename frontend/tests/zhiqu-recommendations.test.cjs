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
  qualityScore: 0.8,
  publishedAt: new Date().toISOString(),
  ...overrides,
});

assert.deepEqual({ ...rules.weights }, {
  recentValidWatch: 0.40,
  completionQuality: 0.25,
  highQualityInteraction: 0.20,
  freshness: 0.10,
  exploration: 0.05,
});

assert.equal(rules.usable(base({ ageBand: ['11-12'] }), new Set()), true, 'age must not filter a hot recommendation');
assert.equal(rules.usable(base({ reviewStatus: 'PENDING' }), new Set()), false, 'unreviewed content must be filtered');
assert.equal(rules.usable(base({ containsAdvertising: true }), new Set()), false, 'advertising content must be filtered');
assert.equal(rules.usable(base({ coverUrl: 'https://cdn.example/cover.jpg' }), new Set()), false, 'placeholder covers must be filtered');
assert.equal(rules.usable(base({ videoUrl: 'not-a-video-url' }), new Set()), false, 'invalid video URLs must be filtered');
assert.equal(rules.usable(base({ videoUrl: '', videoUrlKnown: false }), new Set()), true, 'catalog cards may defer playback URL validation to the content page');
assert.equal(rules.usable(base({ summary: '' }), new Set()), false, 'content without a learning summary must be filtered');
assert.equal(rules.sortFeatured([base()], 0).length, 1, 'a single real video must remain one original card');

const seriesCandidates = [
  base({ id: 's1-1', seriesId: 's1', episodeNo: 1 }),
  base({ id: 's1-2', seriesId: 's1', episodeNo: 2 }),
  base({ id: 's1-3', seriesId: 's1', episodeNo: 3 }),
  base({ id: 's2-1', seriesId: 's2', subject: 'Science' }),
  base({ id: 's3-1', seriesId: 's3', subject: 'Art' }),
  base({ id: 's4-1', seriesId: 's4', subject: 'Music' }),
];
const ranked = rules.rerank(seriesCandidates.map((candidate) => rules.score(candidate, 0)), 6, 0);
assert.ok(ranked.filter((item) => item.seriesId === 's1').length <= 2, 'one series must not fill the hot area');
assert.ok(new Set(ranked.map((item) => item.subject)).size >= 3, 'subjects should be diversified');
assert.deepEqual(ranked.map((item) => item.id), rules.rerank(seriesCandidates.map((candidate) => rules.score(candidate, 0)), 6, 0).map((item) => item.id), 'same batch should be deterministic');

const untouchedProgress = base({ id: 'progress-same', completed: false, progressSeconds: 0, watchedPercent: 0 });
const completedProgress = base({ id: 'progress-same', completed: true, progressSeconds: 120, watchedPercent: 100 });
assert.equal(rules.score(untouchedProgress, 0).score, rules.score(completedProgress, 0).score, 'personal learning progress must not change hot ranking score');
const youngerAudience = base({ id: 'age-same', ageBand: ['6-8'] });
const olderAudience = base({ id: 'age-same', ageBand: ['11-12'] });
assert.equal(rules.score(youngerAudience, 0).score, rules.score(olderAudience, 0).score, 'age metadata must not change hot ranking score');

const exploratory = Array.from({ length: 6 }, (_, index) => base({
  id: `explore-${index}`,
  seriesId: `explore-${index}`,
  exposureCount: index < 2 ? 0 : 50,
  publishedAt: index < 2 ? new Date().toISOString() : '2020-01-01T00:00:00.000Z',
}));
const explored = rules.rerank(exploratory.map((candidate) => rules.score(candidate, 1)), 6, 1);
assert.ok(explored.filter((item) => item.exploration).length >= 2, 'available new content should receive exploration exposure');

storage.clear();
storage.set('zhiqu.auth.session.v1', JSON.stringify({ user: { id: 'student-1', ageBand: ['6-8'] } }));
context.__zqRecommendationTrack('recommendation_impression', { videoId: 'dedupe', position: 0 });
context.__zqRecommendationTrack('recommendation_impression', { videoId: 'dedupe', position: 0 });
assert.equal(JSON.parse(storage.get('zq:recommendation-events:student-1')).length, 1, 'impressions must be deduplicated per account');
assert.equal(storage.has('zq:recommendation-events:anonymous'), false, 'events must not leak to anonymous account storage');

console.log('hot recommendation rules: ok');
