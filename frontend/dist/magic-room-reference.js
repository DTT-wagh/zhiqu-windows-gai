(() => {
  const RUNTIME_KEY = '__zqMagicRoomReferenceRuntimeV4';
  globalThis[RUNTIME_KEY]?.dispose?.();
  const runtime = { disposed: false, dispose: null };
  globalThis[RUNTIME_KEY] = runtime;
  const SESSION_KEY = 'zhiqu.auth.session.v1';
  const POLL_INTERVAL_MS = 2_000;
  const GUESS_DURATION_MS = 2 * 60 * 1_000;
  const GENERATION_LAUNCH_MS = 360;
  const GUESS_DEADLINE_KEY_PREFIX = 'zhiqu.magic.guess-deadline.';
  const STATUS_LABELS = {
    LOBBY: '等待猜图者加入',
    ROUND_1: '挑战图正在生成',
    ROUND_2: '等待猜图者提交',
    RESULT: '提示词匹配完成',
    EXPIRED: '房间已过期',
    CANCELLED: '房间已取消',
  };
  const TERM_GROUPS = [
    { label: '场景', options: ['海边灯塔', '雪山小屋', '城市天台', '热带雨林'] },
    { label: '主体', options: ['一只橘猫', '一个小机器人', '一位穿黄色雨衣的孩子', '一只白色风筝'] },
    { label: '氛围', options: ['清晨薄雾', '金色夕阳', '雨后彩虹', '蓝色月夜'] },
    { label: '画风', options: ['童话水彩', '彩色蜡笔', '立体纸雕', '黏土定格'] },
  ];
  const UPLOADED_AVATAR_KEY = /^[0-9a-fA-F]{32}$/;
  const AVATAR_PRESETS = {
    'indigo-orbit': { background: '#DCE8F5', foreground: '#365c8d', icon: 'orbit' },
    'matcha-bot': { background: '#DCEEDB', foreground: '#668552', icon: 'bot' },
    'mustard-spark': { background: '#F5E7B8', foreground: '#987015', icon: 'sparkles' },
    'vermilion-palette': { background: '#F5DCD5', foreground: '#B84E42', icon: 'palette' },
    'violet-brain': { background: '#E8DDF1', foreground: '#75568D', icon: 'brain' },
    'steel-compass': { background: '#D8E3E5', foreground: '#4D6B80', icon: 'compass' },
  };

  let shell = null;
  let style = null;
  let roomTimer = null;
  let routeTimer = null;
  let entranceTimer = null;
  let countdownTimer = null;
  let countdownDeadline = 0;
  let countdownRoomId = null;
  let countdownAutoSubmitStarted = false;
  let roomRequestInFlight = false;
  let actionInFlight = false;
  let exitInProgress = false;
  let trackedRoomId = null;
  let currentRoom = null;
  let currentListing = null;
  let selectedTerms = TERM_GROUPS.map((group) => group.options[0]);
  let dialogAction = null;
  let actionError = '';
  let lastContentSignature = '';
  let resultView = 'score';
  let publishAnimation = '';
  let publishAnimationTimer = null;
  let generationProgress = null;
  let generationProgressTimer = null;
  let generationProgressRequestInFlight = false;
  let generationCompletionTimer = null;
  let generationLaunchInFlight = false;
  // A room tab must keep using the account that opened it. The auth store is
  // shared by tabs, so logging into a second account must not change the
  // credentials used by an already-running room or image-generation request.
  let boundRoomSession = null;
  let roomSessionRefreshInFlight = null;
  let roomUnavailableAttempts = 0;

  const apiBase = () => String(globalThis.__ZHIQU_API_BASE_URL || 'http://localhost:8080').replace(/\/+$/, '');

  const session = () => {
    try {
      return JSON.parse(globalThis.localStorage?.getItem(SESSION_KEY) || 'null');
    } catch {
      return null;
    }
  };

  const roomSession = () => boundRoomSession || session();

  const refreshRoomSession = async () => {
    const refreshToken = boundRoomSession?.refreshToken;
    if (!refreshToken) return false;
    if (!roomSessionRefreshInFlight) {
      roomSessionRefreshInFlight = (async () => {
        try {
          const response = await globalThis.fetch(`${apiBase()}/api/auth/refresh`, {
            method: 'POST',
            headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken }),
          });
          if (!response.ok) return false;
          const nextSession = await response.json();
          if (!nextSession?.accessToken) return false;
          boundRoomSession = nextSession;
          return true;
        } catch {
          return false;
        } finally {
          roomSessionRefreshInFlight = null;
        }
      })();
    }
    return roomSessionRefreshInFlight;
  };

  const roomId = () => {
    const parts = globalThis.location.pathname.split('/').filter(Boolean);
    return parts.length === 2 && parts[0] === 'magic' ? parts[1] : null;
  };

  const isRoomRoute = () => {
    const parts = globalThis.location.pathname.split('/').filter(Boolean);
    return parts.length === 2 && parts[0] === 'magic';
  };

  const isReviewRoute = () => {
    try {
      return new URLSearchParams(globalThis.location?.search || '').get('view') === 'review';
    } catch {
      return false;
    }
  };

  // The room overlay can be injected during an SPA transition before the
  // shared magic route script observes the new URL. Keep this runtime
  // responsible for entering the landscape presentation immediately.
  const lockRoomLandscape = () => {
    try {
      const orientation = globalThis.screen?.orientation;
      if (typeof orientation?.lock === 'function') {
        Promise.resolve(orientation.lock('landscape')).catch(() => {});
      }
    } catch {}
  };
  const unlockRoomLandscape = () => {
    try { globalThis.screen?.orientation?.unlock?.(); } catch {}
  };

  const syncRoomLandscape = () => {
    const active = isRoomRoute();
    const pathname = globalThis.location?.pathname || '';
    const review = active && isReviewRoute();
    document.body?.toggleAttribute('data-zq-magic-review', review);
    if (active && !review) {
      document.body?.setAttribute('data-zq-magic-landscape', '');
      lockRoomLandscape();
    } else if (pathname !== '/magic') {
      document.body?.removeAttribute('data-zq-magic-landscape');
      if (review) unlockRoomLandscape();
    }
    return active;
  };

  const requestId = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;

  const api = async (path, options = {}) => {
    const token = roomSession()?.accessToken;
    const { timeoutMs = 0, signal, retryAfterRefresh = true, ...requestOptions } = options;
    const controller = timeoutMs > 0 ? new AbortController() : null;
    const timeout = controller ? globalThis.setTimeout(() => controller.abort(), timeoutMs) : null;
    try {
      const response = await globalThis.fetch(`${apiBase()}${path}`, {
        ...requestOptions,
        signal: signal || controller?.signal,
        headers: {
          Accept: 'application/json',
          ...(requestOptions.body ? { 'Content-Type': 'application/json' } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(requestOptions.headers || {}),
        },
      });
      const raw = await response.text();
      let payload = null;
      try { payload = raw ? JSON.parse(raw) : null; } catch { payload = raw; }
      if (!response.ok) {
        if (response.status === 401 && retryAfterRefresh && await refreshRoomSession()) {
          return api(path, { ...options, retryAfterRefresh: false });
        }
        const error = new Error(payload?.message || payload?.error || '请求暂时未完成');
        error.status = response.status;
        throw error;
      }
      return payload;
    } catch (error) {
      if (controller?.signal.aborted) {
        const timeoutError = new Error('提交响应超时，正在重新同步结算结果');
        timeoutError.code = 'REQUEST_TIMEOUT';
        throw timeoutError;
      }
      throw error;
    } finally {
      if (timeout) globalThis.clearTimeout(timeout);
    }
  };

  const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;',
  }[character]));

  const asset = (name) => `/assets/figma-magic-room/runtime/${name}`;
  const image = (name, className, alt = '') => `<img class="${className}" src="${asset(name)}" alt="${alt}">`;
  const safeTerms = (terms) => Array.isArray(terms) ? terms.filter(Boolean).slice(0, 4) : [];
  const avatarPreset = (avatarKey) => AVATAR_PRESETS[String(avatarKey || '')] || AVATAR_PRESETS['indigo-orbit'];
  const avatarIcon = (name) => ({
    orbit: '<circle cx="12" cy="12" r="3"></circle><circle cx="19" cy="5" r="2"></circle><circle cx="5" cy="19" r="2"></circle><path d="M10.4 21.9a10 10 0 0 0 9.5-9.5M21.9 10.4a10 10 0 0 0-9.5-9.5M2.1 13.6a10 10 0 0 0 9.5 9.5M13.6 2.1a10 10 0 0 0-9.5 9.5"></path>',
    bot: '<rect x="3" y="8" width="18" height="12" rx="2"></rect><path d="M12 4v4M8 12h.01M16 12h.01M9 16h6"></path><circle cx="12" cy="3" r="1"></circle>',
    sparkles: '<path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z"></path>',
    palette: '<circle cx="13.5" cy="6.5" r=".5" fill="currentColor"></circle><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"></circle><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"></circle><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"></circle><path d="M12 2a10 10 0 0 0 0 20c1.1 0 2-.9 2-2 0-.5-.2-1-.6-1.4-.4-.4-.6-.9-.6-1.4a2 2 0 0 1 2-2H17a5 5 0 0 0 5-5C22 5.7 17.5 2 12 2z"></path>',
    brain: '<path d="M9.5 4.5A3 3 0 0 0 4 6a3 3 0 0 0-1 5.8A3 3 0 0 0 5 17a3 3 0 0 0 5 2.2V5.5a3 3 0 0 0-.5-1zM14.5 4.5A3 3 0 0 1 20 6a3 3 0 0 1 1 5.8 3 3 0 0 1-2 5.2 3 3 0 0 1-5 2.2V5.5a3 3 0 0 1 .5-1zM6 9h4M14 9h4M6 14h4M14 14h4"></path>',
    compass: '<circle cx="12" cy="12" r="10"></circle><path d="m16 8-2.5 5.5L8 16l2.5-5.5z"></path>',
  }[name] || '');

  const renderUnknownAvatar = (role, variant) => `<span class="magic-room-account-avatar magic-room-account-avatar--${variant} magic-room-account-avatar--unknown magic-room-account-avatar--${role}" aria-label="等待对方加入"><span class="magic-room-unknown-avatar" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="3.2"></circle><path d="M5.5 20c.7-3.3 2.8-5 6.5-5s5.8 1.7 6.5 5"></path><path d="M18.2 3.2 21 6l-2.8 2.8"></path><path d="M21 6h-4"></path></svg><b>?</b></span></span>`;

  const renderAccountAvatar = (participant, role, variant) => {
    const avatarKey = String(participant?.avatarKey || '').trim();
    const nickname = String(participant?.nickname || '').trim();
    if (!participant || !nickname) return renderUnknownAvatar(role, variant);
    const preset = avatarPreset(avatarKey);
    const fallback = `<span class="magic-room-account-avatar-fallback" aria-hidden="true" style="--avatar-background:${preset.background};--avatar-foreground:${preset.foreground}"><svg viewBox="0 0 24 24" fill="none">${avatarIcon(preset.icon)}</svg></span>`;
    if (!UPLOADED_AVATAR_KEY.test(avatarKey)) {
      return `<span class="magic-room-account-avatar magic-room-account-avatar--${variant} magic-room-account-avatar--${role}" aria-label="${escapeHtml(nickname ? `${nickname}的头像` : '账号头像')}">${fallback}</span>`;
    }
    const source = `${apiBase()}/api/social/avatars/${encodeURIComponent(avatarKey)}`;
    return `<span class="magic-room-account-avatar magic-room-account-avatar--${variant} magic-room-account-avatar--${role}" aria-label="${escapeHtml(nickname ? `${nickname}的头像` : '账号头像')}">${fallback}<img src="${escapeHtml(source)}" alt="" data-room-account-avatar-image></span>`;
  };

  const selectedTermsAreValid = () => TERM_GROUPS.every((group, index) => group.options.includes(selectedTerms[index]));

  const removeShell = () => {
    shell?.remove();
    style?.remove();
    shell = null;
    style = null;
    currentRoom = null;
    currentListing = null;
    boundRoomSession = null;
    dialogAction = null;
    actionError = '';
    lastContentSignature = '';
    if (roomTimer) clearInterval(roomTimer);
    if (entranceTimer) clearTimeout(entranceTimer);
    if (publishAnimationTimer) clearTimeout(publishAnimationTimer);
    if (generationProgressTimer) clearInterval(generationProgressTimer);
    if (generationCompletionTimer) clearTimeout(generationCompletionTimer);
    if (countdownTimer) clearInterval(countdownTimer);
    roomTimer = null;
    entranceTimer = null;
    publishAnimationTimer = null;
    generationProgressTimer = null;
    generationCompletionTimer = null;
    generationProgress = null;
    countdownTimer = null;
    countdownDeadline = 0;
    countdownRoomId = null;
    countdownAutoSubmitStarted = false;
    roomSessionRefreshInFlight = null;
    roomUnavailableAttempts = 0;
    document.body?.removeAttribute('data-zq-magic-room-reference');
    document.body?.removeAttribute('data-zq-magic-review');
    document.documentElement?.removeAttribute('data-zq-magic-room-reference-pending');
    syncRoomLandscape();
  };

  const navigate = (path) => {
    exitInProgress = true;
    if (roomTimer) clearInterval(roomTimer);
    roomTimer = null;
    document.body?.setAttribute('data-zq-magic-room-exiting', '');
    globalThis.location.replace(path);
  };

  const navigateAfterExit = () => navigate('/magic');
  const roomIsUnavailable = (error) => [401, 403, 404].includes(Number(error?.status));

  const renderDigits = (inviteCode) => {
    const digits = String(inviteCode || '').replace(/\D/g, '').slice(0, 6).split('');
    const frames = ['asset-03.png', 'asset-04.png', 'asset-05.png', 'asset-07.png', 'asset-06.png', 'asset-05.png'];
    return frames.map((frame, index) => `<span class="magic-room-code-digit">
      ${image(frame, 'magic-room-code-frame')}
      <span>${escapeHtml(digits[index] || '')}</span>
    </span>`).join('');
  };

  const findListing = (payload, id) => {
    const items = Array.isArray(payload?.items) ? payload.items : [];
    return items.find((listing) => listing?.gameCode === 'MAGIC' && String(listing?.roomId) === String(id) && listing?.status === 'OPEN') || null;
  };

  const renderTermChips = (terms, comparedTerms = []) => safeTerms(terms).map((term, index) => {
    const matches = comparedTerms.length > index && comparedTerms[index] === term;
    return `<span class="magic-room-result-term${matches ? ' is-match' : ''}">${escapeHtml(term)}</span>`;
  }).join('');

  const renderPicture = (url, label, compact = false, pendingLabel = '图片正在生成') => {
    if (!url) {
      return `<div class="magic-room-picture-loading${compact ? ' is-compact' : ''}">
        <span class="magic-room-spinner" aria-hidden="true"></span>
        <strong>${escapeHtml(pendingLabel)}</strong>
        <span>完成后会自动出现</span>
      </div>`;
    }
    return `<img class="magic-room-generated-image" src="${escapeHtml(url)}" alt="${escapeHtml(label)}" data-room-generated-image>`;
  };

  const showPictureError = (imageNode) => {
    const fallback = document.createElement('div');
    fallback.className = 'magic-room-picture-loading magic-room-picture-error';
    fallback.setAttribute('role', 'status');
    fallback.innerHTML = '<strong>图片暂时无法显示</strong><span>请稍后刷新房间</span>';
    imageNode.replaceWith(fallback);
  };

  const bindPictureLoadErrors = () => {
    shell?.querySelectorAll('[data-room-generated-image]').forEach((imageNode) => {
      imageNode.addEventListener('error', () => showPictureError(imageNode), { once: true });
      imageNode.addEventListener('load', () => {
        if (generationProgress?.active && imageNode.currentSrc) completeGeneratedImageLoad(imageNode.currentSrc);
      }, { once: true });
    });
  };

  const sameRoom = (left, right) => String(left || '') === String(right || '');

  const progressNumber = (value, fallback = 0) => {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(0, Math.min(100, Math.round(number))) : fallback;
  };

  const clearGenerationProgress = () => {
    if (generationProgressTimer) clearInterval(generationProgressTimer);
    if (generationCompletionTimer) clearTimeout(generationCompletionTimer);
    generationProgressTimer = null;
    generationCompletionTimer = null;
    generationProgressRequestInFlight = false;
    generationProgress = null;
  };

  const updateGenerationProgress = (next) => {
    const previous = generationProgress || {};
    generationProgress = {
      active: next.active !== false,
      roomId: String(next.roomId || previous.roomId || ''),
      status: String(next.status || previous.status || 'PREPARING'),
      progress: progressNumber(next.progress, progressNumber(previous.progress, 8)),
      message: String(next.message || previous.message || '正在准备生成挑战图'),
      imageUrl: String(next.imageUrl || previous.imageUrl || ''),
    };
  };

  const finishGenerationProgress = () => {
    if (!generationProgress?.active || generationProgress.status === 'READY') return;
    updateGenerationProgress({
      status: 'READY',
      progress: 100,
      message: '挑战图已准备好',
    });
    if (shell && currentRoom) updateShell(currentRoom, currentListing);
    if (generationCompletionTimer) clearTimeout(generationCompletionTimer);
    generationCompletionTimer = globalThis.setTimeout(() => {
      clearGenerationProgress();
      if (shell && currentRoom && !exitInProgress) updateShell(currentRoom, currentListing);
    }, 640);
  };

  const completeGeneratedImageLoad = (url) => {
    if (!generationProgress?.active || !url) return;
    if (generationProgress.imageUrl && generationProgress.imageUrl !== url) return;
    generationProgress.imageUrl = url;
    finishGenerationProgress();
  };

  const preloadGeneratedImage = (url) => {
    if (!generationProgress?.active || !url || generationProgress.imageUrl === url) return;
    generationProgress.imageUrl = url;
    const preview = new Image();
    preview.addEventListener('load', () => completeGeneratedImageLoad(url), { once: true });
    preview.src = url;
    if (preview.complete) completeGeneratedImageLoad(url);
  };

  const pollGenerationProgress = async () => {
    if (!generationProgress?.active || generationProgressRequestInFlight || !generationProgress.roomId || exitInProgress) return;
    generationProgressRequestInFlight = true;
    try {
      const payload = await api(`/api/magic-game-rooms/${encodeURIComponent(generationProgress.roomId)}/image-progress`);
      if (!generationProgress?.active || !sameRoom(generationProgress.roomId, payload?.roomId || generationProgress.roomId)) return;
      if (payload?.status === 'FAILED') {
        actionError = String(payload?.message || '图片生成失败，请重新尝试');
        clearGenerationProgress();
        if (currentRoom && sameRoom(currentRoom.id, payload?.roomId)) updateShell(currentRoom, currentListing);
        return;
      }
      updateGenerationProgress({
        roomId: generationProgress.roomId,
        status: payload?.status,
        progress: payload?.progress,
        message: payload?.message,
      });
      if (currentRoom && sameRoom(currentRoom.id, generationProgress.roomId)) updateShell(currentRoom, currentListing);
    } catch {
      // The room snapshot remains the source of truth; a temporary progress
      // request failure must not interrupt image generation or room polling.
    } finally {
      generationProgressRequestInFlight = false;
    }
  };

  const startGenerationProgress = (room, terms = []) => {
    const id = String(room?.id || '');
    if (!id) return;
    if (!generationProgress || !sameRoom(generationProgress.roomId, id)) {
      clearGenerationProgress();
      updateGenerationProgress({
        roomId: id,
        status: 'PREPARING',
        progress: 8,
        message: safeTerms(terms).length ? '正在整理四个提示词' : '正在准备生成挑战图',
      });
    }
    if (!generationProgressTimer) generationProgressTimer = globalThis.setInterval(pollGenerationProgress, 900);
    pollGenerationProgress();
  };

  const playGenerationLaunchEffect = async () => {
    if (!shell || generationLaunchInFlight) return false;
    const button = shell.querySelector('[data-room-submit-terms]');
    if (!button) return true;
    generationLaunchInFlight = true;
    button.disabled = true;
    button.classList.add('is-launching');
    button.setAttribute('aria-busy', 'true');
    await new Promise((resolve) => globalThis.setTimeout(resolve, GENERATION_LAUNCH_MS));
    generationLaunchInFlight = false;
    return true;
  };

  const syncGenerationProgress = (room) => {
    if (!room?.id) return;
    if (room.status === 'ROUND_1' && !room.mentorImageUrl) {
      // Only a novice should enter the passive waiting state automatically.
      // A mentor must explicitly submit the four terms before generation starts.
      const creatorIsGenerating = room.currentUserRole === 'MENTOR'
        && generationProgress?.active
        && sameRoom(generationProgress.roomId, room.id);
      const guesserIsWaiting = room.currentUserRole === 'NOVICE';
      if (creatorIsGenerating || guesserIsWaiting) startGenerationProgress(room, room.mentorTerms);
      return;
    }
    if (generationProgress?.active && sameRoom(generationProgress.roomId, room.id) && room.mentorImageUrl) {
      updateGenerationProgress({
        status: 'IMAGE_READY',
        progress: Math.max(96, progressNumber(generationProgress.progress, 96)),
        message: '挑战图已生成，正在加载画面',
      });
      preloadGeneratedImage(room.mentorImageUrl);
    }
  };

  const bindAccountAvatarErrors = () => {
    shell?.querySelectorAll('[data-room-account-avatar-image]').forEach((imageNode) => {
      if (imageNode.dataset.roomAvatarBound === 'true') return;
      imageNode.dataset.roomAvatarBound = 'true';
      imageNode.addEventListener('error', () => {
        imageNode.hidden = true;
        imageNode.closest('.magic-room-account-avatar')?.querySelector('.magic-room-account-avatar-fallback')?.removeAttribute('hidden');
      }, { once: true });
      imageNode.addEventListener('load', () => {
        imageNode.closest('.magic-room-account-avatar')?.querySelector('.magic-room-account-avatar-fallback')?.setAttribute('hidden', '');
      }, { once: true });
    });
  };

  const formatCountdown = (milliseconds) => {
    const seconds = Math.max(0, Math.ceil(milliseconds / 1_000));
    return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  };

  const clearGuessCountdown = () => {
    if (countdownTimer) clearInterval(countdownTimer);
    countdownTimer = null;
    countdownDeadline = 0;
    countdownRoomId = null;
    countdownAutoSubmitStarted = false;
  };

  const guessDeadline = (room) => {
    const id = String(room?.id || '');
    if (!id) return 0;
    const serverDeadline = Date.parse(room?.guessDeadline || room?.roundDeadline || '');
    if (Number.isFinite(serverDeadline)) return serverDeadline;
    const key = `${GUESS_DEADLINE_KEY_PREFIX}${id}`;
    const stored = Number(globalThis.sessionStorage?.getItem(key));
    if (Number.isFinite(stored) && stored > 0) return stored;
    const deadline = Date.now() + GUESS_DURATION_MS;
    try { globalThis.sessionStorage?.setItem(key, String(deadline)); } catch {}
    return deadline;
  };

  const updateCountdown = () => {
    if (!shell || !countdownDeadline || currentRoom?.status !== 'ROUND_2' || currentRoom?.currentUserRole !== 'NOVICE' || !currentRoom?.mentorImageUrl) return;
    const remaining = Math.max(0, countdownDeadline - Date.now());
    const countdown = shell.querySelector('[data-room-countdown]');
    if (countdown) countdown.textContent = `剩余时间：${formatCountdown(remaining)}`;
    if (remaining > 0 || countdownAutoSubmitStarted || actionInFlight) return;
    countdownAutoSubmitStarted = true;
    if (countdown) countdown.textContent = '时间到，正在进入结算';
    submitTerms().finally(() => {
      if (currentRoom?.status === 'ROUND_2' && currentRoom?.currentUserRole === 'NOVICE') {
        const currentCountdown = shell?.querySelector('[data-room-countdown]');
        if (currentCountdown) currentCountdown.textContent = '时间到，正在重试结算';
        countdownAutoSubmitStarted = false;
      }
    });
  };

  const syncGuessCountdown = (room) => {
    if (room?.status !== 'ROUND_2' || room?.currentUserRole !== 'NOVICE' || !room?.mentorImageUrl) {
      clearGuessCountdown();
      return;
    }
    if (countdownRoomId !== room.id) {
      clearGuessCountdown();
      countdownRoomId = room.id;
      countdownDeadline = guessDeadline(room);
    }
    updateCountdown();
    if (!countdownTimer) countdownTimer = globalThis.setInterval(updateCountdown, 1_000);
  };

  const renderVsHeader = (room = currentRoom) => `<div class="magic-room-vs-header" aria-label="游戏角色">
    <div class="magic-room-vs-player magic-room-vs-player--mentor">
      <div class="magic-room-vs-avatar">${renderAccountAvatar(room?.mentor, 'mentor', 'vs')}</div>
      <span class="magic-room-vs-role">先手创作者</span><b>${escapeHtml(room?.mentor?.nickname || '创作者')}</b>
    </div>
    <div class="magic-room-vs-star" aria-hidden="true">VS</div>
    <div class="magic-room-vs-player magic-room-vs-player--novice">
      <div class="magic-room-vs-avatar">${renderAccountAvatar(room?.novice, 'novice', 'vs')}</div>
      <span class="magic-room-vs-role">猜图者</span><b>${escapeHtml(room?.novice?.nickname || '猜图者')}</b>
    </div>
  </div>`;

  const renderTermOptions = (group, groupIndex, disabled = false) => group.options.map((option, optionIndex) => `<button type="button" role="radio" aria-checked="${selectedTerms[groupIndex] === option}" class="magic-room-figma-term${selectedTerms[groupIndex] === option ? ' is-selected' : ''}" data-term-group="${groupIndex}" data-term-option="${optionIndex}" ${actionInFlight || disabled ? 'disabled' : ''}>${escapeHtml(option)}</button>`).join('');

  const renderCreatorBoard = (room) => `<main class="magic-room-figma-game magic-room-creator-game${actionInFlight ? ' is-submitting-terms' : ''}">
    ${renderVsHeader(room)}
    <button class="magic-room-figma-back" type="button" data-room-exit aria-label="取消游戏">←</button>
    <h1 class="magic-room-figma-heading">选择四个提示词</h1>
    <section class="magic-room-figma-term-columns">
      ${TERM_GROUPS.map((group, groupIndex) => `<section class="magic-room-figma-term-card">
        <h2>${escapeHtml(group.label)}</h2>
        <div class="magic-room-figma-term-options" role="radiogroup" aria-label="${escapeHtml(group.label)}">${renderTermOptions(group, groupIndex)}</div>
      </section>`).join('')}
    </section>
    ${actionError ? `<div class="magic-room-generation-error" role="status"><strong>图片没有生成成功</strong><span>${escapeHtml(actionError)}</span></div>` : ''}
    <button class="magic-room-figma-primary magic-room-figma-generate" type="button" data-room-submit-terms ${actionInFlight ? 'disabled' : ''}>
      ${actionInFlight ? 'AI小助手正在绘制中...' : actionError ? '重新生成挑战图' : '开始游戏并生成挑战图'}
    </button>
  </main>`;

  const renderCreatorGeneratingBoard = (room) => {
    const progress = generationProgress?.active && sameRoom(generationProgress.roomId, room?.id)
      ? generationProgress
      : { progress: 8, status: 'PREPARING', message: '正在准备生成挑战图' };
    const progressTerms = safeTerms(room?.mentorTerms).join(' · ') || '四个提示词';
    return `<main class="magic-room-figma-game magic-room-generating-game magic-room-creator-generating-game" data-generation-status="${escapeHtml(progress.status)}">
    ${renderVsHeader(room)}
    <button class="magic-room-figma-back" type="button" data-room-exit aria-label="取消游戏">←</button>
    <section class="magic-room-generating-card">
      <div class="magic-room-generating-sparkle" aria-hidden="true">✦</div>
      <h1>你的挑战图正在生成</h1>
      <p>AI正在根据你选择的四个提示词绘制挑战图</p>
      <div class="magic-room-generating-progress" role="progressbar" aria-label="挑战图生成进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progress.progress}" style="--generation-progress:${progress.progress}%"><i></i><span>${escapeHtml(progress.message)} · ${progress.progress}%</span></div>
      <small class="magic-room-generating-terms">已选择：${escapeHtml(progressTerms)}</small>
      <div class="magic-room-generating-dots" aria-label="生成中"><i></i><i></i><i></i></div>
    </section>
    <button class="magic-room-figma-secondary" type="button" data-room-exit>取消游戏</button>
  </main>`;
  };

  const renderGuesserWaitingBoard = (room) => `<main class="magic-room-figma-game magic-room-generating-game magic-room-guesser-waiting-game" data-generation-status="WAITING_CREATOR">
    ${renderVsHeader(room)}
    <button class="magic-room-figma-back" type="button" data-room-exit aria-label="退出房间">←</button>
    <section class="magic-room-generating-card">
      <div class="magic-room-generating-sparkle" aria-hidden="true">…</div>
      <h1>等待创作者完成挑战图</h1>
      <p>创作者已经提交提示词，图片生成完成后会自动开始答题</p>
      <div class="magic-room-waiting-indicator" role="status" aria-label="等待创作者完成挑战图"><i></i><i></i><i></i></div>
      <small class="magic-room-generating-terms">请稍候，答案提示词不会提前显示</small>
    </section>
    <button class="magic-room-figma-secondary" type="button" data-room-exit>退出房间</button>
  </main>`;

  const renderCreatorWaitingBoard = (room) => `<main class="magic-room-figma-game magic-room-generating-game magic-room-creator-waiting-game" data-generation-status="NOVICE_ANSWERING">
    ${renderVsHeader(room)}
    <button class="magic-room-figma-back" type="button" data-room-exit aria-label="退出房间">←</button>
    <section class="magic-room-generating-card">
      <div class="magic-room-generating-sparkle" aria-hidden="true">✓</div>
      <h1>猜图者正在作答</h1>
      <p>挑战图已准备好，对方正在观察并选择答案</p>
      <div class="magic-room-waiting-indicator" role="status" aria-label="等待猜图者提交答案"><i></i><i></i><i></i></div>
      <small class="magic-room-generating-terms">提交后将显示本轮匹配结果</small>
    </section>
    <button class="magic-room-figma-secondary" type="button" data-room-exit>退出房间</button>
  </main>`;

  // Compatibility fallback for transient loading/error states. Active rounds
  // are rendered through the role-specific boards below.
  const renderGeneratingBoard = (room) => room?.currentUserRole === 'NOVICE'
    ? renderGuesserWaitingBoard(room)
    : renderCreatorGeneratingBoard(room);

  const renderGuessBoard = (room) => {
    const challengeReady = Boolean(room?.mentorImageUrl);
    return `<main class="magic-room-figma-game magic-room-guess-game">
    ${renderVsHeader(room)}
    <button class="magic-room-figma-back" type="button" data-room-exit aria-label="退出房间">←</button>
    <section class="magic-room-guess-board">
      <section class="magic-room-guess-instruction">
        <h1>${challengeReady ? '轮到你啦！' : '挑战图正在准备'}</h1>
        <p>${challengeReady ? '仔细观察挑战图，找出隐藏的提示词并提交答案吧！' : '图片尚未生成完成，生成成功后才会开始倒计时。'}</p>
        <div class="magic-room-guess-image">${renderPicture(room?.mentorImageUrl, '创作者的挑战图', false, '挑战图正在生成')}</div>
      </section>
      <section class="magic-room-guess-options">
        ${TERM_GROUPS.map((group, groupIndex) => `<section class="magic-room-guess-row"><h2>${escapeHtml(group.label)}</h2><div role="radiogroup" aria-label="${escapeHtml(group.label)}">${renderTermOptions(group, groupIndex, !challengeReady)}</div></section>`).join('')}
      </section>
    </section>
    <div class="magic-room-guess-actions">
      <span class="magic-room-countdown" data-room-countdown>${challengeReady ? '剩余时间：02:00' : '等待挑战图生成'}</span>
      <button class="magic-room-figma-primary" type="button" data-room-submit-terms ${actionInFlight || !challengeReady ? 'disabled' : ''}>${actionInFlight ? '正在提交...' : challengeReady ? '提交答案' : '等待生成完成'}</button>
    </div>
  </main>`;
  };

  const renderLobby = (room, listing) => `<section class="magic-room-publish-band${listing ? ' is-public' : ''}${publishAnimation ? ` is-${publishAnimation}` : ''}">
      ${image('asset-01.png', 'magic-room-publish-band-art')}
      <div class="magic-room-publish-icon">${image('asset-16.png', 'magic-room-globe-brown')}</div>
      <div class="magic-room-publish-copy">
        <strong>发布到社区公开房间</strong>
        <span>发布后，其他同学可以看到这个房间并直接加入。</span>
      </div>
      <button class="magic-room-publish-button${listing ? ' is-published' : ''}" type="button" data-room-publish ${actionInFlight ? 'disabled' : ''}>
        ${image('asset-20.png', 'magic-room-publish-button-art')}
        ${image('asset-37.png', 'magic-room-globe-white')}
        <span>${publishAnimation === 'unpublishing' ? '撤下中...' : publishAnimation === 'publishing' ? '发布中...' : listing ? '撤下公开' : '发布公开'}</span>
      </button>
    </section>
    <main class="magic-room-invite-card">
      ${image('asset-02.png', 'magic-room-invite-card-art')}
      ${image('asset-18.png', 'magic-room-title-art', '把邀请码交给猜图者')}
      ${image('asset-19.png', 'magic-room-detail-art')}
      <div class="magic-room-code" data-room-code aria-label="六位邀请码">${renderDigits(room?.inviteCode)}</div>
    </main>`;

  const renderRoundOne = (room) => {
    if (room?.currentUserRole === 'MENTOR') {
      if (generationProgress?.active && sameRoom(generationProgress.roomId, room.id)) return renderCreatorGeneratingBoard(room);
      return renderCreatorBoard(room);
    }
    return renderGuesserWaitingBoard(room);
  };

  const renderRoundTwo = (room) => {
    if (room?.currentUserRole === 'NOVICE') {
      return renderGuessBoard(room);
    }
    return renderCreatorWaitingBoard(room);
  };

  const renderResultPicture = (title, url, terms, comparedTerms, emptyCopy = '') => `<section class="magic-room-figma-result-picture">
    <h2>${escapeHtml(title)}</h2>
    <div>${url ? renderPicture(url, title, true) : `<div class="magic-room-result-answer"><strong>答案已提交</strong><span>${escapeHtml(emptyCopy || '本轮不再生成新的图片')}</span></div>`}</div>
    <p>${renderTermChips(terms, comparedTerms)}</p>
  </section>`;

  const renderResultReview = (room = currentRoom) => {
    const score = Math.max(0, Math.min(100, Number(room?.matchScore) || 0));
    const mentorTerms = safeTerms(room?.mentorTerms);
    const noviceTerms = safeTerms(room?.noviceTerms);
    return `<main class="magic-room-record-review">
      <header class="magic-room-record-review-header"><button class="magic-room-record-back" type="button" data-record-back aria-label="返回记录">←</button><div><span>画里藏词 · 本局记录</span><h1>评级与总结</h1></div><span class="magic-room-record-score">${score}%</span></header>
      <section class="magic-room-record-summary"><div class="magic-room-record-summary-copy"><span>本局匹配度</span><strong>${score}%</strong><p>${score >= 90 ? '你们准确找回了画面中的关键信息。' : '继续观察场景、主体、氛围和画风，线索会越来越清晰。'}</p></div><div class="magic-room-record-meter" aria-label="${score}% 匹配度" style="--score:${score}%"><i></i></div></section>
      <section class="magic-room-record-card"><h2>提示词对照</h2><div class="magic-room-record-terms"><div><b>创作者提示词</b><p>${renderTermChips(mentorTerms)}</p></div><div><b>猜图者选择</b><p>${renderTermChips(noviceTerms, mentorTerms)}</p></div></div></section>
      <section class="magic-room-record-card"><h2>AI 复盘</h2><p>比较两次表达中相同与不同的词，观察信息在传递过程中怎样产生偏差。你已经完成了一次从提示词到图像、再从图像找回线索的完整实践。</p></section>
      <section class="magic-room-record-card magic-room-record-course"><h2>下一步学习</h2><p><b>认识人工智能</b><span>AI认知 · 5分钟</span></p><button type="button" data-room-learn>去学习</button></section>
      <button class="magic-room-record-primary" type="button" data-record-back>返回记录</button>
    </main>`;
  };

  const renderResult = (room) => {
    const mentorTerms = safeTerms(room?.mentorTerms);
    const noviceTerms = safeTerms(room?.noviceTerms);
    const nextLabel = room?.nextRoomId ? '进入新一局' : '互换角色再来一局';
    if (resultView === 'review') return renderResultReview(room);
    const score = Math.max(0, Math.min(100, Number(room?.matchScore) || 0));
    return `<main class="magic-room-figma-game magic-room-result-game">
    ${renderVsHeader(room)}
      <button class="magic-room-figma-back" type="button" data-room-back aria-label="返回大厅">←</button>
      <section class="magic-room-figma-result-grid">
        ${renderResultPicture('创作者的挑战图', room?.mentorImageUrl, mentorTerms, noviceTerms)}
        <section class="magic-room-figma-score"><span>符合度</span><b>${score}%</b><div aria-label="${score}% 符合度" style="--score:${score}%"><i></i></div><p>${renderTermChips(mentorTerms, noviceTerms)}</p></section>
        ${renderResultPicture('猜图者答案', room?.noviceImageUrl, noviceTerms, mentorTerms, '已根据你的四个选择完成匹配')}
      </section>
      <section class="magic-room-figma-result-footer"><p>恭喜你们！<br>获得 <b>15</b> 颗星星</p><p>银族<br>积分 <b>+30</b> 分</p><p>解锁徽章<br><b>小探索家章</b></p><button class="magic-room-figma-primary" type="button" data-result-review>查看复盘</button><button class="magic-room-figma-blue" type="button" data-room-back>返回大厅</button><button class="magic-room-figma-primary" type="button" data-room-swap ${actionInFlight ? 'disabled' : ''}>${actionInFlight ? '正在准备...' : nextLabel}</button></section>
  </main>`;
  };

  const renderEnded = (room) => `<main class="magic-room-ended-layer is-finished">
    <section class="magic-room-ended-card">
      <span aria-hidden="true">!</span>
      <h1>${room?.status === 'EXPIRED' ? '这个挑战已过期' : '这个挑战已结束'}</h1>
      <p>返回大厅后可以重新开始一局。</p>
      <button class="magic-room-primary-button" type="button" data-room-back>返回画里藏词大厅</button>
    </section>
  </main>`;

  const renderRoomContent = (room, listing) => {
    switch (room?.status) {
      case 'LOBBY': return renderLobby(room, listing);
      case 'ROUND_1': return renderRoundOne(room);
      case 'ROUND_2': return renderRoundTwo(room);
      case 'RESULT': return renderResult(room);
      case 'EXPIRED':
      case 'CANCELLED': return renderEnded(room);
      default: return renderGeneratingBoard(room);
    }
  };

  const updateShell = (room, listing) => {
    if (!shell) return;
    const firstReadyRender = shell.dataset.roomReady !== 'true' && Boolean(room?.id && room?.status);
    currentRoom = room;
    currentListing = listing;
    const mentorName = String(room?.mentor?.nickname || '').trim();
    const noviceName = String(room?.novice?.nickname || '').trim();
    shell.dataset.roomStatus = room?.status || 'LOADING';
    shell.dataset.roomReady = room?.id && room?.status ? 'true' : 'false';
    shell.querySelector('[data-room-status]').textContent = STATUS_LABELS[room?.status] || '正在同步游戏';
    shell.querySelector('[data-room-mentor-name]').textContent = mentorName || '先手创作者';
    shell.querySelector('[data-room-novice-name]').textContent = noviceName || '等待加入';
    shell.querySelector('[data-room-role]').textContent = room?.currentUserRole === 'NOVICE' ? '猜图者' : '先手创作者';
    shell.querySelector('[data-room-mentor-avatar]').innerHTML = renderAccountAvatar(room?.mentor, 'mentor', 'header');
    shell.querySelector('[data-room-novice-avatar]').innerHTML = renderAccountAvatar(room?.novice, 'novice', 'header');
    const contentSignature = JSON.stringify({
      status: room?.status,
      role: room?.currentUserRole,
      inviteCode: room?.inviteCode,
      mentor: room?.mentor?.nickname,
      novice: room?.novice?.nickname,
      mentorAvatarKey: room?.mentor?.avatarKey,
      noviceAvatarKey: room?.novice?.avatarKey,
      mentorImageUrl: room?.mentorImageUrl,
      noviceImageUrl: room?.noviceImageUrl,
      mentorTerms: room?.mentorTerms,
      noviceTerms: room?.noviceTerms,
      matchScore: room?.matchScore,
      nextRoomId: room?.nextRoomId,
      listingId: listing?.id,
      selectedTerms,
      resultView,
      actionInFlight,
      actionError,
      publishAnimation,
      generationProgressStatus: generationProgress?.status,
      generationProgressValue: generationProgress?.progress,
      generationProgressMessage: generationProgress?.message,
      generationProgressImageUrl: generationProgress?.imageUrl,
    });
    if (contentSignature !== lastContentSignature) {
      shell.querySelector('[data-room-content]').innerHTML = renderRoomContent(room, listing);
      lastContentSignature = contentSignature;
      bindPictureLoadErrors();
    }
    syncGenerationProgress(room);
    syncErrorDisplay();
    bindAccountAvatarErrors();
    syncGuessCountdown(room);
    if (room?.status === 'ROUND_2' && room?.currentUserRole === 'NOVICE' && !room?.mentorImageUrl) {
      const countdown = shell.querySelector('[data-room-countdown]');
      if (countdown) countdown.textContent = '等待挑战图生成';
    }
    if (firstReadyRender) {
      shell.classList.remove('is-room-entering');
      void shell.offsetWidth;
      shell.classList.add('is-room-entering');
      if (entranceTimer) clearTimeout(entranceTimer);
      entranceTimer = globalThis.setTimeout(() => {
        shell?.classList.remove('is-room-entering');
        entranceTimer = null;
      }, 680);
    }

    const exitButton = shell.querySelector('[data-room-exit]');
    const isFinished = ['RESULT', 'EXPIRED', 'CANCELLED'].includes(room?.status);
    exitButton.hidden = false;
    exitButton.disabled = actionInFlight;
    exitButton.querySelector('span').textContent = isFinished ? '返回大厅' : room?.currentUserRole === 'MENTOR' ? '取消游戏' : '退出房间';
  };

  const createShell = () => {
    if (shell) return;
    const root = document.getElementById('root');
    if (!root) return;
    syncRoomLandscape();
    if (!document.querySelector('link[href="/magic-room-reference.css"]')) {
      style = document.createElement('link');
      style.rel = 'stylesheet';
      style.href = '/magic-room-reference.css';
      document.head.appendChild(style);
    }

    shell = document.createElement('div');
    shell.setAttribute('data-magic-room-reference-shell', 'true');
    shell.innerHTML = `<div class="magic-room-stage">
      <div class="magic-room-background" aria-hidden="true"></div>
      <header class="magic-room-topbar">
        <div class="magic-room-status">
          ${image('asset-10.png', 'magic-room-status-art')}
          <span data-room-status>正在打开画里藏词</span>
        </div>
        <div class="magic-room-player magic-room-player--mentor">
          <span class="magic-room-header-avatar-slot" data-room-mentor-avatar></span>
          ${image('asset-26.png', 'magic-room-ribbon-art')}
          <span class="magic-room-player-role">先手创作者</span>
          <div class="magic-room-player-nameplate has-star">
            ${image('asset-25.png', 'magic-room-player-nameplate-art')}
            <span class="magic-room-player-star" aria-hidden="true">★</span>
            <span class="magic-room-player-name" data-room-mentor-name>正在同步</span>
          </div>
        </div>
        <div class="magic-room-player-link" aria-hidden="true">${image('asset-32.png', 'magic-room-link-art')}</div>
        <div class="magic-room-player magic-room-player--novice">
          <span class="magic-room-header-avatar-slot" data-room-novice-avatar></span>
          ${image('asset-26.png', 'magic-room-ribbon-art')}
          <span class="magic-room-player-role">猜图者</span>
          <div class="magic-room-player-nameplate">
            ${image('asset-25.png', 'magic-room-player-nameplate-art')}
            <span class="magic-room-player-name" data-room-novice-name>等待加入</span>
          </div>
        </div>
        <button class="magic-room-cancel" type="button" data-room-exit>
          ${image('asset-11.png', 'magic-room-cancel-art')}
          ${image('asset-12.png', 'magic-room-cancel-icon')}
          <span>退出房间</span>
        </button>
        <div class="magic-room-role-chip">
          ${image('asset-13.png', 'magic-room-role-art')}
          ${image('asset-14.png', 'magic-room-role-icon')}
          <span data-room-role>先手创作者</span>
        </div>
      </header>
      <div data-room-content>
        <main class="magic-room-ended-layer"><section class="magic-room-ended-card"><span class="magic-room-spinner"></span><h1>正在打开画里藏词</h1></section></main>
      </div>
      <div class="magic-room-error" data-room-error role="alert" hidden></div>
      <div class="magic-room-cancel-dialog" data-room-dialog role="dialog" aria-modal="true" aria-labelledby="magic-room-dialog-title" hidden>
        <button class="magic-room-dialog-backdrop" type="button" data-room-dialog-dismiss aria-label="继续游戏"></button>
        <section class="magic-room-dialog-panel">
          <div class="magic-room-dialog-icon" aria-hidden="true">!</div>
          <h2 id="magic-room-dialog-title" data-room-dialog-title>确定退出吗？</h2>
          <p data-room-dialog-copy>退出后本局将结束。</p>
          <div class="magic-room-dialog-actions">
            <button class="magic-room-dialog-continue" type="button" data-room-dialog-dismiss>继续游戏</button>
            <button class="magic-room-dialog-confirm" type="button" data-room-dialog-confirm>确认退出</button>
          </div>
        </section>
      </div>
    </div>`;
    root.appendChild(shell);
    document.documentElement.removeAttribute('data-zq-magic-active-stage');
    document.body?.setAttribute('data-zq-magic-room-reference', '');
    document.getElementById('zq-magic-route-prepaint')?.remove();

    shell.addEventListener('click', async (event) => {
      const termButton = event.target.closest('[data-term-group]');
      if (termButton && !actionInFlight) {
        const groupIndex = Number(termButton.dataset.termGroup);
        const optionIndex = Number(termButton.dataset.termOption);
        selectedTerms[groupIndex] = TERM_GROUPS[groupIndex]?.options[optionIndex] || selectedTerms[groupIndex];
        updateShell(currentRoom, currentListing);
        return;
      }
      if (event.target.closest('[data-room-publish]')) await togglePublish();
      if (event.target.closest('[data-room-refresh]')) await refreshRoom();
      if (event.target.closest('[data-room-submit-terms]')) await submitTerms();
      if (event.target.closest('[data-room-swap]')) await swapRoles();
      if (event.target.closest('[data-room-back]')) navigateAfterExit();
      if (event.target.closest('[data-record-back]')) navigate('/records');
      if (event.target.closest('[data-room-learn]')) navigate('/categories');
      if (event.target.closest('[data-result-review]')) { resultView = 'review'; updateShell(currentRoom, currentListing); }
      if (event.target.closest('[data-result-score]')) { resultView = 'score'; updateShell(currentRoom, currentListing); }
      if (event.target.closest('[data-room-exit]')) handleExitRequest();
      if (event.target.closest('[data-room-dialog-dismiss]')) closeDialog();
      if (event.target.closest('[data-room-dialog-confirm]')) await confirmExit();
    });

    shell.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && dialogAction && !actionInFlight) closeDialog();
    });
  };

  const syncErrorDisplay = () => {
    if (!shell) return;
    const node = shell.querySelector('[data-room-error]');
    const creatorGenerationFailure = Boolean(
      actionError
      && currentRoom?.status === 'ROUND_1'
      && currentRoom?.currentUserRole === 'MENTOR'
      && !generationProgress?.active
    );
    node.textContent = creatorGenerationFailure ? '' : actionError;
    node.hidden = !actionError || creatorGenerationFailure;
  };

  const setError = (message) => {
    actionError = String(message || '');
    syncErrorDisplay();
  };

  const runAction = async (action, fallbackMessage) => {
    if (actionInFlight) return null;
    actionInFlight = true;
    setError('');
    if (currentRoom) updateShell(currentRoom, currentListing);
    try {
      const result = await action();
      if (result?.id && String(result.id) === String(currentRoom?.id)) {
        currentRoom = result;
        updateShell(result, currentListing);
      }
      return result;
    } catch (error) {
      setError(error.message || fallbackMessage);
      return null;
    } finally {
      actionInFlight = false;
      if (shell && currentRoom && !exitInProgress) updateShell(currentRoom, currentListing);
    }
  };

  const togglePublish = async () => {
    if (!currentRoom || currentRoom.currentUserRole !== 'MENTOR' || currentRoom.status !== 'LOBBY') return;
    const wasPublic = Boolean(currentListing);
    publishAnimation = wasPublic ? 'unpublishing' : 'publishing';
    const completed = await runAction(async () => {
      if (currentListing) {
        await api(`/api/community/game-listings/${encodeURIComponent(currentListing.id)}/close`, {
          method: 'POST',
          body: JSON.stringify({ requestId: requestId() }),
        });
      } else {
        await api('/api/community/game-listings', {
          method: 'POST',
          body: JSON.stringify({ requestId: requestId(), gameCode: 'MAGIC', roomId: currentRoom.id }),
        });
      }
      await refreshRoom();
      return true;
    }, '公开状态暂时无法修改');
    if (!completed) {
      publishAnimation = '';
      if (shell && currentRoom && !exitInProgress) updateShell(currentRoom, currentListing);
      return;
    }
    publishAnimation = wasPublic ? 'unpublish-complete' : 'publish-complete';
    if (shell && currentRoom && !exitInProgress) updateShell(currentRoom, currentListing);
    if (publishAnimationTimer) clearTimeout(publishAnimationTimer);
    publishAnimationTimer = globalThis.setTimeout(() => {
      publishAnimation = '';
      publishAnimationTimer = null;
      if (shell && currentRoom && !exitInProgress) updateShell(currentRoom, currentListing);
    }, 920);
  };

  const submitTerms = async () => {
    if (!currentRoom || generationLaunchInFlight || !['ROUND_1', 'ROUND_2'].includes(currentRoom.status)) return;
    const expectedRole = currentRoom.status === 'ROUND_1' ? 'MENTOR' : 'NOVICE';
    if (currentRoom.currentUserRole !== expectedRole) return;
    if (!selectedTermsAreValid()) {
      setError('提示词已更新，请重新从每个分类选择一个选项后再提交。');
      updateShell(currentRoom, currentListing);
      return;
    }
    const endpoint = currentRoom.status === 'ROUND_1' ? 'mentor-cast-async' : 'novice-cast';
    if (endpoint === 'mentor-cast-async') {
      const launched = await playGenerationLaunchEffect();
      if (!launched || !currentRoom || currentRoom.status !== 'ROUND_1' || exitInProgress) return;
      startGenerationProgress(currentRoom, selectedTerms);
      updateShell(currentRoom, currentListing);
    }
    const result = await runAction(() => api(`/api/magic-game-rooms/${encodeURIComponent(currentRoom.id)}/${endpoint}`, {
      method: 'POST',
      timeoutMs: 12_000,
      body: JSON.stringify({ requestId: requestId(), terms: selectedTerms }),
    }), '提示词暂时无法提交');
    if (result) {
      currentRoom = result;
      updateShell(result, currentListing);
      await refreshRoom();
    } else if (endpoint === 'mentor-cast-async') {
      clearGenerationProgress();
      updateShell(currentRoom, currentListing);
    }
  };

  const swapRoles = async () => {
    if (!currentRoom || currentRoom.status !== 'RESULT') return;
    if (currentRoom.nextRoomId) {
      navigate(`/magic/${encodeURIComponent(currentRoom.nextRoomId)}`);
      return;
    }
    const result = await runAction(() => api(`/api/magic-game-rooms/${encodeURIComponent(currentRoom.id)}/swap`, {
      method: 'POST',
      body: JSON.stringify({ requestId: requestId() }),
    }), '新一局暂时无法创建');
    const nextId = result?.nextRoomId || result?.id;
    if (nextId) navigate(`/magic/${encodeURIComponent(nextId)}`);
  };

  const handleExitRequest = () => {
    if (!currentRoom || actionInFlight) return;
    if (['RESULT', 'EXPIRED', 'CANCELLED'].includes(currentRoom.status)) {
      navigateAfterExit();
      return;
    }
    const mentor = currentRoom.currentUserRole === 'MENTOR';
    dialogAction = mentor ? 'cancel' : 'leave';
    const dialog = shell.querySelector('[data-room-dialog]');
    dialog.querySelector('[data-room-dialog-title]').textContent = mentor ? '确定取消这局游戏吗？' : '确定退出房间吗？';
    dialog.querySelector('[data-room-dialog-copy]').textContent = mentor ? '取消后本局将结束，另一位玩家也会退出。' : '退出后你将离开本局，返回画里藏词大厅。';
    dialog.querySelector('[data-room-dialog-confirm]').textContent = mentor ? '确认取消' : '确认退出';
    dialog.hidden = false;
    dialog.querySelector('[data-room-dialog-confirm]').focus();
  };

  const closeDialog = () => {
    if (!shell || actionInFlight) return;
    shell.querySelector('[data-room-dialog]').hidden = true;
    dialogAction = null;
    shell.querySelector('[data-room-exit]')?.focus();
  };

  const confirmExit = async () => {
    if (!currentRoom || !dialogAction || actionInFlight) return;
    const action = dialogAction;
    actionInFlight = true;
    const dialog = shell.querySelector('[data-room-dialog]');
    dialog.querySelectorAll('button').forEach((button) => { button.disabled = true; });
    dialog.querySelector('[data-room-dialog-confirm]').textContent = action === 'cancel' ? '正在取消...' : '正在退出...';
    try {
      if (action === 'cancel') {
        await api(`/api/magic-game-rooms/${encodeURIComponent(currentRoom.id)}`, { method: 'DELETE' });
      } else {
        await api(`/api/magic-game-rooms/${encodeURIComponent(currentRoom.id)}/leave`, { method: 'POST' });
      }
      navigateAfterExit();
    } catch (error) {
      if (roomIsUnavailable(error)) {
        navigateAfterExit();
        return;
      }
      actionInFlight = false;
      setError(error.message || '暂时无法退出房间');
      dialog.querySelectorAll('button').forEach((button) => { button.disabled = false; });
      dialog.querySelector('[data-room-dialog-confirm]').textContent = '重新尝试';
    }
  };

  async function refreshRoom() {
    const id = roomId();
    if (!id || roomRequestInFlight || exitInProgress) return;
    roomRequestInFlight = true;
    try {
      const room = await api(`/api/magic-game-rooms/${encodeURIComponent(id)}`);
      roomUnavailableAttempts = 0;
      let listing = null;
      if (room?.status === 'LOBBY' && room?.currentUserRole === 'MENTOR') {
        try { listing = findListing(await api('/api/community/game-listings/mine'), id); } catch {}
      }
      createShell();
      updateShell(room, listing);
      globalThis.__zqMagicEntryTransitionRuntimeV2?.complete?.();
    } catch (error) {
      if (roomIsUnavailable(error)) {
        roomUnavailableAttempts += 1;
        const generationStillRunning = generationProgress?.active && sameRoom(generationProgress.roomId, id);
        if (generationStillRunning && roomUnavailableAttempts < 4) {
          if (shell) setError('正在重新同步生成进度...');
          return;
        }
        navigateAfterExit();
      }
      else if (shell) {
        shell.querySelector('[data-room-content]').innerHTML = `<main class="magic-room-figma-game magic-room-generating-game">
          <section class="magic-room-generating-card">
            <div class="magic-room-generating-sparkle" aria-hidden="true">!</div>
            <h1>房间暂时无法同步</h1>
            <p>${escapeHtml(error.message || '请检查网络后稍等片刻')}</p>
            <button class="magic-room-figma-primary" type="button" data-room-refresh>重新连接</button>
          </section>
        </main>`;
        setError(error.message || '房间暂时无法同步');
      }
    } finally {
      roomRequestInFlight = false;
    }
  }

  const boot = () => {
    syncRoomLandscape();
    const id = roomId();
    if (!id) {
      if (exitInProgress) return;
      trackedRoomId = null;
      removeShell();
      return;
    }
    // Hide the old Expo room immediately. The replacement shell owns every
    // stage, so a slow network request must never reveal the obsolete hint UI.
    document.documentElement?.setAttribute('data-zq-magic-room-reference-pending', '');
    document.body?.setAttribute('data-zq-magic-room-reference', '');
    if (trackedRoomId !== id) {
      trackedRoomId = id;
      boundRoomSession = session();
      clearGenerationProgress();
      selectedTerms = TERM_GROUPS.map((group) => group.options[0]);
      resultView = isReviewRoute() ? 'review' : 'score';
      currentRoom = null;
      actionError = '';
      exitInProgress = false;
      roomUnavailableAttempts = 0;
    }
    createShell();
    refreshRoom();
    if (!roomTimer) roomTimer = globalThis.setInterval(refreshRoom, POLL_INTERVAL_MS);
  };

  runtime.ensure = boot;

  if (document.readyState === 'loading') {
    globalThis.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
  routeTimer = globalThis.setInterval(boot, 300);
  const dispose = () => {
    if (runtime.disposed) return;
    runtime.disposed = true;
    if (roomTimer) clearInterval(roomTimer);
    if (routeTimer) clearInterval(routeTimer);
    if (entranceTimer) clearTimeout(entranceTimer);
    clearGuessCountdown();
    removeShell();
    if (globalThis[RUNTIME_KEY] === runtime) delete globalThis[RUNTIME_KEY];
  };
  runtime.dispose = dispose;
  globalThis.addEventListener('pagehide', dispose, { once: true });
})();
