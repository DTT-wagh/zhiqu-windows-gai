(function (global) {
  'use strict';

  var SESSION_KEY = 'zhiqu.auth.session.v1';
  var DEFAULT_TIMEOUT = 12000;
  var refreshPromise = null;

  function apiBase() {
    // The static demo server normally injects this value. Keep local standalone
    // runs connected to the bundled backend when that injection is omitted.
    return String(global.__ZHIQU_API_BASE_URL || 'http://localhost:8080').replace(/\/+$/, '');
  }

  function session() {
    try {
      var raw = global.localStorage && global.localStorage.getItem(SESSION_KEY);
      var value = raw ? JSON.parse(raw) : null;
      return value && value.accessToken ? value : null;
    } catch (error) {
      return null;
    }
  }

  function createRequestId() {
    if (global.crypto && typeof global.crypto.randomUUID === 'function') return global.crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (character) {
      var random = Math.random() * 16 | 0;
      return (character === 'x' ? random : (random & 3 | 8)).toString(16);
    });
  }

  function ApiError(message, status, code, details) {
    this.name = 'ApiError';
    this.message = message || '请求未完成';
    this.status = status || 0;
    this.code = code || 'REQUEST_FAILED';
    this.details = details || null;
  }
  ApiError.prototype = Object.create(Error.prototype);

  function refreshSession(currentSession, signal) {
    if (!currentSession || !currentSession.refreshToken) return Promise.resolve(null);
    if (!refreshPromise) {
      refreshPromise = global.fetch(apiBase() + '/api/auth/refresh', {
        method: 'POST',
        signal: signal,
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: currentSession.refreshToken })
      }).then(function (response) {
        if (!response.ok) return null;
        return response.json().then(function (next) {
          if (!next || !next.accessToken) return null;
          global.localStorage.setItem(SESSION_KEY, JSON.stringify(next));
          return next;
        });
      }).catch(function () {
        return null;
      }).finally(function () {
        refreshPromise = null;
      });
    }
    return refreshPromise;
  }

  function request(path, options, retryAfterRefresh) {
    var settings = options || {};
    var requiresAuth = settings.auth !== false;
    var currentSession = session();
    if (requiresAuth && !currentSession) {
      return Promise.reject(new ApiError('请先登录', 401, 'UNAUTHORIZED'));
    }
    var controller = new AbortController();
    var timeout = global.setTimeout(function () { controller.abort('timeout'); }, settings.timeout || DEFAULT_TIMEOUT);
    var externalSignal = settings.signal;
    var onAbort = function () { controller.abort(externalSignal.reason || 'cancelled'); };
    if (externalSignal) {
      if (externalSignal.aborted) onAbort();
      else externalSignal.addEventListener('abort', onAbort, { once: true });
    }
    var headers = Object.assign({ Accept: 'application/json' }, settings.headers || {});
    if (requiresAuth && currentSession) headers.Authorization = 'Bearer ' + currentSession.accessToken;
    if (settings.body !== undefined) headers['Content-Type'] = 'application/json';
    if (settings.requestId) headers['X-Request-Id'] = settings.requestId;

    return global.fetch(apiBase() + path, {
      method: settings.method || 'GET',
      headers: headers,
      signal: controller.signal,
      body: settings.body === undefined ? undefined : JSON.stringify(settings.body)
    }).then(function (response) {
      if (response.status === 401 && requiresAuth && retryAfterRefresh !== false) {
        return refreshSession(currentSession, controller.signal).then(function (next) {
          if (!next) throw new ApiError('登录已过期，请重新登录', 401, 'SESSION_EXPIRED');
          return request(path, settings, false);
        });
      }
      return response.text().then(function (text) {
        var payload = null;
        try { payload = text ? JSON.parse(text) : null; } catch (error) { payload = text; }
        if (!response.ok) {
          throw new ApiError(
            payload && payload.message ? payload.message : '请求未完成',
            response.status,
            payload && payload.code ? payload.code : 'REQUEST_FAILED',
            payload
          );
        }
        return payload;
      });
    }).catch(function (error) {
      if (error && error.name === 'AbortError') {
        if (externalSignal && externalSignal.aborted) throw error;
        throw new ApiError('请求超时，请重试', 0, 'REQUEST_TIMEOUT');
      }
      throw error;
    }).finally(function () {
      global.clearTimeout(timeout);
      if (externalSignal) externalSignal.removeEventListener('abort', onAbort);
    });
  }

  function write(path, method, body, signal) {
    var requestId = body.requestId;
    return request(path, { method: method, body: body, requestId: requestId, signal: signal });
  }

  global.ZhiquSinglePlayerApi = {
    ApiError: ApiError,
    session: session,
    createRequestId: createRequestId,
    request: request,
    mediaUrl: function (value) {
      var url = String(value || '');
      return /^https?:\/\//i.test(url) ? url : apiBase() + (url.charAt(0) === '/' ? url : '/' + url);
    },
    games: function (signal) { return request('/api/single-player-games', { auth: false, signal: signal }); },
    progress: function (signal) { return request('/api/single-player-games/progress', { signal: signal }); },
    createInstance: function (gameCode, body, signal) {
      return write('/api/single-player-games/' + encodeURIComponent(gameCode) + '/instances', 'POST', body, signal);
    },
    instance: function (instanceId, signal) {
      return request('/api/single-player-games/instances/' + encodeURIComponent(instanceId), { signal: signal });
    },
    submit: function (instanceId, roundId, body, signal) {
      return write('/api/single-player-games/instances/' + encodeURIComponent(instanceId) + '/rounds/' + encodeURIComponent(roundId) + '/submit', 'POST', body, signal);
    },
    retryGeneration: function (instanceId, body, signal) {
      return write('/api/single-player-games/instances/' + encodeURIComponent(instanceId) + '/retry-generation', 'POST', body, signal);
    },
    regenerate: function (instanceId, body, signal) {
      return write('/api/single-player-games/instances/' + encodeURIComponent(instanceId) + '/regenerate', 'POST', body, signal);
    },
    finish: function (instanceId, body, signal) {
      return write('/api/single-player-games/instances/' + encodeURIComponent(instanceId) + '/finish', 'POST', body, signal);
    },
    loginUrl: function () {
      return '/login?next=' + encodeURIComponent(global.location.pathname + global.location.search);
    }
  };
})(globalThis);
