(() => {
  const boot = () => {
    if (globalThis.location.pathname !== '/magic') return;
    const root = document.getElementById('root');
    if (!root || root.querySelector('[data-magic-reference-shell]')) return;

    const assetRoot = '/assets/figma-magic';
    const shell = document.createElement('div');
    shell.setAttribute('data-magic-reference-shell', 'true');
    shell.innerHTML = `
      <div class="magic-ref-stage">
        <img class="magic-ref-sign" src="/assets/assets/images/zhaopai.png" alt="共学社">

        <section class="magic-ref-profile" aria-label="小画家，经验 20205 / 100000">
          <img class="magic-ref-profile-banner" src="${assetRoot}/profile-banner.png" alt="">
          <div class="magic-ref-avatar-wrap">
            <img class="magic-ref-avatar" src="${assetRoot}/avatar-dog.png" alt="小画家的头像">
          </div>
          <div class="magic-ref-profile-copy">
            <div class="magic-ref-profile-name">小画家</div>
            <div class="magic-ref-profile-xp">20205/100000</div>
            <div class="magic-ref-profile-progress" aria-hidden="true">
              <img class="magic-ref-profile-star" src="${assetRoot}/star-small.png" alt="">
              <div class="magic-ref-xp-bar"></div>
              <img class="magic-ref-profile-coin" src="${assetRoot}/coin.png" alt="">
            </div>
          </div>
        </section>

        <aside class="magic-ref-left" aria-label="玩家菜单">
          <div class="magic-ref-stat">
            <div class="magic-ref-label">我的星星</div>
            <div class="magic-ref-stars"><img src="${assetRoot}/star-large.png" alt=""><span>1258</span></div>
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
          <button class="magic-ref-start" type="button" data-action="start" aria-label="开始游戏">开始游戏</button>
        </main>

        <aside class="magic-ref-rooms" aria-label="房间列表">
          <img class="magic-ref-rooms-art" src="${assetRoot}/rooms-panel.png" alt="">
          <div class="magic-ref-room-list" aria-live="polite"></div>
          <button class="magic-ref-create-hotspot" type="button" data-action="create" aria-label="创建房间">创建房间</button>
        </aside>
      </div>`;

    const style = document.createElement('link');
    style.rel = 'stylesheet';
    style.href = '/magic-reference.css';
    document.head.appendChild(style);
    root.appendChild(shell);

    const roomsPanel = shell.querySelector('.magic-ref-rooms');
    const roomList = shell.querySelector('.magic-ref-room-list');
    const listedRooms = new Map();

    const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;',
    }[character]));

    const apiBase = () => String(globalThis.__ZHIQU_API_BASE_URL || 'http://localhost:8080').replace(/\/+$/, '');

    const accessToken = () => {
      try {
        return JSON.parse(globalThis.localStorage?.getItem('zhiqu.auth.session.v1') || 'null')?.accessToken || '';
      } catch {
        return '';
      }
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

    const renderRooms = (rooms) => {
      const visibleRooms = rooms.slice(0, 3);
      listedRooms.clear();
      visibleRooms.forEach((room) => listedRooms.set(String(room.id), room));
      roomsPanel.classList.toggle('is-live', visibleRooms.length > 0);
      roomList.innerHTML = visibleRooms.map((room) => {
        const playerCount = Number(room.playerCount ?? 0);
        const maxPlayers = Number(room.maxPlayers ?? 2);
        const hostName = String(room.host?.nickname || '').trim();
        const roomName = hostName ? `${hostName}的房间` : `房间 ${String(room.roomId || room.id).slice(-6)}`;
        return `<div class="magic-ref-room"><div class="magic-ref-room-name">${escapeHtml(roomName)}</div><div class="magic-ref-room-meta"><span>${playerCount} / ${maxPlayers} 人</span><button class="magic-ref-room-action" type="button" data-action="join" data-listing-id="${escapeHtml(room.id)}">加入</button></div></div>`;
      }).join('');
    };

    const requestHeaders = () => {
      const token = accessToken();
      return token ? { Accept: 'application/json', Authorization: `Bearer ${token}` } : { Accept: 'application/json' };
    };

    const refreshRooms = async () => {
      if (!accessToken()) {
        renderRooms([]);
        return;
      }

      try {
        const response = await globalThis.fetch(`${apiBase()}/api/community/game-listings?gameCode=MAGIC`, { headers: requestHeaders() });
        if (!response.ok) throw new Error('Unable to load public magic rooms');
        const payload = await response.json();
        renderRooms((Array.isArray(payload?.items) ? payload.items : []).filter(roomIsJoinable));
      } catch {
        renderRooms([]);
      }
    };

    const joinRoom = async (button) => {
      if (!button) return;
      const room = listedRooms.get(button.dataset.listingId || '');
      if (!room) return;

      button.disabled = true;
      button.textContent = '加入中';
      try {
        const response = await globalThis.fetch(`${apiBase()}/api/community/game-listings/${encodeURIComponent(room.id)}/join`, {
          method: 'POST',
          headers: { ...requestHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ requestId: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}` }),
        });
        if (!response.ok) throw new Error('Unable to join public magic room');
        const joinedRoom = await response.json();
        const roomId = joinedRoom?.roomId || room.roomId;
        if (roomId) globalThis.location.assign(`/magic/${encodeURIComponent(roomId)}`);
      } catch {
        button.disabled = false;
        button.textContent = '加入';
        refreshRooms();
      }
    };

    const findReactButton = (pattern) => [...document.querySelectorAll('[role="button"],button')]
      .find((button) => !shell.contains(button) && pattern.test(button.textContent || ''));

    const createRoom = () => findReactButton(/创建看图挑战|创建房间/)?.click();

    renderRooms([]);
    refreshRooms();
    const roomRefreshTimer = globalThis.setInterval(refreshRooms, 5000);

    shell.addEventListener('click', (event) => {
      const actionNode = event.target.closest('[data-action]');
      const action = actionNode?.dataset.action;
      if (action === 'start' || action === 'create') createRoom();
      if (action === 'join') joinRoom(actionNode);
      if (action === 'settings') globalThis.location.assign('/settings');
      if (action === 'ranking') globalThis.location.assign('/rewards');
    });

    const cleanup = () => {
      if (globalThis.location.pathname !== '/magic') {
        shell.remove();
        style.remove();
        if (!globalThis.location.pathname.startsWith('/magic/')) {
          document.body?.removeAttribute('data-zq-magic-landscape');
          document.body?.removeAttribute('data-zq-magic-lobby');
        }
        clearInterval(roomRefreshTimer);
        clearInterval(routeTimer);
      }
    };
    const routeTimer = globalThis.setInterval(cleanup, 300);
  };

  const scheduleBoot = () => globalThis.requestAnimationFrame(() => globalThis.requestAnimationFrame(boot));
  if (document.readyState === 'loading') {
    globalThis.addEventListener('DOMContentLoaded', scheduleBoot, { once: true });
  } else {
    scheduleBoot();
  }
  globalThis.setInterval(() => {
    if (globalThis.location.pathname === '/magic') boot();
  }, 200);
})();
