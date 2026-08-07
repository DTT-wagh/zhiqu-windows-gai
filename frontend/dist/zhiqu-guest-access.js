(function () {
  'use strict';

  var sessionKey = 'zhiqu.auth.session.v1';
  var catalogPromise;
  var loginRedirecting = false;
  var friendPromptLabels = new Set([
    '\u5171\u5b66\u7b14\u53cb',
    '\u6253\u5f00\u5171\u5b66\u7b14\u53cb',
    '\u6dfb\u52a0\u7b14\u53cb',
    '\u7ba1\u7406\u7b14\u53cb'
  ]);
  var inboxPromptLabels = new Set([
    '\u6765\u4fe1\u5323',
    '\u6d88\u606f'
  ]);
  var loginLabels = new Set([
    '\u7f16\u8f91\u4e2a\u4eba\u8d44\u6599',
    '\u5199\u4e0b\u95ee\u9898',
    '\u5171\u5b66\u7b14\u53cb',
    '\u6765\u4fe1\u5323',
    '\u6536\u85cf\u95ee\u9898',
    '\u53d6\u6d88\u6536\u85cf',
    '\u53d6\u6d88\u6536\u85cf\u95ee\u9898',
    '\u6dfb\u52a0\u7b14\u53cb',
    '\u7ba1\u7406\u7b14\u53cb',
    '\u6253\u5f00\u5171\u5b66\u7b14\u53cb',
    '\u67e5\u770b\u5b8c\u6574\u4e2a\u4eba\u6210\u957f',
    '\u516d\u7c7b\u5b66\u4e60\u56fe\u8c31',
    '\u80fd\u529b\u5fbd\u7ae0',
    '\u6210\u957f\u8d26\u672c',
    '\u6536\u85cf',
    '\u6700\u8fd1\u5b66\u4e60',
    '\u5b9e\u8df5\u8bb0\u5f55',
    '\u9519\u9898\u672c'
  ]);

  function isGuestSession() {
    try {
      var raw = window.localStorage.getItem(sessionKey);
      if (!raw) return true;
      var session = JSON.parse(raw);
      return !session || !session.accessToken;
    } catch (error) {
      return true;
    }
  }

  window.__zqIsGuestSession = isGuestSession;

  function isProfileRoute() {
    var pathname = window.location.pathname.replace(/\/+$/, '') || '/';
    return pathname === '/profile' || pathname === '/(tabs)/profile';
  }

  function isCommunityRoute() {
    var pathname = window.location.pathname.replace(/\/+$/, '') || '/';
    return pathname === '/community' || pathname === '/(tabs)/community';
  }

  function isSettingsRoute() {
    var pathname = window.location.pathname.replace(/\/+$/, '') || '/';
    return pathname === '/settings';
  }

  function isProtectedSettingsSubpage() {
    var pathname = window.location.pathname.replace(/\/+$/, '') || '/';
    return pathname === '/settings/account'
      || pathname === '/settings/identity'
      || pathname === '/settings/privacy'
      || pathname === '/settings/general'
      || pathname === '/settings/permissions';
  }

  function apiBase() {
    return String(window.__ZHIQU_API_BASE_URL || 'http://localhost:8080').replace(/\/+$/, '');
  }

  function loadCatalog() {
    if (catalogPromise) return catalogPromise;
    var headers = { Accept: 'application/json' };
    catalogPromise = Promise.all([
      window.fetch(apiBase() + '/api/contents', { headers: headers }).then(function (response) { return response.json(); }),
      window.fetch(apiBase() + '/api/categories', { headers: headers }).then(function (response) { return response.json(); })
    ]).then(function (result) {
      return { contents: Array.isArray(result[0]) ? result[0] : [], categories: Array.isArray(result[1]) ? result[1] : [] };
    });
    return catalogPromise;
  }

  function toCourse(item, categories) {
    var category = categories.find(function (entry) { return entry.name === item.categoryName; });
    return {
      id: item.id,
      type: item.type,
      title: item.title,
      summary: item.summary,
      coverUrl: item.coverUrl,
      categorySlug: category ? category.slug : '',
      categoryName: item.categoryName,
      difficulty: item.difficulty,
      durationSeconds: Number(item.durationMinutes || 0) * 60,
      durationMinutes: Number(item.durationMinutes || 0),
      tags: [],
      learningStatus: 'NOT_STARTED',
      progressSeconds: 0,
      favorite: false,
      matchReasons: []
    };
  }

  window.__zqGuestHome = function () {
    return loadCatalog().then(function (catalog) {
      var courses = catalog.contents.map(function (item) { return toCourse(item, catalog.categories); });
      var selected = courses.find(function (course) { return course.categorySlug === 'ai-awareness'; }) || courses[0] || null;
      return {
        asOfDate: new Date().toISOString().slice(0, 10),
        continueLearning: selected ? { selection: 'RECOMMENDED', content: selected, progressSeconds: 0, percent: 0, lastViewedAt: null } : null,
        dailyFact: null,
        relatedGames: [],
        recentResults: []
      };
    });
  };

  window.__zqGuestLearning = function (requestPath) {
    return loadCatalog().then(function (catalog) {
      var requestedCategory = new URLSearchParams(String(requestPath || '').split('?')[1] || '').get('category');
      var categorySlug = requestedCategory || (catalog.categories[0] && catalog.categories[0].slug) || '';
      var courses = catalog.contents.map(function (item) { return toCourse(item, catalog.categories); });
      var categoryCourses = courses.filter(function (course) { return course.categorySlug === categorySlug; });
      return {
        category: categorySlug,
        categories: catalog.categories,
        dailyFact: null,
        featured: courses.slice(0, 6),
        newest: courses.slice(0, 6),
        categoryProgress: { categorySlug: categorySlug, completedLessons: 0, totalLessons: categoryCourses.length, percent: 0 },
        courses: categoryCourses
      };
    });
  };

  function requestPublicCommunity(requestPath) {
    return window.fetch(apiBase() + requestPath, { headers: { Accept: 'application/json' } }).then(function (response) {
      if (response.ok === false) throw new Error('Public community request failed');
      return response.json();
    });
  }

  function requestPublicPlayback(requestPath) {
    return window.fetch(apiBase() + requestPath, { headers: { Accept: 'application/json' } }).then(function (response) {
      if (response.ok === false) throw new Error('Public video playback request failed');
      return response.json();
    });
  }

  window.__zqGuestCommunityHome = function () {
    return requestPublicCommunity('/api/community').catch(function () {
      return loadCatalog().then(function (catalog) {
        return { categories: catalog.categories };
      });
    });
  };

  window.__zqGuestCommunityQuestions = function (requestPath) {
    return requestPublicCommunity(requestPath).catch(function () {
      return { items: [], nextCursor: null };
    });
  };

  window.__zqGuestCommunityQuestion = function (requestPath) {
    return requestPublicCommunity(requestPath).catch(function () {
      return { question: null, answers: [] };
    });
  };

  window.__zqGuestApiRequest = function (requestPath, requestOptions) {
    if (!isGuestSession()) return null;
    var method = String(requestOptions && requestOptions.method || 'GET').toUpperCase();
    var path = String(requestPath || '');
    if (method === 'PUT' && /^\/api\/history\/[^/]+$/.test(path)) {
      return Promise.resolve({ learningStatus: 'NOT_STARTED', completedNow: false, reward: null });
    }
    if (method !== 'GET') return null;
    if (path.indexOf('/api/learning') === 0) return window.__zqGuestLearning(path);
    if (path === '/api/community') return window.__zqGuestCommunityHome();
    if (path.indexOf('/api/community/questions?') === 0) return window.__zqGuestCommunityQuestions(path);
    if (/^\/api\/community\/questions\/[^/]+$/.test(path)) return window.__zqGuestCommunityQuestion(path);
    if (path.indexOf('/api/community/game-listings') === 0) return Promise.resolve({ items: [], nextCursor: null });
    if (/^\/api\/contents\/[^/]+\/playback$/.test(path)) return requestPublicPlayback(path);
    if (path === '/api/social/me') return Promise.resolve({ friendCount: 0, incomingRequestCount: 0, unreadNotificationCount: 0 });
    if (path === '/api/notifications/summary') return Promise.resolve({ unreadCount: 0 });
    return null;
  };

  window.__zqRequireLogin = function () {
    if (!isGuestSession() || loginRedirecting || window.location.pathname === '/login') return;
    loginRedirecting = true;
    var next = window.location.pathname + (window.location.search || '');
    window.location.assign('/login?next=' + encodeURIComponent(next));
  };

  window.__zqGuestProfile = function () {
    return {
      username: 'guest',
      nickname: '\u6e38\u5ba2',
      bio: '\u767b\u5f55\u540e\u540c\u6b65\u8bfe\u7a0b\u3001\u5b9e\u8df5\u548c\u6210\u957f\u8bb0\u5f55\u3002',
      avatarKey: null
    };
  };

  window.__zqGuestRewardSummary = function () {
    return { totalXp: 0, todayXp: 0, dailyLimit: 80, currentLevelXp: 0, nextLevelXp: 100, achievements: [] };
  };

  function setText(value, replacement) {
    if (value && value.textContent && value.textContent.trim() === replacement.from) value.textContent = replacement.to;
  }

  function patchGuestProfile() {
    if (!isGuestSession() || !isProfileRoute()) return;

    document.querySelectorAll('[dir="auto"]').forEach(function (element) {
      setText(element, { from: '\u52a0\u8f7d\u4e2d', to: '\u6e38\u5ba2' });
      setText(element, { from: '@...', to: '@guest' });
      setText(element, { from: '\u4e2a\u4eba\u8d44\u6599\u52a0\u8f7d\u5931\u8d25', to: '\u767b\u5f55\u540e\u5373\u53ef\u67e5\u770b\u4e2a\u4eba\u8d44\u6599' });
      setText(element, { from: '\u7ba1\u7406\u7b14\u53cb\u4e0e\u5171\u5b66\u9080\u7ea6', to: '\u767b\u5f55\u540e\u7ba1\u7406\u7b14\u53cb\u4e0e\u5171\u5b66\u9080\u7ea6' });
    });

    var loginButton = document.querySelector('[aria-label="\u7f16\u8f91\u4e2a\u4eba\u8d44\u6599"], [data-zq-guest-login="true"]');
    if (loginButton) {
      loginButton.setAttribute('data-zq-guest-login', 'true');
      loginButton.setAttribute('aria-label', '\u767b\u5f55');
      loginButton.setAttribute('title', '\u767b\u5f55');
      if ((loginButton.textContent || '').trim() !== '\u767b\u5f55') {
        loginButton.textContent = '\u767b\u5f55';
      }
    }
  }

  function findSettingsActionText(button, labels) {
    return Array.from(button.querySelectorAll('[dir="auto"]')).find(function (element) {
      return labels.has((element.textContent || '').trim());
    }) || null;
  }

  function restoreGuestSettingsLogin() {
    document.querySelectorAll('[data-zq-guest-settings-login="true"]').forEach(function (button) {
      var label = findSettingsActionText(button, new Set(['\u767b\u5f55']));
      if (label) label.textContent = '\u9000\u51fa\u767b\u5f55';
      button.removeAttribute('data-zq-guest-settings-login');
      button.removeAttribute('aria-label');
      button.removeAttribute('title');
    });
  }

  function patchGuestSettings() {
    if (!isGuestSession() || !isSettingsRoute()) {
      restoreGuestSettingsLogin();
      return;
    }

    var logoutLabels = new Set(['\u9000\u51fa\u767b\u5f55', '\u6b63\u5728\u9000\u51fa']);
    var logoutButton = Array.from(document.querySelectorAll('[role="button"]')).find(function (button) {
      return button.dataset.zqGuestSettingsLogin === 'true'
        || logoutLabels.has((button.textContent || '').trim());
    });
    if (!logoutButton) return;

    logoutButton.setAttribute('data-zq-guest-settings-login', 'true');
    logoutButton.setAttribute('aria-label', '\u767b\u5f55');
    logoutButton.setAttribute('title', '\u767b\u5f55');
    var label = findSettingsActionText(logoutButton, logoutLabels);
    if (label) label.textContent = '\u767b\u5f55';
  }

  function removeGuestSettingsGate() {
    var gate = document.querySelector('[data-zq-guest-settings-gate="true"]');
    if (gate && gate.parentNode) gate.parentNode.removeChild(gate);
  }

  function createGuestSettingsGate() {
    var gate = document.createElement('div');
    gate.className = 'zq-guest-settings-gate';
    gate.setAttribute('data-zq-guest-settings-gate', 'true');
    gate.setAttribute('role', 'dialog');
    gate.setAttribute('aria-modal', 'true');
    gate.setAttribute('aria-label', '\u767b\u5f55\u63d0\u9192');

    var panel = document.createElement('section');
    panel.className = 'zq-guest-settings-gate-panel';
    gate.appendChild(panel);

    var eyebrow = document.createElement('span');
    eyebrow.className = 'zq-guest-settings-gate-eyebrow';
    eyebrow.textContent = '\u8d26\u53f7\u8bbe\u7f6e';
    panel.appendChild(eyebrow);

    var title = document.createElement('h1');
    title.className = 'zq-guest-settings-gate-title';
    title.textContent = '\u767b\u5f55\u540e\u4f7f\u7528\u8d26\u53f7\u8bbe\u7f6e';
    panel.appendChild(title);

    var message = document.createElement('p');
    message.className = 'zq-guest-settings-gate-message';
    message.textContent = '\u5b8c\u6210\u767b\u5f55\u540e\u53ef\u7ba1\u7406\u8d26\u53f7\u3001\u8eab\u4efd\u548c\u9690\u79c1\u8bbe\u7f6e\u3002';
    panel.appendChild(message);

    var actions = document.createElement('div');
    actions.className = 'zq-guest-settings-gate-actions';
    panel.appendChild(actions);

    var backButton = document.createElement('button');
    backButton.type = 'button';
    backButton.className = 'zq-guest-settings-gate-back';
    backButton.setAttribute('aria-label', '\u8fd4\u56de\u8bbe\u7f6e');
    backButton.textContent = '\u8fd4\u56de\u8bbe\u7f6e';
    backButton.addEventListener('click', function () {
      window.location.assign('/settings');
    });
    actions.appendChild(backButton);

    var loginButton = document.createElement('button');
    loginButton.type = 'button';
    loginButton.className = 'zq-guest-settings-gate-login';
    loginButton.setAttribute('data-zq-guest-login', 'true');
    loginButton.setAttribute('aria-label', '\u53bb\u767b\u5f55');
    loginButton.textContent = '\u53bb\u767b\u5f55';
    actions.appendChild(loginButton);

    return gate;
  }

  function patchGuestSettingsSubpage() {
    if (!isGuestSession() || !isProtectedSettingsSubpage()) {
      removeGuestSettingsGate();
      return;
    }

    if (document.querySelector('[data-zq-guest-settings-gate="true"]')) return;
    document.body.appendChild(createGuestSettingsGate());
  }

  function removeGuestCommunityGate() {
    document.querySelectorAll('[data-zq-guest-community-gate="true"]').forEach(function (gate) {
      if (gate.parentNode) gate.parentNode.removeChild(gate);
    });
    document.querySelectorAll('[data-zq-guest-community-hidden="true"]').forEach(function (element) {
      element.removeAttribute('data-zq-guest-community-hidden');
      element.removeAttribute('data-zq-guest-community-scope');
      element.classList.remove('zq-guest-community-hidden');
    });
  }

  function clearGuestCommunityScope(scope) {
    document.querySelectorAll('[data-zq-guest-community-gate="true"]').forEach(function (gate) {
      if (gate.getAttribute('data-zq-guest-community-scope') !== scope) return;
      if (gate.parentNode) gate.parentNode.removeChild(gate);
    });
    document.querySelectorAll('[data-zq-guest-community-hidden="true"]').forEach(function (element) {
      if (element.getAttribute('data-zq-guest-community-scope') !== scope) return;
      element.removeAttribute('data-zq-guest-community-hidden');
      element.removeAttribute('data-zq-guest-community-scope');
      element.classList.remove('zq-guest-community-hidden');
    });
  }

  function createGuestCommunityGate(scope) {
    var isGames = scope === 'games';
    var gate = document.createElement('section');
    gate.className = 'zq-guest-community-gate';
    gate.setAttribute('data-zq-guest-community-gate', 'true');
    gate.setAttribute('data-zq-guest-community-scope', scope);
    gate.setAttribute('aria-label', '\u767b\u5f55\u63d0\u9192');

    var title = document.createElement('h2');
    title.className = 'zq-guest-community-gate-title';
    title.textContent = isGames ? '\u767b\u5f55\u540e\u53c2\u4e0e\u4e92\u52a8\u6e38\u620f' : '\u767b\u5f55\u540e\u67e5\u770b\u793e\u533a\u5e16\u5b50';
    gate.appendChild(title);

    var message = document.createElement('p');
    message.className = 'zq-guest-community-gate-message';
    message.textContent = isGames
      ? '\u5b8c\u6210\u767b\u5f55\u540e\u53ef\u8fdb\u5165\u6e38\u620f\u5927\u5385\uff0c\u53c2\u4e0e\u5b89\u5168\u7684\u4e92\u52a8\u5b9e\u8df5\u3002'
      : '\u767b\u5f55\u540e\u53ef\u67e5\u770b\u5b8c\u6574\u8ba8\u8bba\uff0c\u5e76\u53c2\u4e0e\u53d1\u5e03\u3001\u56de\u7b54\u548c\u6536\u85cf\u3002';
    gate.appendChild(message);

    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'zq-guest-community-gate-button';
    button.setAttribute('data-zq-guest-login', 'true');
    button.setAttribute('aria-label', isGames ? '\u767b\u5f55\u540e\u8fdb\u5165\u4e92\u52a8\u6e38\u620f' : '\u767b\u5f55\u540e\u67e5\u770b\u793e\u533a');
    button.textContent = '\u767b\u5f55';
    gate.appendChild(button);
    return gate;
  }

  function patchGuestCommunity() {
    if (!isGuestSession() || !isCommunityRoute()) {
      removeGuestCommunityGate();
      return;
    }

    var communityTabs = Array.from(document.querySelectorAll('[role="tab"]'));
    var gamesTab = communityTabs.find(function (tab) {
      return (tab.textContent || '').trim() === 'AI \u5b9e\u8df5';
    });
    var gamesActive = gamesTab && new URLSearchParams(window.location.search || '').get('section') === 'games';
    if (gamesActive && gamesTab.parentElement && gamesTab.parentElement.parentElement) {
      clearGuestCommunityScope('questions');
      var switcher = gamesTab.parentElement;
      var communityContent = switcher.parentElement;
      var gamesGate = communityContent.querySelector('[data-zq-guest-community-gate="true"]');
      if (!gamesGate) {
        gamesGate = createGuestCommunityGate('games');
        communityContent.insertBefore(gamesGate, switcher.nextSibling);
      }
      var contentChildren = Array.from(communityContent.children);
      var switcherIndex = contentChildren.indexOf(switcher);
      contentChildren.forEach(function (element, index) {
        if (element === gamesGate || index <= switcherIndex) return;
        element.setAttribute('data-zq-guest-community-hidden', 'true');
        element.setAttribute('data-zq-guest-community-scope', 'games');
        element.classList.add('zq-guest-community-hidden');
      });
      return;
    }

    clearGuestCommunityScope('games');
    var input = document.querySelector('[aria-label="\u7b5b\u9009\u5df2\u52a0\u8f7d\u7684\u95ee\u9898"]');
    if (!input || !input.parentElement || !input.parentElement.parentElement) return;
    var controlRow = input.parentElement.parentElement;
    var controls = controlRow.parentElement;
    if (!controls) return;

    var gate = controls.querySelector('[data-zq-guest-community-gate="true"]');
    if (!gate) {
      gate = createGuestCommunityGate('questions');
      controls.insertBefore(gate, controlRow.nextSibling);
    }

    var children = Array.from(controls.children);
    var controlIndex = children.indexOf(controlRow);
    children.forEach(function (element, index) {
      if (element === gate || element === controlRow) return;
      var followsControls = index > controlIndex;
      var text = (element.textContent || '').trim();
      var isGuestTopicPlaceholder = text.indexOf('\u4e3b\u9898\u6682\u65f6\u65e0\u6cd5\u52a0\u8f7d') >= 0
        || text.indexOf('\u6b63\u5728\u52a0\u8f7d\u516d\u7c7b\u4e3b\u9898') >= 0;
      if (!followsControls && !isGuestTopicPlaceholder) return;
      element.setAttribute('data-zq-guest-community-hidden', 'true');
      element.setAttribute('data-zq-guest-community-scope', 'questions');
      element.classList.add('zq-guest-community-hidden');
    });
  }

  function patchGuestExperience() {
    patchGuestProfile();
    patchGuestSettings();
    patchGuestSettingsSubpage();
    patchGuestCommunity();
  }

  function closeGuestActionPrompt() {
    var prompt = document.querySelector('[data-zq-guest-action-prompt="true"]');
    if (prompt && prompt.parentNode) prompt.parentNode.removeChild(prompt);
  }

  function showGuestActionPrompt(type) {
    closeGuestActionPrompt();
    var isInbox = type === 'inbox';
    var isSettings = type === 'settings';
    var backdrop = document.createElement('div');
    backdrop.className = 'zq-guest-action-backdrop';
    backdrop.setAttribute('data-zq-guest-action-prompt', 'true');

    var dialog = document.createElement('section');
    dialog.className = 'zq-guest-action-dialog';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', 'zq-guest-action-title');
    backdrop.appendChild(dialog);

    var closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'zq-guest-action-close';
    closeButton.setAttribute('aria-label', '\u5173\u95ed\u767b\u5f55\u63d0\u9192');
    closeButton.textContent = '\u00d7';
    closeButton.addEventListener('click', closeGuestActionPrompt);
    dialog.appendChild(closeButton);

    var eyebrow = document.createElement('span');
    eyebrow.className = 'zq-guest-action-eyebrow';
    eyebrow.textContent = isSettings ? '\u8d26\u53f7' : isInbox ? '\u6765\u4fe1\u5323' : '\u5171\u5b66\u7b14\u53cb';
    dialog.appendChild(eyebrow);

    var title = document.createElement('h2');
    title.id = 'zq-guest-action-title';
    title.className = 'zq-guest-action-title';
    title.textContent = isSettings
      ? '\u767b\u5f55\u540e\u4f7f\u7528\u8d26\u53f7\u8bbe\u7f6e'
      : isInbox ? '\u767b\u5f55\u540e\u67e5\u770b\u6765\u4fe1' : '\u767b\u5f55\u540e\u4f7f\u7528\u5171\u5b66\u7b14\u53cb';
    dialog.appendChild(title);

    var message = document.createElement('p');
    message.className = 'zq-guest-action-message';
    message.textContent = isSettings
      ? '\u5b8c\u6210\u767b\u5f55\u540e\u53ef\u7ba1\u7406\u8d26\u53f7\u3001\u9690\u79c1\u548c\u6d88\u606f\u8bbe\u7f6e\u3002'
      : isInbox
        ? '\u5b8c\u6210\u767b\u5f55\u540e\u53ef\u67e5\u770b\u7b14\u53cb\u6d88\u606f\u548c\u4e92\u52a8\u901a\u77e5\u3002'
        : '\u5b8c\u6210\u767b\u5f55\u540e\u53ef\u6dfb\u52a0\u548c\u7ba1\u7406\u7b14\u53cb\uff0c\u7ee7\u7eed\u5b89\u5168\u7684\u5b66\u4e60\u4ea4\u6d41\u3002';
    dialog.appendChild(message);

    var loginButton = document.createElement('button');
    loginButton.type = 'button';
    loginButton.className = 'zq-guest-action-login';
    loginButton.setAttribute('data-zq-guest-login', 'true');
    loginButton.setAttribute('aria-label', isSettings
      ? '\u767b\u5f55\u540e\u4f7f\u7528\u8d26\u53f7\u8bbe\u7f6e'
      : isInbox ? '\u767b\u5f55\u540e\u67e5\u770b\u6765\u4fe1' : '\u767b\u5f55\u540e\u4f7f\u7528\u5171\u5b66\u7b14\u53cb');
    loginButton.textContent = '\u53bb\u767b\u5f55';
    dialog.appendChild(loginButton);

    backdrop.addEventListener('click', function (event) {
      if (event.target === backdrop) closeGuestActionPrompt();
    });
    document.body.appendChild(backdrop);
    window.setTimeout(function () {
      if (loginButton.focus) loginButton.focus();
    }, 0);
  }

  function goToLogin(event) {
    if (!isGuestSession()) return;
    var button = event.target.closest && event.target.closest('button,[role="button"],[role="tab"]');
    if (!button) return;
    var label = button.getAttribute('aria-label') || '';
    var text = (button.textContent || '').trim();
    var promptLabel = friendPromptLabels.has(label) || friendPromptLabels.has(text)
      ? 'friends'
      : inboxPromptLabels.has(label) || inboxPromptLabels.has(text) ? 'inbox' : null;
    if (button.dataset.zqGuestSettingsLogin === 'true'
      || (isSettingsRoute() && (text === '\u9000\u51fa\u767b\u5f55' || text === '\u6b63\u5728\u9000\u51fa'))) {
      event.preventDefault();
      event.stopImmediatePropagation();
      showGuestActionPrompt('settings');
      return;
    }
    if (promptLabel) {
      event.preventDefault();
      event.stopImmediatePropagation();
      showGuestActionPrompt(promptLabel);
      return;
    }
    if (text === '\u5e16\u5b50' || text === 'AI \u5b9e\u8df5') {
      window.setTimeout(patchGuestExperience, 0);
      return;
    }
    if (button.dataset.zqGuestLogin === 'true' || loginLabels.has(label) || loginLabels.has(text)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      window.__zqRequireLogin();
    }
  }

  var style = document.createElement('style');
  style.textContent = 'button[data-zq-guest-login="true"]:not(.zq-guest-community-gate-button):not(.zq-guest-action-login):not(.zq-guest-settings-gate-login){width:52px!important;min-width:52px!important;padding:0 8px!important;background:#365c8d!important;color:#fff!important;font-size:12px!important;font-weight:800!important;line-height:18px!important}.zq-guest-community-hidden{display:none!important}.zq-guest-community-gate{box-sizing:border-box;width:100%;min-height:260px;margin-top:16px;padding:40px 28px 52px;display:flex!important;flex-direction:column;align-items:center;justify-content:center;text-align:center;border-top:1px solid #ddd6c9;background:#f8f5ed;color:#23313b}.zq-guest-community-gate-title{margin:0;color:#23313b;font-size:22px;font-weight:800;line-height:1.35}.zq-guest-community-gate-message{max-width:520px;margin:12px 0 24px;color:#667177;font-size:15px;line-height:1.6}.zq-guest-community-gate-button{min-width:112px;min-height:44px;padding:0 24px;border:0;border-radius:6px;background:#365c8d;color:#fff;font-size:15px;font-weight:800;cursor:pointer}.zq-guest-community-gate-button:focus-visible{outline:3px solid rgba(54,92,141,.35);outline-offset:2px}.zq-guest-settings-gate{position:fixed;inset:0;z-index:2147482000;box-sizing:border-box;padding:20px;display:flex;align-items:center;justify-content:center;background:rgba(247,244,236,.96);color:#23313b}.zq-guest-settings-gate-panel{box-sizing:border-box;width:min(100%,460px);padding:36px 28px 28px;border:1px solid #d7d0c3;border-radius:8px;background:#fffdfa;text-align:center;box-shadow:0 16px 42px rgba(35,49,59,.16)}.zq-guest-settings-gate-eyebrow{display:block;margin-bottom:8px;color:#b6463d;font-size:12px;font-weight:800}.zq-guest-settings-gate-title{margin:0;color:#23313b;font-size:24px;line-height:1.4}.zq-guest-settings-gate-message{margin:12px 0 24px;color:#667177;font-size:15px;line-height:1.65}.zq-guest-settings-gate-actions{display:flex;flex-wrap:wrap;justify-content:center;gap:12px}.zq-guest-settings-gate-back,.zq-guest-settings-gate-login{min-width:132px;min-height:44px;padding:0 22px;border-radius:6px;font-size:15px;font-weight:800;cursor:pointer}.zq-guest-settings-gate-back{border:1px solid #365c8d;background:#fffdfa;color:#365c8d}.zq-guest-settings-gate-login{border:0;background:#365c8d;color:#fff}.zq-guest-settings-gate-back:focus-visible,.zq-guest-settings-gate-login:focus-visible{outline:3px solid rgba(54,92,141,.35);outline-offset:2px}.zq-guest-action-backdrop{position:fixed;inset:0;z-index:2147483000;box-sizing:border-box;padding:20px;display:flex;align-items:center;justify-content:center;background:rgba(28,38,44,.42)}.zq-guest-action-dialog{position:relative;box-sizing:border-box;width:min(100%,420px);padding:34px 28px 28px;border:1px solid #d7d0c3;border-radius:8px;background:#fffdfa;color:#23313b;text-align:center;box-shadow:0 16px 42px rgba(35,49,59,.22)}.zq-guest-action-close{position:absolute;top:10px;right:10px;width:44px;height:44px;padding:0;border:0;border-radius:50%;background:transparent;color:#59666d;font-size:28px;line-height:1;cursor:pointer}.zq-guest-action-close:hover{background:#f0ece4}.zq-guest-action-eyebrow{display:block;margin-bottom:8px;color:#b6463d;font-size:12px;font-weight:800}.zq-guest-action-title{margin:0;color:#23313b;font-size:22px;line-height:1.4}.zq-guest-action-message{margin:12px 0 24px;color:#667177;font-size:15px;line-height:1.65}.zq-guest-action-login{min-width:120px;min-height:44px;padding:0 24px;border:0;border-radius:6px;background:#365c8d;color:#fff;font-size:15px;font-weight:800;cursor:pointer}.zq-guest-action-close:focus-visible,.zq-guest-action-login:focus-visible{outline:3px solid rgba(54,92,141,.35);outline-offset:2px}@media (max-width:560px){.zq-guest-community-gate{min-height:240px;padding:32px 20px 44px}.zq-guest-community-gate-title{font-size:20px}.zq-guest-community-gate-message{font-size:14px}.zq-guest-settings-gate-panel{padding:32px 22px 24px}.zq-guest-settings-gate-title{font-size:20px}.zq-guest-settings-gate-message{font-size:14px}.zq-guest-action-dialog{padding:32px 22px 24px}.zq-guest-action-title{font-size:20px}.zq-guest-action-message{font-size:14px}}';
  document.head.appendChild(style);
  document.addEventListener('click', goToLogin, true);
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') closeGuestActionPrompt();
  });

  function startGuestExperiencePatch() {
    new MutationObserver(patchGuestExperience).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-selected'] });
    patchGuestExperience();
  }

  if (document.readyState === 'complete') {
    window.setTimeout(startGuestExperiencePatch, 0);
  } else {
    window.addEventListener('load', function () {
      window.setTimeout(startGuestExperiencePatch, 0);
    }, { once: true });
  }
})();
