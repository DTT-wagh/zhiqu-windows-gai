const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'dist', 'zhiqu-guest-access.js'), 'utf8');
const serverSource = fs.readFileSync(path.join(__dirname, '..', 'serve-static.cjs'), 'utf8');
const securitySource = fs.readFileSync(path.join(__dirname, '..', '..', 'server', 'patch-src', 'com', 'zhiqu', 'server', 'config', 'SecurityConfig.java'), 'utf8');
const controllerSource = fs.readFileSync(path.join(__dirname, '..', '..', 'server', 'patch-src', 'com', 'zhiqu', 'server', 'content', 'ContentController.java'), 'utf8');
const playbackPatchSource = fs.readFileSync(path.join(__dirname, '..', '..', 'server', 'patch-src', 'patch-guest-video-playback.cjs'), 'utf8');
const patchManifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'server', 'patch-src', 'patch-manifest.json'), 'utf8'));
const storage = new Map();
let assignedUrl = null;
const contents = [
  { id: 'course-1', type: 'VIDEO', title: '认识人工智能', summary: '从身边开始认识 AI。', coverUrl: null, categoryName: 'AI认知', difficulty: 'BEGINNER', durationMinutes: 4 },
];
const categories = [{ id: 'category-1', slug: 'ai-awareness', name: 'AI认知', shortName: 'AI认知' }];
const publicQuestion = {
  id: 'question-1111',
  category: categories[0],
  title: '斯拉夫人的运营现状——BVVD篇',
  bodySummary: '先声明: 战争雷霆这游戏本体没得黑。',
  tags: [{ id: 'tag-machine-learning', name: '机器学习' }],
  linkedContent: null,
  questionStatus: 'SOLVED',
  safetyStatus: 'PUBLISHED',
  author: { nickname: '1111', publicProfileId: 'student-1111', avatarKey: null },
  authorOwned: false,
  bookmarked: false,
  answerCount: 3,
  createdAt: '2026-08-01T12:29:00.000Z',
};
let publicCommunityAvailable = true;

class TestElement {
  constructor(tagName) {
    this.tagName = String(tagName || 'div').toUpperCase();
    this.parentElement = null;
    this.children = [];
    this.attributes = new Map();
    this.dataset = {};
    this.className = '';
    this._textContent = '';
    this.listeners = {};
    this.classList = {
      add: (...names) => {
        const classes = new Set(this.className.split(/\s+/).filter(Boolean));
        names.forEach((name) => classes.add(name));
        this.className = Array.from(classes).join(' ');
      },
      remove: (...names) => {
        const removed = new Set(names);
        this.className = this.className.split(/\s+/).filter((name) => name && !removed.has(name)).join(' ');
      },
      contains: (name) => this.className.split(/\s+/).includes(name),
    };
  }

  get textContent() {
    return this._textContent || this.children.map((child) => child.textContent).join('');
  }

  set textContent(value) {
    this._textContent = String(value || '');
  }

  get nextSibling() {
    if (!this.parentElement) return null;
    const index = this.parentElement.children.indexOf(this);
    return this.parentElement.children[index + 1] || null;
  }

  get parentNode() {
    return this.parentElement;
  }

  appendChild(child) {
    return this.insertBefore(child, null);
  }

  insertBefore(child, reference) {
    if (child.parentElement) child.parentElement.removeChild(child);
    const index = reference ? this.children.indexOf(reference) : -1;
    if (index >= 0) this.children.splice(index, 0, child);
    else this.children.push(child);
    child.parentElement = this;
    return child;
  }

  removeChild(child) {
    const index = this.children.indexOf(child);
    if (index >= 0) this.children.splice(index, 1);
    child.parentElement = null;
    return child;
  }

  setAttribute(name, value) {
    const stringValue = String(value);
    this.attributes.set(name, stringValue);
    if (name.startsWith('data-')) {
      const key = name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      this.dataset[key] = stringValue;
    }
  }

  getAttribute(name) {
    return this.attributes.get(name) || null;
  }

  removeAttribute(name) {
    this.attributes.delete(name);
    if (name.startsWith('data-')) {
      const key = name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      delete this.dataset[key];
    }
  }

  contains(target) {
    return this === target || this.children.some((child) => child.contains(target));
  }

