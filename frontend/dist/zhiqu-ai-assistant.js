(function () {
  'use strict';

  if (window.__zhiquAiAssistantLoaded) return;
  window.__zhiquAiAssistantLoaded = true;

  var SESSION_KEY = 'zhiqu.auth.session.v1';
  var SIDEBAR_COLLAPSED_KEY = 'zq:ai-assistant-sidebar-collapsed:v1';
  var PORTRAIT_TRIGGER = '\u5fcd\u51ac2033';
  var ALICE_TRIGGER = '\u5fc3\u7231\u7684\u5c11\u5973\u5728\u54ea\u91cc\uff1f';
  var PAGE_MARKER = 'data-zq-ai-assistant-page';
  var NAV_MARKER = 'data-zq-ai-global-nav';
  var PRIMARY_ROUTES = new Set(['/', '/(tabs)', '/categories', '/community', '/profile', '/ai-assistant']);
  var NAV_ITEMS = [
    { label: '\u9996\u9875', href: '/', icon: '\u2302' },
    { label: '\u5b66\u4e60', href: '/categories', icon: '\u25a4' },
    { label: 'AI\u52a9\u624b', href: '/ai-assistant', icon: 'sparkles', assistant: true },
    { label: '\u793e\u533a', href: '/community', icon: 'messages-square' },
    { label: '\u6211\u7684', href: '/profile', icon: 'user-round' }
  ];
  var state = {
    config: null,
    conversations: [],
    activeConversationId: null,
    messages: [],
    draft: '',
    memoryEnabled: false,
    loading: false,
    error: '',
    authRequired: false,
    abortController: null,
    activeGeneration: null,
    generationCancelPending: false,
    confirmDeleteId: null,
    deletingId: null,
    conversationSwitching: false,
    conversationTransitionTimer: null,
    loadingLabel: '',
    latestMessageId: null,
    followLatest: false,
    sidebarOpen: false,
    sidebarCollapsed: readSidebarCollapsed(),
    sidebarTrigger: null,
    sidebarKeyHandler: null,
    sidebarTouchStart: null,
    sidebarBodyLock: null,
    settingsOpen: false,
    copiedMessageId: null,
    copiedTimer: null,
    sourceExpandedIds: Object.create(null),
    failedMessageId: null,
    regeneratingMessageId: null,
    deletingMessageId: null,
    confirmMessageDeleteId: null,
    editingMessageId: null,
    editingMessageDraft: '',
    editingMessageError: '',
    editingRequestId: null,
    portraitVisible: false,
    portraitMode: '',
    nativeRoute: null,
    enteringAssistant: false,
    leavingAssistant: false,
    initialized: false
  };
  var observer;
  var scheduled = false;
  var refreshPromise = null;

  function pathName() {
    return (window.location.pathname.replace(/\/+$/, '') || '/');
  }

  function isAssistantRoute() {
    return pathName() === '/ai-assistant';
  }

  function readSidebarCollapsed() {
    try {
      return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1';
    } catch (error) {
      return false;
    }
  }

  function persistSidebarCollapsed(collapsed) {
    try {
      window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? '1' : '0');
    } catch (error) {
      // The sidebar still works for the current page when storage is unavailable.
    }
  }

  function session() {
    try {
      var raw = window.localStorage.getItem(SESSION_KEY);
      var value = raw ? JSON.parse(raw) : null;
      return value && value.accessToken ? value : null;
    } catch (error) {
      return null;
    }
  }

  function apiBase() {
    return String(window.__ZHIQU_API_BASE_URL || 'http://localhost:8080').replace(/\/+$/, '');
  }

  function apiError(message, status, code) {
    var error = new Error(message);
    error.status = status;
    error.code = code;
    return error;
  }

  function refreshSession(currentSession) {
    if (!currentSession || !currentSession.refreshToken) return Promise.resolve(null);
    if (!refreshPromise) {
      refreshPromise = window.fetch(apiBase() + '/api/auth/refresh', {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: currentSession.refreshToken })
      }).then(function (response) {
        if (!response.ok) return null;
        return response.json().then(function (nextSession) {
          if (!nextSession || !nextSession.accessToken) return null;
          window.localStorage.setItem(SESSION_KEY, JSON.stringify(nextSession));
          return nextSession;
        });
      }).catch(function () {
        return null;
      }).finally(function () {
        refreshPromise = null;
      });
    }
    return refreshPromise;
  }

  function isAuthError(error) {
    return !!error && (error.status === 401 || error.code === 'UNAUTHORIZED' || error.code === 'SESSION_EXPIRED');
  }

  function messageForError(error, fallback) {
    if (error && error.code === 'UNAUTHORIZED' && !session()) return '\u8bf7\u5148\u767b\u5f55\u540e\u91cd\u8bd5';
    if (isAuthError(error)) return '\u767b\u5f55\u5df2\u8fc7\u671f\uff0c\u8bf7\u91cd\u65b0\u767b\u5f55\u540e\u91cd\u8bd5';
    return error && error.message ? error.message : fallback;
  }

  function apiRequest(path, options, retryAfterRefresh) {
    var activeSession = session();
    if (!activeSession || !activeSession.accessToken) {
      return Promise.reject(apiError('\u8bf7\u5148\u767b\u5f55', 401, 'UNAUTHORIZED'));
    }
    var requestOptions = options || {};
    var headers = Object.assign({ Accept: 'application/json' }, requestOptions.headers || {}, {
      Authorization: 'Bearer ' + activeSession.accessToken
    });
    if (requestOptions.body !== undefined) headers['Content-Type'] = 'application/json';
    return window.fetch(apiBase() + path, Object.assign({}, requestOptions, {
      headers: headers,
      body: requestOptions.body === undefined ? undefined : JSON.stringify(requestOptions.body)
    })).then(function (response) {
      if (response.status === 401 && retryAfterRefresh !== false) {
        return refreshSession(activeSession).then(function (nextSession) {
          if (nextSession && nextSession.accessToken) return apiRequest(path, requestOptions, false);
          throw apiError('\u767b\u5f55\u5df2\u8fc7\u671f\uff0c\u8bf7\u91cd\u65b0\u767b\u5f55\u540e\u91cd\u8bd5', 401, 'SESSION_EXPIRED');
        });
      }
      return response.text().then(function (text) {
        var payload = null;
        try { payload = text ? JSON.parse(text) : null; } catch (error) { payload = null; }
        if (!response.ok) {
          var message = payload && (payload.message || payload.detail || payload.error);
          var failure = new Error(message || ('\u8bf7\u6c42\u5931\u8d25 (' + response.status + ')'));
          failure.status = response.status;
          failure.code = payload && payload.code;
          throw failure;
        }
        return payload;
      });
    });
  }

  function createRequestId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (character) {
      var random = Math.random() * 16 | 0;
      var value = character === 'x' ? random : (random & 3 | 8);
      return value.toString(16);
    });
  }

  function startGenerationRequest(requestId, kind) {
    state.activeGeneration = {
      requestId: requestId,
      kind: kind || 'message'
    };
    state.generationCancelPending = false;
  }

  function finishGenerationRequest(requestId) {
    if (state.activeGeneration && state.activeGeneration.requestId === requestId) {
      state.activeGeneration = null;
    }
    state.generationCancelPending = false;
  }

  function cancelActiveGeneration(options) {
    var settings = options || {};
    var active = state.activeGeneration;
    var controller = state.abortController;
    if (!active) {
      if (controller) controller.abort();
      return Promise.resolve();
    }
    if (state.generationCancelPending) {
      if (controller) controller.abort();
      return Promise.resolve();
    }
    state.generationCancelPending = true;
    if (!settings.skipRender) renderDialogue();
    var cancellation = apiRequest('/api/assistant/requests/' + encodeURIComponent(active.requestId), {
      method: 'DELETE'
    }).catch(function (error) {
      if (!settings.silent) {
        state.error = messageForError(error, '\u65e0\u6cd5\u505c\u6b62\u670d\u52a1\u7aef\u751f\u6210');
      }
    }).finally(function () {
      state.generationCancelPending = false;
      if (!settings.skipRender && isAssistantRoute()) renderDialogue();
    });
    if (controller) controller.abort();
    return cancellation;
  }

  function routeTo(href) {
    if (pathName() === href) return;
    if (href !== '/ai-assistant') {
      // Native tab buttons normally handle these routes. This is only a
      // fallback for a directly loaded assistant document or an incomplete
      // shell, so use the route document instead of synthesizing popstate.
      window.location.assign(href);
      return;
    }
    // Keep the Expo shell mounted while switching top-level pages. A hard
    // location change reloads the full bundle and makes the five main tabs
    // feel sluggish; the router already responds to popstate on web.
    if (href === '/ai-assistant' && PRIMARY_ROUTES.has(pathName())) {
      // The assistant is an enhancement route layered over the native Tabs
      // shell. Remember the native page underneath it so clicking that same
      // tab can go back through browser history instead of asking the native
      // router to navigate to its already-active screen.
      state.nativeRoute = pathName();
      state.enteringAssistant = true;
      playAssistantSourceExit();
    }
    window.history.pushState({}, '', href);
    // `/ai-assistant` is an enhancement route, not an Expo route. Do not send
    // it to Expo Router; doing so renders its Unmatched Route screen.
    window.dispatchEvent(new Event('zq:routechange'));
  }

  function activateOriginalNav(label, beforeClick) {
    var original = document.querySelector('[data-zq-original-nav-hidden="true"]');
    if (!original) return false;
    var target = Array.from(original.querySelectorAll('[role="tab"]')).find(function (tab) {
      return (tab.textContent || '').trim() === label;
    });
    if (!target) return false;
    if (beforeClick) beforeClick();
    target.click();
    return true;
  }

  function installStyles() {
    if (document.getElementById('zq-ai-assistant-styles')) return;
    var style = document.createElement('style');
    style.id = 'zq-ai-assistant-styles';
    style.textContent = [
      ':root{--zq-ai-paper:#f7f4ec;--zq-ai-white:#fffdfa;--zq-ai-ink:#243139;--zq-ai-soft:#667177;--zq-ai-line:#d8d2c5;--zq-ai-teal:#39766d;--zq-ai-teal-soft:#dcebe5;--zq-ai-coral:#c85f53;--zq-ai-gold:#d9ad4b;--zq-ai-nav-active:#365c8d;--zq-ai-nav-height:74px}',
      '[data-zq-original-nav-hidden="true"]{visibility:hidden!important;pointer-events:none!important}',
      '.zq-ai-global-nav{position:fixed;z-index:10050;left:50%;bottom:8px;transform:translateX(-50%);width:min(calc(100% - 28px),700px);height:66px;padding:6px;display:grid;grid-template-columns:repeat(5,minmax(0,1fr));align-items:stretch;background:rgba(255,253,250,.76);border:0;border-radius:24px;box-shadow:0 8px 18px rgba(39,50,55,.16);box-sizing:border-box}',
      '.zq-ai-nav-item{appearance:none;border:1px solid transparent;background:transparent;border-radius:18px;color:var(--zq-ai-soft);min-width:0;min-height:52px;padding:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;font:700 10px/13px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;cursor:pointer}',
      '.zq-ai-nav-icon{width:29px;height:29px;display:grid;place-items:center;border-radius:50%;font:700 20px/1 system-ui;transition:transform 200ms ease-out,background-color 200ms ease-out,box-shadow 200ms ease-out;color:currentColor}',
      '.zq-ai-nav-icon svg{display:block;width:20px;height:20px}',
      '.zq-ai-nav-item[data-active="true"]{color:var(--zq-ai-nav-active);font-weight:900;background:rgba(255,253,250,.90);border-color:rgba(54,92,141,.14)}',
      '.zq-ai-nav-item[data-assistant="true"] .zq-ai-nav-icon{background:transparent}',
      '.zq-ai-nav-item[data-active="true"] .zq-ai-nav-icon{width:44px;height:44px;margin-bottom:-2px;transform:translateY(-8px);background:var(--zq-ai-nav-active);color:#fff;box-shadow:0 7px 14px rgba(54,92,141,.20)}',
      '@media (hover:hover){.zq-ai-nav-item:not([data-active="true"]):hover .zq-ai-nav-icon{transform:translateY(-2px)}}',
      '.zq-ai-page{position:fixed;z-index:9000;inset:0;overflow:hidden;background:var(--zq-ai-paper);color:var(--zq-ai-ink);font-family:system-ui,-apple-system,"Segoe UI","Microsoft YaHei",sans-serif;transform-origin:left center;backface-visibility:hidden;animation:none}',
      '.zq-ai-page[data-entering="true"]{background:transparent;isolation:isolate}',
      '.zq-ai-page[data-entering="true"]::before{content:"";position:absolute;z-index:0;inset:0;background:var(--zq-ai-paper);animation:zqAiAssistantBackdrop 260ms cubic-bezier(.22,.61,.36,1) both}',
      '.zq-ai-page[data-entering="true"] .zq-ai-shell{position:relative;z-index:1;animation:zqAiAssistantReveal 320ms 120ms cubic-bezier(.22,.61,.36,1) both}',
      '.zq-ai-sidebar-scrim{display:none}.zq-ai-sidebar-scrim[hidden]{display:none!important}',
      '#root.zq-ai-assistant-source-exit{transform-origin:center center;backface-visibility:hidden;animation:zqAiAssistantSourceExit 260ms cubic-bezier(.22,.61,.36,1) both}',
      '#root.zq-ai-native-page-enter{transform-origin:left center;backface-visibility:hidden;animation:zqAiNativeSceneEnter 560ms cubic-bezier(.62,.02,.25,1) both}',
      '.zq-ai-shell{height:100%;box-sizing:border-box;padding-bottom:var(--zq-ai-nav-height);display:grid;grid-template-columns:260px minmax(0,1fr);overflow:hidden;transition:grid-template-columns 190ms ease-out}',
      '.zq-ai-shell[data-sidebar-collapsed="true"]{grid-template-columns:68px minmax(0,1fr)}',
      '.zq-ai-sidebar{min-width:0;border-right:1px solid var(--zq-ai-line);background:#eeeee6;padding:18px 14px;display:flex;flex-direction:column;gap:14px;overflow:hidden;transition:padding 190ms ease-out}',
      '.zq-ai-brand-row{display:flex;align-items:center;justify-content:space-between;gap:8px}',
      '.zq-ai-sidebar-actions{display:flex;align-items:center;gap:6px}',
      '.zq-ai-icon-button.zq-ai-sidebar-close{display:none}',
      '.zq-ai-icon-button.zq-ai-sidebar-toggle{display:grid;flex:none}',
      '.zq-ai-brand{min-width:0;flex:1;font-size:17px;line-height:22px;font-weight:900;letter-spacing:0;white-space:nowrap;overflow:hidden}',
      '.zq-ai-icon-button{width:44px;height:44px;display:grid;place-items:center;border:1px solid var(--zq-ai-line);border-radius:8px;background:var(--zq-ai-white);color:var(--zq-ai-ink);cursor:pointer;font-size:20px}',
      '.zq-ai-icon-button .zq-ai-message-icon{width:19px;height:19px}',
      '.zq-ai-icon-button:disabled{cursor:wait;opacity:.56}',
      '.zq-ai-shell[data-sidebar-collapsed="true"] .zq-ai-sidebar{padding-inline:11px}',
      '.zq-ai-shell[data-sidebar-collapsed="true"] .zq-ai-brand-row{flex-direction:column;justify-content:flex-start}',
      '.zq-ai-shell[data-sidebar-collapsed="true"] .zq-ai-brand{display:none}',
      '.zq-ai-shell[data-sidebar-collapsed="true"] .zq-ai-sidebar-actions{flex-direction:column}',
      '.zq-ai-shell[data-sidebar-collapsed="true"] .zq-ai-conversation-list{display:none}',
      '.zq-ai-page button:focus-visible,.zq-ai-page a:focus-visible{outline:3px solid rgba(57,118,109,.28);outline-offset:2px}',
      '.zq-ai-conversation-list{display:flex;flex-direction:column;gap:6px;overflow:auto;min-height:0}',
      '.zq-ai-conversation-list[data-switching="true"] .zq-ai-conversation[data-active="true"]{animation:zqAiConversationLabel 300ms ease-out both}',
      '.zq-ai-conversation-row{display:grid;grid-template-columns:minmax(0,1fr) 40px;gap:4px;align-items:stretch}',
      '.zq-ai-conversation{min-width:0;border:1px solid transparent;border-radius:8px;background:transparent;padding:10px;text-align:left;color:var(--zq-ai-ink);cursor:pointer}',
      '.zq-ai-conversation[data-active="true"]{background:var(--zq-ai-white);border-color:var(--zq-ai-line)}',
      '.zq-ai-conversation-title{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;line-height:18px;font-weight:800}',
      '.zq-ai-conversation-time{display:block;color:var(--zq-ai-soft);font-size:10px;line-height:15px;margin-top:2px}',
      '.zq-ai-delete{border:0;background:transparent;border-radius:8px;color:var(--zq-ai-soft);font-size:12px;cursor:pointer;min-width:40px}',
      '.zq-ai-delete[data-confirm="true"]{background:#f7e7e2;color:#9d352d;font-weight:800}',
      '.zq-ai-delete:disabled{cursor:wait;opacity:.72}',
      '.zq-ai-main{min-width:0;min-height:0;display:grid;grid-template-columns:minmax(0,1fr);grid-template-rows:minmax(150px,30vh) minmax(0,1fr);background:#e7eee9;position:relative}',
      '.zq-ai-stage{position:relative;width:100%;min-width:0;box-sizing:border-box;overflow:hidden;border-bottom:1px solid rgba(57,118,109,.18);background:#dcebe5}',
      '.zq-ai-stage-lines{position:absolute;inset:18px;border:1px solid rgba(57,118,109,.12);border-left-color:rgba(200,95,83,.2);border-bottom-color:rgba(217,173,75,.28);opacity:.8}',
      '.zq-ai-stage-title{position:absolute;z-index:2;left:clamp(18px,5vw,58px);top:clamp(22px,5vh,54px);max-width:340px}',
      '.zq-ai-stage-title h1{margin:0;font-size:clamp(22px,3vw,34px);line-height:1.15;letter-spacing:0;font-weight:900;color:#214d47}',
      '.zq-ai-stage-title p{margin:10px 0 0;color:#46665f;font-size:13px;line-height:19px}',
      '.zq-ai-portrait{position:absolute;z-index:4;right:clamp(18px,10vw,130px);bottom:-8px;width:220px;height:240px;display:block;object-fit:cover;object-position:center center;mix-blend-mode:multiply;filter:drop-shadow(0 10px 10px rgba(36,49,57,.14));pointer-events:none}',
      '.zq-ai-stage[data-portrait-mode="alice"] .zq-ai-stage-title{max-width:42%}',
      '.zq-ai-portrait[data-mode="alice"]{right:clamp(18px,5vw,72px);bottom:12px;width:min(42%,380px);height:calc(100% - 24px);object-fit:contain;object-position:right center;mix-blend-mode:normal;border-radius:6px;filter:drop-shadow(0 9px 14px rgba(36,22,28,.2))}',
      '.zq-ai-portrait[hidden]{display:none!important}',
      '.zq-ai-portrait-body{position:absolute;left:28px;bottom:0;width:112px;height:104px;background:#39766d;border-radius:48px 48px 14px 14px;border:5px solid #fffdfa;box-sizing:border-box}',
      '.zq-ai-portrait-neck{position:absolute;left:69px;top:81px;width:30px;height:31px;background:#e7b89f;border:4px solid #fffdfa;box-sizing:border-box}',
      '.zq-ai-portrait-head{position:absolute;left:42px;top:14px;width:86px;height:84px;background:#edc2aa;border-radius:43px 43px 38px 38px;border:5px solid #fffdfa;box-sizing:border-box}',
      '.zq-ai-portrait-hair{position:absolute;left:38px;top:3px;width:96px;height:58px;background:#314c50;border-radius:52px 52px 24px 30px;transform:rotate(-2deg)}',
      '.zq-ai-portrait-hair:after{content:"";position:absolute;right:4px;top:34px;width:26px;height:58px;background:#314c50;border-radius:4px 22px 22px 14px;transform:rotate(-8deg)}',
      '.zq-ai-eye{position:absolute;z-index:2;top:54px;width:7px;height:7px;background:#243139;border-radius:50%}',
      '.zq-ai-eye.left{left:62px}.zq-ai-eye.right{left:102px}',
      '.zq-ai-mouth{position:absolute;z-index:2;left:78px;top:76px;width:16px;height:7px;border-bottom:2px solid #9e554c;border-radius:0 0 12px 12px}',
      '.zq-ai-pin{position:absolute;z-index:3;left:73px;bottom:51px;width:24px;height:24px;display:grid;place-items:center;border-radius:50%;background:#d9ad4b;color:#fff;font-size:15px;border:3px solid #fffdfa}',
      '.zq-ai-dialogue{min-height:0;background:rgba(255,253,250,.88);backdrop-filter:blur(12px);display:grid;grid-template-rows:auto minmax(0,1fr) auto}',
      '.zq-ai-dialogue[data-conversation-switching="true"]{animation:zqAiConversationSwitch 320ms ease-out both}',
      '.zq-ai-toolbar{position:relative;z-index:8;min-height:52px;padding:7px 16px;display:flex;align-items:center;gap:10px;border-bottom:1px solid rgba(216,210,197,.8)}',
      '.zq-ai-toolbar-title{min-width:0;flex:1;font-size:13px;font-weight:850;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.zq-ai-settings-button{flex:none}',
      '.zq-ai-settings-scrim{position:fixed;z-index:30;inset:0;border:0;background:transparent;padding:0;cursor:default}',
      '.zq-ai-settings-menu{position:absolute;z-index:31;right:12px;top:calc(100% + 6px);width:min(320px,calc(100vw - 24px));box-sizing:border-box;padding:14px;border:1px solid var(--zq-ai-line);border-radius:8px;background:#fffdfa;box-shadow:0 12px 28px rgba(36,49,57,.16)}',
      '.zq-ai-settings-heading{margin:0 0 10px;font-size:13px;line-height:18px;font-weight:900;color:var(--zq-ai-ink)}',
      '.zq-ai-settings-option{min-height:58px;display:grid;grid-template-columns:minmax(0,1fr) 22px;gap:12px;align-items:center;cursor:pointer}',
      '.zq-ai-settings-copy{min-width:0;display:grid;gap:3px}',
      '.zq-ai-settings-title{font-size:13px;line-height:18px;font-weight:850;color:var(--zq-ai-ink)}',
      '.zq-ai-settings-description{font-size:11px;line-height:17px;color:var(--zq-ai-soft)}',
      '.zq-ai-settings-option input{width:20px;height:20px;margin:0;accent-color:var(--zq-ai-teal);cursor:pointer}',
      '.zq-ai-mobile-menu{display:none}',
      '.zq-ai-messages{min-height:0;overflow:auto;padding:18px clamp(14px,4vw,46px) 22px;scroll-behavior:smooth}',
      '.zq-ai-message{display:flex;flex-direction:column;align-items:flex-start;margin:0 auto 16px;max-width:820px}',
      '.zq-ai-message[data-entering="true"] .zq-ai-bubble{animation:zqAiMessageIn 560ms ease-out both;transform-origin:bottom left}',
      '.zq-ai-message[data-role="USER"][data-entering="true"] .zq-ai-bubble{transform-origin:bottom right}',
      '.zq-ai-message[data-role="USER"]{align-items:flex-end}',
      '.zq-ai-bubble{max-width:min(76%,680px);padding:12px 14px;border-radius:8px;background:#fffdfa;border:1px solid var(--zq-ai-line);box-shadow:0 4px 10px rgba(58,53,43,.06);white-space:pre-wrap;overflow-wrap:anywhere;font-size:14px;line-height:22px}',
      '.zq-ai-message[data-role="USER"] .zq-ai-bubble{background:#39766d;color:#fff;border-color:#39766d}',
      '.zq-ai-message[data-editing="true"]{align-items:flex-end}',
      '.zq-ai-message[data-editing="true"] .zq-ai-bubble{width:min(92%,680px);max-width:min(92%,680px);box-sizing:border-box;background:#f7faf8;color:var(--zq-ai-ink);border-color:var(--zq-ai-teal);white-space:normal;box-shadow:0 5px 14px rgba(57,118,109,.12)}',
      '.zq-ai-inline-edit-form{display:grid;gap:10px}',
      '.zq-ai-inline-editor{display:block;width:100%;min-height:88px;max-height:200px;box-sizing:border-box;resize:none;overflow-x:hidden;overflow-y:auto;scrollbar-width:none;-ms-overflow-style:none;border:0;background:transparent;color:var(--zq-ai-ink);padding:0;font:14px/22px inherit;outline:none}',
      '.zq-ai-inline-editor::-webkit-scrollbar{width:0;height:0;display:none}',
      '.zq-ai-inline-actions{display:flex;justify-content:flex-end;align-items:center;gap:8px}',
      '.zq-ai-inline-cancel,.zq-ai-inline-submit{min-width:72px;min-height:44px;border-radius:7px;padding:0 16px;font:800 13px/1 inherit;cursor:pointer}',
      '.zq-ai-inline-cancel{border:1px solid #bcb8ae;background:#fff;color:var(--zq-ai-ink)}',
      '.zq-ai-inline-submit{border:1px solid var(--zq-ai-teal);background:var(--zq-ai-teal);color:#fff}',
      '.zq-ai-inline-cancel:focus-visible,.zq-ai-inline-submit:focus-visible{outline:3px solid rgba(57,118,109,.24);outline-offset:2px}',
      '.zq-ai-inline-cancel:disabled,.zq-ai-inline-submit:disabled{opacity:.55;cursor:wait}',
      '.zq-ai-inline-error{color:#a23e35;font-size:12px;line-height:18px}',
      '.zq-ai-intent{display:inline-flex;margin-top:9px;padding:3px 7px;border-radius:4px;background:#e8edf4;color:#365c8d;font-size:10px;line-height:14px;font-weight:800}',
      '.zq-ai-sources{margin-top:12px;padding-top:10px;border-top:1px solid var(--zq-ai-line)}',
      '.zq-ai-section-label{font-size:11px;font-weight:900;color:var(--zq-ai-soft);margin-bottom:6px}',
      '.zq-ai-source{display:block;color:#2c675e;text-decoration:none;font-size:12px;line-height:18px;padding:4px 0}',
      '.zq-ai-recommendations{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:12px}',
      '.zq-ai-recommendation{min-width:0;display:grid;grid-template-columns:64px minmax(0,1fr);gap:9px;padding:8px;border:1px solid var(--zq-ai-line);border-radius:8px;background:#f7f4ec;color:var(--zq-ai-ink);text-decoration:none}',
      '.zq-ai-cover{width:64px;aspect-ratio:4/3;object-fit:cover;border-radius:4px;background:#dcebe5}',
      '.zq-ai-cover-placeholder{width:64px;aspect-ratio:4/3;border-radius:4px;background:#dcebe5;display:grid;place-items:center;color:#39766d;font-size:22px}',
      '.zq-ai-rec-title{font-size:12px;line-height:17px;font-weight:900;overflow-wrap:anywhere}',
      '.zq-ai-rec-reason{margin-top:3px;color:var(--zq-ai-soft);font-size:10px;line-height:15px}',
      '.zq-ai-message-action,.zq-ai-source-toggle{position:relative;isolation:isolate;width:44px;min-width:44px;height:44px;min-height:44px;display:inline-grid;place-items:center;border:0;border-radius:50%;background:transparent;color:var(--zq-ai-soft);padding:0;cursor:pointer}',
      '.zq-ai-message-action::before,.zq-ai-source-toggle::before{content:"";position:absolute;z-index:0;inset:5px;border-radius:50%;background:transparent;transition:background-color 140ms ease-out}',
      '.zq-ai-message-action:hover::before,.zq-ai-message-action:focus-visible::before,.zq-ai-source-toggle:hover::before,.zq-ai-source-toggle:focus-visible::before{background:#f1f3f2}',
      '.zq-ai-message-action:hover,.zq-ai-message-action:focus-visible,.zq-ai-source-toggle:hover,.zq-ai-source-toggle:focus-visible{color:var(--zq-ai-teal);outline:2px solid rgba(57,118,109,.22);outline-offset:-1px}',
      '.zq-ai-message-actions{display:flex;flex-wrap:wrap;gap:2px;margin-top:4px;max-width:100%;align-items:center}',
      '.zq-ai-message-action:disabled{opacity:.55;cursor:wait}',
      '.zq-ai-message-icon,.zq-ai-source-icon{position:relative;z-index:1;width:18px;height:18px;display:block;pointer-events:none}',
      '.zq-ai-message-action[aria-busy="true"] .zq-ai-message-icon{animation:zqAiIconSpin 900ms linear infinite}',
      '.zq-ai-message-failure{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:10px;color:#a23e35;font-size:12px;line-height:18px}',
      '.zq-ai-message-failure button{color:#a23e35;font-weight:800}',
      '.zq-ai-source-toggle{margin-top:6px;color:#365c8d}',
      '@media(min-width:761px) and (hover:hover){.zq-ai-message-actions{opacity:.28;transition:opacity 140ms ease-out}.zq-ai-message:hover .zq-ai-message-actions,.zq-ai-message:focus-within .zq-ai-message-actions{opacity:1}}',
      '.zq-ai-composer{padding:10px clamp(12px,3vw,26px) max(12px,env(safe-area-inset-bottom));border-top:1px solid var(--zq-ai-line);background:rgba(255,253,250,.96)}',
      '.zq-ai-error-row{max-width:820px;margin:0 auto 8px;display:flex;align-items:center;justify-content:space-between;gap:10px}',
      '.zq-ai-error{min-width:0;color:#a23e35;font-size:12px;line-height:18px}',
      '.zq-ai-error-action{flex:none;min-height:44px;border:1px solid #a23e35;border-radius:6px;background:#fff;color:#a23e35;padding:0 12px;font-weight:800;cursor:pointer}',
      '.zq-ai-compose-row{max-width:820px;margin:auto;display:grid;grid-template-columns:minmax(0,1fr) 48px;gap:8px;align-items:end}',
      '.zq-ai-input{width:100%;min-height:48px;max-height:132px;resize:none;box-sizing:border-box;border:1px solid #bcb8ae;border-radius:8px;background:#fff;color:var(--zq-ai-ink);padding:12px 13px;font:14px/21px inherit;outline:none;overflow-x:hidden;overflow-y:auto;scrollbar-width:none;-ms-overflow-style:none}',
      '.zq-ai-input::-webkit-scrollbar{width:0;height:0;display:none}',
      '.zq-ai-input:focus{border-color:var(--zq-ai-teal);box-shadow:0 0 0 3px rgba(57,118,109,.14)}',
      '.zq-ai-send{width:48px;height:48px;border:0;border-radius:8px;background:var(--zq-ai-teal);color:#fff;font-size:20px;font-weight:900;cursor:pointer;transition:transform 160ms ease-out}',
      '.zq-ai-send:hover{transform:translateY(-1px)}.zq-ai-send:disabled{opacity:.45;cursor:not-allowed;transform:none}',
      '.zq-ai-stop{max-width:820px;margin:8px auto 0;display:block;min-height:36px;border:1px solid #c85f53;border-radius:6px;background:#fff;color:#a23e35;padding:0 12px;cursor:pointer}',
      '.zq-ai-status{height:100%;display:grid;place-items:center;padding:24px;box-sizing:border-box}',
      '.zq-ai-status-panel{width:min(100%,520px);text-align:center}',
      '.zq-ai-status-panel h2{margin:0 0 10px;font-size:22px;line-height:28px;letter-spacing:0}',
      '.zq-ai-status-panel p{margin:0;color:var(--zq-ai-soft);font-size:14px;line-height:22px}',
      '.zq-ai-primary{min-height:48px;margin-top:18px;border:0;border-radius:8px;background:var(--zq-ai-teal);color:#fff;padding:0 20px;font-weight:850;cursor:pointer}',
      '.zq-ai-loading{display:flex;align-items:center;gap:6px;color:var(--zq-ai-soft);font-size:13px}',
      '.zq-ai-loading-dots{display:inline-flex;gap:3px}.zq-ai-loading-dots i{width:5px;height:5px;border-radius:50%;background:var(--zq-ai-teal);animation:zqAiPulse 900ms ease-in-out infinite}.zq-ai-loading-dots i:nth-child(2){animation-delay:120ms}.zq-ai-loading-dots i:nth-child(3){animation-delay:240ms}',
      '@keyframes zqAiAssistantSourceExit{from{opacity:1;transform:scale(1)}to{opacity:.12;transform:scale(.99)}}',
      '@keyframes zqAiAssistantBackdrop{from{opacity:0}to{opacity:1}}',
      '@keyframes zqAiAssistantReveal{from{opacity:0;transform:scale(1.01)}to{opacity:1;transform:scale(1)}}',
      '@keyframes zqAiNativeSceneEnter{from{opacity:.04;transform:perspective(1400px) rotateY(0deg) scale(.985)}to{opacity:1;transform:perspective(1400px) rotateY(0deg) scale(1)}}',
      '@keyframes zqAiIconSpin{to{transform:rotate(360deg)}}',
      '@keyframes zqAiConversationSwitch{from{opacity:.24;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}',
      '@keyframes zqAiConversationLabel{from{opacity:.35;transform:translateX(-8px)}to{opacity:1;transform:translateX(0)}}',
      '@keyframes zqAiMessageIn{0%{opacity:.08;transform:translateY(8px) scale(.82)}72%{opacity:1;transform:translateY(-1px) scale(1.02)}100%{opacity:1;transform:translateY(0) scale(1)}}',
      '@keyframes zqAiPulse{0%,100%{opacity:.28;transform:translateY(0)}50%{opacity:1;transform:translateY(-3px)}}',
      '@media(max-width:760px){.zq-ai-shell,.zq-ai-shell[data-sidebar-collapsed="true"]{grid-template-columns:1fr}.zq-ai-shell[data-sidebar-collapsed="true"] .zq-ai-sidebar{padding:18px 14px}.zq-ai-shell[data-sidebar-collapsed="true"] .zq-ai-brand-row{flex-direction:row;justify-content:space-between}.zq-ai-shell[data-sidebar-collapsed="true"] .zq-ai-brand{display:block}.zq-ai-shell[data-sidebar-collapsed="true"] .zq-ai-sidebar-actions{flex-direction:row}.zq-ai-shell[data-sidebar-collapsed="true"] .zq-ai-conversation-list{display:flex}.zq-ai-icon-button.zq-ai-sidebar-toggle{display:none}.zq-ai-sidebar-scrim{display:block;position:fixed;z-index:10;inset:0;background:rgba(20,30,35,.42);opacity:0;pointer-events:none;transition:opacity 180ms ease-out}.zq-ai-sidebar-scrim:not([hidden]){opacity:1;pointer-events:auto}.zq-ai-sidebar{position:absolute;z-index:20;inset:0 18% 0 0;transform:translateX(-104%);transition:transform 180ms ease-out;box-shadow:12px 0 24px rgba(36,49,57,.18);touch-action:pan-y}.zq-ai-sidebar[data-open="true"]{transform:translateX(0)}.zq-ai-icon-button.zq-ai-sidebar-close{display:grid}.zq-ai-main{grid-template-rows:minmax(136px,24vh) minmax(0,1fr)}.zq-ai-stage-title{left:18px;top:22px;max-width:48%}.zq-ai-stage[data-portrait-mode="alice"] .zq-ai-stage-title{max-width:42%}.zq-ai-stage-title p{display:none}.zq-ai-portrait{right:18px;width:190px;height:220px;transform:scale(.88);transform-origin:bottom right}.zq-ai-portrait[data-mode="alice"]{right:10px;width:46%;height:calc(100% - 18px);bottom:9px;transform:none}.zq-ai-mobile-menu{display:grid}.zq-ai-toolbar{padding-inline:10px}.zq-ai-settings-menu{right:10px;width:min(320px,calc(100vw - 20px))}.zq-ai-messages{padding:14px 12px 18px}.zq-ai-bubble{max-width:88%;font-size:13px;line-height:20px}.zq-ai-message[data-editing="true"] .zq-ai-bubble{width:96%;max-width:96%}.zq-ai-inline-cancel,.zq-ai-inline-submit{min-width:68px;padding-inline:14px}.zq-ai-recommendations{grid-template-columns:1fr}.zq-ai-nav-item{min-height:52px}.zq-ai-composer{padding-inline:10px}}',
      '@media(max-width:390px){.zq-ai-stage-title h1{font-size:20px}.zq-ai-portrait{right:4px}.zq-ai-nav-item{font-size:9px}.zq-ai-dialogue{backdrop-filter:none}}',
      '@media(prefers-reduced-motion:reduce){.zq-ai-page,#root.zq-ai-assistant-source-exit,#root.zq-ai-native-page-enter,.zq-ai-nav-icon,.zq-ai-shell,.zq-ai-sidebar,.zq-ai-sidebar-scrim,.zq-ai-send,.zq-ai-dialogue[data-conversation-switching="true"],.zq-ai-conversation-list[data-switching="true"] .zq-ai-conversation[data-active="true"],.zq-ai-message[data-entering="true"] .zq-ai-bubble{transition:none!important;animation:none!important}.zq-ai-nav-item[data-active="true"] .zq-ai-nav-icon{transform:none}.zq-ai-loading-dots i{animation:none}.zq-ai-messages{scroll-behavior:auto}}'
    ].join('');
    document.head.appendChild(style);
  }

  function findOriginalNav() {
    var tabs = Array.from(document.querySelectorAll('[role="tab"]'));
    var labels = ['\u9996\u9875', '\u5b66\u4e60', '\u793e\u533a', '\u6211\u7684'];
    var matching = tabs.filter(function (tab) { return labels.indexOf((tab.textContent || '').trim()) >= 0; });
    if (matching.length < 4) return null;
    var node = matching[0].parentElement;
    while (node && node !== document.body) {
      if (matching.every(function (tab) { return node.contains(tab); })) {
        var style = window.getComputedStyle(node);
        if (style.position === 'fixed' || style.position === 'absolute' || node.getAttribute('role') === 'tablist') return node;
      }
      node = node.parentElement;
    }
    return matching[0].parentElement;
  }

  function createAssistantNavIcon() {
    // The path data is the bundled Lucide Sparkles icon; MessageCircleHeart is
    // not exposed by the generated bundle, so Sparkles is the documented fallback.
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    svg.innerHTML = '<path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z"></path><path d="M20 2v4"></path><path d="M22 4h-4"></path><circle cx="4" cy="20" r="2"></circle>';
    return svg;
  }

  function createNavIcon(name) {
    // These paths match the MessagesSquare and UserRound icons used by the
    // native Tabs bundle, keeping the injected navigation visually consistent.
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    if (name === 'messages-square') {
      svg.innerHTML = '<path d="M16 10a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 14.286V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path><path d="M20 9a2 2 0 0 1 2 2v10.286a.71.71 0 0 1-1.212.502l-2.202-2.202A2 2 0 0 0 17.172 19H10a2 2 0 0 1-2-2v-1"></path>';
    } else if (name === 'user-round') {
      svg.innerHTML = '<circle cx="12" cy="8" r="5"></circle><path d="M20 21a8 8 0 0 0-16 0"></path>';
    }
    return svg;
  }

  function createMessageIcon(name) {
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    svg.classList.add(name === 'book-open' ? 'zq-ai-source-icon' : 'zq-ai-message-icon');
    var paths = {
      copy: '<rect width="14" height="14" x="8" y="8" rx="2"></rect><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"></path>',
      pencil: '<path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"></path>',
      'refresh-cw': '<path d="M3 12a9 9 0 0 1 15-6.7L21 8"></path><path d="M21 3v5h-5"></path><path d="M21 12a9 9 0 0 1-15 6.7L3 16"></path><path d="M3 21v-5h5"></path>',
      'book-open': '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path>',
      'panel-left-close': '<rect width="18" height="18" x="3" y="3" rx="2"></rect><path d="M9 3v18"></path><path d="m16 15-3-3 3-3"></path>',
      'panel-left-open': '<rect width="18" height="18" x="3" y="3" rx="2"></rect><path d="M9 3v18"></path><path d="m14 9 3 3-3 3"></path>',
      settings: '<path d="M4 21v-7"></path><path d="M4 10V3"></path><path d="M12 21v-9"></path><path d="M12 8V3"></path><path d="M20 21v-5"></path><path d="M20 12V3"></path><path d="M1 14h6"></path><path d="M9 8h6"></path><path d="M17 16h6"></path>',
      check: '<path d="m5 12 4 4L19 6"></path>',
      'thumbs-up': '<path d="M7 10v12"></path><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2h0a3.13 3.13 0 0 1 3 3.88Z"></path>',
      'thumbs-down': '<g transform="rotate(180 12 12)"><path d="M7 10v12"></path><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2h0a3.13 3.13 0 0 1 3 3.88Z"></path></g>',
      'loader-circle': '<path d="M21 12a9 9 0 1 1-6.219-8.56"></path>'
    };
    svg.innerHTML = paths[name] || paths.copy;
    return svg;
  }

  function labelMessageAction(button, iconName, label) {
    button.title = label;
    button.setAttribute('data-tooltip', label);
    button.replaceChildren(createMessageIcon(iconName));
  }

  function renderGlobalNav() {
    var route = pathName();
    var existing = document.querySelector('[' + NAV_MARKER + ']');
    if (!PRIMARY_ROUTES.has(route)) {
      if (existing) existing.remove();
      var previouslyHidden = document.querySelector('[data-zq-original-nav-hidden="true"]');
      if (previouslyHidden) previouslyHidden.removeAttribute('data-zq-original-nav-hidden');
      return;
    }
    if (!existing) {
      existing = document.createElement('nav');
      existing.className = 'zq-ai-global-nav';
      existing.setAttribute(NAV_MARKER, 'true');
      existing.setAttribute('aria-label', '\u4e3b\u5bfc\u822a');
      NAV_ITEMS.forEach(function (item) {
        var button = document.createElement('button');
        button.type = 'button';
        button.className = 'zq-ai-nav-item';
        button.dataset.href = item.href;
        button.dataset.assistant = item.assistant ? 'true' : 'false';
        button.setAttribute('aria-label', item.label);
        var icon = document.createElement('span');
        icon.className = 'zq-ai-nav-icon';
        icon.setAttribute('aria-hidden', 'true');
        if (item.assistant) icon.appendChild(createAssistantNavIcon());
        else if (item.icon === 'messages-square' || item.icon === 'user-round') icon.appendChild(createNavIcon(item.icon));
        else icon.textContent = item.icon;
        var label = document.createElement('span');
        label.textContent = item.label;
        button.append(icon, label);
        button.addEventListener('click', function () {
          if (!item.assistant) {
            // Let Expo Router perform the real tab navigation so the
            // assistant-to-tab transition is identical to a normal tab tap.
            // When the requested tab is the native page underneath the
            // assistant, its handler is intentionally a no-op; go back to the
            // history entry that opened the assistant instead.
            if (state.nativeRoute === item.href && pathName() === '/ai-assistant') {
              replayNativePageEnter();
              detachAssistantOverlay();
              window.history.back();
              return;
            }
            if (activateOriginalNav(item.label, function () {
              if (pathName() === '/ai-assistant') detachAssistantOverlay();
            })) {
              return;
            }
          }
          routeTo(item.href);
        });
        existing.appendChild(button);
      });
      document.body.appendChild(existing);
    }
    existing.querySelectorAll('.zq-ai-nav-item').forEach(function (button) {
      var href = button.dataset.href;
      var active = href === route || (href === '/' && route === '/(tabs)');
      button.dataset.active = active ? 'true' : 'false';
      button.setAttribute('aria-current', active ? 'page' : 'false');
    });
    var original = findOriginalNav();
    if (original && !original.hasAttribute(NAV_MARKER)) original.setAttribute('data-zq-original-nav-hidden', 'true');
  }

  function createPortrait() {
    var portrait = document.createElement('img');
    portrait.className = 'zq-ai-portrait';
    portrait.decoding = 'async';
    updatePortraitElement(portrait);
    return portrait;
  }

  function updatePortraitElement(portrait) {
    if (!portrait) return;
    var aliceMode = state.portraitMode === 'alice';
    portrait.src = aliceMode ? '/ai-assistant-alice.jpg' : '/ai-assistant-portrait.webp';
    portrait.alt = aliceMode
      ? '\u9690\u85cf\u5bf9\u8bdd\u89e6\u53d1\u7684\u7ae5\u8bdd\u573a\u666f\u63d2\u56fe'
      : '\u5b66\u4e60 AI \u52a9\u624b\u89d2\u8272\u7acb\u7ed8';
    portrait.dataset.mode = state.portraitMode || 'default';
    portrait.hidden = !state.portraitVisible;
    var stage = portrait.closest('.zq-ai-stage');
    if (stage) stage.dataset.portraitMode = state.portraitMode || 'default';
  }

  function setPortraitMode(mode) {
    state.portraitMode = mode || '';
    state.portraitVisible = !!state.portraitMode;
    updatePortraitElement(document.querySelector('[' + PAGE_MARKER + '] .zq-ai-portrait'));
  }

  function setPortraitVisible(visible) {
    state.portraitVisible = !!visible;
    if (!state.portraitVisible) state.portraitMode = '';
    else if (!state.portraitMode) state.portraitMode = 'default';
    updatePortraitElement(document.querySelector('[' + PAGE_MARKER + '] .zq-ai-portrait'));
  }

  function syncPortraitFromMessages() {
    var mode = '';
    state.messages.forEach(function (message) {
      if (message.role !== 'USER') return;
      var content = String(message.body || '').trim();
      if (content === PORTRAIT_TRIGGER) mode = 'default';
      if (content === ALICE_TRIGGER) mode = 'alice';
    });
    setPortraitMode(mode);
  }

  function buildPage() {
    var oldPage = document.querySelector('[' + PAGE_MARKER + ']');
    if (oldPage) return oldPage;
    var page = document.createElement('main');
    page.className = 'zq-ai-page';
    page.setAttribute(PAGE_MARKER, 'true');
    if (state.enteringAssistant) {
      page.setAttribute('data-entering', 'true');
      state.enteringAssistant = false;
      window.setTimeout(function () {
        if (page.isConnected) page.removeAttribute('data-entering');
      }, 460);
    }
    page.innerHTML = '<div class="zq-ai-sidebar-scrim" data-zq-sidebar-scrim hidden aria-hidden="true"></div><div class="zq-ai-shell"><aside class="zq-ai-sidebar" id="zq-ai-sidebar-panel" data-zq-ai-sidebar aria-hidden="true"><div class="zq-ai-brand-row"><button type="button" class="zq-ai-icon-button zq-ai-sidebar-toggle" data-zq-toggle-sidebar aria-label="\u6536\u8d77\u4f1a\u8bdd\u5217\u8868" aria-expanded="true" aria-controls="zq-ai-sidebar-panel"></button><span class="zq-ai-brand">AI\u52a9\u624b</span><div class="zq-ai-sidebar-actions"><button type="button" class="zq-ai-icon-button" data-zq-new-conversation aria-label="\u65b0\u5efa\u4f1a\u8bdd">+</button><button type="button" class="zq-ai-icon-button zq-ai-sidebar-close" data-zq-close-sidebar aria-label="\u5173\u95ed\u4f1a\u8bdd\u5217\u8868">×</button></div></div><div class="zq-ai-conversation-list" data-zq-conversations></div></aside><section class="zq-ai-main"><div class="zq-ai-stage"><div class="zq-ai-stage-lines" aria-hidden="true"></div><div class="zq-ai-stage-title"><h1>AI\u5b66\u4e60\u52a9\u624b</h1><p>\u5bf9\u8bdd\u3001\u5b66\u4e60\u89e3\u7b54\u4e0e\u5185\u5bb9\u63a8\u8350\u7531\u540c\u4e00\u4e2a\u8f93\u5165\u6846\u5b8c\u6210\u3002</p></div></div><div class="zq-ai-dialogue" data-zq-dialogue></div></section></div>';
    page.querySelector('.zq-ai-stage').appendChild(createPortrait());
    page.querySelector('[data-zq-toggle-sidebar]').addEventListener('click', function () {
      setSidebarCollapsed(!state.sidebarCollapsed);
    });
    page.querySelector('[data-zq-new-conversation]').addEventListener('click', function () {
      createConversation({ animate: true });
    });
    page.querySelector('[data-zq-close-sidebar]').addEventListener('click', function () {
      setSidebarOpen(false);
    });
    page.querySelector('[data-zq-sidebar-scrim]').addEventListener('click', function () {
      setSidebarOpen(false);
    });
    page.querySelector('[data-zq-ai-sidebar]').addEventListener('touchstart', handleSidebarTouchStart, { passive: true });
    page.querySelector('[data-zq-ai-sidebar]').addEventListener('touchend', handleSidebarTouchEnd, { passive: true });
    page.querySelector('[data-zq-ai-sidebar]').addEventListener('touchcancel', handleSidebarTouchCancel, { passive: true });
    state.sidebarKeyHandler = function (event) {
      if (event.key === 'Escape' && state.settingsOpen) {
        event.preventDefault();
        setSettingsOpen(false);
        return;
      }
      if (event.key === 'Escape' && state.sidebarOpen) {
        event.preventDefault();
        setSidebarOpen(false);
      }
    };
    window.addEventListener('keydown', state.sidebarKeyHandler, true);
    document.body.appendChild(page);
    renderConversations();
    return page;
  }

  function lockSidebarBody() {
    if (state.sidebarBodyLock) return;
    state.sidebarBodyLock = {
      bodyOverflow: document.body.style.overflow,
      htmlOverflow: document.documentElement.style.overflow
    };
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
  }

  function unlockSidebarBody() {
    if (!state.sidebarBodyLock) return;
    document.body.style.overflow = state.sidebarBodyLock.bodyOverflow;
    document.documentElement.style.overflow = state.sidebarBodyLock.htmlOverflow;
    state.sidebarBodyLock = null;
  }

  function setSidebarOpen(open, options) {
    var settings = options || {};
    var next = !!open;
    if (next) {
      if (settings.trigger) state.sidebarTrigger = settings.trigger;
      else if (!state.sidebarTrigger) state.sidebarTrigger = document.querySelector('.zq-ai-mobile-menu');
      lockSidebarBody();
    } else {
      var trigger = state.sidebarTrigger;
      state.sidebarTrigger = null;
      unlockSidebarBody();
      if (settings.restoreFocus !== false && trigger && trigger.isConnected) {
        window.requestAnimationFrame(function () { trigger.focus(); });
      }
    }
    state.sidebarOpen = next;
    if (!settings.skipRender) renderConversations();
    if (next) {
      var closeButton = document.querySelector('[data-zq-close-sidebar]');
      if (closeButton) window.requestAnimationFrame(function () { closeButton.focus(); });
    }
  }

  function setSidebarCollapsed(collapsed, options) {
    var settings = options || {};
    state.sidebarCollapsed = !!collapsed;
    persistSidebarCollapsed(state.sidebarCollapsed);
    if (!settings.skipRender) renderConversations();
    if (settings.restoreFocus !== false) {
      var toggle = document.querySelector('[data-zq-toggle-sidebar]');
      if (toggle) window.requestAnimationFrame(function () { toggle.focus(); });
    }
  }

  function setSettingsOpen(open, options) {
    var settings = options || {};
    state.settingsOpen = !!open;
    if (!settings.skipRender) renderDialogue();
    if (settings.restoreFocus === false) return;
    window.requestAnimationFrame(function () {
      var target = state.settingsOpen
        ? document.querySelector('[data-zq-memory-setting]')
        : document.querySelector('[data-zq-open-settings]');
      if (target) target.focus();
    });
  }

  function handleSidebarTouchStart(event) {
    if (!state.sidebarOpen || !event.changedTouches || event.changedTouches.length !== 1) return;
    var touch = event.changedTouches[0];
    state.sidebarTouchStart = { x: touch.clientX, y: touch.clientY };
  }

  function handleSidebarTouchEnd(event) {
    if (!state.sidebarTouchStart || !event.changedTouches || event.changedTouches.length !== 1) return;
    var touch = event.changedTouches[0];
    var deltaX = touch.clientX - state.sidebarTouchStart.x;
    var deltaY = touch.clientY - state.sidebarTouchStart.y;
    state.sidebarTouchStart = null;
    if (deltaX < -64 && Math.abs(deltaX) > Math.abs(deltaY) * 1.25) setSidebarOpen(false);
  }

  function handleSidebarTouchCancel() {
    state.sidebarTouchStart = null;
  }

  function removePage() {
    setSidebarOpen(false, { skipRender: true, restoreFocus: false });
    state.settingsOpen = false;
    resetEditingState();
    var page = document.querySelector('[' + PAGE_MARKER + ']');
    if (page) page.remove();
    state.initialized = false;
    state.nativeRoute = null;
    state.conversationSwitching = false;
    state.loadingLabel = '';
    state.latestMessageId = null;
    state.followLatest = false;
    if (state.sidebarKeyHandler) window.removeEventListener('keydown', state.sidebarKeyHandler, true);
    state.sidebarKeyHandler = null;
    state.sidebarTouchStart = null;
    if (state.conversationTransitionTimer) window.clearTimeout(state.conversationTransitionTimer);
    state.conversationTransitionTimer = null;
    cancelActiveGeneration({ silent: true, skipRender: true });
    state.abortController = null;
    state.activeGeneration = null;
    state.generationCancelPending = false;
    state.portraitVisible = false;
    state.portraitMode = '';
  }

  function detachAssistantOverlay() {
    // Remove only the assistant surface before the native tab press. Keeping
    // the shared navigation mounted avoids a bar swap during the page turn.
    setSidebarOpen(false, { skipRender: true, restoreFocus: false });
    state.settingsOpen = false;
    resetEditingState();
    var page = document.querySelector('[' + PAGE_MARKER + ']');
    if (page) page.remove();
    state.initialized = false;
    state.conversationSwitching = false;
    state.loadingLabel = '';
    state.latestMessageId = null;
    state.followLatest = false;
    if (state.sidebarKeyHandler) window.removeEventListener('keydown', state.sidebarKeyHandler, true);
    state.sidebarKeyHandler = null;
    state.sidebarTouchStart = null;
    if (state.conversationTransitionTimer) window.clearTimeout(state.conversationTransitionTimer);
    state.conversationTransitionTimer = null;
    cancelActiveGeneration({ silent: true, skipRender: true });
    state.abortController = null;
    state.activeGeneration = null;
    state.generationCancelPending = false;
    state.portraitVisible = false;
    state.portraitMode = '';
    state.leavingAssistant = true;
  }

  function replayNativePageEnter() {
    // Expo treats a press on the already-active native tab as a no-op. Replay
    // its exported scene interpolator on the shell for that one route case.
    var root = document.getElementById('root');
    if (!root) return;
    root.classList.remove('zq-ai-assistant-source-exit');
    root.classList.remove('zq-ai-native-page-enter');
    void root.offsetWidth;
    root.classList.add('zq-ai-native-page-enter');
    window.setTimeout(function () {
      root.classList.remove('zq-ai-native-page-enter');
    }, 580);
  }

  function playAssistantSourceExit() {
    var root = document.getElementById('root');
    if (!root) return;
    root.classList.remove('zq-ai-native-page-enter');
    root.classList.remove('zq-ai-assistant-source-exit');
    void root.offsetWidth;
    root.classList.add('zq-ai-assistant-source-exit');
    window.setTimeout(function () {
      root.classList.remove('zq-ai-assistant-source-exit');
    }, 280);
  }

  function renderStatus(title, detail, actionLabel, action) {
    var page = buildPage();
    var dialogue = page.querySelector('[data-zq-dialogue]');
    dialogue.innerHTML = '';
    var status = document.createElement('div');
    status.className = 'zq-ai-status';
    var panel = document.createElement('div');
    panel.className = 'zq-ai-status-panel';
    var heading = document.createElement('h2');
    heading.textContent = title;
    var paragraph = document.createElement('p');
    paragraph.textContent = detail;
    panel.append(heading, paragraph);
    if (actionLabel && action) {
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'zq-ai-primary';
      button.textContent = actionLabel;
      button.addEventListener('click', action);
      panel.appendChild(button);
    }
    status.appendChild(panel);
    dialogue.appendChild(status);
  }

  function formatTime(value) {
    if (!value) return '';
    try { return new Date(value).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }); }
    catch (error) { return ''; }
  }

  function renderConversations() {
    var page = document.querySelector('[' + PAGE_MARKER + ']');
    if (!page) return;
    var sidebar = page.querySelector('[data-zq-ai-sidebar]');
    var mobileSidebar = window.matchMedia('(max-width:760px)').matches;
    var desktopCollapsed = !mobileSidebar && state.sidebarCollapsed;
    var shell = page.querySelector('.zq-ai-shell');
    if (shell) shell.dataset.sidebarCollapsed = desktopCollapsed ? 'true' : 'false';
    sidebar.dataset.open = state.sidebarOpen ? 'true' : 'false';
    sidebar.dataset.collapsed = desktopCollapsed ? 'true' : 'false';
    sidebar.setAttribute('aria-hidden', mobileSidebar && !state.sidebarOpen ? 'true' : 'false');
    var sidebarToggle = page.querySelector('[data-zq-toggle-sidebar]');
    if (sidebarToggle) {
      var toggleLabel = desktopCollapsed ? '\u5c55\u5f00\u4f1a\u8bdd\u5217\u8868' : '\u6536\u8d77\u4f1a\u8bdd\u5217\u8868';
      sidebarToggle.setAttribute('aria-label', toggleLabel);
      sidebarToggle.setAttribute('aria-expanded', desktopCollapsed ? 'false' : 'true');
      sidebarToggle.setAttribute('aria-controls', 'zq-ai-sidebar-panel');
      labelMessageAction(sidebarToggle, desktopCollapsed ? 'panel-left-open' : 'panel-left-close', toggleLabel);
    }
    var scrim = page.querySelector('[data-zq-sidebar-scrim]');
    if (scrim) {
      scrim.hidden = !state.sidebarOpen;
      scrim.setAttribute('aria-hidden', state.sidebarOpen ? 'false' : 'true');
    }
    var menuButton = page.querySelector('.zq-ai-mobile-menu');
    if (menuButton) {
      menuButton.setAttribute('aria-expanded', state.sidebarOpen ? 'true' : 'false');
      menuButton.setAttribute('aria-controls', 'zq-ai-sidebar-panel');
    }
    var list = page.querySelector('[data-zq-conversations]');
    list.dataset.switching = state.conversationSwitching ? 'true' : 'false';
    list.innerHTML = '';
    state.conversations.forEach(function (conversation) {
      var row = document.createElement('div');
      row.className = 'zq-ai-conversation-row';
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'zq-ai-conversation';
      button.dataset.active = conversation.id === state.activeConversationId ? 'true' : 'false';
      button.setAttribute('aria-label', '\u6253\u5f00\u4f1a\u8bdd ' + conversation.title);
      var title = document.createElement('span');
      title.className = 'zq-ai-conversation-title';
      title.textContent = conversation.title;
      var time = document.createElement('span');
      time.className = 'zq-ai-conversation-time';
      time.textContent = formatTime(conversation.updatedAt);
      button.append(title, time);
      button.addEventListener('click', function () {
        setSidebarOpen(false);
        state.confirmDeleteId = null;
        openConversation(conversation.id);
      });
      var deleteButton = document.createElement('button');
      deleteButton.type = 'button';
      deleteButton.className = 'zq-ai-delete';
      var deleting = state.deletingId === conversation.id;
      var confirming = state.confirmDeleteId === conversation.id;
      deleteButton.dataset.confirm = confirming ? 'true' : 'false';
      deleteButton.disabled = !!state.deletingId;
      deleteButton.setAttribute('aria-busy', deleting ? 'true' : 'false');
      deleteButton.setAttribute('aria-label', deleting ? '\u5220\u9664\u4e2d' : confirming ? '\u786e\u8ba4\u5220\u9664\u4f1a\u8bdd' : '\u5220\u9664\u4f1a\u8bdd');
      deleteButton.textContent = deleting ? '\u5220\u9664\u4e2d\u2026' : confirming ? '\u786e\u8ba4' : '\u00d7';
      deleteButton.addEventListener('click', function () {
        if (state.deletingId) return;
        if (state.confirmDeleteId !== conversation.id) {
          state.confirmDeleteId = conversation.id;
          state.error = '';
          state.authRequired = false;
          renderConversations();
          return;
        }
        deleteConversation(conversation.id);
      });
      row.append(button, deleteButton);
      list.appendChild(row);
    });
  }

  function intentLabel(intent) {
    if (intent === 'QUESTION') return '\u5b66\u4e60\u89e3\u7b54';
    if (intent === 'RECOMMENDATION') return '\u5185\u5bb9\u63a8\u8350';
    return '\u5bf9\u8bdd';
  }

  function messageById(id) {
    return state.messages.find(function (message) { return message.id === id; }) || null;
  }

  function previousUserMessage(messageId) {
    var index = state.messages.findIndex(function (message) { return message.id === messageId; });
    for (var cursor = index - 1; cursor >= 0; cursor -= 1) {
      if (state.messages[cursor].role === 'USER') return state.messages[cursor];
    }
    return null;
  }

  function copyText(text) {
    var fallbackCopy = function () {
      var textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.setAttribute('readonly', 'true');
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      var copied = document.execCommand('copy');
      textarea.remove();
      if (!copied) throw new Error('\u590d\u5236\u5931\u8d25');
    };
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      return navigator.clipboard.writeText(text).catch(fallbackCopy);
    }
    return Promise.resolve().then(fallbackCopy);
  }

  function copyMessage(message) {
    copyText(message.body || '').then(function () {
      state.copiedMessageId = message.id;
      if (state.copiedTimer) window.clearTimeout(state.copiedTimer);
      renderDialogue();
      state.copiedTimer = window.setTimeout(function () {
        state.copiedMessageId = null;
        state.copiedTimer = null;
        if (isAssistantRoute()) renderDialogue();
      }, 1600);
    }).catch(function () {
      state.error = '\u590d\u5236\u5931\u8d25\uff0c\u8bf7\u91cd\u8bd5';
      renderDialogue();
    });
  }

  function toggleMessageSources(messageId) {
    state.sourceExpandedIds[messageId] = !state.sourceExpandedIds[messageId];
    renderDialogue();
  }

  function latestUserMessageId() {
    for (var index = state.messages.length - 1; index >= 0; index -= 1) {
      if (state.messages[index].role === 'USER') return state.messages[index].id;
    }
    return null;
  }

  function resetEditingState() {
    state.editingMessageId = null;
    state.editingMessageDraft = '';
    state.editingMessageError = '';
    state.editingRequestId = null;
  }

  function focusInlineEditor() {
    window.requestAnimationFrame(function () {
      var input = document.querySelector('[' + PAGE_MARKER + '] .zq-ai-inline-editor');
      if (!input || input.disabled) return;
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    });
  }

  function editMessage(message) {
    if (!message || message.role !== 'USER' || message.id !== latestUserMessageId() || state.loading || message.failed) return;
    state.editingMessageId = message.id;
    state.editingMessageDraft = message.body || '';
    state.editingMessageError = '';
    state.editingRequestId = null;
    state.error = '';
    renderDialogue();
    focusInlineEditor();
  }

  function cancelEditMessage() {
    if (state.loading) return;
    resetEditingState();
    renderDialogue();
  }

  function replaceEditedExchange(messageId, exchange) {
    var userMessage = exchange && exchange.userMessage;
    var assistantMessage = exchange && exchange.assistantMessage;
    if (!userMessage || !assistantMessage) throw new Error('\u670d\u52a1\u7aef\u672a\u8fd4\u56de\u5b8c\u6574\u7684\u95ee\u7b54');
    var userIndex = state.messages.findIndex(function (item) { return item.id === messageId; });
    if (userIndex < 0) throw new Error('\u672a\u627e\u5230\u8981\u7f16\u8f91\u7684\u6d88\u606f');
    var assistantIndex = state.messages.findIndex(function (item, index) {
      return index > userIndex && item.id === assistantMessage.id;
    });
    if (assistantIndex < 0 && state.messages[userIndex + 1] && state.messages[userIndex + 1].role === 'ASSISTANT') {
      assistantIndex = userIndex + 1;
    }
    state.messages.splice(userIndex, 1, userMessage);
    if (assistantIndex >= 0) state.messages.splice(assistantIndex, 1, assistantMessage);
    else state.messages.splice(userIndex + 1, 0, assistantMessage);
    syncPortraitFromMessages();
  }

  function submitEditedMessage(message) {
    var content = String(state.editingMessageDraft || '').trim();
    if (!message || state.loading || !content || message.id !== state.editingMessageId || message.id !== latestUserMessageId()) return;
    var conversationId = state.activeConversationId;
    var requestId = state.editingRequestId || createRequestId();
    state.editingRequestId = requestId;
    state.editingMessageError = '';
    state.error = '';
    state.authRequired = false;
    state.loading = true;
    state.loadingLabel = '\u6b63\u5728\u91cd\u65b0\u751f\u6210\u56de\u7b54';
    if (content === ALICE_TRIGGER) setPortraitMode('alice');
    else if (content === PORTRAIT_TRIGGER) setPortraitMode('default');
    renderDialogue();
    var controller = new AbortController();
    state.abortController = controller;
    startGenerationRequest(requestId, 'edit');
    apiRequest('/api/assistant/conversations/' + encodeURIComponent(conversationId) + '/messages/' + encodeURIComponent(message.id), {
      method: 'PUT',
      signal: controller.signal,
      body: {
        requestId: requestId,
        content: content,
        memoryEnabled: state.memoryEnabled
      }
    }).then(function (exchange) {
      replaceEditedExchange(message.id, exchange);
      state.latestMessageId = exchange.assistantMessage.id;
      resetEditingState();
      return apiRequest('/api/assistant/conversations').then(function (conversations) {
        state.conversations = Array.isArray(conversations) ? conversations : state.conversations;
      });
    }).catch(function (error) {
      syncPortraitFromMessages();
      state.authRequired = error.name === 'AbortError' ? false : isAuthError(error);
      state.editingMessageError = error.name === 'AbortError'
        ? '\u5df2\u505c\u6b62\u91cd\u65b0\u751f\u6210\uff0c\u539f\u95ee\u7b54\u5df2\u4fdd\u7559\u3002'
        : messageForError(error, '\u91cd\u65b0\u751f\u6210\u5931\u8d25\uff0c\u539f\u95ee\u7b54\u5df2\u4fdd\u7559\u3002');
    }).finally(function () {
      state.loading = false;
      state.loadingLabel = '';
      state.abortController = null;
      finishGenerationRequest(requestId);
      renderDialogue();
      if (state.editingMessageId) focusInlineEditor();
    });
  }

  function retryFailedMessage(message) {
    if (!message || !message.failed || state.loading) return;
    sendCurrentMessage(message.body, { retryMessage: message });
  }

  function regenerateMessage(message) {
    if (state.loading) return;
    var source = previousUserMessage(message.id);
    if (!source || source.id !== latestUserMessageId() || source.failed) return;
    var requestId = createRequestId();
    var conversationId = state.activeConversationId;
    state.regeneratingMessageId = message.id;
    state.loading = true;
    state.loadingLabel = '\u6b63\u5728\u91cd\u65b0\u751f\u6210\u56de\u7b54';
    state.error = '';
    state.authRequired = false;
    renderDialogue();
    var controller = new AbortController();
    state.abortController = controller;
    startGenerationRequest(requestId, 'regenerate');
    apiRequest('/api/assistant/conversations/' + encodeURIComponent(conversationId) + '/messages/' + encodeURIComponent(source.id), {
      method: 'PUT',
      signal: controller.signal,
      body: {
        requestId: requestId,
        content: source.body,
        memoryEnabled: state.memoryEnabled
      }
    }).then(function (exchange) {
      replaceEditedExchange(source.id, exchange);
      state.latestMessageId = exchange.assistantMessage.id;
      state.followLatest = true;
      state.regeneratingMessageId = null;
      return apiRequest('/api/assistant/conversations').then(function (conversations) {
        state.conversations = Array.isArray(conversations) ? conversations : state.conversations;
      });
    }).catch(function (error) {
      state.regeneratingMessageId = null;
      state.authRequired = error.name === 'AbortError' ? false : isAuthError(error);
      state.error = error.name === 'AbortError'
        ? ''
        : messageForError(error, '\u91cd\u65b0\u751f\u6210\u5931\u8d25\uff0c\u539f\u56de\u590d\u5df2\u4fdd\u7559\u3002');
    }).finally(function () {
      state.loading = false;
      state.loadingLabel = '';
      state.abortController = null;
      finishGenerationRequest(requestId);
      renderDialogue();
    });
  }

  function requestDeleteMessage(message) {
    if (state.deletingMessageId || state.loading) return;
    if (state.confirmMessageDeleteId !== message.id) {
      state.confirmMessageDeleteId = message.id;
      renderDialogue();
      return;
    }
    deleteMessage(message);
  }

  function renderMessage(message) {
    var wrapper = document.createElement('article');
    wrapper.className = 'zq-ai-message';
    wrapper.dataset.role = message.role;
    if (message.failed) wrapper.dataset.failed = 'true';
    if (message.id && message.id === state.latestMessageId) wrapper.dataset.entering = 'true';
    var isEditing = message.role === 'USER' && message.id === state.editingMessageId;
    if (isEditing) wrapper.dataset.editing = 'true';
    var bubble = document.createElement('div');
    bubble.className = 'zq-ai-bubble';
    if (isEditing) {
      var editForm = document.createElement('form');
      editForm.className = 'zq-ai-inline-edit-form';
      editForm.addEventListener('submit', function (event) {
        event.preventDefault();
        submitEditedMessage(message);
      });
      var editInput = document.createElement('textarea');
      editInput.className = 'zq-ai-inline-editor';
      editInput.value = state.editingMessageDraft;
      editInput.maxLength = 2000;
      editInput.disabled = !!state.loading;
      editInput.setAttribute('aria-label', '\u7f16\u8f91\u6d88\u606f\u5185\u5bb9');
      editInput.addEventListener('input', function () {
        state.editingMessageDraft = editInput.value;
        state.editingMessageError = '';
        state.editingRequestId = null;
        editSubmit.disabled = state.loading || !editInput.value.trim();
        editInput.style.height = 'auto';
        editInput.style.height = Math.min(Math.max(editInput.scrollHeight, 88), 200) + 'px';
      });
      editInput.addEventListener('keydown', function (event) {
        if (event.key === 'Escape') {
          event.preventDefault();
          cancelEditMessage();
          return;
        }
        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !event.isComposing) {
          event.preventDefault();
          submitEditedMessage(message);
        }
      });
      editForm.appendChild(editInput);
      if (state.editingMessageError) {
        var editError = document.createElement('div');
        editError.className = 'zq-ai-inline-error';
        editError.setAttribute('role', 'alert');
        editError.textContent = state.editingMessageError;
        editForm.appendChild(editError);
      }
      var editActions = document.createElement('div');
      editActions.className = 'zq-ai-inline-actions';
      var editCancel = document.createElement('button');
      editCancel.type = 'button';
      editCancel.className = 'zq-ai-inline-cancel';
      editCancel.textContent = '\u53d6\u6d88';
      editCancel.disabled = !!state.loading;
      editCancel.setAttribute('aria-label', '\u53d6\u6d88\u7f16\u8f91');
      editCancel.addEventListener('click', cancelEditMessage);
      var editSubmit = document.createElement('button');
      editSubmit.type = 'submit';
      editSubmit.className = 'zq-ai-inline-submit';
      editSubmit.textContent = state.loading ? '\u751f\u6210\u4e2d' : '\u53d1\u9001';
      editSubmit.disabled = !!state.loading || !state.editingMessageDraft.trim();
      editSubmit.setAttribute('aria-label', state.loading ? '\u6b63\u5728\u91cd\u65b0\u751f\u6210\u56de\u7b54' : '\u53d1\u9001\u7f16\u8f91\u540e\u7684\u6d88\u606f');
      editActions.append(editCancel, editSubmit);
      editForm.appendChild(editActions);
      bubble.appendChild(editForm);
      wrapper.appendChild(bubble);
      return wrapper;
    }
    var body = document.createElement('div');
    body.textContent = message.body || '';
    bubble.appendChild(body);
    if (message.role === 'ASSISTANT' && message.intent) {
      var intent = document.createElement('span');
      intent.className = 'zq-ai-intent';
      intent.textContent = intentLabel(message.intent);
      bubble.appendChild(intent);
    }

    var actions = document.createElement('div');
    actions.className = 'zq-ai-message-actions';
    var copyButton = document.createElement('button');
    var copied = state.copiedMessageId === message.id;
    copyButton.type = 'button';
    copyButton.className = 'zq-ai-message-action';
    copyButton.setAttribute('aria-label', copied ? '\u5df2\u590d\u5236' : '\u590d\u5236\u6d88\u606f');
    labelMessageAction(copyButton, copied ? 'check' : 'copy', copied ? '\u5df2\u590d\u5236' : '\u590d\u5236\u6d88\u606f');
    copyButton.addEventListener('click', function () { copyMessage(message); });
    actions.appendChild(copyButton);

    if (message.role === 'USER' && message.id === latestUserMessageId()) {
      var editButton = document.createElement('button');
      editButton.type = 'button';
      editButton.className = 'zq-ai-message-action';
      editButton.setAttribute('aria-label', '\u7f16\u8f91\u6d88\u606f');
      labelMessageAction(editButton, 'pencil', '\u7f16\u8f91\u6d88\u606f');
      editButton.disabled = !!state.loading || !!message.failed;
      editButton.addEventListener('click', function () { editMessage(message); });
      actions.appendChild(editButton);
    }
    if (message.role === 'ASSISTANT') {
      var regenerateButton = document.createElement('button');
      var sourceMessage = previousUserMessage(message.id);
      var regenerating = state.regeneratingMessageId === message.id;
      if (sourceMessage && sourceMessage.id === latestUserMessageId()) {
        regenerateButton.type = 'button';
        regenerateButton.className = 'zq-ai-message-action';
        regenerateButton.disabled = !!state.loading || !!sourceMessage.failed;
        regenerateButton.setAttribute('aria-busy', regenerating ? 'true' : 'false');
        regenerateButton.setAttribute('aria-label', regenerating ? '\u91cd\u65b0\u751f\u6210\u4e2d' : '\u91cd\u65b0\u751f\u6210');
        labelMessageAction(regenerateButton, regenerating ? 'loader-circle' : 'refresh-cw', regenerating ? '\u91cd\u65b0\u751f\u6210\u4e2d' : '\u91cd\u65b0\u751f\u6210');
        regenerateButton.addEventListener('click', function () { regenerateMessage(message); });
        actions.appendChild(regenerateButton);
      }
    }
    if (Array.isArray(message.sources) && message.sources.length) {
      var sourcesExpanded = !!state.sourceExpandedIds[message.id];
      var sourceToggle = document.createElement('button');
      sourceToggle.type = 'button';
      sourceToggle.className = 'zq-ai-source-toggle';
      sourceToggle.setAttribute('aria-label', sourcesExpanded ? '\u6536\u8d77\u6765\u6e90' : '\u67e5\u770b\u6765\u6e90');
      sourceToggle.setAttribute('aria-expanded', sourcesExpanded ? 'true' : 'false');
      labelMessageAction(sourceToggle, 'book-open', sourcesExpanded ? '\u6536\u8d77\u6765\u6e90' : '\u67e5\u770b\u6765\u6e90');
      sourceToggle.addEventListener('click', function () { toggleMessageSources(message.id); });
      actions.appendChild(sourceToggle);
    }
    if (Array.isArray(message.sources) && message.sources.length && state.sourceExpandedIds[message.id]) {
      var sources = document.createElement('div');
      sources.className = 'zq-ai-sources';
      var label = document.createElement('div');
      label.className = 'zq-ai-section-label';
      label.textContent = '\u53c2\u8003\u6765\u6e90';
      sources.appendChild(label);
      message.sources.forEach(function (source) {
        var link = document.createElement('a');
        link.className = 'zq-ai-source';
        link.href = source.href;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = source.title;
        if (source.excerpt) link.title = source.excerpt;
        sources.appendChild(link);
      });
      bubble.appendChild(sources);
    }
    if (Array.isArray(message.recommendations) && message.recommendations.length) {
      var recommendations = document.createElement('div');
      recommendations.className = 'zq-ai-recommendations';
      message.recommendations.forEach(function (recommendation) {
        var link = document.createElement('a');
        link.className = 'zq-ai-recommendation';
        link.href = recommendation.href;
        if (recommendation.coverUrl) {
          var image = document.createElement('img');
          image.className = 'zq-ai-cover';
          image.src = recommendation.coverUrl;
          image.alt = '';
          link.appendChild(image);
        } else {
          var placeholder = document.createElement('span');
          placeholder.className = 'zq-ai-cover-placeholder';
          placeholder.setAttribute('aria-hidden', 'true');
          placeholder.textContent = '\u25a4';
          link.appendChild(placeholder);
        }
        var copy = document.createElement('span');
        var title = document.createElement('span');
        title.className = 'zq-ai-rec-title';
        title.textContent = recommendation.title;
        var reason = document.createElement('span');
        reason.className = 'zq-ai-rec-reason';
        reason.textContent = recommendation.reason;
        copy.append(title, reason);
        link.appendChild(copy);
        recommendations.appendChild(link);
      });
      bubble.appendChild(recommendations);
    }
    if (message.failed) {
      var failure = document.createElement('div');
      failure.className = 'zq-ai-message-failure';
      var failureText = document.createElement('span');
      failureText.textContent = message.failureReason || '\u53d1\u9001\u5931\u8d25';
      var retryButton = document.createElement('button');
      retryButton.type = 'button';
      retryButton.disabled = !!state.loading;
      retryButton.setAttribute('aria-label', '\u91cd\u8bd5\u53d1\u9001');
      retryButton.title = '\u91cd\u8bd5\u53d1\u9001';
      retryButton.setAttribute('data-tooltip', '\u91cd\u8bd5\u53d1\u9001');
      retryButton.className = 'zq-ai-message-action';
      retryButton.appendChild(createMessageIcon('refresh-cw'));
      retryButton.addEventListener('click', function () { retryFailedMessage(message); });
      failure.append(failureText, retryButton);
      bubble.appendChild(failure);
    }
    if (message.role === 'ASSISTANT') {
      var helpful = document.createElement('button');
      helpful.type = 'button';
      helpful.className = 'zq-ai-message-action';
      helpful.setAttribute('aria-label', '\u6709\u5e2e\u52a9');
      labelMessageAction(helpful, 'thumbs-up', '\u6709\u5e2e\u52a9');
      helpful.addEventListener('click', function () { sendFeedback(message.id, true, helpful, notHelpful); });
      var notHelpful = document.createElement('button');
      notHelpful.type = 'button';
      notHelpful.className = 'zq-ai-message-action';
      notHelpful.setAttribute('aria-label', '\u6ca1\u5e2e\u52a9');
      labelMessageAction(notHelpful, 'thumbs-down', '\u6ca1\u5e2e\u52a9');
      notHelpful.addEventListener('click', function () { sendFeedback(message.id, false, helpful, notHelpful); });
      actions.append(helpful, notHelpful);
    }
    wrapper.appendChild(bubble);
    wrapper.appendChild(actions);
    return wrapper;
  }

  function renderDialogue() {
    var page = document.querySelector('[' + PAGE_MARKER + ']');
    if (!page) return;
    var dialogue = page.querySelector('[data-zq-dialogue]');
    var previousMessages = dialogue.querySelector('.zq-ai-messages');
    var previousScrollTop = previousMessages ? previousMessages.scrollTop : 0;
    var previousScrollDistance = previousMessages
      ? previousMessages.scrollHeight - previousMessages.scrollTop - previousMessages.clientHeight
      : 0;
    var followLatest = state.followLatest || !previousMessages || previousScrollDistance <= 72;
    state.followLatest = false;
    dialogue.innerHTML = '';
    dialogue.dataset.conversationSwitching = state.conversationSwitching ? 'true' : 'false';

    var newConversationButton = page.querySelector('[data-zq-new-conversation]');
    if (newConversationButton) {
      newConversationButton.disabled = !!(state.loading || state.deletingId || state.deletingMessageId || state.conversationSwitching);
      newConversationButton.setAttribute('aria-busy', state.conversationSwitching ? 'true' : 'false');
    }

    var toolbar = document.createElement('div');
    toolbar.className = 'zq-ai-toolbar';
    var menu = document.createElement('button');
    menu.type = 'button';
    menu.className = 'zq-ai-icon-button zq-ai-mobile-menu';
    menu.setAttribute('aria-label', '\u6253\u5f00\u4f1a\u8bdd\u5217\u8868');
    menu.setAttribute('aria-expanded', state.sidebarOpen ? 'true' : 'false');
    menu.setAttribute('aria-controls', 'zq-ai-sidebar-panel');
    menu.textContent = '\u2630';
    menu.addEventListener('click', function () {
      state.settingsOpen = false;
      setSidebarOpen(!state.sidebarOpen, { trigger: menu, skipRender: true });
      renderDialogue();
    });
    state.sidebarTrigger = menu;
    var active = state.conversations.find(function (item) { return item.id === state.activeConversationId; });
    var title = document.createElement('div');
    title.className = 'zq-ai-toolbar-title';
    title.textContent = active ? active.title : 'AI\u52a9\u624b';
    var settingsButton = document.createElement('button');
    settingsButton.type = 'button';
    settingsButton.className = 'zq-ai-icon-button zq-ai-settings-button';
    settingsButton.setAttribute('data-zq-open-settings', 'true');
    settingsButton.setAttribute('aria-label', '\u6253\u5f00 AI \u52a9\u624b\u8bbe\u7f6e');
    settingsButton.setAttribute('aria-haspopup', 'dialog');
    settingsButton.setAttribute('aria-expanded', state.settingsOpen ? 'true' : 'false');
    settingsButton.setAttribute('aria-controls', 'zq-ai-settings-menu');
    labelMessageAction(settingsButton, 'settings', '\u6253\u5f00 AI \u52a9\u624b\u8bbe\u7f6e');
    settingsButton.addEventListener('click', function () {
      if (state.sidebarOpen) setSidebarOpen(false, { skipRender: true, restoreFocus: false });
      setSettingsOpen(!state.settingsOpen);
    });
    toolbar.append(menu, title, settingsButton);

    if (state.settingsOpen) {
      var settingsScrim = document.createElement('button');
      settingsScrim.type = 'button';
      settingsScrim.className = 'zq-ai-settings-scrim';
      settingsScrim.tabIndex = -1;
      settingsScrim.setAttribute('aria-label', '\u5173\u95ed AI \u52a9\u624b\u8bbe\u7f6e');
      settingsScrim.addEventListener('click', function () { setSettingsOpen(false); });

      var settingsMenu = document.createElement('section');
      settingsMenu.id = 'zq-ai-settings-menu';
      settingsMenu.className = 'zq-ai-settings-menu';
      settingsMenu.setAttribute('role', 'dialog');
      settingsMenu.setAttribute('aria-label', 'AI \u52a9\u624b\u8bbe\u7f6e');
      var settingsHeading = document.createElement('h2');
      settingsHeading.className = 'zq-ai-settings-heading';
      settingsHeading.textContent = 'AI \u52a9\u624b\u8bbe\u7f6e';
      var memory = document.createElement('label');
      memory.className = 'zq-ai-settings-option';
      var memoryCopy = document.createElement('span');
      memoryCopy.className = 'zq-ai-settings-copy';
      var memoryTitle = document.createElement('span');
      memoryTitle.className = 'zq-ai-settings-title';
      memoryTitle.textContent = '\u5141\u8bb8\u4fdd\u5b58\u957f\u671f\u8bb0\u5fc6';
      var memoryDescription = document.createElement('span');
      memoryDescription.className = 'zq-ai-settings-description';
      memoryDescription.textContent = '\u7528\u7ecf\u8fc7\u9690\u79c1\u8fc7\u6ee4\u7684\u6458\u8981\u5ef6\u7eed\u4ee5\u540e\u7684\u5bf9\u8bdd';
      memoryCopy.append(memoryTitle, memoryDescription);
      var memoryInput = document.createElement('input');
      memoryInput.type = 'checkbox';
      memoryInput.checked = state.memoryEnabled;
      memoryInput.setAttribute('data-zq-memory-setting', 'true');
      memoryInput.setAttribute('aria-label', '\u5141\u8bb8\u4fdd\u5b58\u957f\u671f\u8bb0\u5fc6');
      memoryInput.addEventListener('change', function () { state.memoryEnabled = memoryInput.checked; });
      memory.append(memoryCopy, memoryInput);
      settingsMenu.append(settingsHeading, memory);
      toolbar.append(settingsScrim, settingsMenu);
    }

    var messages = document.createElement('div');
    messages.className = 'zq-ai-messages';
    messages.setAttribute('aria-live', 'polite');
    var latestMessageId = state.latestMessageId;
    state.messages.forEach(function (message) { messages.appendChild(renderMessage(message)); });
    if (latestMessageId && state.latestMessageId === latestMessageId) state.latestMessageId = null;
    if (state.loading) {
      var loading = document.createElement('div');
      loading.className = 'zq-ai-message';
      var indicator = document.createElement('div');
      indicator.className = 'zq-ai-loading';
      indicator.appendChild(document.createTextNode((state.loadingLabel || '\u6b63\u5728\u6839\u636e\u5f53\u524d\u4e0a\u4e0b\u6587\u751f\u6210') + ' '));
      var dots = document.createElement('span');
      dots.className = 'zq-ai-loading-dots';
      dots.innerHTML = '<i></i><i></i><i></i>';
      indicator.appendChild(dots);
      loading.appendChild(indicator);
      messages.appendChild(loading);
    }

    var composer = document.createElement('form');
    composer.className = 'zq-ai-composer';
    composer.addEventListener('submit', function (event) {
      event.preventDefault();
      sendCurrentMessage();
    });
    if (state.error) {
      var errorRow = document.createElement('div');
      errorRow.className = 'zq-ai-error-row';
      var error = document.createElement('div');
      error.className = 'zq-ai-error';
      error.textContent = state.error;
      errorRow.appendChild(error);
      if (state.authRequired) {
        var loginButton = document.createElement('button');
        loginButton.type = 'button';
        loginButton.className = 'zq-ai-error-action';
        loginButton.textContent = '\u91cd\u65b0\u767b\u5f55';
        loginButton.setAttribute('aria-label', '\u91cd\u65b0\u767b\u5f55');
        loginButton.addEventListener('click', function () {
          window.location.assign('/login?next=' + encodeURIComponent('/ai-assistant'));
        });
        errorRow.appendChild(loginButton);
      }
      composer.appendChild(errorRow);
    }
    var row = document.createElement('div');
    row.className = 'zq-ai-compose-row';
    var input = document.createElement('textarea');
    input.className = 'zq-ai-input';
    input.rows = 1;
    input.maxLength = 2000;
    input.value = state.draft;
    input.disabled = !!state.editingMessageId;
    input.placeholder = '\u8f93\u5165\u60f3\u8bf4\u7684\u8bdd\u6216\u5b66\u4e60\u95ee\u9898';
    input.setAttribute('aria-label', '\u6d88\u606f\u8f93\u5165');
    input.addEventListener('input', function () {
      state.draft = input.value;
      send.disabled = state.loading || !!state.editingMessageId || !input.value.trim();
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 132) + 'px';
    });
    input.addEventListener('keydown', function (event) {
      if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        sendCurrentMessage();
      }
    });
    var send = document.createElement('button');
    send.type = 'submit';
    send.className = 'zq-ai-send';
    send.disabled = state.loading || !!state.editingMessageId || !state.draft.trim();
    send.setAttribute('aria-label', '\u53d1\u9001');
    send.textContent = '\u2191';
    row.append(input, send);
    composer.appendChild(row);
    if (state.loading) {
      var stop = document.createElement('button');
      stop.type = 'button';
      stop.className = 'zq-ai-stop';
      stop.disabled = state.generationCancelPending;
      stop.textContent = state.generationCancelPending ? '\u6b63\u5728\u505c\u6b62' : '\u505c\u6b62\u751f\u6210';
      stop.setAttribute('aria-busy', state.generationCancelPending ? 'true' : 'false');
      stop.addEventListener('click', stopGeneration);
      composer.appendChild(stop);
    }
    dialogue.append(toolbar, messages, composer);
    window.requestAnimationFrame(function () {
      var targetScrollTop = followLatest
        ? messages.scrollHeight
        : Math.min(previousScrollTop, Math.max(0, messages.scrollHeight - messages.clientHeight));
      messages.style.scrollBehavior = 'auto';
      messages.scrollTop = targetScrollTop;
      messages.style.removeProperty('scroll-behavior');
    });
    renderConversations();
  }

  function loadConversations() {
    return apiRequest('/api/assistant/conversations').then(function (conversations) {
      state.conversations = Array.isArray(conversations) ? conversations : [];
      if (!state.conversations.length) return createConversation();
      var activeExists = state.conversations.some(function (item) { return item.id === state.activeConversationId; });
      return openConversation(activeExists ? state.activeConversationId : state.conversations[0].id);
    });
  }

  function beginConversationTransition() {
    state.conversationSwitching = true;
    if (state.conversationTransitionTimer) window.clearTimeout(state.conversationTransitionTimer);
    state.conversationTransitionTimer = window.setTimeout(function () {
      state.conversationSwitching = false;
      state.conversationTransitionTimer = null;
      if (isAssistantRoute()) renderDialogue();
    }, 360);
  }

  function titleFromFirstMessage(message) {
    var title = String(message && message.body || '').replace(/[\r\n]+/g, ' ').trim();
    return title.length > 36 ? title.slice(0, 36) : title;
  }

  function applyFirstMessageTitle(message) {
    var title = titleFromFirstMessage(message);
    if (!title) return;
    var conversation = state.conversations.find(function (item) {
      return item.id === state.activeConversationId;
    });
    if (conversation) conversation.title = title;
  }

  function createConversation(options) {
    if (state.loading || !session() || !state.config || !state.config.configured) return Promise.resolve();
    var requestId = createRequestId();
    state.settingsOpen = false;
    setPortraitVisible(false);
    resetEditingState();
    var animate = !!(options && options.animate);
    var previousConversationId = state.activeConversationId;
    var previousMessages = state.messages;
    if (animate) beginConversationTransition();
    state.loading = true;
    state.loadingLabel = animate ? '\u6b63\u5728\u521b\u5efa\u65b0\u5bf9\u8bdd' : '';
    state.error = '';
    state.authRequired = false;
    state.confirmDeleteId = null;
    state.followLatest = true;
    if (animate) {
      state.activeConversationId = null;
      state.messages = [];
      state.draft = '';
      setSidebarOpen(false, { restoreFocus: false });
    }
    renderDialogue();
    var controller = new AbortController();
    state.abortController = controller;
    startGenerationRequest(requestId, 'create-conversation');
    return apiRequest('/api/assistant/conversations', {
      method: 'POST',
      signal: controller.signal,
      body: { requestId: requestId, memoryEnabled: state.memoryEnabled }
    }).then(function (created) {
      state.activeConversationId = created.conversation.id;
      state.messages = Array.isArray(created.messages) ? created.messages : [];
      return apiRequest('/api/assistant/conversations').then(function (conversations) {
        state.conversations = Array.isArray(conversations) ? conversations : [];
      });
    }).catch(function (error) {
      if (animate) {
        state.activeConversationId = previousConversationId;
        state.messages = previousMessages;
      }
      if (error.name !== 'AbortError') {
        state.authRequired = isAuthError(error);
        state.error = messageForError(error, '\u65e0\u6cd5\u65b0\u5efa\u4f1a\u8bdd');
      }
    }).finally(function () {
      state.loading = false;
      state.loadingLabel = '';
      state.abortController = null;
      finishGenerationRequest(requestId);
      renderDialogue();
    });
  }

  function openConversation(id) {
    if (!id) return Promise.resolve();
    state.settingsOpen = false;
    setPortraitVisible(false);
    resetEditingState();
    state.activeConversationId = id;
    var conversation = state.conversations.find(function (item) { return item.id === id; });
    state.memoryEnabled = !!(conversation && conversation.memoryEnabled);
    state.error = '';
    state.authRequired = false;
    state.followLatest = true;
    renderDialogue();
    return apiRequest('/api/assistant/conversations/' + encodeURIComponent(id) + '/messages').then(function (messages) {
      state.messages = Array.isArray(messages) ? messages : [];
      syncPortraitFromMessages();
      renderDialogue();
    }).catch(function (error) {
      state.authRequired = isAuthError(error);
      state.error = messageForError(error, '\u65e0\u6cd5\u52a0\u8f7d\u4f1a\u8bdd');
      renderDialogue();
    });
  }

  function sendCurrentMessage(contentOverride, options) {
    var settings = options || {};
    var content = String(contentOverride === undefined ? state.draft : contentOverride).trim();
    if (!content || state.loading || state.editingMessageId || !state.activeConversationId) return;
    var retryMessage = settings.retryMessage || null;
    var firstUserMessage = !state.messages.some(function (message) { return message.role === 'USER'; });
    var requestId = retryMessage && retryMessage.requestId ? retryMessage.requestId : createRequestId();
    var optimisticMessage = retryMessage || {
      id: 'pending-' + requestId,
      role: 'USER',
      body: content,
      requestId: requestId
    };
    optimisticMessage.failed = false;
    optimisticMessage.failureReason = '';
    optimisticMessage.body = content;
    if (!retryMessage) state.messages.push(optimisticMessage);
    state.failedMessageId = null;
    state.confirmMessageDeleteId = null;
    state.latestMessageId = optimisticMessage.id;
    state.followLatest = true;
    state.draft = '';
    resetEditingState();
    state.loading = true;
    state.loadingLabel = '';
    state.error = '';
    state.authRequired = false;
    if (settings.source !== 'regenerate') {
      if (content === ALICE_TRIGGER) setPortraitMode('alice');
      else if (content === PORTRAIT_TRIGGER) setPortraitMode('default');
    }
    renderDialogue();
    var controller = new AbortController();
    state.abortController = controller;
    startGenerationRequest(requestId, retryMessage ? 'retry' : 'message');
    apiRequest('/api/assistant/conversations/' + encodeURIComponent(state.activeConversationId) + '/messages', {
      method: 'POST',
      signal: controller.signal,
      body: {
        requestId: requestId,
        content: content,
        memoryEnabled: state.memoryEnabled
      }
    }).then(function (exchange) {
      var userMessage = exchange.userMessage || optimisticMessage;
      var optimisticIndex = state.messages.indexOf(optimisticMessage);
      if (optimisticIndex >= 0) state.messages.splice(optimisticIndex, 1, userMessage);
      else state.messages.push(userMessage);
      state.messages.push(exchange.assistantMessage);
      syncPortraitFromMessages();
      state.latestMessageId = exchange.assistantMessage.id;
      state.failedMessageId = null;
      state.regeneratingMessageId = null;
      if (firstUserMessage) applyFirstMessageTitle(userMessage);
      return apiRequest('/api/assistant/conversations').then(function (conversations) {
        state.conversations = Array.isArray(conversations) ? conversations : state.conversations;
      });
    }).catch(function (error) {
      optimisticMessage.failed = true;
      optimisticMessage.failureReason = error.name === 'AbortError'
        ? '\u5df2\u505c\u6b62\u751f\u6210\uff0c\u53ef\u91cd\u8bd5\u3002'
        : messageForError(error, '\u53d1\u9001\u5931\u8d25\uff0c\u53ef\u91cd\u8bd5\u3002');
      state.failedMessageId = optimisticMessage.id;
      state.regeneratingMessageId = null;
      state.authRequired = error.name === 'AbortError' ? false : isAuthError(error);
      state.error = '';
      if (!state.draft.trim()) state.draft = content;
    }).finally(function () {
      state.loading = false;
      state.loadingLabel = '';
      state.abortController = null;
      finishGenerationRequest(requestId);
      renderDialogue();
    });
  }

  function stopGeneration() {
    cancelActiveGeneration();
  }

  function deleteConversation(id) {
    if (!id || state.deletingId || state.deletingMessageId) return;
    state.deletingId = id;
    state.confirmDeleteId = null;
    state.error = '';
    state.authRequired = false;
    renderDialogue();

    // A confirmation can arrive while a greeting/message request is still in
    // flight. Cancel that request first so the deleted conversation cannot be
    // recreated by a late model response, then perform the real delete.
    var cancel = state.loading && state.activeConversationId === id
      ? cancelActiveGeneration({ silent: true, skipRender: true })
      : Promise.resolve();
    cancel.then(function () {
      return apiRequest('/api/assistant/conversations/' + encodeURIComponent(id), { method: 'DELETE' });
    }).then(function () {
      state.deletingId = null;
      state.conversations = state.conversations.filter(function (item) { return item.id !== id; });
      if (state.activeConversationId === id) {
        state.activeConversationId = null;
        state.messages = [];
        if (state.conversations.length) return openConversation(state.conversations[0].id);
        // Keep a truthful empty state. Do not create a new model-backed
        // conversation just to replace the one the user deleted.
        state.draft = '';
        state.followLatest = true;
        renderDialogue();
        return null;
      }
      renderConversations();
      return null;
    }).catch(function (error) {
      state.deletingId = null;
      state.authRequired = isAuthError(error);
      state.error = messageForError(error, '\u5220\u9664\u5931\u8d25');
      renderDialogue();
    });
  }

  function deleteMessage(message) {
    if (!message || state.loading || state.deletingMessageId || !state.activeConversationId) return;
    state.deletingMessageId = message.id;
    state.confirmMessageDeleteId = null;
    state.error = '';
    state.authRequired = false;
    renderDialogue();
    apiRequest('/api/assistant/conversations/' + encodeURIComponent(state.activeConversationId) + '/messages/' + encodeURIComponent(message.id), {
      method: 'DELETE'
    }).then(function () {
      state.deletingMessageId = null;
      state.failedMessageId = null;
      state.sourceExpandedIds[message.id] = false;
      return openConversation(state.activeConversationId);
    }).catch(function (error) {
      state.deletingMessageId = null;
      state.authRequired = isAuthError(error);
      state.error = messageForError(error, '\u5220\u9664\u6d88\u606f\u5931\u8d25\uff0c\u6d88\u606f\u4ecd\u4fdd\u7559');
      renderDialogue();
    });
  }

  function sendFeedback(messageId, helpful, helpfulButton, notHelpfulButton) {
    helpfulButton.disabled = true;
    notHelpfulButton.disabled = true;
    apiRequest('/api/assistant/feedback', {
      method: 'POST',
      body: { requestId: createRequestId(), messageId: messageId, helpful: helpful }
    }).then(function () {
      helpfulButton.setAttribute('aria-label', helpful ? '\u5df2\u8bb0\u5f55' : '\u6709\u5e2e\u52a9');
      notHelpfulButton.setAttribute('aria-label', helpful ? '\u6ca1\u5e2e\u52a9' : '\u5df2\u8bb0\u5f55');
      labelMessageAction(helpfulButton, helpful ? 'check' : 'thumbs-up', helpful ? '\u5df2\u8bb0\u5f55' : '\u6709\u5e2e\u52a9');
      labelMessageAction(notHelpfulButton, helpful ? 'thumbs-down' : 'check', helpful ? '\u6ca1\u5e2e\u52a9' : '\u5df2\u8bb0\u5f55');
    }).catch(function () {
      helpfulButton.disabled = false;
      notHelpfulButton.disabled = false;
    });
  }

  function initializeAssistant() {
    buildPage();
    if (!session()) {
      if (state.initialized) return;
      state.initialized = true;
      renderStatus('\u767b\u5f55\u540e\u4f7f\u7528 AI \u52a9\u624b', '\u4f1a\u8bdd\u3001\u5b66\u4e60\u8bb0\u5f55\u548c\u4e2a\u6027\u5316\u5185\u5bb9\u9700\u8981\u5728\u8d26\u53f7\u5185\u9694\u79bb\u4fdd\u5b58\u3002', '\u53bb\u767b\u5f55', function () {
        window.location.assign('/login?next=' + encodeURIComponent('/ai-assistant'));
      });
      return;
    }
    if (state.initialized) return;
    state.error = '';
    state.authRequired = false;
    state.confirmDeleteId = null;
    state.deletingId = null;
    state.initialized = true;
    renderStatus('\u6b63\u5728\u8fde\u63a5 AI \u52a9\u624b', '\u6b63\u5728\u68c0\u67e5\u6a21\u578b\u914d\u7f6e\u548c\u4f1a\u8bdd\u72b6\u6001\u3002');
    apiRequest('/api/assistant/config').then(function (config) {
      state.config = config;
      if (!config.configured) {
        renderStatus('AI \u670d\u52a1\u5c1a\u672a\u914d\u7f6e', '\u8bf7\u5728 server/.env \u4e2d\u8bbe\u7f6e DASHSCOPE_BASE_URL \u548c DASHSCOPE_API_KEY\uff0c\u524d\u7aef\u4e0d\u4f1a\u4f7f\u7528\u4f2a\u9020\u56de\u590d\u3002');
        return null;
      }
      renderDialogue();
      return loadConversations();
    }).catch(function (error) {
      state.initialized = false;
      renderStatus('\u65e0\u6cd5\u52a0\u8f7d AI \u52a9\u624b', error.message || '\u8bf7\u68c0\u67e5\u540e\u7aef\u670d\u52a1\u548c\u7f51\u7edc\u8fde\u63a5\u3002', '\u91cd\u8bd5', function () {
        state.initialized = false;
        initializeAssistant();
      });
    });
  }

  function syncRoute() {
    scheduled = false;
    if (state.leavingAssistant && isAssistantRoute()) return;
    if (state.leavingAssistant && !isAssistantRoute()) state.leavingAssistant = false;
    installStyles();
    renderGlobalNav();
    if (isAssistantRoute()) initializeAssistant();
    else removePage();
  }

  function scheduleSync() {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(syncRoute);
  }

  ['pushState', 'replaceState'].forEach(function (method) {
    var original = window.history[method];
    if (original && !original.__zqAiWrapped) {
      var wrapped = function () {
        var result = original.apply(this, arguments);
        window.dispatchEvent(new Event('zq:routechange'));
        return result;
      };
      wrapped.__zqAiWrapped = true;
      window.history[method] = wrapped;
    }
  });
  window.addEventListener('popstate', scheduleSync);
  window.addEventListener('hashchange', scheduleSync);
  window.addEventListener('zq:routechange', scheduleSync);
  function startEnhancement() {
    if (observer) return;
    observer = new MutationObserver(scheduleSync);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    scheduleSync();
  }

  if (document.readyState === 'complete') {
    window.setTimeout(startEnhancement, 250);
  } else {
    window.addEventListener('load', function () {
      window.setTimeout(startEnhancement, 250);
    }, { once: true });
  }
})();
