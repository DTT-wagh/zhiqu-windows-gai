(() => {
  const PRESENCE_RUNTIME_KEY = '__zqMagicFriendPresenceRuntimeV1';
  const PRESENCE_INTERVAL_MS = 25_000;
  const SESSION_KEY = 'zhiqu.auth.session.v1';
  const RETURN_STATE_KEY = 'zhiqu.magic.return.v1';
  let accountRefreshPromise = null;

  const apiBase = () => String(globalThis.__ZHIQU_API_BASE_URL || 'http://localhost:8080').replace(/\/+$/, '');

  const session = () => {
    try {
      return JSON.parse(globalThis.localStorage?.getItem(SESSION_KEY) || 'null');
    } catch {
      return null;
    }
  };

  const accessToken = () => session()?.accessToken || '';

  const refreshAccountSession = async (currentSession) => {
    if (!currentSession?.refreshToken) return null;
    if (!accountRefreshPromise) {
      accountRefreshPromise = (async () => {
        try {
          const response = await globalThis.fetch(`${apiBase()}/api/auth/refresh`, {
            method: 'POST',
            headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken: currentSession.refreshToken }),
          });
          if (!response.ok) return null;
          const nextSession = await response.json();
          if (!nextSession?.accessToken) return null;
          globalThis.localStorage?.setItem(SESSION_KEY, JSON.stringify(nextSession));
          return nextSession;
        } catch {
          return null;
        } finally {
          accountRefreshPromise = null;
        }
      })();
    }
    return accountRefreshPromise;
  };

  const accountRequest = async (path, retryAfterRefresh = true) => {
    const currentSession = session();
    if (!currentSession?.accessToken) throw new Error('请先登录');
    const response = await globalThis.fetch(`${apiBase()}${path}`, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${currentSession.accessToken}` },
    });
    if (response.status === 401 && retryAfterRefresh) {
      const nextSession = await refreshAccountSession(currentSession);
      if (nextSession?.accessToken) return accountRequest(path, false);
    }
    const raw = await response.text();
    let payload = null;
    try { payload = raw ? JSON.parse(raw) : null; } catch { payload = raw; }
    if (!response.ok) throw new Error(payload?.message || payload?.error || '账号信息暂时无法同步');
    return payload;
  };

  const requestId = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;

  const magicRoute = () => {
    const parts = globalThis.location.pathname.split('/').filter(Boolean);
    return parts[0] === 'magic' && parts.length <= 2;
  };

  const activeRoomId = () => {
    const parts = globalThis.location.pathname.split('/').filter(Boolean);
    return parts[0] === 'magic' && parts.length === 2 ? parts[1] : null;
  };

  const ensurePresenceRuntime = () => {
    if (globalThis[PRESENCE_RUNTIME_KEY]) return globalThis[PRESENCE_RUNTIME_KEY];
    const heartbeat = async () => {
      if (!magicRoute() || !accessToken()) return;
      try {
        await globalThis.fetch(`${apiBase()}/api/magic/friends/presence`, {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken()}`,
          },
          body: JSON.stringify({ activeRoomId: activeRoomId() }),
        });
      } catch {
        // Presence is best-effort and must not interrupt a live game.
      }
    };
    globalThis[PRESENCE_RUNTIME_KEY] = {
      heartbeat,
      timer: globalThis.setInterval(heartbeat, PRESENCE_INTERVAL_MS),
    };
    heartbeat();
    return globalThis[PRESENCE_RUNTIME_KEY];
  };

  const boot = () => {
    if (globalThis.location.pathname !== '/magic') return;
    const root = document.getElementById('root');
    if (!root || root.querySelector('[data-magic-reference-shell]')) return;

    const assetRoot = '/assets/figma-magic';
    const shell = document.createElement('div');
    shell.setAttribute('data-magic-reference-shell', 'true');
    shell.classList.add('is-entering');
    shell.innerHTML = `
      <div class="magic-ref-stage">
        <img class="magic-ref-sign" src="/assets/assets/images/zhaopai.png" alt="共学社">

        <section class="magic-ref-profile" aria-label="正在同步账号信息" aria-busy="true">
          <img class="magic-ref-profile-banner" src="${assetRoot}/profile-banner.png" alt="">
          <div class="magic-ref-avatar-wrap">
            <span class="magic-ref-avatar-fallback" aria-hidden="true" style="--avatar-background:#DCE8F5;--avatar-foreground:#365c8d">
              <svg viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="3"></circle>
                <circle cx="19" cy="5" r="2"></circle>
                <circle cx="5" cy="19" r="2"></circle>
                <path d="M10.4 21.9a10 10 0 0 0 9.5-9.5M21.9 10.4a10 10 0 0 0-9.5-9.5M2.1 13.6a10 10 0 0 0 9.5 9.5M13.6 2.1a10 10 0 0 0-9.5 9.5"></path>
              </svg>
            </span>
            <img class="magic-ref-avatar" alt="" hidden>
          </div>
          <div class="magic-ref-profile-copy">
            <div class="magic-ref-profile-name">--</div>
            <div class="magic-ref-profile-xp">--</div>
            <div class="magic-ref-profile-progress">
              <img class="magic-ref-profile-star" src="${assetRoot}/star-small.png" alt="">
              <div class="magic-ref-xp-bar" role="progressbar" aria-label="本级经验进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"></div>
              <img class="magic-ref-profile-coin" src="${assetRoot}/coin.png" alt="">
            </div>
          </div>
        </section>

        <aside class="magic-ref-left" aria-label="玩家菜单">
          <div class="magic-ref-stat">
            <div class="magic-ref-label">我的星星</div>
            <div class="magic-ref-stars"><img src="${assetRoot}/star-large.png" alt=""><span>--</span></div>
            <img class="magic-ref-mascot" src="${assetRoot}/mascot.png" alt="绿色吉祥物">
          </div>
          <button class="magic-ref-tool magic-ref-tool--settings" type="button" data-action="settings">
            <img src="${assetRoot}/treasure.png" alt=""><span>设置</span>
          </button>
          <button class="magic-ref-tool magic-ref-tool--ranking" type="button" data-action="ranking">
            <img src="${assetRoot}/trophy.png" alt=""><span>排行榜</span>
          </button>
        </aside>

        <main class="magic-ref-main">
          <img class="magic-ref-main-card" src="${assetRoot}/main-card.png" alt="画里藏词：找出藏在图中的隐藏线索">
          <button class="magic-ref-exit" type="button" data-action="exit" aria-label="退出大厅" title="返回">
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
              <path d="M19 12H5"></path>
              <path d="m12 19-7-7 7-7"></path>
            </svg>
          </button>
          <button class="magic-ref-start" type="button" data-action="start" aria-label="开始游戏">开始游戏</button>
          <div class="magic-ref-feedback" data-magic-feedback role="alert" aria-live="polite" hidden></div>
        </main>

        <aside class="magic-ref-rooms" aria-label="房间列表">
          <img class="magic-ref-rooms-art" src="${assetRoot}/rooms-panel.png" alt="">
          <div class="magic-ref-room-list" aria-live="polite"></div>
          <button class="magic-ref-create-hotspot" type="button" data-action="create" aria-label="创建房间">
            <span class="magic-ref-create-icon" aria-hidden="true">&#9733;</span>
            <span class="magic-ref-create-label">创建房间</span>
          </button>
        </aside>
      </div>`;

    const style = document.createElement('link');
    const referenceStylesheet = document.querySelector('link[href="/magic-reference.css"]');
    if (!referenceStylesheet) {
      style.rel = 'stylesheet';
      style.href = '/magic-reference.css';
      document.head.appendChild(style);
    }
    root.appendChild(shell);
    document.getElementById('zq-magic-route-prepaint')?.remove();
    globalThis.__zqMagicEntryTransitionRuntimeV2?.complete?.();
    const entryAnimationTimer = globalThis.setTimeout(() => shell.classList.remove('is-entering'), 760);

    const roomsPanel = shell.querySelector('.magic-ref-rooms');
    const roomList = shell.querySelector('.magic-ref-room-list');
    const startButton = shell.querySelector('.magic-ref-start');
    const profilePanel = shell.querySelector('.magic-ref-profile');
    const profileName = shell.querySelector('.magic-ref-profile-name');
    const profileXp = shell.querySelector('.magic-ref-profile-xp');
    const profileAvatar = shell.querySelector('.magic-ref-avatar');
    const profileAvatarFallback = shell.querySelector('.magic-ref-avatar-fallback');
    const profileXpBar = shell.querySelector('.magic-ref-xp-bar');
    const starTotal = shell.querySelector('.magic-ref-stars span');
    const feedback = shell.querySelector('[data-magic-feedback]');
    const state = { rooms: [], error: '', loading: false, starting: false, exiting: false };
    const syncFeedback = () => {
      if (!feedback) return;
      const message = String(state.error || '').trim();
      feedback.textContent = message;
      feedback.hidden = !message;
    };

    const readReturnState = () => {
      try {
        const value = JSON.parse(globalThis.sessionStorage?.getItem(RETURN_STATE_KEY) || 'null');
        const isFresh = Number.isFinite(value?.createdAt) && Date.now() - value.createdAt < 15 * 60_000;
        const isCommunityGames = typeof value?.url === 'string' && /^\/community(?:\?[^#]*)?$/.test(value.url);
        const hasHistoryPosition = Number.isInteger(value?.historyLength) && value.historyLength > 0;
        return isFresh && isCommunityGames && hasHistoryPosition ? value : null;
      } catch {
        return null;
      }
    };

    const exitLobby = () => {
      if (state.exiting) return;
      state.exiting = true;
      const exitCover = document.createElement('div');
      exitCover.className = 'magic-ref-exit-cover';
      exitCover.setAttribute('aria-hidden', 'true');
      document.body.appendChild(exitCover);
      shell.classList.add('is-exiting');
      document.body?.setAttribute('data-zq-magic-exiting', '');

      const returnState = readReturnState();
      try {
        globalThis.sessionStorage?.removeItem(RETURN_STATE_KEY);
      } catch {}
      const reduceMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      globalThis.setTimeout(() => {
        try {
          globalThis.screen?.orientation?.unlock?.();
        } catch {}
        const returnDelta = returnState ? returnState.historyLength - globalThis.history.length : 0;
        if (returnState && returnDelta < 0 && returnDelta >= -20) {
          globalThis.history.go(returnDelta);
          return;
        }
        globalThis.location.replace(returnState?.url || '/community?section=games');
      }, reduceMotion ? 100 : 420);
    };
    const listedRooms = new Map();
    let accountLoadingPromise = null;

    const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;',
    }[character]));

    const UPLOADED_AVATAR_KEY = /^[0-9a-fA-F]{32}$/;
    const avatarPresets = {
      'indigo-orbit': { background: '#DCE8F5', foreground: '#365c8d', icon: 'orbit' },
      'matcha-bot': { background: '#DCEEDB', foreground: '#668552', icon: 'bot' },
      'mustard-spark': { background: '#F5E7B8', foreground: '#987015', icon: 'sparkles' },
      'vermilion-palette': { background: '#F5DCD5', foreground: '#B84E42', icon: 'palette' },
      'violet-brain': { background: '#E8DDF1', foreground: '#75568D', icon: 'brain' },
      'steel-compass': { background: '#D8E3E5', foreground: '#4D6B80', icon: 'compass' },
    };

    const avatarPreset = (avatarKey) => avatarPresets[String(avatarKey || '')] || avatarPresets['indigo-orbit'];

    const avatarIcon = (name) => ({
      orbit: '<circle cx="12" cy="12" r="3"></circle><circle cx="19" cy="5" r="2"></circle><circle cx="5" cy="19" r="2"></circle><path d="M10.4 21.9a10 10 0 0 0 9.5-9.5M21.9 10.4a10 10 0 0 0-9.5-9.5M2.1 13.6a10 10 0 0 0 9.5 9.5M13.6 2.1a10 10 0 0 0-9.5 9.5"></path>',
      bot: '<rect x="3" y="8" width="18" height="12" rx="2"></rect><path d="M12 4v4M8 12h.01M16 12h.01M9 16h6"></path><circle cx="12" cy="3" r="1"></circle>',
      sparkles: '<path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z"></path>',
      palette: '<circle cx="13.5" cy="6.5" r=".5" fill="currentColor"></circle><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"></circle><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"></circle><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"></circle><path d="M12 2a10 10 0 0 0 0 20c1.1 0 2-.9 2-2 0-.5-.2-1-.6-1.4-.4-.4-.6-.9-.6-1.4a2 2 0 0 1 2-2H17a5 5 0 0 0 5-5C22 5.7 17.5 2 12 2z"></path>',
      brain: '<path d="M9.5 4.5A3 3 0 0 0 4 6a3 3 0 0 0-1 5.8A3 3 0 0 0 5 17a3 3 0 0 0 5 2.2V5.5a3 3 0 0 0-.5-1zM14.5 4.5A3 3 0 0 1 20 6a3 3 0 0 1 1 5.8 3 3 0 0 1-2 5.2 3 3 0 0 1-5 2.2V5.5a3 3 0 0 1 .5-1zM6 9h4M14 9h4M6 14h4M14 14h4"></path>',
      compass: '<circle cx="12" cy="12" r="10"></circle><path d="m16 8-2.5 5.5L8 16l2.5-5.5z"></path>',
    }[name] || '');

    const applyProfileFallback = (avatarKey) => {
      const preset = avatarPreset(avatarKey);
      profileAvatarFallback.style.setProperty('--avatar-background', preset.background);
      profileAvatarFallback.style.setProperty('--avatar-foreground', preset.foreground);
      profileAvatarFallback.innerHTML = `<svg viewBox="0 0 24 24" fill="none">${avatarIcon(preset.icon)}</svg>`;
    };

    const requestHeaders = () => {
      const token = accessToken();
      return token ? { Accept: 'application/json', Authorization: `Bearer ${token}` } : { Accept: 'application/json' };
    };

    const api = async (path, options = {}, retryAfterRefresh = true) => {
      const currentSession = session();
      const response = await globalThis.fetch(`${apiBase()}${path}`, {
        ...options,
        headers: { ...requestHeaders(), ...(options.headers || {}) },
      });
      const raw = await response.text();
      let payload = null;
      try { payload = raw ? JSON.parse(raw) : null; } catch { payload = raw; }
      if (response.status === 401 && retryAfterRefresh) {
        const nextSession = await refreshAccountSession(currentSession);
        if (nextSession?.accessToken) return api(path, options, false);
      }
      if (!response.ok) {
        const error = new Error(payload?.message || payload?.error || '请求暂时未完成');
        error.status = response.status;
        throw error;
      }
      return payload;
    };

    const renderAccount = (user, summary) => {
      const nickname = String(user?.nickname || user?.username || '').trim();
      const numberValue = (value) => value !== null && value !== '' && Number.isFinite(Number(value)) ? Number(value) : null;
      const totalXp = numberValue(summary?.totalXp);
      const currentLevelXp = numberValue(summary?.currentLevelXp);
      const hasMaxLevel = summary && summary.nextLevelXp === null;
      const nextLevelXp = hasMaxLevel ? null : numberValue(summary?.nextLevelXp);
      const progress = hasMaxLevel
        ? 100
        : currentLevelXp === null || nextLevelXp === null
          ? 0
          : Math.max(0, Math.min(100, Math.round(currentLevelXp / Math.max(1, nextLevelXp) * 100)));

      profileName.textContent = nickname || '--';
      profileXp.textContent = currentLevelXp === null
        ? '--'
        : hasMaxLevel
          ? `${currentLevelXp}/已满级`
          : nextLevelXp === null ? '--' : `${currentLevelXp}/${nextLevelXp}`;
      starTotal.textContent = totalXp === null ? '--' : String(totalXp);
      profilePanel.style.setProperty('--magic-profile-progress', `${progress}%`);
      profileXpBar.setAttribute('aria-valuenow', String(progress));

      const avatarKey = String(user?.avatarKey || '').trim();
      const showAvatarFallback = () => {
        profileAvatar.dataset.expectedSrc = '';
        profileAvatar.hidden = true;
        profileAvatar.removeAttribute('src');
        profileAvatar.alt = '';
        applyProfileFallback(avatarKey);
        profileAvatarFallback.hidden = false;
      };
      showAvatarFallback();
      if (UPLOADED_AVATAR_KEY.test(avatarKey)) {
        const avatarSource = `${apiBase()}/api/social/avatars/${encodeURIComponent(avatarKey)}`;
        profileAvatar.dataset.expectedSrc = avatarSource;
        profileAvatar.onload = () => {
          if (profileAvatar.dataset.expectedSrc !== avatarSource) return;
          profileAvatar.hidden = false;
          profileAvatarFallback.hidden = true;
        };
        profileAvatar.onerror = () => {
          if (profileAvatar.dataset.expectedSrc === avatarSource) showAvatarFallback();
        };
        profileAvatar.alt = nickname ? `${nickname}的头像` : '我的头像';
        profileAvatar.src = avatarSource;
      }

      profilePanel.setAttribute('aria-label', nickname
        ? hasMaxLevel
          ? `${nickname}，总经验 ${totalXp ?? '--'}，本级经验 ${currentLevelXp ?? '--'}，已达最高等级`
          : `${nickname}，总经验 ${totalXp ?? '--'}，本级经验 ${currentLevelXp ?? '--'} / ${nextLevelXp ?? '--'}`
        : '账号信息暂不可用');
    };

    const refreshAccount = () => {
      if (accountLoadingPromise) return accountLoadingPromise;
      const requestedToken = accessToken();
      if (!requestedToken) {
        renderAccount(null, null);
        profilePanel.setAttribute('aria-busy', 'false');
        return Promise.resolve();
      }
      profilePanel.setAttribute('aria-busy', 'true');
      accountLoadingPromise = Promise.all([
          accountRequest('/api/users/me'),
          accountRequest('/api/rewards/summary'),
      ]).then(([user, summary]) => {
        if (accessToken() === requestedToken) renderAccount(user, summary);
      }).catch(() => {
        if (profileName.textContent === '--') renderAccount(null, null);
      }).finally(() => {
        profilePanel.setAttribute('aria-busy', 'false');
        accountLoadingPromise = null;
        if (accessToken() !== requestedToken) refreshAccount();
      });
      return accountLoadingPromise;
    };

    const roomIsJoinable = (room) => {
      const playerCount = Number(room?.playerCount ?? 0);
      const maxPlayers = Number(room?.maxPlayers ?? 2);
      const expiresAt = room?.expiresAt ? Date.parse(room.expiresAt) : Number.NaN;
      return room?.gameCode === 'MAGIC'
        && room?.status === 'OPEN'
        && room?.joinable !== false
        && Number.isFinite(playerCount)
        && Number.isFinite(maxPlayers)
        && playerCount < maxPlayers
        && (!Number.isFinite(expiresAt) || expiresAt > Date.now());
    };

    const roomNumber = (room) => String(room?.roomNumber || room?.inviteCode || room?.roomId || room?.id || '').slice(-6);

    const renderRooms = (rooms) => {
      const visibleRooms = rooms.slice(0, 3);
      state.rooms = visibleRooms;
      listedRooms.clear();
      visibleRooms.forEach((room) => listedRooms.set(String(room.id), room));
      roomsPanel.classList.toggle('is-live', visibleRooms.length > 0);
      roomList.innerHTML = visibleRooms.map((room) => {
        const playerCount = Number(room.playerCount ?? 0);
        const maxPlayers = Number(room.maxPlayers ?? 2);
        return `<div class="magic-ref-room"><div class="magic-ref-room-name">房间 ${escapeHtml(roomNumber(room))}</div><div class="magic-ref-room-meta"><span>${playerCount} / ${maxPlayers} 人</span><button class="magic-ref-room-action" type="button" data-action="join" data-listing-id="${escapeHtml(room.id)}">加入</button></div></div>`;
      }).join('');
    };

    const refreshRooms = async () => {
      if (!accessToken()) {
        renderRooms([]);
        return;
      }
      state.loading = true;
      try {
        const payload = await api('/api/community/game-listings?gameCode=MAGIC');
        state.error = '';
        syncFeedback();
        renderRooms((Array.isArray(payload?.items) ? payload.items : []).filter(roomIsJoinable));
      } catch (error) {
        state.error = error.message || '房间列表暂时无法刷新';
        syncFeedback();
        renderRooms([]);
      } finally {
        state.loading = false;
      }
    };

    const joinRoom = async (button) => {
      const room = listedRooms.get(button?.dataset.listingId || '');
      if (!room || button.disabled) return;
      button.disabled = true;
      button.textContent = '加入中';
      try {
        const joinedRoom = await api(`/api/community/game-listings/${encodeURIComponent(room.id)}/join`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ requestId: requestId() }),
        });
        const joinedRoomId = joinedRoom?.roomId || room.roomId;
        if (!joinedRoomId) throw new Error('房间暂时无法加入');
        if (globalThis.__zqOpenMagicRoom) {
          globalThis.__zqOpenMagicRoom(joinedRoomId);
        } else {
          globalThis.location.assign(`/magic/${encodeURIComponent(joinedRoomId)}`);
        }
      } catch {
        button.disabled = false;
        button.textContent = '加入';
        state.error = '房间暂时无法加入，请刷新后重试';
        syncFeedback();
        refreshRooms();
      }
    };

    const startGame = async () => {
      if (state.starting) return;
      if (!accessToken()) {
        globalThis.location.assign('/login?next=%2Fmagic');
        return;
      }
      state.starting = true;
      startButton.disabled = true;
      startButton.setAttribute('aria-label', '正在开始游戏');
      shell.classList.add('is-starting-game');
      state.error = '';
      syncFeedback();
      try {
        let room = null;
        try {
          room = await api('/api/magic-game-rooms/active');
        } catch (error) {
          if (![404, 204].includes(Number(error?.status))) throw error;
        }
        if (!room?.id) {
          const createId = requestId();
          room = await api('/api/magic-game-rooms', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Request-Id': createId },
            body: JSON.stringify({ requestId: createId }),
          });
        }
        if (!room?.id) throw new Error('暂时无法进入游戏，请稍后重试');
        if (globalThis.__zqOpenMagicRoom) {
          globalThis.__zqOpenMagicRoom(room.id);
        } else {
          globalThis.location.assign(`/magic/${encodeURIComponent(room.id)}`);
        }
      } catch (error) {
        state.starting = false;
        startButton.disabled = false;
        startButton.setAttribute('aria-label', '开始游戏');
        shell.classList.remove('is-starting-game');
        state.error = error.message || '暂时无法进入游戏，请稍后重试';
        syncFeedback();
      }
    };

    renderRooms([]);
    refreshAccount();
    refreshRooms();
    const roomRefreshTimer = globalThis.setInterval(refreshRooms, 5_000);
    const accountRefreshTimer = globalThis.setInterval(refreshAccount, 30_000);
    const refreshOnFocus = () => {
      refreshAccount();
      refreshRooms();
    };
    const refreshOnVisibility = () => {
      if (document.visibilityState === 'visible') refreshOnFocus();
    };
    const refreshOnStorage = (event) => {
      if (event.key !== SESSION_KEY) return;
      renderAccount(null, null);
      refreshAccount();
      refreshRooms();
    };
    globalThis.addEventListener('focus', refreshOnFocus);
    document.addEventListener('visibilitychange', refreshOnVisibility);
    globalThis.addEventListener('storage', refreshOnStorage);

    shell.addEventListener('click', (event) => {
      const actionNode = event.target.closest('[data-action]');
      const action = actionNode?.dataset.action;
      if (action === 'start' || action === 'create') startGame();
      if (action === 'join') joinRoom(actionNode);
      if (action === 'settings') globalThis.location.assign('/settings');
      if (action === 'ranking') globalThis.location.assign('/rewards');
      if (action === 'exit') exitLobby();
    });

    const cleanup = () => {
      if (globalThis.location.pathname !== '/magic') {
        shell.remove();
        document.body?.removeAttribute('data-zq-magic-exiting');
        document.body?.removeAttribute('data-zq-magic-lobby');
        const exitCover = document.querySelector('.magic-ref-exit-cover');
        if (exitCover) {
          exitCover.classList.add('is-leaving');
          globalThis.setTimeout(() => exitCover.remove(), 180);
        }
        if (!referenceStylesheet) style.remove();
        if (!globalThis.location.pathname.startsWith('/magic/')) {
          document.body?.removeAttribute('data-zq-magic-landscape');
        }
        clearInterval(roomRefreshTimer);
        clearInterval(accountRefreshTimer);
        clearInterval(routeTimer);
        globalThis.clearTimeout(entryAnimationTimer);
        globalThis.removeEventListener('focus', refreshOnFocus);
        globalThis.removeEventListener('popstate', cleanup);
        document.removeEventListener('visibilitychange', refreshOnVisibility);
        globalThis.removeEventListener('storage', refreshOnStorage);
      }
    };
    const routeTimer = globalThis.setInterval(cleanup, 300);
    globalThis.addEventListener('popstate', cleanup);
  };

  if (document.readyState === 'loading') {
    globalThis.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
  globalThis.setInterval(() => {
    if (globalThis.location.pathname === '/magic') boot();
  }, 200);
  const hideLegacyRoom = () => {
    const id = 'zq-magic-room-reference-pending-style';
    if (document.getElementById(id)) return;
    const style = document.createElement('style');
    style.id = id;
    style.textContent = 'html[data-zq-magic-room-reference-pending] #root > *:not([data-magic-room-reference-shell]) { visibility: hidden !important; }';
    document.head.appendChild(style);
  };
  const ensureRoomOverlay = () => {
    const parts = globalThis.location.pathname.split('/').filter(Boolean);
    const isRoomRoute = parts.length === 2 && parts[0] === 'magic';
    if (!isRoomRoute) return;
    hideLegacyRoom();
    document.documentElement?.setAttribute('data-zq-magic-room-reference-pending', '');
    document.body?.setAttribute('data-zq-magic-room-reference', '');
    const currentRuntime = globalThis.__zqMagicRoomReferenceRuntimeV4;
    if (currentRuntime) {
      currentRuntime.ensure?.();
      return;
    }
    if (document.querySelector('[data-zq-magic-room-reference-loader]')) return;
    const script = document.createElement('script');
    script.src = '/magic-room-reference.js';
    script.dataset.zqMagicRoomReferenceLoader = 'true';
    script.addEventListener('error', () => {
      script.remove();
      document.body?.removeAttribute('data-zq-magic-room-reference');
      document.documentElement?.removeAttribute('data-zq-magic-room-reference-pending');
    }, { once: true });
    document.body.appendChild(script);
  };
  globalThis.setInterval(ensureRoomOverlay, 100);
  ensurePresenceRuntime();
})();