  addEventListener(type, callback) {
    if (!this.listeners[type]) this.listeners[type] = [];
    this.listeners[type].push(callback);
  }

  dispatch(type, event = {}) {
    (this.listeners[type] || []).forEach((callback) => callback({ target: this, ...event }));
  }

  closest(selector) {
    const isButton = this.tagName === 'BUTTON' || this.getAttribute('role') === 'button' || this.getAttribute('role') === 'tab';
    if (isButton && selector.includes('button')) return this;
    return this.parentElement ? this.parentElement.closest(selector) : null;
  }

  focus() {
    this.focused = true;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  querySelectorAll(selector) {
    const dataMatch = selector.match(/^\[([^=]+)="([^"]+)"\]$/);
    const matches = dataMatch && this.getAttribute(dataMatch[1]) === dataMatch[2];
    return (matches ? [this] : []).concat(...this.children.map((child) => child.querySelectorAll(selector)));
  }
}

function verifyGuestCommunityGate() {
  const communityStorage = new Map();
  const communityRoot = new TestElement('html');
  const communityHead = new TestElement('head');
  const controls = new TestElement('div');
  const topTabs = new TestElement('div');
  const topicError = new TestElement('div');
  const statusTabs = new TestElement('div');
  const controlRow = new TestElement('div');
  const inputShell = new TestElement('div');
  const input = new TestElement('input');
  const postList = new TestElement('div');
  let rerunPatch = null;

  topicError.textContent = '主题暂时无法加载重新加载';
  postList.textContent = '真实帖子内容';
  input.setAttribute('aria-label', '筛选已加载的问题');
  inputShell.appendChild(input);
  controlRow.appendChild(inputShell);
  controls.appendChild(topTabs);
  controls.appendChild(topicError);
  controls.appendChild(statusTabs);
  controls.appendChild(controlRow);
  controls.appendChild(postList);
  communityRoot.appendChild(controls);

  const communityDocument = {
    documentElement: communityRoot,
    head: communityHead,
    readyState: 'complete',
    createElement(tagName) { return new TestElement(tagName); },
    querySelector(selector) {
      if (selector === '[aria-label="筛选已加载的问题"]') return input;
      return communityRoot.querySelector(selector);
    },
    querySelectorAll(selector) { return communityRoot.querySelectorAll(selector); },
    addEventListener() {},
  };
  const communityWindow = {
    location: { pathname: '/community', search: '', assign() {} },
    localStorage: { getItem(key) { return communityStorage.get(key) || null; } },
    fetch() { return Promise.resolve({ ok: true, json: () => Promise.resolve({}) }); },
    setTimeout(callback) { callback(); },
  };
  const communityContext = {
    window: communityWindow,
    document: communityDocument,
    URLSearchParams,
    MutationObserver: class MutationObserver {
      constructor(callback) { rerunPatch = callback; }
      observe() {}
    },
    globalThis: null,
  };
  communityContext.globalThis = communityContext;
  vm.runInNewContext(source, communityContext, { filename: 'zhiqu-guest-access.js' });

  const gate = controls.querySelector('[data-zq-guest-community-gate="true"]');
  assert.ok(gate, 'guest community must render a standalone login gate');
  assert.equal(gate.parentElement, controls, 'the login gate must be a sibling of the post list, not a post');
  assert.equal(controls.children.indexOf(gate), controls.children.indexOf(controlRow) + 1, 'the login gate must appear immediately after the search controls');
  assert.equal(postList.classList.contains('zq-guest-community-hidden'), true, 'guest post content must be hidden behind the login gate');
  assert.equal(topicError.classList.contains('zq-guest-community-hidden'), true, 'guest-only topic loading errors must not appear above the gate');
  assert.equal(topTabs.classList.contains('zq-guest-community-hidden'), false, 'community navigation tabs must remain visible');
  assert.equal(statusTabs.classList.contains('zq-guest-community-hidden'), false, 'post filter tabs must remain visible');

  communityStorage.set('zhiqu.auth.session.v1', JSON.stringify({ accessToken: 'session-token' }));
  rerunPatch();
  assert.equal(controls.querySelector('[data-zq-guest-community-gate="true"]'), null, 'the gate must be removed after login');
  assert.equal(postList.classList.contains('zq-guest-community-hidden'), false, 'the original post list must be restored after login');
}

verifyGuestCommunityGate();

function verifyGuestCommunityGamesGate() {
  const communityRoot = new TestElement('html');
  const communityHead = new TestElement('head');
  const communityContent = new TestElement('div');
  const hero = new TestElement('div');
  const switcher = new TestElement('div');
  const questionsTab = new TestElement('div');
  const gamesTab = new TestElement('div');
  const gamesArea = new TestElement('div');
  let rerunPatch = null;
  let assignedCommunityUrl = null;

  questionsTab.textContent = '帖子';
  questionsTab.setAttribute('role', 'tab');
  questionsTab.setAttribute('aria-selected', 'false');
  gamesTab.textContent = 'AI 实践';
  gamesTab.setAttribute('role', 'tab');
  gamesTab.setAttribute('aria-selected', 'true');
  switcher.setAttribute('role', 'tablist');
  switcher.appendChild(questionsTab);
  switcher.appendChild(gamesTab);
  gamesArea.textContent = '互动游戏大厅';
  communityContent.appendChild(hero);
  communityContent.appendChild(switcher);
  communityContent.appendChild(gamesArea);
  communityRoot.appendChild(communityContent);

  const communityDocument = {
    documentElement: communityRoot,
    head: communityHead,
    readyState: 'complete',
    createElement(tagName) { return new TestElement(tagName); },
    querySelector() { return null; },
    querySelectorAll(selector) { return communityRoot.querySelectorAll(selector); },
    addEventListener() {},
  };
  const communityWindow = {
    location: { pathname: '/community', search: '?section=games', assign(url) { assignedCommunityUrl = url; } },
    localStorage: { getItem() { return null; } },
    fetch() { return Promise.resolve({ ok: true, json: () => Promise.resolve({}) }); },
    setTimeout(callback) { callback(); },
  };
  const communityContext = {
    window: communityWindow,
    document: communityDocument,
    URLSearchParams,
    MutationObserver: class MutationObserver {
      constructor(callback) { rerunPatch = callback; }
      observe() {}
    },
    globalThis: null,
  };
  communityContext.globalThis = communityContext;
  vm.runInNewContext(source, communityContext, { filename: 'zhiqu-guest-access.js' });

  const gate = communityContent.querySelector('[data-zq-guest-community-gate="true"]');
  assert.ok(gate, 'guest AI practice must render a standalone login gate');
  assert.equal(gate.parentElement, communityContent, 'the AI practice gate must replace the game area, not navigate away');
  assert.equal(communityContent.children.indexOf(gate), communityContent.children.indexOf(switcher) + 1, 'the AI practice gate must appear immediately below the section tabs');
  assert.match(gate.textContent, /登录后参与互动游戏/);
  assert.equal(gamesArea.classList.contains('zq-guest-community-hidden'), true, 'the interactive game area must be covered for guests');
  assert.equal(hero.classList.contains('zq-guest-community-hidden'), false, 'the community heading must remain visible');
  assert.equal(assignedCommunityUrl, null, 'opening the AI practice tab must not redirect guests to login');

  gamesTab.setAttribute('aria-selected', 'false');
  questionsTab.setAttribute('aria-selected', 'true');
  communityWindow.location.search = '';
  rerunPatch();
  assert.equal(communityContent.querySelector('[data-zq-guest-community-gate="true"]'), null, 'leaving AI practice must remove its login gate');
  assert.equal(gamesArea.classList.contains('zq-guest-community-hidden'), false, 'leaving AI practice must restore its original content node');
}

verifyGuestCommunityGamesGate();

function verifyGuestFriendAndInboxPrompts() {
  const communityRoot = new TestElement('html');
  const communityHead = new TestElement('head');
  const communityBody = new TestElement('body');
  const friendButton = new TestElement('button');
  const inboxButton = new TestElement('button');
  const documentListeners = {};
  let assignedUrl = null;

  friendButton.setAttribute('aria-label', '共学笔友');
  inboxButton.setAttribute('aria-label', '来信匣');
  communityBody.appendChild(friendButton);
  communityBody.appendChild(inboxButton);
  communityRoot.appendChild(communityHead);
  communityRoot.appendChild(communityBody);

  const communityDocument = {
    documentElement: communityRoot,
    head: communityHead,
    body: communityBody,
    readyState: 'complete',
    createElement(tagName) { return new TestElement(tagName); },
    querySelector(selector) { return communityRoot.querySelector(selector); },
    querySelectorAll(selector) { return communityRoot.querySelectorAll(selector); },
    addEventListener(type, callback) { documentListeners[type] = callback; },
  };
  const communityWindow = {
    location: { pathname: '/community', search: '?section=games', assign(url) { assignedUrl = url; } },
    localStorage: { getItem() { return null; } },
    fetch() { return Promise.resolve({ ok: true, json: () => Promise.resolve({}) }); },
    setTimeout(callback) { callback(); },
  };
  const communityContext = {
    window: communityWindow,
    document: communityDocument,
    URLSearchParams,
    MutationObserver: class MutationObserver { observe() {} },
    globalThis: null,
  };
  communityContext.globalThis = communityContext;
  vm.runInNewContext(source, communityContext, { filename: 'zhiqu-guest-access.js' });

  const clickEvent = (target) => ({
    target,
    preventDefault() {},
    stopImmediatePropagation() {},
  });
  documentListeners.click(clickEvent(friendButton));
  let prompt = communityRoot.querySelector('[data-zq-guest-action-prompt="true"]');
  assert.ok(prompt, 'guest friend actions must open a login reminder');
  assert.match(prompt.textContent, /登录后使用共学笔友/);
  assert.equal(assignedUrl, null, 'opening the friend reminder must not navigate immediately');

  prompt.querySelector('[aria-label="关闭登录提醒"]').dispatch('click');
  assert.equal(communityRoot.querySelector('[data-zq-guest-action-prompt="true"]'), null, 'the reminder must be dismissible');

  documentListeners.click(clickEvent(inboxButton));
  prompt = communityRoot.querySelector('[data-zq-guest-action-prompt="true"]');
  assert.match(prompt.textContent, /登录后查看来信/);
  assert.equal(assignedUrl, null, 'opening the inbox reminder must not navigate immediately');

  const loginButton = prompt.querySelector('[data-zq-guest-login="true"]');
  documentListeners.click(clickEvent(loginButton));
  assert.equal(assignedUrl, '/login?next=%2Fcommunity%3Fsection%3Dgames', 'only the reminder login button may navigate to login');
}

verifyGuestFriendAndInboxPrompts();

function verifyGuestSettingsLoginPrompt() {
  const settingsStorage = new Map();
  const settingsRoot = new TestElement('html');
  const settingsHead = new TestElement('head');
  const settingsBody = new TestElement('body');
  const settingsButton = new TestElement('button');
  const settingsLabel = new TestElement('span');
  const documentListeners = {};
  let rerunPatch = null;
  let assignedUrl = null;

  settingsButton.setAttribute('role', 'button');
  settingsLabel.setAttribute('dir', 'auto');
  settingsLabel.textContent = '退出登录';
  settingsButton.appendChild(settingsLabel);
  settingsBody.appendChild(settingsButton);
  settingsRoot.appendChild(settingsHead);
  settingsRoot.appendChild(settingsBody);

  const settingsDocument = {
    documentElement: settingsRoot,
    head: settingsHead,
    body: settingsBody,
    readyState: 'complete',
    createElement(tagName) { return new TestElement(tagName); },
    querySelector(selector) { return settingsRoot.querySelector(selector); },
    querySelectorAll(selector) { return settingsRoot.querySelectorAll(selector); },
    addEventListener(type, callback) { documentListeners[type] = callback; },
  };
  const settingsWindow = {
    location: { pathname: '/settings', search: '', assign(url) { assignedUrl = url; } },
    localStorage: { getItem(key) { return settingsStorage.get(key) || null; } },
    fetch() { return Promise.resolve({ ok: true, json: () => Promise.resolve({}) }); },
    setTimeout(callback) { callback(); },
  };
  const settingsContext = {
    window: settingsWindow,
    document: settingsDocument,
    URLSearchParams,
    MutationObserver: class MutationObserver {
      constructor(callback) { rerunPatch = callback; }
      observe() {}
    },
    globalThis: null,
  };
  settingsContext.globalThis = settingsContext;
  vm.runInNewContext(source, settingsContext, { filename: 'zhiqu-guest-access.js' });

  assert.equal(settingsLabel.textContent, '登录', 'guest settings must show a login action instead of logout');
  assert.equal(settingsButton.getAttribute('aria-label'), '登录');
  assert.equal(settingsButton.dataset.zqGuestSettingsLogin, 'true');

  let prevented = false;
  let stopped = false;
  const clickEvent = (target) => ({
    target,
    preventDefault() { prevented = true; },
    stopImmediatePropagation() { stopped = true; },
  });
  documentListeners.click(clickEvent(settingsButton));
  let prompt = settingsRoot.querySelector('[data-zq-guest-action-prompt="true"]');
  assert.ok(prompt, 'guest settings login action must open a standalone reminder');
  assert.match(prompt.textContent, /登录后使用账号设置/);
  assert.equal(assignedUrl, null, 'opening the settings reminder must not navigate immediately');
  assert.equal(prevented, true, 'the original logout click must be prevented for guests');
  assert.equal(stopped, true, 'the original logout handler must not run for guests');

  prompt.querySelector('[aria-label="关闭登录提醒"]').dispatch('click');
  assert.equal(settingsRoot.querySelector('[data-zq-guest-action-prompt="true"]'), null, 'the settings reminder must be dismissible');

  documentListeners.click(clickEvent(settingsButton));
  prompt = settingsRoot.querySelector('[data-zq-guest-action-prompt="true"]');
  const loginButton = prompt.querySelector('[data-zq-guest-login="true"]');
  documentListeners.click(clickEvent(loginButton));
  assert.equal(assignedUrl, '/login?next=%2Fsettings', 'only the reminder login button may navigate to login');

  prompt.querySelector('[aria-label="关闭登录提醒"]').dispatch('click');
  settingsStorage.set('zhiqu.auth.session.v1', JSON.stringify({ accessToken: 'session-token' }));
  rerunPatch();
  assert.equal(settingsLabel.textContent, '退出登录', 'signing in must restore the original logout label');
  assert.equal(settingsButton.dataset.zqGuestSettingsLogin, undefined, 'signed-in settings must keep the original logout behavior');
}

verifyGuestSettingsLoginPrompt();

const document = {
  documentElement: {},
  head: { appendChild() {} },
  readyState: 'complete',
  createElement() { return { textContent: '' }; },
  querySelector() { return null; },
  querySelectorAll() { return []; },
  addEventListener() {},
};
const window = {
  location: { pathname: '/profile', search: '', assign(url) { assignedUrl = url; } },
  setTimeout(callback) { callback(); },
  localStorage: {
    getItem(key) { return storage.has(key) ? storage.get(key) : null; },
  },
  fetch(url) {
    if (url.includes('/playback')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ playbackUrl: 'https://video.example/lesson.mp4' }) });
    }
    if (url.includes('/api/community')) {
      if (!publicCommunityAvailable) return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
      if (url.includes('/api/community/questions/question-1111')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ question: publicQuestion, answers: [] }) });
      }
      if (url.includes('/api/community/questions')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ items: [publicQuestion], nextCursor: null }) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ categories }) });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve(url.includes('/api/contents') ? contents : categories) });
  },
};
const context = {
  window,
  document,
  URLSearchParams,
  MutationObserver: class MutationObserver { observe() {} },
  globalThis: null,
};
context.globalThis = context;
vm.runInNewContext(source, context, { filename: 'zhiqu-guest-access.js' });

