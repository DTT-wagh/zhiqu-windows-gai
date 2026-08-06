(() => {
  const ROOT_ID = 'zhiqu-social-chat-root';
  const STYLE_ID = 'zhiqu-social-chat-styles';
  const SESSION_KEY = 'zhiqu.auth.session.v1';
  const API_BASE = String(globalThis.__ZHIQU_API_BASE_URL || '').replace(/\/+$/, '');
  const EMOJIS = [
    '😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣',
    '😊', '😇', '🙂', '🙃', '😉', '😌', '😍', '🥰',
    '😘', '😗', '😙', '😚', '🤗', '🤩', '🤔', '🫡',
    '🤨', '😐', '😑', '😶', '🙄', '😏', '😣', '😥',
    '😮', '🤐', '😯', '😪', '😫', '🥱', '😴', '😌',
    '🤓', '😎', '🥳', '😳', '🥺', '😢', '😭', '😤',
    '😠', '😡', '🤬', '🤯', '😱', '😨', '😰', '😥',
    '👍', '👎', '👌', '✌️', '🤞', '🤟', '🤘', '🤙',
    '👏', '🙌', '👐', '🤲', '🙏', '💪', '👋', '🤝',
    '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍',
    '💔', '💕', '💖', '💯', '✨', '⭐', '🌟', '🔥',
    '🎉', '🎊', '🎈', '🎁', '✅', '❌', '⚡', '☀️',
    '🌈', '☁️', '🌙', '🍎', '🍉', '🍔', '🍕', '☕',
    '⚽', '🏀', '🎮', '📚', '✏️', '💡', '🚀', '🌻'
  ];
  const state = {
    open: false,
    searchMode: false,
    searchQuery: '',
    searchResults: [],
    friends: [],
    conversations: [],
    activePartner: null,
    activeMode: 'chat',
    messages: [],
    enteringMessageId: null,
    composerDraft: '',
    composerPartnerId: null,
    composerSelection: null,
    composerPanel: null,
    loading: false,
    error: '',
    pollTimer: null,
    searchTimer: null,
    searchRequestId: 0,
  };

  let refreshPromise = null;

  function isSocialRoute() {
    return /^\/friends(?:\/add)?(?:\.html)?\/?$/.test(location.pathname);
  }

  function session() {
    try {
      return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
    } catch {
      return null;
    }
  }

  function requestId() {
    return globalThis.crypto?.randomUUID?.() || `zq-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  async function refreshSession(currentSession) {
    if (!currentSession?.refreshToken) return null;
    if (!refreshPromise) {
      refreshPromise = (async () => {
        try {
          const response = await fetch(`${API_BASE}/api/auth/refresh`, {
            method: 'POST',
            headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken: currentSession.refreshToken }),
          });
          if (!response.ok) return null;
          const nextSession = await response.json();
          if (!nextSession?.accessToken) return null;
          localStorage.setItem(SESSION_KEY, JSON.stringify(nextSession));
          return nextSession;
        } catch {
          return null;
        } finally {
          refreshPromise = null;
        }
      })();
    }
    return refreshPromise;
  }

  async function api(path, options = {}, retryAfterRefresh = true) {
    const currentSession = session();
    if (!currentSession?.accessToken) throw new Error('请先登录后使用私聊');
    const headers = new Headers(options.headers || {});
    headers.set('Accept', 'application/json');
    headers.set('Authorization', `Bearer ${currentSession.accessToken}`);
    if (options.body !== undefined) headers.set('Content-Type', 'application/json');
    const url = /^https?:\/\//i.test(path) ? path : `${API_BASE}${path}`;
    const response = await fetch(url, { ...options, headers });
    if (response.status === 401 && retryAfterRefresh) {
      const nextSession = await refreshSession(currentSession);
      if (nextSession?.accessToken) return api(path, options, false);
      throw new Error('登录已过期，请重新登录后使用私聊');
    }
    if (!response.ok) {
      let payload = null;
      try { payload = await response.clone().json(); } catch {}
      throw new Error(payload?.message || '请求失败，请稍后重试');
    }
    if (response.status === 204) return null;
    return response.json();
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, (character) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
    }[character]));
  }

  function formatTime(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const now = new Date();
    if (date.toDateString() === now.toDateString()) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString([], { month: 'numeric', day: 'numeric' });
  }

  function installStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${ROOT_ID} { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif; }
      #${ROOT_ID} *, #${ROOT_ID} *::before, #${ROOT_ID} *::after { box-sizing: border-box; }
      #${ROOT_ID} .zq-social-launcher { position: fixed; right: max(22px, env(safe-area-inset-right)); bottom: max(22px, env(safe-area-inset-bottom)); z-index: 2147483640; display: flex; gap: 8px; }
      #${ROOT_ID} .zq-social-launcher button, #${ROOT_ID} button { border: 0; font: inherit; cursor: pointer; }
      #${ROOT_ID} .zq-social-launcher button { min-height: 44px; padding: 0 16px; border: 1px solid rgba(54, 92, 141, .18); border-radius: 22px; background: #365c8d; color: #fff; font-weight: 800; box-shadow: 0 8px 22px rgba(58, 53, 43, .18); }
      #${ROOT_ID} .zq-social-launcher button.secondary { background: #fffdfa; color: #365c8d; }
      #${ROOT_ID} .zq-social-unread { display: inline-grid; min-width: 18px; height: 18px; margin-left: 5px; padding: 0 4px; place-items: center; border-radius: 9px; background: #f05a4f; color: #fff; font-size: 11px; line-height: 18px; }
      #${ROOT_ID} .zq-social-backdrop { position: fixed; inset: 0; z-index: 2147483641; display: grid; place-items: center; padding: 24px; background: rgba(24, 36, 43, .42); }
      #${ROOT_ID} .zq-social-panel { display: grid; grid-template-columns: minmax(230px, 31%) minmax(0, 1fr); width: min(960px, 100%); height: min(680px, calc(100vh - 64px)); overflow: hidden; border: 1px solid #d8d0c1; border-radius: 14px; background: #fffdfa; box-shadow: 0 24px 70px rgba(28, 39, 46, .25); }
      #${ROOT_ID} .zq-social-panel:not(.zq-social-active-chat):not(.zq-social-search-panel) { height: min(520px, calc(100vh - 64px)); }
      #${ROOT_ID} .zq-social-sidebar { display: flex; min-width: 0; flex-direction: column; border-right: 1px solid #e4ddd1; background: #f7f4ec; }
      #${ROOT_ID} .zq-social-sidebar-header, #${ROOT_ID} .zq-social-chat-header { display: flex; min-height: 68px; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 18px; border-bottom: 1px solid #e4ddd1; }
      #${ROOT_ID} .zq-social-title { margin: 0; color: #243139; font-size: 19px; font-weight: 900; }
      #${ROOT_ID} .zq-social-subtitle { margin: 3px 0 0; color: #74808a; font-size: 12px; }
      #${ROOT_ID} .zq-social-icon-button { width: 38px; height: 38px; border-radius: 8px; background: transparent; color: #53616a; font-size: 23px; line-height: 38px; }
      #${ROOT_ID} .zq-social-icon-button:hover { background: #ebe5da; }
      #${ROOT_ID} .zq-social-search-action { display: flex; align-items: center; justify-content: space-between; margin: 14px 14px 8px; padding: 11px 13px; border: 1px solid #d8d2c5; border-radius: 8px; background: #e8edf4; color: #365c8d; font-size: 13px; font-weight: 800; }
      #${ROOT_ID} .zq-social-search-action:hover { background: #f0ece4; }
      #${ROOT_ID} .zq-social-search-action span:last-child { font-size: 18px; }
      #${ROOT_ID} .zq-social-search-box { margin: 0 14px 10px; }
      #${ROOT_ID} .zq-social-search-box input, #${ROOT_ID} .zq-social-composer input { width: 100%; min-height: 44px; border: 1px solid #d5d0c7; border-radius: 8px; outline: none; background: #fff; color: #243139; font: inherit; }
      #${ROOT_ID} .zq-social-search-box input { padding: 0 12px; }
      #${ROOT_ID} .zq-social-search-box input:focus, #${ROOT_ID} .zq-social-composer input:focus { border-color: #365c8d; box-shadow: 0 0 0 3px rgba(54, 92, 141, .12); }
      #${ROOT_ID} .zq-social-list { min-height: 0; overflow: auto; padding: 2px 9px 16px; }
      #${ROOT_ID} .zq-social-list-row { display: grid; grid-template-columns: 40px minmax(0, 1fr) auto; align-items: center; gap: 10px; width: 100%; margin: 3px 0; padding: 10px 9px; border-radius: 9px; background: transparent; color: #243139; text-align: left; }
      #${ROOT_ID} .zq-social-list-row:hover, #${ROOT_ID} .zq-social-list-row.active { background: #fffdfa; }
      #${ROOT_ID} .zq-social-avatar { display: grid; flex: 0 0 40px; width: 40px; min-width: 40px; height: 40px; min-height: 40px; overflow: hidden; place-items: center; border-radius: 50%; background: #e8edf4; color: #365c8d; font-size: 16px; font-weight: 900; }
      #${ROOT_ID} .zq-social-avatar img, #${ROOT_ID} .zq-social-avatar-fallback { grid-area: 1 / 1; }
      #${ROOT_ID} .zq-social-avatar img { display: block; width: 40px; max-width: none; height: 40px; max-height: none; border-radius: inherit; object-fit: cover; }
      #${ROOT_ID} .zq-social-avatar-fallback { display: grid; width: 100%; height: 100%; place-items: center; }
      #${ROOT_ID} .zq-social-chat-header .zq-social-avatar { flex: 0 0 46px; width: 46px; min-width: 46px; height: 46px; min-height: 46px; }
      #${ROOT_ID} .zq-social-chat-header .zq-social-avatar img { width: 46px; height: 46px; }
      #${ROOT_ID} .zq-social-chat-header-main { display: flex; min-width: 0; align-items: center; gap: 10px; flex: 1; }
      #${ROOT_ID} .zq-social-chat-back { display: none; }
      #${ROOT_ID} .zq-social-row-copy { min-width: 0; }
      #${ROOT_ID} .zq-social-row-name { overflow: hidden; color: #243139; font-size: 14px; font-weight: 800; text-overflow: ellipsis; white-space: nowrap; }
      #${ROOT_ID} .zq-social-row-preview { overflow: hidden; margin-top: 3px; color: #7a858c; font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
      #${ROOT_ID} .zq-social-row-meta { color: #7a858c; font-size: 11px; white-space: nowrap; }
      #${ROOT_ID} .zq-social-unread-small { display: inline-grid; min-width: 18px; height: 18px; place-items: center; padding: 0 4px; border-radius: 9px; background: #f05a4f; color: #fff; font-size: 10px; font-weight: 800; }
      #${ROOT_ID} .zq-social-result { display: grid; grid-template-columns: 40px minmax(0, 1fr) auto; align-items: center; gap: 10px; padding: 10px 9px; border-bottom: 1px solid #e9e2d8; }
      #${ROOT_ID} .zq-social-result-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 6px; }
      #${ROOT_ID} .zq-social-result-action { min-height: 32px; padding: 0 10px; border-radius: 6px; background: #365c8d; color: #fff; font-size: 12px; font-weight: 800; }
      #${ROOT_ID} .zq-social-result-action.secondary { background: #e8edf4; color: #365c8d; }
      #${ROOT_ID} .zq-social-empty { padding: 28px 16px; color: #7a858c; font-size: 13px; line-height: 1.7; text-align: center; }
      #${ROOT_ID} .zq-social-chat { display: flex; min-width: 0; min-height: 0; height: 100%; overflow: hidden; flex-direction: column; background: #fffdfa; }
      #${ROOT_ID} .zq-social-chat-header-copy { min-width: 0; flex: 1; }
      #${ROOT_ID} .zq-social-chat-header .zq-social-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      #${ROOT_ID} .zq-social-message-list { display: flex; min-height: 0; flex: 1; flex-direction: column; gap: 9px; overflow: auto; padding: 22px 22px 14px; background: #fbfaf7; }
      #${ROOT_ID} .zq-social-message { display: flex; max-width: 78%; flex-direction: column; align-items: flex-start; gap: 4px; }
      #${ROOT_ID} .zq-social-message.mine { align-self: flex-end; align-items: flex-end; }
      #${ROOT_ID} .zq-social-bubble { padding: 10px 13px; border: 1px solid #e2ddd4; border-radius: 12px 12px 12px 4px; background: #fff; color: #243139; font-size: 14px; line-height: 1.55; white-space: pre-wrap; overflow-wrap: anywhere; }
      #${ROOT_ID} .zq-social-message.mine .zq-social-bubble { border-color: #365c8d; border-radius: 12px 12px 4px 12px; background: #365c8d; color: #fff; }
      #${ROOT_ID} .zq-social-message-enter .zq-social-bubble, #${ROOT_ID} .zq-social-message-enter .zq-social-sticker-message { transform-origin: right bottom; animation: zq-social-message-pop 280ms cubic-bezier(.2, .8, .25, 1) both; will-change: transform, opacity; }
      #${ROOT_ID} .zq-social-sticker-message { display: grid; width: min(160px, 42vw); min-width: 88px; aspect-ratio: 1; overflow: hidden; place-items: center; border-radius: 8px; background: transparent; }
      #${ROOT_ID} .zq-social-sticker-message img { display: block; width: 100%; height: 100%; object-fit: contain; }
      #${ROOT_ID} .zq-social-message-time { color: #9a9993; font-size: 10px; }
      #${ROOT_ID} .zq-social-request-banner { margin: 14px 18px 0; padding: 12px 13px; border: 1px solid #d8e3f9; border-radius: 9px; background: #f1f5ff; color: #36538a; font-size: 13px; line-height: 1.5; }
      #${ROOT_ID} .zq-social-request-banner strong { display: block; margin-bottom: 3px; color: #243f79; font-size: 14px; }
      #${ROOT_ID} .zq-social-request-actions { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 9px; }
      #${ROOT_ID} .zq-social-request-actions button { min-height: 34px; padding: 0 12px; border-radius: 6px; background: #365c8d; color: #fff; font-size: 12px; font-weight: 800; }
      #${ROOT_ID} .zq-social-request-actions button.secondary { background: #fff; color: #53616a; border: 1px solid #d5d0c7; }
      #${ROOT_ID} .zq-social-request-note { margin: 14px 18px 0; padding: 10px 12px; border-radius: 8px; background: #f7f4ec; color: #74808a; font-size: 12px; line-height: 1.5; }
      #${ROOT_ID} .zq-social-composer { display: flex; flex-direction: column; gap: 8px; padding: 11px 16px max(11px, env(safe-area-inset-bottom)); border-top: 1px solid #e4ddd1; background: #fffdfa; }
      #${ROOT_ID} .zq-social-composer-row { display: grid; grid-template-columns: minmax(0, 1fr) 42px auto; align-items: center; gap: 6px; }
      #${ROOT_ID} .zq-social-composer input { padding: 0 13px; }
      #${ROOT_ID} .zq-social-send { min-width: 64px; min-height: 42px; padding: 0 14px; place-items: center; border-radius: 8px; background: #2457d6; color: #fff; font-weight: 800; transform-origin: center; }
      #${ROOT_ID} .zq-social-send:disabled { opacity: .5; cursor: default; }
      #${ROOT_ID} .zq-social-composer[data-has-content="false"] .zq-social-send { display: none; }
      #${ROOT_ID} .zq-social-composer[data-has-content="true"] .zq-social-send { display: inline-grid; animation: zq-social-send-pop 240ms cubic-bezier(.2, .8, .25, 1) both; will-change: transform, opacity; }
      #${ROOT_ID} .zq-social-composer[data-has-content="true"] .zq-social-composer-more { display: none; }
      #${ROOT_ID} .zq-social-composer-tools { display: flex; min-height: 42px; align-items: center; gap: 4px; padding: 0 2px; }
      #${ROOT_ID} .zq-social-tool-button { display: inline-grid; width: 38px; min-width: 38px; height: 38px; place-items: center; border-radius: 8px; background: transparent; color: #34434c; font-size: 24px; line-height: 1; }
      #${ROOT_ID} .zq-social-tool-button:hover, #${ROOT_ID} .zq-social-tool-button[aria-pressed="true"] { background: #ebe5da; color: #365c8d; }
      #${ROOT_ID} .zq-social-tool-button[data-action="toggle-more"] { font-size: 28px; font-weight: 300; }
      #${ROOT_ID} .zq-social-tool-spacer { flex: 1; }
      #${ROOT_ID} .zq-social-emoji-category-tabs { display: flex; align-items: center; gap: 3px; }
      #${ROOT_ID} .zq-social-emoji-category-tab { display: inline-grid; width: 38px; height: 38px; place-items: center; border-radius: 8px; background: transparent; color: #53616a; font-size: 24px; line-height: 1; }
      #${ROOT_ID} .zq-social-emoji-category-tab[aria-selected="true"] { background: #e8edf4; color: #365c8d; }
      #${ROOT_ID} .zq-social-emoji-category-tab[data-section="stickers"] { font-size: 27px; }
      #${ROOT_ID} .zq-social-tool-panel { min-height: 112px; margin: 1px -16px calc(-1 * max(11px, env(safe-area-inset-bottom))); border-top: 1px solid #e4ddd1; background: #f7f4ec; }
      #${ROOT_ID} .zq-social-emoji-panel { display: flex; height: min(380px, 45vh); min-height: 300px; max-height: min(380px, 45vh); flex-direction: column; overflow: hidden; }
      #${ROOT_ID} .zq-social-emoji-content { min-height: 0; flex: 1; overflow-x: hidden; overflow-y: auto; overscroll-behavior: contain; touch-action: pan-y; -webkit-overflow-scrolling: touch; padding: 14px 14px max(18px, env(safe-area-inset-bottom)); }
      #${ROOT_ID} .zq-social-unicode-grid { display: grid; grid-template-columns: repeat(8, minmax(40px, 1fr)); gap: 9px 6px; align-content: start; }
      #${ROOT_ID} .zq-social-emoji-button { display: grid; min-width: 0; height: 58px; place-items: center; border-radius: 8px; background: transparent; font-size: 32px; line-height: 1; }
      #${ROOT_ID} .zq-social-emoji-button:hover { background: #fffdfa; }
      #${ROOT_ID} .zq-social-sticker-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(68px, 1fr)); gap: 10px; align-content: start; }
      #${ROOT_ID} .zq-social-sticker-tile, #${ROOT_ID} .zq-social-sticker-add { position: relative; display: grid; min-width: 0; aspect-ratio: 1; overflow: hidden; place-items: center; border-radius: 8px; background: #fffdfa; }
      #${ROOT_ID} .zq-social-sticker-tile img { display: block; width: 100%; height: 100%; object-fit: cover; }
      #${ROOT_ID} .zq-social-sticker-add { border: 1px dashed #a9a69e; color: #53616a; font-size: 34px; font-weight: 300; }
      #${ROOT_ID} .zq-social-sticker-add:disabled { opacity: .55; cursor: default; }
      #${ROOT_ID} .zq-social-sticker-empty { grid-column: 2 / -1; align-self: center; color: #8a8e8f; font-size: 12px; line-height: 1.5; text-align: center; }
      #${ROOT_ID} .zq-social-more-panel { min-height: 112px; padding: 12px 16px max(12px, env(safe-area-inset-bottom)); }
      #${ROOT_ID} .zq-social-placeholder { display: grid; min-height: 0; flex: 1; place-items: center; padding: 24px; color: #7a858c; font-size: 14px; line-height: 1.7; text-align: center; }
      #${ROOT_ID} .zq-social-error { margin: 0 16px 12px; padding: 9px 11px; border-radius: 7px; background: #fff0ee; color: #a53a30; font-size: 12px; line-height: 1.5; }
      @keyframes zq-social-message-pop {
        0% { opacity: .25; transform: scale(.72); }
        58% { opacity: 1; transform: scale(1.08); }
        78% { transform: scale(.98); }
        100% { opacity: 1; transform: scale(1); }
      }
      @keyframes zq-social-send-pop {
        0% { opacity: .35; transform: scale(.76); }
        58% { opacity: 1; transform: scale(1.08); }
        80% { transform: scale(.98); }
        100% { opacity: 1; transform: scale(1); }
      }
      @media (prefers-reduced-motion: reduce) {
        #${ROOT_ID} .zq-social-message-enter .zq-social-bubble, #${ROOT_ID} .zq-social-message-enter .zq-social-sticker-message { animation: none; }
        #${ROOT_ID} .zq-social-composer[data-has-content="true"] .zq-social-send { animation: none; }
      }
      @media (max-width: 720px) {
        #${ROOT_ID} .zq-social-launcher { right: 14px; bottom: max(14px, env(safe-area-inset-bottom)); }
        #${ROOT_ID} .zq-social-launcher button { min-height: 40px; padding: 0 12px; font-size: 12px; }
        #${ROOT_ID} .zq-social-backdrop { padding: 10px; place-items: end center; }
        #${ROOT_ID} .zq-social-panel, #${ROOT_ID} .zq-social-panel:not(.zq-social-active-chat):not(.zq-social-search-panel) { grid-template-columns: 1fr; width: 100%; height: min(720px, calc(100vh - 20px)); max-height: calc(100vh - 20px); border-radius: 12px; }
        #${ROOT_ID} .zq-social-chat-backdrop { padding: 0; place-items: stretch; background: #fbfaf7; }
        #${ROOT_ID} .zq-social-chat-backdrop .zq-social-panel { width: 100%; height: 100%; max-height: none; border: 0; border-radius: 0; box-shadow: none; }
        #${ROOT_ID} .zq-social-panel.zq-social-active-chat { grid-template-columns: 1fr; }
        #${ROOT_ID} .zq-social-active-chat .zq-social-sidebar { display: none; }
        #${ROOT_ID} .zq-social-active-chat .zq-social-chat { display: flex; min-height: 0; }
        #${ROOT_ID} .zq-social-panel:not(.zq-social-active-chat) .zq-social-chat { display: none; }
        #${ROOT_ID} .zq-social-active-chat .zq-social-chat-back { display: inline-grid; }
        #${ROOT_ID} .zq-social-list-row, #${ROOT_ID} .zq-social-result { grid-template-columns: 32px minmax(0, 1fr) auto; }
        #${ROOT_ID} .zq-social-avatar { flex-basis: 32px; width: 32px; min-width: 32px; height: 32px; min-height: 32px; }
        #${ROOT_ID} .zq-social-avatar img { width: 32px; height: 32px; }
        #${ROOT_ID} .zq-social-chat-header .zq-social-avatar { flex-basis: 40px; width: 40px; min-width: 40px; height: 40px; min-height: 40px; }
        #${ROOT_ID} .zq-social-chat-header .zq-social-avatar img { width: 40px; height: 40px; }
        #${ROOT_ID} .zq-social-search-panel { grid-template-rows: minmax(0, 1fr); }
        #${ROOT_ID} .zq-social-search-panel .zq-social-chat { display: none; }
        #${ROOT_ID} .zq-social-search-panel .zq-social-sidebar { height: 100%; max-height: none; border-bottom: 0; }
        #${ROOT_ID} .zq-social-search-panel .zq-social-list { flex: 1; }
        #${ROOT_ID} .zq-social-sidebar { max-height: 215px; border-right: 0; border-bottom: 1px solid #e4ddd1; }
        #${ROOT_ID} .zq-social-panel:not(.zq-social-active-chat) .zq-social-sidebar { height: 100%; max-height: none; border-bottom: 0; }
        #${ROOT_ID} .zq-social-chat-header, #${ROOT_ID} .zq-social-sidebar-header { min-height: 58px; padding: 10px 14px; }
        #${ROOT_ID} .zq-social-message-list { padding: 16px 13px 10px; }
        #${ROOT_ID} .zq-social-message { max-width: 88%; }
        #${ROOT_ID} .zq-social-composer { padding-right: 12px; padding-left: 12px; }
        #${ROOT_ID} .zq-social-composer-row { grid-template-columns: minmax(0, 1fr) 44px auto; gap: 4px; }
        #${ROOT_ID} .zq-social-composer-row .zq-social-tool-button { width: 44px; min-width: 44px; height: 44px; border-radius: 50%; font-size: 27px; }
        #${ROOT_ID} .zq-social-send { min-width: 62px; min-height: 42px; padding: 0 12px; }
        #${ROOT_ID} .zq-social-tool-panel { margin-right: -12px; margin-left: -12px; }
        #${ROOT_ID} .zq-social-more-panel { padding-right: 12px; padding-left: 12px; }
        #${ROOT_ID} .zq-social-emoji-panel { height: clamp(300px, 45vh, 390px); min-height: 300px; max-height: clamp(300px, 45vh, 390px); }
        #${ROOT_ID} .zq-social-unicode-grid { grid-template-columns: repeat(7, minmax(40px, 1fr)); gap: 9px 5px; }
        #${ROOT_ID} .zq-social-sticker-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 9px; }
      }
    `;
    document.head.appendChild(style);
  }

  function ensureRoot() {
    let root = document.getElementById(ROOT_ID);
    if (root) return root;
    root = document.createElement('div');
    root.id = ROOT_ID;
    root.dataset.zqSocialChat = 'true';
    document.body.appendChild(root);
    root.addEventListener('click', handleClick);
    root.addEventListener('input', handleInput);
    root.addEventListener('focusin', handleFocusIn);
    root.addEventListener('keydown', handleKeydown);
    return root;
  }

  function avatar(name, avatarKey) {
    const fallback = escapeHtml((name || '同').slice(0, 1));
    const image = avatarKey
      ? `<img src="${API_BASE}/api/social/avatars/${encodeURIComponent(avatarKey)}" alt="" loading="lazy" onload="this.nextElementSibling.style.display='none'" onerror="this.style.display='none'" />`
      : '';
    return `<span class="zq-social-avatar" aria-hidden="true">${image}<span class="zq-social-avatar-fallback">${fallback}</span></span>`;
  }

  function renderLauncher(root) {
    root.querySelector('.zq-social-launcher')?.remove();
  }

  function renderPanel(root) {
    const searchWasFocused = document.activeElement?.matches?.('[data-chat-search]');
    const searchSelection = searchWasFocused
      ? { start: document.activeElement.selectionStart, end: document.activeElement.selectionEnd }
      : null;
    const composerWasFocused = document.activeElement?.matches?.('[data-chat-composer]');
    const composerSelection = composerWasFocused
      ? { start: document.activeElement.selectionStart, end: document.activeElement.selectionEnd }
      : null;
    if (composerWasFocused) {
      state.composerDraft = document.activeElement.value;
      state.composerPartnerId = state.activePartner?.id || null;
      state.composerSelection = composerSelection;
    }
    root.querySelector('.zq-social-backdrop')?.remove();
    if (!state.open) return;
    const active = state.activePartner;
    const panelTitle = active ? '聊天' : '私聊';
    const panelSubtitle = active ? '和笔友继续交流学习' : '先添加笔友，成为好友后即可聊天';
    const panel = document.createElement('div');
    panel.className = `zq-social-backdrop ${active ? 'zq-social-chat-backdrop' : ''}`;
    panel.innerHTML = `
      <section class="zq-social-panel ${state.searchMode && !active ? 'zq-social-search-panel' : ''} ${active ? 'zq-social-active-chat' : ''}" role="dialog" aria-modal="true" aria-label="${panelTitle}">
        <aside class="zq-social-sidebar">
          <header class="zq-social-sidebar-header">
            <div><h2 class="zq-social-title">${panelTitle}</h2><p class="zq-social-subtitle">${panelSubtitle}</p></div>
            <button type="button" class="zq-social-icon-button" data-action="close" aria-label="关闭">×</button>
          </header>
          <button type="button" class="zq-social-search-action" data-action="toggle-search"><span>${state.searchMode ? '返回会话列表' : '找同学，不用笔友码'}</span><span>${state.searchMode ? '‹' : '⌕'}</span></button>
          ${state.error ? `<div class="zq-social-error">${escapeHtml(state.error)}</div>` : ''}
          ${state.searchMode ? renderSearch() : renderConversationList()}
        </aside>
        <main class="zq-social-chat">
          ${active ? renderChatHeader(active) + renderMessages(active) : '<div class="zq-social-placeholder">选择一位笔友开始私聊。<br>还没有笔友？点击左侧“找同学”，按账号或昵称搜索。</div>'}
        </main>
      </section>`;
    panel.addEventListener('click', (event) => {
      if (event.target === panel) closePanel();
    });
    root.appendChild(panel);
    if (active) {
      const list = panel.querySelector('.zq-social-message-list');
      if (list) list.scrollTop = list.scrollHeight;
    }
    if (searchWasFocused && state.searchMode) {
      const input = panel.querySelector('[data-chat-search]');
      input?.focus();
      if (input && searchSelection) {
        input.setSelectionRange(searchSelection.start, searchSelection.end);
      }
    }
    if (composerWasFocused && active && state.composerPartnerId === active.id) {
      const input = panel.querySelector('[data-chat-composer]');
      input?.focus();
      if (input && state.composerSelection) {
        input.setSelectionRange(state.composerSelection.start, state.composerSelection.end);
      }
    }
  }

  function renderSearch() {
    const results = state.searchQuery.trim().length < 2
      ? '<div class="zq-social-empty">输入至少 2 个字符，可以搜索账号或昵称。</div>'
      : state.loading && !state.searchResults.length
        ? '<div class="zq-social-empty">正在查找同学...</div>'
        : state.searchResults.length
          ? state.searchResults.map((item) => {
            const isFriend = state.friends.some((friend) => friend.student?.userId === item.id
              || friend.student?.id === item.id
              || (item.publicProfileId && friend.student?.publicProfileId === item.publicProfileId));
            const isPending = !isFriend && item.pending;
            const action = isFriend ? 'open-result-chat' : (isPending ? '' : 'add-result');
            const label = isFriend ? '聊天' : (isPending ? '已发送' : '加好友');
            return `<div class="zq-social-result">${avatar(item.nickname, item.avatarKey)}<div class="zq-social-row-copy"><div class="zq-social-row-name">${escapeHtml(item.nickname)}</div><div class="zq-social-row-preview">@${escapeHtml(item.username)}</div></div><div class="zq-social-result-actions"><button type="button" class="zq-social-result-action" ${isPending ? 'disabled' : ''} data-action="${action}" data-user-id="${escapeHtml(item.id)}" data-profile-id="${escapeHtml(item.publicProfileId || '')}">${label}</button></div></div>`;
          }).join('')
          : '<div class="zq-social-empty">没有找到匹配的同学。检查账号或昵称后再试。</div>';
    return `<div class="zq-social-search-box"><input data-chat-search placeholder="搜索账号或昵称" value="${escapeHtml(state.searchQuery)}" autocomplete="off" /></div><div class="zq-social-list">${results}</div>`;
  }

  function renderConversationList() {
    if (!state.conversations.length) {
      return '<div class="zq-social-list"><div class="zq-social-empty">还没有私聊会话。<br>先找一位笔友聊聊吧。</div></div>';
    }
    return `<div class="zq-social-list">${state.conversations.map((item) => `<button type="button" class="zq-social-list-row ${state.activePartner?.id === item.partnerId ? 'active' : ''}" data-action="open-conversation" data-user-id="${escapeHtml(item.partnerId)}"><span>${avatar(item.nickname, item.avatarKey)}</span><span class="zq-social-row-copy"><span class="zq-social-row-name">${escapeHtml(item.nickname)}</span><span class="zq-social-row-preview">${escapeHtml(conversationPreview(item))}</span></span><span class="zq-social-row-meta">${Number(item.unreadCount) ? `<span class="zq-social-unread-small">${item.unreadCount > 9 ? '9+' : item.unreadCount}</span>` : escapeHtml(formatTime(item.lastAt))}</span></button>`).join('')}</div>`;
  }

  function conversationPreview(item) {
    return item.lastMessage || '开始一段新的交流';
  }

  function renderChatHeader(partner) {
    return `<header class="zq-social-chat-header"><button type="button" class="zq-social-icon-button zq-social-chat-back" data-action="back-to-conversations" aria-label="返回会话列表">‹</button><div class="zq-social-chat-header-main">${avatar(partner.nickname || partner.username, partner.avatarKey)}<div class="zq-social-chat-header-copy"><h2 class="zq-social-title">${escapeHtml(partner.nickname || partner.username)}</h2><p class="zq-social-subtitle">@${escapeHtml(partner.username || '')}</p></div></div></header>`;
  }

  function renderEmojiPanel() {
    const content = `<div class="zq-social-unicode-grid">${EMOJIS.map((emoji) => `<button type="button" class="zq-social-emoji-button" data-action="insert-emoji" data-emoji="${escapeHtml(emoji)}" aria-label="插入表情 ${escapeHtml(emoji)}">${escapeHtml(emoji)}</button>`).join('')}</div>`;
    return `<div class="zq-social-tool-panel zq-social-emoji-panel" role="region" aria-label="表情"><div class="zq-social-emoji-content">${content}</div></div>`;
  }

  function renderComposerActions() {
    return `<button type="button" class="zq-social-tool-button" data-action="toggle-emoji" aria-label="表情" aria-pressed="${state.composerPanel === 'emoji'}">☺</button><button type="button" class="zq-social-tool-button zq-social-composer-more" data-action="toggle-more" aria-label="更多功能" aria-pressed="${state.composerPanel === 'more'}">+</button><button type="submit" class="zq-social-send">发送</button>`;
  }

  function renderComposerTools() {
    return '';
  }

  function renderMessages(partner) {
    const visibleMessages = state.messages.filter((message) => message?.status === 'APPROVED');
    const messages = visibleMessages.length
      ? visibleMessages.map((message) => {
        const entering = state.enteringMessageId && message.id === state.enteringMessageId;
        const content = `<div class="zq-social-bubble">${escapeHtml(message.body)}</div>`;
        return `<div class="zq-social-message ${message.senderId === currentUserId() ? 'mine' : ''} ${entering ? 'zq-social-message-enter' : ''}">${content}<span class="zq-social-message-time">${escapeHtml(formatTime(message.createdAt))}</span></div>`;
      }).join('')
      : '<div class="zq-social-placeholder">还没有消息，向这位笔友问个好吧。</div>';
    const draft = state.composerPartnerId === partner.id ? state.composerDraft : '';
    const toolPanel = state.composerPanel === 'emoji'
      ? renderEmojiPanel()
      : state.composerPanel === 'more'
        ? '<div class="zq-social-tool-panel zq-social-more-panel" role="region" aria-label="更多功能"></div>'
        : '';
    const composer = isFriendPartner(partner)
      ? `<form class="zq-social-composer" data-chat-form data-has-content="${draft.trim() ? 'true' : 'false'}"><div class="zq-social-composer-row"><input data-chat-composer maxlength="500" placeholder="写下想说的话" autocomplete="off" value="${escapeHtml(draft)}" />${renderComposerActions()}</div>${renderComposerTools()}${toolPanel}</form>`
      : '<div class="zq-social-request-note">双方成为好友后才能聊天</div>';
    return `<div class="zq-social-message-list">${messages}</div>${composer}`;
  }

  function isFriendPartner(partner) {
    if (!partner) return false;
    if (partner.isFriend === true || partner.mode === 'chat') return true;
    return state.friends.some((friend) => friend.student?.userId === partner.id
      || friend.student?.id === partner.id
      || (partner.publicProfileId && friend.student?.publicProfileId === partner.publicProfileId));
  }

  function currentUserId() {
    return session()?.user?.id || session()?.userId || '';
  }

  function showError(message) {
    state.error = message;
    const root = document.getElementById(ROOT_ID);
    if (!root) return;
    root.querySelector('.zq-social-error')?.remove();
    const error = document.createElement('div');
    error.className = 'zq-social-error';
    error.textContent = message;
    const panel = root.querySelector('.zq-social-panel');
    if (panel) panel.prepend(error);
  }

  async function loadOverview() {
    try {
      const [friends, conversations] = await Promise.all([
        api('/api/social/friends'),
        api('/api/chat/conversations'),
      ]);
      state.friends = friends || [];
      state.conversations = conversations || [];
      const root = ensureRoot();
      renderLauncher(root);
      if (state.open) renderPanel(root);
    } catch (error) {
      if (state.open) showError(error.message);
    }
  }

  async function searchUsers(query) {
    const searchRequestId = ++state.searchRequestId;
    state.searchQuery = query;
    state.error = '';
    state.searchResults = [];
    if (query.trim().length < 2) {
      state.loading = false;
      return;
    }
    state.loading = true;
    try {
      const results = await api(`/api/chat/users?q=${encodeURIComponent(query.trim())}`) || [];
      if (searchRequestId !== state.searchRequestId) return;
      state.searchResults = results;
    } catch (error) {
      if (searchRequestId !== state.searchRequestId) return;
      showError(error.message);
    } finally {
      if (searchRequestId !== state.searchRequestId) return;
      state.loading = false;
      if (state.open) renderPanel(ensureRoot());
    }
  }

  async function openConversation(partner, mode) {
    if (!isFriendPartner(partner)) {
      showError('双方成为好友后才能聊天');
      return;
    }
    const nextMode = 'chat';
    if (state.activePartner?.id !== partner.id) {
      state.composerDraft = '';
      state.composerPartnerId = partner.id;
      state.composerSelection = null;
    }
    state.activePartner = { ...partner, mode: nextMode, isFriend: nextMode === 'chat' || partner.isFriend === true };
    state.activeMode = nextMode;
    state.enteringMessageId = null;
    state.composerPanel = null;
    state.searchMode = false;
    state.messages = [];
    state.loading = true;
    renderPanel(ensureRoot());
    try {
      state.messages = await api(`/api/chat/conversations/${encodeURIComponent(partner.id)}/messages`) || [];
      await api(`/api/chat/conversations/${encodeURIComponent(partner.id)}/read`, { method: 'POST', body: '{}' });
      state.conversations = await api('/api/chat/conversations') || state.conversations;
      state.loading = false;
      renderLauncher(ensureRoot());
      renderPanel(ensureRoot());
    } catch (error) {
      state.loading = false;
      showError(error.message);
    }
  }

  async function addFriend(item) {
    if (!item.publicProfileId) return showError('该账号暂时无法发起好友申请');
    try {
      await api('/api/social/friend-requests/by-profile', {
        method: 'POST',
        body: JSON.stringify({ requestId: requestId(), publicProfileId: item.publicProfileId }),
      });
      showError('好友申请已发送，等对方接受后即可私聊');
      state.searchResults = state.searchResults.map((candidate) => candidate.id === item.id ? { ...candidate, pending: true } : candidate);
      renderPanel(ensureRoot());
    } catch (error) {
      showError(error.message);
    }
  }

  async function sendMessage(form) {
    if (!state.activePartner) return;
    const input = form.querySelector('[data-chat-composer]');
    const body = input?.value.trim() || '';
    if (!body) return;
    const submit = form.querySelector('button[type="submit"]');
    await sendMessageBody(body, { pendingButton: submit, clearDraft: true });
  }

  async function sendMessageBody(body, options = {}) {
    if (!state.activePartner || !body) return;
    if (!isFriendPartner(state.activePartner)) {
      showError('双方成为好友后才能聊天');
      return;
    }
    if (Array.from(body).length > 500) {
      showError('消息需为 1-500 个字符');
      return;
    }
    const pendingButton = options.pendingButton;
    if (pendingButton) pendingButton.disabled = true;
    try {
      const sentMessage = await api(`/api/chat/conversations/${encodeURIComponent(state.activePartner.id)}/messages`, {
        method: 'POST',
        body: JSON.stringify({ body, requestId: requestId() }),
      });
      if (options.clearDraft) {
        state.composerDraft = '';
        state.composerSelection = null;
        state.composerPanel = null;
      }
      state.messages = await api(`/api/chat/conversations/${encodeURIComponent(state.activePartner.id)}/messages`) || state.messages;
      state.conversations = await api('/api/chat/conversations') || state.conversations;
      state.enteringMessageId = sentMessage?.id || null;
      renderLauncher(ensureRoot());
      renderPanel(ensureRoot());
      state.enteringMessageId = null;
    } catch (error) {
      showError(error.message);
      if (pendingButton) pendingButton.disabled = false;
    }
  }

  function openPanel(searchMode) {
    state.open = true;
    state.searchMode = Boolean(searchMode);
    state.error = '';
    const root = ensureRoot();
    renderPanel(root);
    if (searchMode) root.querySelector('[data-chat-search]')?.focus();
    window.clearInterval(state.pollTimer);
    state.pollTimer = window.setInterval(async () => {
      if (!state.open) return;
      try {
        state.conversations = await api('/api/chat/conversations') || state.conversations;
        if (state.activePartner) state.messages = await api(`/api/chat/conversations/${encodeURIComponent(state.activePartner.id)}/messages`) || state.messages;
        renderLauncher(ensureRoot());
        renderPanel(ensureRoot());
      } catch {}
    }, 7000);
    loadOverview();
  }

  async function openChatForFriend(profileId, nickname) {
    const query = String(nickname || '').trim();
    openPanel(true);
    state.searchQuery = query;
    state.searchResults = [];
    state.loading = true;
    renderPanel(ensureRoot());
    try {
      const results = await api(`/api/chat/users?q=${encodeURIComponent(query)}`) || [];
      const item = results.find((candidate) => candidate.publicProfileId === profileId)
        || results.find((candidate) => candidate.nickname === query);
      if (!item) throw new Error('暂时找不到这位笔友的聊天入口，请稍后重试');
      await openConversation({
        id: item.id,
        username: item.username || '',
        nickname: item.nickname || query,
        avatarKey: item.avatarKey,
        isFriend: true,
      }, 'chat');
    } catch (error) {
      state.loading = false;
      showError(error.message);
      renderPanel(ensureRoot());
    }
  }

  function closePanel() {
    state.open = false;
    state.searchMode = false;
    state.composerPanel = null;
    window.clearInterval(state.pollTimer);
    state.pollTimer = null;
    document.getElementById(ROOT_ID)?.querySelector('.zq-social-backdrop')?.remove();
  }

  function handleClick(event) {
    const target = event.target instanceof Element ? event.target.closest('[data-action]') : null;
    if (!target) {
      if (event.target instanceof Element && event.target.closest('[data-chat-form]')) return;
      return;
    }
    const action = target.dataset.action;
    if (action === 'close') return closePanel();
    if (action === 'back-to-conversations') {
      state.activePartner = null;
      state.activeMode = 'chat';
      state.messages = [];
      state.error = '';
      state.searchMode = false;
      state.composerPanel = null;
      return renderPanel(ensureRoot());
    }
    if (action === 'open-search') return openPanel(true);
    if (action === 'open-inbox') return openPanel(false);
    if (action === 'toggle-search') {
      state.composerPanel = null;
      state.searchMode = !state.searchMode;
      renderPanel(ensureRoot());
      if (state.searchMode) document.querySelector('[data-chat-search]')?.focus();
      return;
    }
    if (action === 'open-conversation') {
      const item = state.conversations.find((candidate) => candidate.partnerId === target.dataset.userId);
      if (!item) return;
      if (state.activePartner?.id === item.partnerId) {
        state.activePartner = null;
        state.activeMode = 'chat';
        state.messages = [];
        state.error = '';
        state.composerPanel = null;
        return renderPanel(ensureRoot());
      }
      return openConversation({ id: item.partnerId, username: item.username, nickname: item.nickname, avatarKey: item.avatarKey, status: item.status, requestedBy: item.requestedBy, isFriend: item.isFriend }, 'chat');
    }
    if (action === 'add-result') {
      const item = state.searchResults.find((candidate) => candidate.id === target.dataset.userId);
      if (item) return addFriend(item);
    }
    if (action === 'open-result-chat') {
      const item = state.searchResults.find((candidate) => candidate.id === target.dataset.userId);
      if (item) return openConversation({ id: item.id, username: item.username || '', nickname: item.nickname || '', avatarKey: item.avatarKey, isFriend: true }, 'chat');
      showError('请重新搜索后再开始聊天');
    }
    if (action === 'toggle-emoji' || action === 'toggle-more') {
      if (!state.composerPanel) captureComposerDraft();
      const nextPanel = action === 'toggle-emoji' ? 'emoji' : 'more';
      state.composerPanel = state.composerPanel === nextPanel ? null : nextPanel;
      return renderPanel(ensureRoot());
    }
    if (action === 'insert-emoji') {
      insertEmoji(target.dataset.emoji || '');
      return;
    }
  }

  function captureComposerDraft() {
    const input = document.getElementById(ROOT_ID)?.querySelector('[data-chat-composer]');
    if (!(input instanceof HTMLInputElement)) return;
    state.composerDraft = input.value;
    state.composerPartnerId = state.activePartner?.id || null;
    state.composerSelection = {
      start: input.selectionStart ?? input.value.length,
      end: input.selectionEnd ?? input.value.length,
    };
  }

  function insertEmoji(emoji) {
    if (!emoji || !state.activePartner) return;
    const draft = state.composerPartnerId === state.activePartner.id ? state.composerDraft : '';
    const start = Math.min(state.composerSelection?.start ?? draft.length, draft.length);
    const end = Math.min(state.composerSelection?.end ?? start, draft.length);
    const nextDraft = Array.from(`${draft.slice(0, start)}${emoji}${draft.slice(end)}`).slice(0, 500).join('');
    const nextPosition = Math.min(start + emoji.length, nextDraft.length);
    state.composerDraft = nextDraft;
    state.composerPartnerId = state.activePartner.id;
    state.composerSelection = { start: nextPosition, end: nextPosition };
    renderPanel(ensureRoot());
  }

  function handleInput(event) {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;
    if (input.matches('[data-chat-composer]')) {
      state.composerDraft = input.value;
      state.composerPartnerId = state.activePartner?.id || null;
      state.composerSelection = { start: input.selectionStart, end: input.selectionEnd };
      const form = input.closest('[data-chat-form]');
      if (form) form.dataset.hasContent = input.value.trim() ? 'true' : 'false';
      return;
    }
    if (!input.matches('[data-chat-search]')) return;
    state.searchQuery = input.value;
    window.clearTimeout(state.searchTimer);
    state.searchTimer = window.setTimeout(() => searchUsers(state.searchQuery), 260);
  }

  function handleFocusIn(event) {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || !input.matches('[data-chat-composer]') || !state.composerPanel) return;
    state.composerPanel = null;
    renderPanel(ensureRoot());
  }

  function handleKeydown(event) {
    if (event.key !== 'Escape' || !state.open) return;
    if (state.composerPanel) {
      state.composerPanel = null;
      renderPanel(ensureRoot());
      return;
    }
    closePanel();
  }

  function handleSubmit(event) {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || !form.matches('[data-chat-form]')) return;
    event.preventDefault();
    sendMessage(form);
  }

  function syncRoute() {
    const root = document.getElementById(ROOT_ID);
    if (!isSocialRoute()) {
      if (root) root.remove();
      closePanel();
      return;
    }
    installStyles();
    const nextRoot = ensureRoot();
    renderLauncher(nextRoot);
    loadOverview();
  }

  globalThis.__zqOpenSocialSearch = () => openPanel(true);
  globalThis.__zqOpenSocialChatForProfile = openChatForFriend;

  document.addEventListener('submit', handleSubmit, true);
  window.addEventListener('popstate', syncRoute);
  window.addEventListener('zqroutechange', syncRoute);
  for (const method of ['pushState', 'replaceState']) {
    const original = history[method];
    history[method] = function (...args) {
      const result = original.apply(this, args);
      window.dispatchEvent(new Event('zqroutechange'));
      return result;
    };
  }
  syncRoute();
})();