assert.equal(window.__zqIsGuestSession(), true, 'a browser without a session must be treated as a guest');
assert.match(source, /if \(\(loginButton\.textContent \|\| ''\)\.trim\(\) !== '\\u767b\\u5f55'\)/, 'guest profile patch must not repeatedly mutate the login button');
assert.match(securitySource, /requestMatchers\(HttpMethod\.GET, "\/api\/contents\/\*\/playback"\)\.permitAll\(\)/, 'published video playback must be public');
assert.match(controllerSource, /return playbackService\.get\(contentId, userId\(authentication\)\);/, 'anonymous playback must not dereference a missing authentication');
assert.match(controllerSource, /return authentication == null \? null : authentication\.getName\(\);/, 'account identity must remain nullable only for public reads');
assert.match(playbackPatchSource, /ContentController\.java/);
assert.match(playbackPatchSource, /-parameters/);
assert.ok(patchManifest.patches.some((patch) => patch.name === 'guest-video-playback'), 'the generated server must include the guest playback security patch');
assert.match(serverSource, /settingsLogoutPatched = "async function J\(\)\{if\(!o\)\{n\(!0\);try\{await e\(\);globalThis\.location\.replace\('\/'\)\}finally\{n\(!1\)\}\}\}"/);
assert.ok(serverSource.includes("const rootSessionRedirectPatched = 'const b=\"/(tabs)\"';"), 'the root route must always open the tabbed home screen');
assert.ok(serverSource.includes('source = source.replace(rootSessionRedirectSource, rootSessionRedirectPatched);'));
assert.ok(serverSource.includes('source = source.replace(tabsSessionGuardSource, tabsSessionGuardPatched);'));
assert.ok(serverSource.includes('source = source.replace(apiGuestAccessSource, apiGuestAccessPatched);'));
assert.equal(serverSource.includes('guestPromptOpenSource'), false, 'guest login prompts are not community post data');
assert.equal(serverSource.includes('guestPromptAnswerSource'), false, 'guest login prompts are not community post data');
assert.ok(serverSource.includes("if('GET'!==String(t.method||'GET').toUpperCase())globalThis.__zqRequireLogin?.();"));
assert.deepEqual({ ...window.__zqGuestProfile() }, {
  username: 'guest',
  nickname: '游客',
  bio: '登录后同步课程、实践和成长记录。',
  avatarKey: null,
});

Promise.all([
  window.__zqGuestHome(),
  window.__zqGuestLearning('/api/learning?category=ai-awareness'),
  window.__zqGuestCommunityHome(),
  window.__zqGuestCommunityQuestions('/api/community/questions?state=UNANSWERED'),
  window.__zqGuestCommunityQuestion('/api/community/questions/question-1111'),
  window.__zqGuestApiRequest('/api/community/game-listings'),
  window.__zqGuestApiRequest('/api/contents/course-1/playback'),
  window.__zqGuestApiRequest('/api/history/course-1', { method: 'PUT' }),
]).then(([home, learning, communityHome, communityQuestions, communityQuestion, communityGames, playback, guestProgress]) => {
  assert.equal(home.continueLearning.content.title, '认识人工智能');
  assert.equal(home.continueLearning.percent, 0);
  assert.equal(learning.category, 'ai-awareness');
  assert.equal(learning.courses.length, 1);
  assert.equal(learning.courses[0].learningStatus, 'NOT_STARTED');
  assert.equal(communityHome.categories.length, 1);
  assert.deepEqual(communityQuestions.items, [publicQuestion], 'guests can read real public community questions');
  assert.equal(communityQuestion.question.id, 'question-1111');
  assert.equal(communityQuestion.answers.length, 0);
  assert.equal(communityGames.items.length, 0, 'guest game listings must use an empty protected-area fallback');
  assert.equal(communityGames.nextCursor, null);
  assert.equal(playback.playbackUrl, 'https://video.example/lesson.mp4', 'guests must receive the public video playback URL');
  assert.equal(guestProgress.learningStatus, 'NOT_STARTED', 'guest playback progress must not require an account write');
  assert.equal(source.includes('小林'), false, 'the guest fallback must not invent student posts');

  publicCommunityAvailable = false;
  return window.__zqGuestCommunityQuestions('/api/community/questions');
}).then((loginPrompts) => {
  assert.equal(loginPrompts.items.length, 0, 'an unavailable community must not invent login reminder posts');
  assert.equal(source.includes('loginPrompt'), false, 'login reminders belong to the standalone gate, not post data');
  assert.equal(source.includes('guest-login-prompt'), false, 'the guest fallback must not create prompt post ids');

  return window.__zqGuestApiRequest('/api/learning?category=ai-awareness');
}).then((guestLearning) => {
  assert.equal(guestLearning.courses.length, 1, 'guest API access must expose learning reads');
  assert.equal(window.__zqGuestApiRequest('/api/favorites'), null, 'protected writes and account data must not be exposed to guests');
  window.__zqRequireLogin();
  assert.equal(assignedUrl, '/login?next=%2Fprofile', 'protected actions must lead guests to login');

  storage.set('zhiqu.auth.session.v1', JSON.stringify({ accessToken: 'session-token' }));
  assert.equal(window.__zqIsGuestSession(), false, 'a signed-in account must keep its original account experience');
  console.log('guest access fallback: ok');
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
