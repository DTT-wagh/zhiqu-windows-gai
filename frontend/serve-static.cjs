const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, 'dist');
const port = Number(process.env.PORT || 8082);
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.m3u8': 'application/vnd.apple.mpegurl',
  '.ts': 'video/mp2t',
};

const gamesPlaceholderScript = '<script src="/zhiqu-placeholder-games.js"></script>';
const avatarPreviewScript = '<script src="/zhiqu-avatar-preview.js"></script>';
const birthdayWheelScript = '<script src="/zhiqu-birthday-wheel.js"></script>';
const profileEditFeedbackScript = '<script src="/zhiqu-profile-edit-feedback.js"></script>';
const askBodyScript = '<script src="/zhiqu-ask-body.js"></script>';
const askNavigationScript = '<script src="/zhiqu-ask-navigation.js"></script>';
const answerComposerScript = '<script src="/zhiqu-answer-composer.js"></script>';
const keyboardAvoidanceScript = '<script src="/zhiqu-keyboard-avoidance.js"></script>';
const friendsNavigationScript = '<script src="/zhiqu-friends-navigation.js"></script>';
const friendsAuthGuardScript = '<script src="/zhiqu-friends-auth-guard.js"></script>';
const socialChatScript = '<script src="/zhiqu-social-chat.js"></script>';
const videoControlsScript = '<script src="/zhiqu-video-controls.js"></script>';
const videoNextScript = '<script src="/zhiqu-video-next.js"></script>';
const recommendationsScript = '<script src="/zhiqu-recommendations.js"></script>';
const guestAccessScript = '<script src="/zhiqu-guest-access.js"></script>';
const aiAssistantScript = '<script src="/zhiqu-ai-assistant.js"></script>';
const recordsNavigationScript = '<script src="/zhiqu-records-navigation.js"></script>';
const recordsReferenceScript = '<script src="/records-reference.js"></script>';
const navBackgroundScript = '<script src="/zhiqu-nav-background.js"></script>';
const rewardsBackScript = '<script src="/zhiqu-rewards-back.js"></script>';
const magicReferenceScript = '<script src="/magic-reference.js"></script>';
const magicRoomReferenceScript = '<script src="/magic-room-reference.js"></script>';
const magicEntryNavigationScript = `<script>(() => {
  const RUNTIME_KEY = '__zqMagicEntryTransitionRuntimeV2';
  globalThis[RUNTIME_KEY]?.dispose?.();
  const style = document.getElementById('zq-magic-entry-transition-style') || document.createElement('style');
  style.id = 'zq-magic-entry-transition-style';
  style.textContent = \`
    #zq-magic-entry-transition {
      position: fixed;
      inset: 0;
      z-index: 2147483647;
      display: grid;
      overflow: hidden;
      place-items: center;
      background: #a8ddf3;
      pointer-events: auto;
      isolation: isolate;
      transition: opacity 180ms ease-out;
    }
    #zq-magic-entry-transition.is-revealing { opacity: 0; pointer-events: none; }
    .zq-magic-entry-stage {
      position: absolute;
      top: 50%;
      left: 50%;
      display: grid;
      width: 100vw;
      height: 100vh;
      overflow: hidden;
      place-items: center;
      background: url('/assets/assets/images/bag1.png') center / cover no-repeat;
      transform: translate(-50%, -50%);
      transform-origin: center;
      animation: zq-magic-entry-background 360ms cubic-bezier(.2,.72,.25,1) both;
    }
    .zq-magic-entry-stage::before {
      position: absolute;
      inset: 0;
      background: rgba(255, 255, 255, .08);
      content: '';
    }
    .zq-magic-entry-loader {
      position: relative;
      z-index: 2;
      display: flex;
      min-width: 138px;
      align-items: center;
      justify-content: center;
      padding: 16px 22px 14px;
      border: 1px solid rgba(184, 133, 40, .55);
      border-radius: 8px;
      background: rgba(255, 251, 226, .94);
      box-shadow: 0 10px 30px rgba(73, 77, 40, .18), inset 0 0 0 3px rgba(255, 255, 255, .48);
      color: #57391f;
      flex-direction: column;
      font-family: "Microsoft YaHei", "PingFang SC", sans-serif;
      animation: zq-magic-entry-loader-in 260ms cubic-bezier(.2,.72,.25,1) both;
    }
    .zq-magic-entry-mark {
      display: grid;
      width: 42px;
      height: 42px;
      place-items: center;
      border: 1px solid #b57c25;
      border-radius: 50%;
      background: #ffd660;
      box-shadow: inset 0 -4px 0 rgba(159, 100, 21, .16);
      font-size: 24px;
      line-height: 1;
    }
    .zq-magic-entry-loader strong {
      margin-top: 8px;
      font-size: 15px;
      font-weight: 900;
      letter-spacing: 0;
    }
    .zq-magic-entry-dots { display: flex; height: 10px; align-items: flex-end; margin-top: 7px; gap: 6px; }
    .zq-magic-entry-dots i {
      display: block;
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #e5ae2e;
      animation: zq-magic-entry-dot 900ms ease-in-out infinite;
    }
    .zq-magic-entry-dots i:nth-child(2) { animation-delay: 120ms; }
    .zq-magic-entry-dots i:nth-child(3) { animation-delay: 240ms; }
    @keyframes zq-magic-entry-background {
      from { filter: brightness(1.08); transform: translate(-50%, -50%) scale(1.025); }
      to { filter: brightness(1); transform: translate(-50%, -50%) scale(1); }
    }
    @keyframes zq-magic-entry-loader-in {
      from { opacity: 0; transform: translateY(8px) scale(.96); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }
    @keyframes zq-magic-entry-dot {
      0%, 100% { opacity: .35; transform: translateY(0); }
      50% { opacity: 1; transform: translateY(-4px); }
    }
    @media (prefers-reduced-motion: reduce) {
      .zq-magic-entry-stage { animation-duration: 80ms !important; animation-timing-function: ease-out !important; }
      .zq-magic-entry-loader { animation-duration: 80ms !important; }
      .zq-magic-entry-dots i { animation: none; opacity: .75; }
      #zq-magic-entry-transition { transition-duration: 100ms; }
    }
  \`;
  if (!style.isConnected) document.head.appendChild(style);

  const runtime = {
    runId: 0,
    transition: null,
    timers: [],
    frameId: 0,
    savedOverflow: null,
    navigated: false,
  };

  const schedule = (callback, delay) => {
    const timerId = globalThis.setTimeout(() => {
      const timerIndex = runtime.timers.indexOf(timerId);
      if (timerIndex >= 0) runtime.timers.splice(timerIndex, 1);
      callback();
    }, delay);
    runtime.timers.push(timerId);
    return timerId;
  };

  const clearScheduledWork = () => {
    runtime.timers.forEach((timerId) => globalThis.clearTimeout(timerId));
    runtime.timers.length = 0;
    if (runtime.frameId) globalThis.cancelAnimationFrame?.(runtime.frameId);
    runtime.frameId = 0;
  };

  const restoreOverflow = () => {
    if (!runtime.savedOverflow) return;
    document.documentElement.style.overflow = runtime.savedOverflow.html;
    if (document.body) document.body.style.overflow = runtime.savedOverflow.body;
    runtime.savedOverflow = null;
  };

  const resetTransition = () => {
    runtime.runId += 1;
    clearScheduledWork();
    runtime.transition?.remove();
    document.getElementById('zq-magic-entry-transition')?.remove();
    runtime.transition = null;
    runtime.navigated = false;
    restoreOverflow();
  };

  const revealDestination = (runId = runtime.runId) => {
    if (runId !== runtime.runId || !runtime.transition) return false;
    const selector = runtime.destinationSelector || '[data-magic-reference-shell]';
    const destination = document.querySelector(selector);
    if (!destination) return false;
    if (selector === '[data-magic-room-reference-shell]' && destination.dataset.roomReady !== 'true') return false;
    const transition = runtime.transition;
    clearScheduledWork();
    transition.classList.add('is-revealing');
    let removed = false;
    const removeTransition = () => {
      if (removed) return;
      removed = true;
      transition.removeEventListener('transitionend', removeTransition);
      transition.remove();
      if (runtime.transition === transition) runtime.transition = null;
      restoreOverflow();
    };
    transition.addEventListener('transitionend', removeTransition, { once: true });
    schedule(removeTransition, 300);
    return true;
  };

  const dispose = () => {
    resetTransition();
    globalThis.removeEventListener('popstate', runtime.handleRouteChange);
    globalThis.removeEventListener('pagehide', dispose);
    if (globalThis[RUNTIME_KEY] === runtime) delete globalThis[RUNTIME_KEY];
  };

  runtime.complete = () => revealDestination(runtime.runId);
  runtime.handleRouteChange = () => {
    if (runtime.transition && runtime.navigated && globalThis.location.pathname !== '/magic') resetTransition();
  };
  runtime.dispose = dispose;
  globalThis[RUNTIME_KEY] = runtime;
  globalThis.addEventListener('popstate', runtime.handleRouteChange);
  globalThis.addEventListener('pagehide', dispose, { once: true });

  const openMagicDestination = (target, destinationSelector) => {
    resetTransition();
    const runId = runtime.runId;
    runtime.destinationSelector = destinationSelector;
    const transition = document.createElement('div');
    transition.id = 'zq-magic-entry-transition';
    transition.setAttribute('aria-label', '\u6b63\u5728\u8fdb\u5165\u753b\u91cc\u85cf\u8bcd');
    const startsPortrait = globalThis.innerHeight > globalThis.innerWidth;
    transition.dataset.startOrientation = startsPortrait ? 'portrait' : 'landscape';
    transition.innerHTML = '<div class="zq-magic-entry-stage"><div class="zq-magic-entry-loader" role="status"><span class="zq-magic-entry-mark" aria-hidden="true">&#10022;</span><strong>正在进入画里藏词</strong><span class="zq-magic-entry-dots" aria-hidden="true"><i></i><i></i><i></i></span></div></div>';
    runtime.transition = transition;
    runtime.savedOverflow = {
      html: document.documentElement.style.overflow,
      body: document.body?.style.overflow || '',
    };
    document.body.appendChild(transition);
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    try {
      const orientation = globalThis.screen?.orientation;
      if (startsPortrait && typeof orientation?.lock === 'function') {
        Promise.resolve(orientation.lock('landscape')).catch(() => {});
      }
    } catch {}
    const fallBackToDocument = () => {
      if (runId !== runtime.runId) return;
      clearScheduledWork();
      transition.remove();
      if (runtime.transition === transition) runtime.transition = null;
      restoreOverflow();
      globalThis.location.replace(target);
    };
    const navigate = () => {
      if (runId !== runtime.runId || runtime.navigated) return;
      runtime.navigated = true;
      try {
        globalThis.sessionStorage?.setItem('zhiqu.magic.return.v1', JSON.stringify({
          url: globalThis.location.pathname + globalThis.location.search,
          createdAt: Date.now(),
          historyLength: globalThis.history.length,
        }));
      } catch {}
      const canOpenInPlace = Boolean(
        document.querySelector('script[src="/magic-reference.js"]') &&
        document.getElementById('root') &&
        globalThis.history?.pushState
      );
      if (!canOpenInPlace) {
        clearScheduledWork();
        restoreOverflow();
        globalThis.location.assign(target);
        return;
      }

      globalThis.history.pushState({ zqMagicLobby: true }, '', target);
      const startedAt = Date.now();
      const waitForLobby = () => {
        if (runId !== runtime.runId || revealDestination(runId)) return;
        if (Date.now() - startedAt < 1_500) {
          runtime.frameId = globalThis.requestAnimationFrame(waitForLobby);
          return;
        }
        fallBackToDocument();
      };
      runtime.frameId = globalThis.requestAnimationFrame(waitForLobby);
      schedule(() => {
        if (!revealDestination(runId)) fallBackToDocument();
      }, 1_800);
    };
    const reduceMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    schedule(navigate, reduceMotion ? 90 : 340);
    schedule(() => {
      if (runId !== runtime.runId || revealDestination(runId)) return;
      fallBackToDocument();
    }, 3_200);
  };
  globalThis.__zqOpenMagicLobby = (mode = 'create') => openMagicDestination(
    '/magic?mode=' + encodeURIComponent(String(mode || 'create')),
    '[data-magic-reference-shell]'
  );
  globalThis.__zqOpenMagicRoom = (roomId) => openMagicDestination(
    '/magic/' + encodeURIComponent(String(roomId || '')),
    '[data-magic-room-reference-shell]'
  );
  for (const source of ['/assets/assets/images/bag1.png']) {
    const preload = new Image();
    preload.src = source;
  }
})();</script>`;
const magicRoutePrepaintHead = (pathname) => {
  const isLobby = pathname === '/magic';
  const isRoom = /^\/magic\/[^/]+$/.test(pathname);
  if (!isLobby && !isRoom) return '';
  const stylesheet = isLobby ? '/magic-reference.css' : '/magic-room-reference.css';
  const background = isLobby ? '/assets/assets/images/bag1.png' : '/assets/figma-magic-room/runtime/figma-115-meadow-background.png';
  return `<link rel="stylesheet" href="${stylesheet}"><link rel="preload" as="image" href="${background}"><style id="zq-magic-route-prepaint">
    html, body { background: #a8ddf3 url('${background}') center / cover no-repeat !important; }
    #root { background: #a8ddf3 url('${background}') center / cover no-repeat !important; }
    #root > * { visibility: hidden !important; }
  </style>`;
};
const magicLandscapeScript = `<style id="zq-magic-landscape">
  @media (orientation: portrait) {
    html, body { overflow: hidden; }
    body[data-zq-magic-landscape] #root {
      position: fixed;
      top: 50%;
      left: 50%;
      width: 100vh;
      height: 100vw;
      max-width: none;
      max-height: none;
      transform: translate(-50%, -50%) rotate(90deg);
      transform-origin: center center;
    }
  }
</style><script>(() => {
  const lockLandscape = () => {
    try {
      const orientation = globalThis.screen?.orientation;
      if (typeof orientation?.lock === 'function') {
        Promise.resolve(orientation.lock('landscape')).catch(() => {});
      }
    } catch {}
  };
  const unlockLandscape = () => {
    try { globalThis.screen?.orientation?.unlock?.(); } catch {}
  };
  const syncMagicLandscape = () => {
    const pathname = globalThis.location?.pathname || '';
    const pathParts = pathname.split('/').filter(Boolean);
    const isMagicRoute = pathname === '/magic' || (pathParts.length === 2 && pathParts[0] === 'magic');
    const isMagicReview = isMagicRoute && new URLSearchParams(globalThis.location?.search || '').get('view') === 'review';
    const isMagicLobby = pathname === '/magic';
    document.body?.toggleAttribute('data-zq-magic-landscape', isMagicRoute && !isMagicReview);
    document.body?.toggleAttribute('data-zq-magic-review', isMagicReview);
    document.body?.toggleAttribute('data-zq-magic-lobby', isMagicLobby);
    if (isMagicRoute && !isMagicReview) lockLandscape();
    if (isMagicReview) unlockLandscape();
  };
  syncMagicLandscape();
  globalThis.setInterval(syncMagicLandscape, 200);
  globalThis.addEventListener('pointerdown', () => {
    if (document.body?.hasAttribute('data-zq-magic-landscape')) lockLandscape();
  }, { passive: true });
})();</script>`;
const blindBoxLandscapeScript = `<style id="zq-blind-box-landscape">
  body[data-zq-blind-box-lobby] #root {
    overflow: hidden;
  }
  body[data-zq-blind-box-lobby] [data-zq-blind-box-scroll] {
    width: 100%;
    height: 100%;
    min-height: 0;
    overflow: hidden !important;
  }
  body[data-zq-blind-box-lobby] [data-zq-blind-box-lobby-shell] {
    position: relative;
    display: grid !important;
    grid-template-columns: minmax(250px, 0.82fr) minmax(390px, 1.18fr);
    grid-template-rows: minmax(0, 1fr);
    width: min(100%, 920px) !important;
    height: 100% !important;
    min-height: 0 !important;
    max-width: 920px !important;
    margin: 0 auto;
    padding: max(14px, env(safe-area-inset-top)) max(24px, env(safe-area-inset-right)) max(14px, env(safe-area-inset-bottom)) max(24px, env(safe-area-inset-left)) !important;
    align-items: center;
    align-content: center;
    column-gap: clamp(24px, 4vw, 46px) !important;
    row-gap: 12px !important;
    overflow: hidden;
  }
  body[data-zq-blind-box-lobby] [data-zq-blind-box-back] {
    position: absolute !important;
    top: max(14px, env(safe-area-inset-top));
    left: max(24px, env(safe-area-inset-left));
    z-index: 4;
  }
  body[data-zq-blind-box-lobby] [data-zq-blind-box-hero] {
    grid-column: 1;
    grid-row: 1;
    width: 100%;
    min-width: 0;
    height: auto !important;
    padding: 0 0 0 42px !important;
    align-self: center;
  }
  body[data-zq-blind-box-lobby] [data-zq-blind-box-panel] {
    grid-column: 2;
    width: 100%;
    min-width: 0;
    max-height: 100%;
    padding: 16px 18px !important;
    gap: 10px !important;
    overflow-x: hidden;
    overflow-y: auto;
    scrollbar-width: thin;
  }
  body[data-zq-blind-box-lobby] [data-zq-blind-box-panel] + [data-zq-blind-box-panel] {
    margin-top: 0;
  }
  body[data-zq-blind-box-lobby] [data-zq-blind-box-panel] button {
    flex-shrink: 0;
  }
  body[data-zq-blind-box-room] #root,
  body[data-zq-blind-box-room-lobby] [data-zq-blind-box-room-scroll] {
    overflow: hidden !important;
  }
  body[data-zq-blind-box-room-lobby] [data-zq-blind-box-room-scroll] {
    width: 100%;
    height: 100%;
    min-height: 0;
  }
  body[data-zq-blind-box-room-lobby] [data-zq-blind-box-room-shell] {
    display: grid !important;
    grid-template-columns: minmax(250px, 0.86fr) minmax(390px, 1.14fr);
    grid-template-rows: auto auto minmax(0, 1fr);
    width: min(100%, 920px) !important;
    height: 100% !important;
    min-height: 0 !important;
    max-width: 920px !important;
    margin: 0 auto;
    padding: max(10px, env(safe-area-inset-top)) max(18px, env(safe-area-inset-right)) max(10px, env(safe-area-inset-bottom)) max(18px, env(safe-area-inset-left)) !important;
    column-gap: 16px !important;
    row-gap: 8px !important;
    align-content: stretch;
    overflow: hidden;
    box-sizing: border-box;
  }
  body[data-zq-blind-box-room-lobby] [data-zq-blind-box-room-shell] > * {
    min-width: 0;
    max-width: 100%;
    box-sizing: border-box;
  }
  body[data-zq-blind-box-room-lobby] [data-zq-blind-box-room-header] {
    grid-column: 1 / -1;
    grid-row: 1;
    min-height: 44px !important;
    gap: 8px !important;
  }
  body[data-zq-blind-box-room-lobby] [data-zq-blind-box-room-people] {
    grid-column: 1;
    grid-row: 2;
    min-height: 72px !important;
    padding: 10px 12px !important;
  }
  body[data-zq-blind-box-room-lobby] [data-zq-blind-box-room-publish] {
    grid-column: 1;
    grid-row: 3;
    min-height: 0 !important;
    max-height: 100%;
    padding: 10px 12px !important;
    gap: 8px !important;
    overflow: hidden;
  }
  body[data-zq-blind-box-room-lobby] [data-zq-blind-box-room-invite] {
    grid-column: 2;
    grid-row: 2 / 4;
    width: 100%;
    height: 100%;
    min-height: 0 !important;
    max-height: 100%;
    padding: 12px 16px !important;
    gap: 10px !important;
    overflow: hidden;
    align-self: stretch;
  }
  body[data-zq-blind-box-room-lobby] [data-zq-blind-box-room-invite] * {
    max-width: 100%;
    overflow-wrap: anywhere;
  }
  @media (max-height: 340px) {
    body[data-zq-blind-box-lobby] [data-zq-blind-box-lobby-shell] {
      padding-top: 10px !important;
      padding-bottom: 10px !important;
    }
    body[data-zq-blind-box-lobby] [data-zq-blind-box-back] {
      top: 10px;
    }
    body[data-zq-blind-box-lobby] [data-zq-blind-box-hero] {
      padding-left: 48px !important;
      transform: scale(0.92);
      transform-origin: center;
    }
    body[data-zq-blind-box-lobby] [data-zq-blind-box-panel] {
      padding: 12px 16px !important;
      gap: 8px !important;
    }
  }
  @media (orientation: portrait) {
    html, body { overflow: hidden; }
    body[data-zq-blind-box-landscape] #root {
      position: fixed;
      top: 50%;
      left: 50%;
      width: 100vh;
      height: 100vw;
      max-width: none;
      max-height: none;
      transform: translate(-50%, -50%) rotate(90deg);
      transform-origin: center center;
    }
  }
</style><script>(() => {
  const lockLandscape = () => {
    try {
      const orientation = globalThis.screen?.orientation;
      if (typeof orientation?.lock === 'function') Promise.resolve(orientation.lock('landscape')).catch(() => {});
    } catch {}
  };
  const syncBlindBoxLandscape = () => {
    const parts = (globalThis.location?.pathname || '').split('/').filter(Boolean);
    const isBlindBoxRoute = parts[0] === 'blind-box' && parts.length <= 2;
    const isBlindBoxLobby = parts[0] === 'blind-box' && parts.length === 1;
    const isBlindBoxRoom = parts[0] === 'blind-box' && parts.length === 2;
    document.body?.toggleAttribute('data-zq-blind-box-landscape', isBlindBoxRoute);
    document.body?.toggleAttribute('data-zq-blind-box-lobby', isBlindBoxLobby);
    document.body?.toggleAttribute('data-zq-blind-box-room', isBlindBoxRoom);
    if (isBlindBoxLobby) {
      const title = Array.from(document.querySelectorAll('#root *')).find((element) =>
        element.children.length === 0 && element.textContent?.trim() === '\u7075\u611f\u63a5\u529b'
      );
      const hero = title?.parentElement;
      const shell = hero?.parentElement;
      if (shell && hero) {
        shell.setAttribute('data-zq-blind-box-lobby-shell', '');
        shell.parentElement?.setAttribute('data-zq-blind-box-scroll', '');
        hero.setAttribute('data-zq-blind-box-hero', '');
        const back = Array.from(shell.children).find((element) =>
          element.getAttribute?.('aria-label') === '\u8fd4\u56de\u6e38\u620f\u5927\u5385'
        );
        back?.setAttribute('data-zq-blind-box-back', '');
        Array.from(shell.children).forEach((element) => {
          if (element !== back && element !== hero) element.setAttribute('data-zq-blind-box-panel', '');
        });
      }
    }
    if (isBlindBoxRoom) {
      const roomTitle = Array.from(document.querySelectorAll('#root *')).find((element) =>
        element.children.length === 0 && element.textContent?.trim() === '\u7075\u611f\u63a5\u529b'
      );
      const roomBack = document.querySelector(
        '#root [aria-label="\u8fd4\u56de\u76f2\u76d2\u5927\u5385"], #root [aria-label="\u8fd4\u56de\u6e38\u620f\u5927\u5385"]'
      );
      let header = roomTitle?.parentElement;
      while (header?.parentElement && roomBack && !header.contains(roomBack)) {
        header = header.parentElement;
      }
      if (!roomBack || !header?.contains(roomBack)) header = null;
      const shell = header?.parentElement;
      const children = shell ? Array.from(shell.children) : [];
      const findSection = (needle) => children.find((element) => element.textContent?.includes(needle));
      const people = children.find((element) => {
        const text = element.textContent || '';
        return text.includes('\u9700\u6c42\u6c9f\u901a\u8005') && text.includes('\u63d0\u793a\u8bcd\u8bbe\u8ba1\u5e08') && element !== header;
      });
      const publish = children.find((element) => {
        const text = element.textContent || '';
        return text.includes('\u793e\u533a\u516c\u5f00\u623f\u95f4') || text.includes('\u516c\u5f00\u623f\u95f4');
      });
      const invite = findSection('\u628a\u9080\u8bf7\u7801\u4ea4\u7ed9\u8bbe\u8ba1\u5e08');
      const isWaitingRoom = Boolean(shell && header && people && invite);
      document.body?.toggleAttribute('data-zq-blind-box-room-lobby', isWaitingRoom);
      if (isWaitingRoom) {
        shell.setAttribute('data-zq-blind-box-room-shell', '');
        shell.parentElement?.setAttribute('data-zq-blind-box-room-scroll', '');
        header.setAttribute('data-zq-blind-box-room-header', '');
        people.setAttribute('data-zq-blind-box-room-people', '');
        publish?.setAttribute('data-zq-blind-box-room-publish', '');
        invite.setAttribute('data-zq-blind-box-room-invite', '');
      }
    } else {
      document.body?.removeAttribute('data-zq-blind-box-room-lobby');
    }
    if (isBlindBoxRoute) lockLandscape();
  };
  syncBlindBoxLandscape();
  globalThis.setInterval(syncBlindBoxLandscape, 200);
  globalThis.addEventListener('pointerdown', () => {
    if (document.body?.hasAttribute('data-zq-blind-box-landscape')) lockLandscape();
  }, { passive: true });
})();</script>`;
const apiBaseUrl = String(process.env.ZHIQU_API_BASE_URL || 'http://127.0.0.1:8080').trim().replace(/\/+$/, '');
const apiConfigScript = `<script>(()=>{const configured=${JSON.stringify(apiBaseUrl).replace(/</g, '\\u003c')};try{const base=new URL(configured,location.href);const loopback=new Set(['localhost','127.0.0.1','[::1]']);if(loopback.has(base.hostname)&&!loopback.has(location.hostname))base.hostname=location.hostname;globalThis.__ZHIQU_API_BASE_URL=base.origin}catch{globalThis.__ZHIQU_API_BASE_URL=configured}})();</script>`;
const apiRuntimeBaseSource = 'const e="http://localhost:8080"?.trim()';
const apiRuntimeBasePatched = 'const e=(globalThis.__ZHIQU_API_BASE_URL||"http://localhost:8080")?.trim()';
const blindBoxAudioErrorSource = "}catch{k('\\u5f55\\u97f3\\u53d1\\u9001\\u5931\\u8d25\\uff0c\\u8bf7\\u91cd\\u8bd5\\u3002')}finally{A(!1)}";
const blindBoxAudioErrorPatched = "}catch(e){k(e instanceof y.ApiClientError?e.message:'\\u5f55\\u97f3\\u53d1\\u9001\\u5931\\u8d25\\uff0c\\u8bf7\\u91cd\\u8bd5\\u3002')}finally{A(!1)}";
const askThemeToggleSource = 'function(e){oe(()=>{s(e),B(""),Q([])})';
const askThemeTogglePatched = 'function(e){oe(()=>{s(n===e?"":e),B(""),Q([])})';
const askBodyValidationSource = 'P.trim().length<=1e3';
const askBodyValidationPatched = 'P.trim().length<=3e3';
const askBodyCreateLabelSource = 'const C=`\\u95ee\\u9898\\u6b63\\u6587 ${P.length}/1000`';
const askBodyCreateLabelPatched = 'const C=`\\u95ee\\u9898\\u6b63\\u6587 ${P.length}/3000`';
const askBodyCreateInputSource = 'maxLength:1e3,multiline:!0,onChangeText:j,placeholder:"\\u5199\\u4e0b\\u4f60\\u89c2\\u5bdf\\u5230\\u7684\\u73b0\\u8c61\\u3001\\u5df2\\u7ecf\\u60f3\\u5230\\u7684\\u89e3\\u91ca\\u548c\\u4ecd\\u7136\\u56f0\\u60d1\\u7684\\u5730\\u65b9"';
const askBodyCreateInputPatched = 'maxLength:3e3,multiline:!0,onChangeText:j,placeholder:"\\u5199\\u4e0b\\u4f60\\u89c2\\u5bdf\\u5230\\u7684\\u73b0\\u8c61\\u3001\\u5df2\\u7ecf\\u60f3\\u5230\\u7684\\u89e3\\u91ca\\u548c\\u4ecd\\u7136\\u56f0\\u60d1\\u7684\\u5730\\u65b9"';
const askBodyEditLabelSource = 'const oe=`\\u95ee\\u9898\\u6b63\\u6587 ${F.length}/1000`';
const askBodyEditLabelPatched = 'const oe=`\\u95ee\\u9898\\u6b63\\u6587 ${F.length}/3000`';
const askBodyEditInputSource = 'maxLength:1e3,multiline:!0,onChangeText:le,value:F';
const askBodyEditInputPatched = 'maxLength:3e3,multiline:!0,onChangeText:le,value:F';
const answerCreateSource = 're=()=>(0,H.createCommunityAnswer)(w,{requestId:(0,q.createRequestId)(),body:R.trim()})';
const answerCreatePatched = 're=()=>Promise.resolve(globalThis.__zqPrepareAnswerBody?globalThis.__zqPrepareAnswerBody(R.trim()):R.trim()).then(zqBody=>(0,H.createCommunityAnswer)(w,{requestId:(0,q.createRequestId)(),body:zqBody}))';
const answerSuccessSource = 'const ie=(0,n.useMutation)({mutationFn:re,onSuccess:()=>{T(""),be()}})';
const answerSuccessPatched = 'const ie=(0,n.useMutation)({mutationFn:re,onSuccess:()=>{T(""),globalThis.__zqAnswerSubmitSuccess?.(),be()}})';
const answerDisabledSource = 'disabled:!R.trim(),loading:ie.isPending,onPress:()=>ie.mutate()';
const answerDisabledPatched = 'disabled:!R.trim()&&!globalThis.__zqHasAnswerImages?.(),loading:ie.isPending,onPress:()=>ie.mutate()';
const logoutSource = "_e.logout=async function(){const e=l?.refreshToken;if(e)try{await T('/api/auth/logout',{method:'POST',body:{refreshToken:e},auth:'none'})}finally{await h(null)}else await h(null)}";
const logoutPatched = "_e.logout=async function(){const e=l?.refreshToken;await h(null);if(e){T('/api/auth/logout',{method:'POST',body:{refreshToken:e},auth:'none'}).catch(()=>{})}}";
const settingsLogoutSource = "async function J(){if(!o){n(!0);try{await e(),t.router.replace('/login')}finally{n(!1)}}}";
const settingsLogoutPatched = "async function J(){if(!o){n(!0);try{await e();globalThis.location.replace('/')}finally{n(!1)}}}";
const apiGuestAccessSource = ",'required'===n&&!l)throw new c(401,{code:'UNAUTHORIZED',message:'\\u8bf7\\u5148\\u767b\\u5f55'});";
const apiGuestAccessPatched = ",'required'===n&&!l){const r=globalThis.__zqGuestApiRequest?.(e,t);if(r)return r;if('GET'!==String(t.method||'GET').toUpperCase())globalThis.__zqRequireLogin?.();throw new c(401,{code:'UNAUTHORIZED',message:'\\u8bf7\\u5148\\u767b\\u5f55'});}";
const magicImageFrameSource = "imageFrame:{overflow:'hidden',aspectRatio:1,borderRadius:8,borderWidth:4";
const magicImageFramePatched = "imageFrame:{overflow:'hidden',width:'48%',flexShrink:0,aspectRatio:1.7777777777777777,borderRadius:8,borderWidth:4";
const magicImageFrameCompactSource = "imageFrameCompact:{width:'100%',aspectRatio:1,borderWidth:2}";
const magicImageFrameCompactPatched = "imageFrameCompact:{width:'100%',aspectRatio:1.7777777777777777,borderWidth:2}";
const magicImageFallbackSource = "imageFallback:{minHeight:280,alignItems:'center',justifyContent:'center'";
const magicImageFallbackPatched = "imageFallback:{width:'48%',flexShrink:0,minHeight:180,aspectRatio:1.7777777777777777,alignItems:'center',justifyContent:'center'";
const magicImageFallbackCompactSource = "imageFallbackCompact:{minHeight:130,borderWidth:2}";
const magicImageFallbackCompactPatched = "imageFallbackCompact:{width:'100%',minHeight:96,aspectRatio:1.7777777777777777,borderWidth:2}";
const magicPlayScrollSource = "scroll:{flexGrow:1,width:'100%',maxWidth:720,alignSelf:'center',padding:16,paddingBottom:44,gap:20}";
const magicPlayScrollPatched = "scroll:{flexGrow:1,width:'100%',maxWidth:1200,alignSelf:'center',padding:24,paddingBottom:56,gap:18}";
const magicGameGapSource = "gameGap:{gap:18}";
const magicGameGapPatched = "gameGap:{flexDirection:'row',alignItems:'flex-start',gap:18}";
const magicSpellBookSource = "spellBook:{position:'relative',gap:17,padding:18";
const magicSpellBookPatched = "spellBook:{flex:1,minWidth:0,position:'relative',gap:17,padding:18";
const magicSafeSource = "safe:{flex:1,backgroundColor:'#2B164D'}";
const magicSafePatched = "safe:{flex:1,backgroundColor:'#A8DDF3',backgroundImage:\"url('/assets/assets/images/bag1.png')\",backgroundSize:'cover',backgroundPosition:'center'}";
const communityMagicRoomNavigationSource = "function de(e,t){switch(e){case'MAGIC':n.router.push({pathname:'/magic/[id]',params:{id:t}});break;";
const communityMagicRoomNavigationPatched = "function de(e,t){switch(e){case'MAGIC':globalThis.__zqOpenMagicRoom(t);break;";
// Home and records use the same result-row renderer, but a completed game
// should open as a read-only review rather than restarting the game flow.
const homeMagicRecordNavigationSource = "function we(e,t){switch(e){case'MAGIC':n.router.push({pathname:'/magic/[id]',params:{id:t}});break;";
const homeMagicRecordNavigationPatched = "function we(e,t){switch(e){case'MAGIC':n.router.push({pathname:'/magic/[id]',params:{id:t,view:'review'}});break;";
const homeRecentMagicNavigationSource = "function V(e,t){switch(e){case'MAGIC':l.router.push({pathname:'/magic/[id]',params:{id:t}});break;";
const homeRecentMagicNavigationPatched = "function V(e,t){switch(e){case'MAGIC':l.router.push({pathname:'/magic/[id]',params:{id:t,view:'review'}});break;";
const communityMagicLobbyNavigationSource = "function ue(e,t){switch(e){case'MAGIC':n.router.push({pathname:'/magic',params:{mode:t}});break;";
const communityMagicLobbyNavigationPatched = "function ue(e,t){switch(e){case'MAGIC':globalThis.__zqOpenMagicLobby(t);break;";
const gameCancelNavigationPatches = [
  [
    'M=e=>{w(e),n.router.replace("/blind-box")}',
    'M=e=>{w(e),globalThis.location.replace("/community?section=games")}',
  ],
  [
    'onSuccess:e=>{me(e),n.router.replace("/jailbreak-game")}',
    'onSuccess:e=>{me(e),globalThis.location.replace("/community?section=games")}',
  ],
  [
    'me=e=>{ce(h,c,e),l.router.replace("/magic")}',
    'me=e=>{ce(h,c,e),globalThis.location.replace("/community?section=games")}',
  ],
  [
    'rt=e=>{pe(e),l.router.replace("/truth-game")}',
    'rt=e=>{pe(e),globalThis.location.replace("/community?section=games")}',
  ],
];
const rootSessionRedirectSource = 'const b=f?"/(tabs)":"/login"';
const rootSessionRedirectPatched = 'const b="/(tabs)"';
const tabsSessionGuardSource = 'if(!s){let t;return e[1]===Symbol.for("react.memo_cache_sentinel")?(t=(0,k.jsx)(n.Redirect,{href:"/login"}),e[1]=t):t=e[1],t}';
const tabsSessionGuardPatched = '';
const settingsBackSource = 'accessibilityLabel:"\\u8fd4\\u56de\\u6211\\u7684",accessibilityRole:"button",onPress:()=>t.router.back()';
const settingsBackPatched = 'accessibilityLabel:"\\u8fd4\\u56de\\u6211\\u7684",accessibilityRole:"button",onPress:()=>{const e=t.router.canGoBack?.();e?t.router.back():t.router.replace("/")}';
const friendsImportSource = 'q=r(_d[31]);function w()';
const friendsImportPatched = 'q=r(_d[31]),AvatarKit=r(_d[32]),ChatIcon=e(r(_d[33])),SearchIcon=e(r(_d[34]));function w()';
const friendsDependencySource = '},1485,[1578,1181,1461,81,1251,1469,1276,1473,1246,1177,1457,1474,1475,810,1256,39,166,291,29,298,100,245,173,1249,1238,1146,1179,1230,1270,1266,1180,2]);';
const friendsDependencyPatched = '},1485,[1578,1181,1461,81,1251,1469,1276,1473,1246,1177,1457,1474,1475,810,1256,39,166,291,29,298,100,245,173,1249,1238,1146,1179,1230,1270,1266,1180,2,1257,809,1237]);';
const friendAvatarSource = 'S=(0,q.jsx)(E.default,{style:ee.avatar,children:(0,q.jsx)(x.default,{size:21,color:B.JournalColors.indigo})})';
const friendAvatarPatched = 'S=(0,q.jsx)(AvatarKit.StudentAvatar,{avatarKey:n.student.avatarKey,size:44})';
const requestAvatarSource = 'c=(0,q.jsx)(E.default,{style:ee.avatar,children:(0,q.jsx)(x.default,{size:21,color:B.JournalColors.indigo})})';
const requestAvatarPatched = 'c=(0,q.jsx)(AvatarKit.StudentAvatar,{avatarKey:n.student.avatarKey,size:44})';
const friendRowSource = 'const T=`\\u7ba1\\u7406${n.student.nickname}`;let A,N,w,M,P;return';
const friendRowPatched = 'const T=`\\u7ba1\\u7406${n.student.nickname}`;const chatLabel=`\\u4e0e${n.student.nickname}\\u804a\\u5929`;const chatButton=(0,q.jsx)(R.default,{accessibilityLabel:chatLabel,accessibilityRole:"button",onPress:()=>globalThis.__zqOpenSocialChatForProfile?.(n.student.publicProfileId,n.student.nickname),style:ee.iconButton,children:(0,q.jsx)(ChatIcon.default,{size:20,color:B.JournalColors.indigo})});let A,N,w,M,P;return';
const friendRowChildrenSource = 'children:[S,I,J,N]}';
const friendRowChildrenPatched = 'children:[S,I,J,chatButton,N]}';
const friendsAddButtonSource = '(0,q.jsx)(k.AppButton,{label:"\\u6dfb\\u52a0\\u7b14\\u53cb",icon:f.default,onPress:P})';
const friendsAddButtonPatched = '(0,q.jsxs)(E.default,{style:{width:"100%",flexDirection:"row",gap:12},children:[(0,q.jsx)(E.default,{style:{flex:1},children:(0,q.jsx)(k.AppButton,{label:"\\u6dfb\\u52a0\\u7b14\\u53cb",icon:f.default,onPress:P})}),(0,q.jsx)(E.default,{style:{flex:1},children:(0,q.jsx)(k.AppButton,{label:"\\u5bfb\\u627e\\u7b14\\u53cb",icon:SearchIcon.default,onPress:()=>globalThis.__zqOpenSocialSearch?.(),variant:"secondary"})})]})';
const guestHomeSource = 'function M(){return(0,I.apiRequest)("/api/learning")}function H(){return(0,I.apiRequest)("/api/home")}';
const guestHomePatched = 'function M(){return globalThis.__zqIsGuestSession?.()?globalThis.__zqGuestLearning("/api/learning"):(0,I.apiRequest)("/api/learning")}function H(){return globalThis.__zqIsGuestSession?.()?globalThis.__zqGuestHome():(0,I.apiRequest)("/api/home")}';
const homeContinueTitleSource = 'title:"\\u7ee7\\u7eed\\u89c2\\u5bdf"';
const homeContinueTitlePatched = 'title:"\\u7ee7\\u7eed\\u5b66\\u4e60"';
const homeContinueHintSource = 'children:"\\u89c2\\u5bdf\\u5df2\\u8bb0\\u5f55 \\xb7 \\u63a5\\u4e0b\\u6765\\u62c6\\u89e3\\u8bfe\\u7a0b\\u91cc\\u7684\\u6570\\u636e\\u4e0e\\u7b97\\u6cd5"';
const homeContinueHintPatched = 'children:"\\u5b66\\u4e60\\u8fdb\\u5ea6\\u5df2\\u540c\\u6b65 \\xb7 \\u70b9\\u51fb\\u5361\\u7247\\u7ee7\\u7eed\\u8bfe\\u7a0b"';
const homeFeaturedWidthSource = 'l=Math.min(290,Math.max(248,.72*t))';
const homeFeaturedWidthPatched = 'l=Math.min(248,Math.max(216,.62*t))';
const homeFeaturedCardSource = "featuredCard:{overflow:'hidden',borderWidth:1,borderColor:k.JournalColors.line,borderRadius:6,backgroundColor:'rgba(255, 253, 250, 0.94)'}";
const homeFeaturedCardPatched = "featuredCard:{overflow:'hidden',flexDirection:'row',borderWidth:1,borderColor:k.JournalColors.line,borderRadius:6,backgroundColor:'rgba(255, 253, 250, 0.94)'}";
const homeFeaturedCoverSource = "featuredCover:{width:'100%',aspectRatio:1.7777777777777777,backgroundColor:k.JournalColors.paperDeep},featuredCoverFallback:{width:'100%',aspectRatio:1.7777777777777777,";
const homeFeaturedCoverPatched = "featuredCover:{width:96,height:96,flexShrink:0,backgroundColor:k.JournalColors.paperDeep},featuredCoverFallback:{width:96,height:96,flexShrink:0,";
const homeFeaturedCopySource = 'featuredCopy:{gap:k.Space.sm,padding:k.Space.md}';
const homeFeaturedCopyPatched = 'featuredCopy:{flex:1,minWidth:0,gap:4,padding:12}';
const homeFeaturedTitleSource = 'featuredTitle:{minHeight:42,';
const homeFeaturedTitlePatched = 'featuredTitle:{minHeight:21,';
const homeFeaturedFooterSource = 'featuredFooter:{minHeight:24,';
const homeFeaturedFooterPatched = 'featuredFooter:{minHeight:20,';
const guestProfileUserSource = 'function Z(){return(0,I.apiRequest)("/api/users/me")}';
const guestProfileUserPatched = 'function Z(){return globalThis.__zqIsGuestSession?.()?Promise.resolve(globalThis.__zqGuestProfile()):(0,I.apiRequest)("/api/users/me")}';
const guestProfileHistorySource = 'function Q(){return(0,I.apiRequest)("/api/history")}';
const guestProfileHistoryPatched = 'function Q(){return globalThis.__zqIsGuestSession?.()?Promise.resolve([]):(0,I.apiRequest)("/api/history")}';
const guestProfileFavoritesSource = 'function V(){return(0,I.apiRequest)("/api/favorites")}';
const guestProfileFavoritesPatched = 'function V(){return globalThis.__zqIsGuestSession?.()?Promise.resolve([]):(0,I.apiRequest)("/api/favorites")}';
const guestProfileLearningSource = 'function U(){return(0,I.apiRequest)("/api/learning")}';
const guestProfileLearningPatched = 'function U(){return globalThis.__zqIsGuestSession?.()?globalThis.__zqGuestLearning("/api/learning"):(0,I.apiRequest)("/api/learning")}';
const guestProfileHomeSource = 'function G(){return(0,I.apiRequest)("/api/home")}';
const guestProfileHomePatched = 'function G(){return globalThis.__zqIsGuestSession?.()?globalThis.__zqGuestHome():(0,I.apiRequest)("/api/home")}';
const guestProfileLedgerSource = 'function Y(){return(0,I.listRewardLedger)(8)}';
const guestProfileLedgerPatched = 'function Y(){return globalThis.__zqIsGuestSession?.()?Promise.resolve([]):(0,I.listRewardLedger)(8)}';
const guestProfileRewardsSource = 'queryFn:I.getRewardSummary';
const guestProfileRewardsPatched = 'queryFn:()=>globalThis.__zqIsGuestSession?.()?Promise.resolve(globalThis.__zqGuestRewardSummary()):I.getRewardSummary()';
const guestProfileSocialSource = 'queryFn:q.getSocialMe';
const guestProfileSocialPatched = 'queryFn:()=>globalThis.__zqIsGuestSession?.()?Promise.resolve({friendCount:0,incomingRequestCount:0}):q.getSocialMe()';
const guestProfileEditSource = 'function K(){return n.router.push("/profile/edit")}';
const guestProfileEditPatched = 'function K(){return n.router.push(globalThis.__zqIsGuestSession?.()?"/login":"/profile/edit")}';

function routeDocumentFor(pathname, resolved) {
  const directDocument = `${resolved}.html`;
  if (directDocument.startsWith(root) && fs.existsSync(directDocument)) return directDocument;

  const segments = pathname.split('/').filter(Boolean);
  for (let index = segments.length - 1; index >= 0; index -= 1) {
    for (const parameter of ['[id]', '[section]']) {
      const candidateSegments = segments.slice();
      candidateSegments[index] = parameter;
      const candidate = path.resolve(root, `./${candidateSegments.join('/')}.html`);
      if (candidate.startsWith(root) && fs.existsSync(candidate)) return candidate;
    }
  }
  return null;
}

function safePath(urlPath) {
  const pathname = decodeURIComponent((urlPath || '/').split('?')[0]);
  const resolved = path.resolve(root, `.${pathname}`);
  if (!resolved.startsWith(root)) return null;

  if (pathname === '/magic') return path.join(root, 'magic-lobby.html');

  // Expo exports route documents as `/route.html` and `/route/[id].html`,
  // while the browser uses extensionless URLs. Resolve the matching artifact
  // before falling back to the SPA shell; otherwise the root loading document
  // is hydrated against every route and React reports a mismatch.
  const unresolvedOrDirectory = !fs.existsSync(resolved) || fs.statSync(resolved).isDirectory();
  if (!path.extname(pathname) && unresolvedOrDirectory) {
    const routeDocument = routeDocumentFor(pathname, resolved);
    if (routeDocument) return routeDocument;
  }
  return resolved;
}

const server = http.createServer((request, response) => {
  let file = safePath(request.url);
  if (!file) {
    response.writeHead(400);
    response.end('Bad request');
    return;
  }

  try {
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      file = path.join(root, 'index.html');
    }
    let body = fs.readFileSync(file);
    if (path.extname(file).toLowerCase() === '.js') {
      let source = body.toString('utf8');
      source = source.replace(askThemeToggleSource, askThemeTogglePatched);
      source = source.replace(askBodyValidationSource, askBodyValidationPatched);
      source = source.replace(askBodyCreateLabelSource, askBodyCreateLabelPatched);
      source = source.replace(askBodyCreateInputSource, askBodyCreateInputPatched);
      source = source.replace(askBodyEditLabelSource, askBodyEditLabelPatched);
      source = source.replace(askBodyEditInputSource, askBodyEditInputPatched);
      source = source.replace(answerCreateSource, answerCreatePatched);
      source = source.replace(answerSuccessSource, answerSuccessPatched);
      source = source.replace(answerDisabledSource, answerDisabledPatched);
      source = source.replace(logoutSource, logoutPatched);
      source = source.replace(settingsLogoutSource, settingsLogoutPatched);
      source = source.replace(apiRuntimeBaseSource, apiRuntimeBasePatched);
      source = source.replace(blindBoxAudioErrorSource, blindBoxAudioErrorPatched);
      source = source.replace(apiGuestAccessSource, apiGuestAccessPatched);
      source = source.replace(rootSessionRedirectSource, rootSessionRedirectPatched);
      source = source.replace(tabsSessionGuardSource, tabsSessionGuardPatched);
      source = source.replace(settingsBackSource, settingsBackPatched);
      source = source.replace(friendsImportSource, friendsImportPatched);
      source = source.replace(friendsDependencySource, friendsDependencyPatched);
      source = source.replace(friendAvatarSource, friendAvatarPatched);
      source = source.replace(requestAvatarSource, requestAvatarPatched);
      source = source.replace(friendRowSource, friendRowPatched);
      source = source.replace(friendRowChildrenSource, friendRowChildrenPatched);
      source = source.replace(friendsAddButtonSource, friendsAddButtonPatched);
      source = source.replace(guestHomeSource, guestHomePatched);
      source = source.replace(homeContinueTitleSource, homeContinueTitlePatched);
      source = source.replace(homeContinueHintSource, homeContinueHintPatched);
      source = source.replace(homeFeaturedWidthSource, homeFeaturedWidthPatched);
      source = source.replace(homeFeaturedCardSource, homeFeaturedCardPatched);
      source = source.replace(homeFeaturedCoverSource, homeFeaturedCoverPatched);
      source = source.replace(homeFeaturedCopySource, homeFeaturedCopyPatched);
      source = source.replace(homeFeaturedTitleSource, homeFeaturedTitlePatched);
      source = source.replace(homeFeaturedFooterSource, homeFeaturedFooterPatched);
      source = source.replace(guestProfileUserSource, guestProfileUserPatched);
      source = source.replace(guestProfileHistorySource, guestProfileHistoryPatched);
      source = source.replace(guestProfileFavoritesSource, guestProfileFavoritesPatched);
      source = source.replace(guestProfileLearningSource, guestProfileLearningPatched);
      source = source.replace(guestProfileHomeSource, guestProfileHomePatched);
      source = source.replace(guestProfileLedgerSource, guestProfileLedgerPatched);
      source = source.replace(guestProfileRewardsSource, guestProfileRewardsPatched);
      source = source.replace(guestProfileSocialSource, guestProfileSocialPatched);
      source = source.replace(guestProfileEditSource, guestProfileEditPatched);
      source = source.replace(magicImageFrameSource, magicImageFramePatched);
      source = source.replace(magicImageFrameCompactSource, magicImageFrameCompactPatched);
      source = source.replace(magicImageFallbackSource, magicImageFallbackPatched);
      source = source.replace(magicImageFallbackCompactSource, magicImageFallbackCompactPatched);
      source = source.replace(magicPlayScrollSource, magicPlayScrollPatched);
      source = source.replace(magicGameGapSource, magicGameGapPatched);
      source = source.replace(magicSpellBookSource, magicSpellBookPatched);
      source = source.replaceAll(magicSafeSource, magicSafePatched);
      source = source.replace(communityMagicRoomNavigationSource, communityMagicRoomNavigationPatched);
      source = source.replace(homeMagicRecordNavigationSource, homeMagicRecordNavigationPatched);
      source = source.replace(homeRecentMagicNavigationSource, homeRecentMagicNavigationPatched);
      source = source.replace(communityMagicLobbyNavigationSource, communityMagicLobbyNavigationPatched);
      for (const [cancelSource, cancelPatched] of gameCancelNavigationPatches) {
        source = source.replace(cancelSource, cancelPatched);
      }
      body = Buffer.from(source);
    }
    if (path.extname(file).toLowerCase() === '.html') {
      const requestPathname = decodeURIComponent((request.url || '/').split('?')[0]);
      const standaloneAssistant = path.basename(file) === 'ai-assistant.html';
      const standaloneRecords = path.basename(file) === 'records.html';
      const standaloneSinglePlayer = path.basename(file) === 'single-player-game.html';
      const standaloneMagicLobby = path.basename(file) === 'magic-lobby.html';
      const scripts = standaloneRecords
        ? [apiConfigScript]
        : standaloneAssistant
        ? [apiConfigScript, aiAssistantScript]
        : standaloneSinglePlayer
          ? []
          : standaloneMagicLobby
            ? []
            : [apiConfigScript, guestAccessScript, avatarPreviewScript, birthdayWheelScript, profileEditFeedbackScript, gamesPlaceholderScript, askBodyScript, askNavigationScript, answerComposerScript, keyboardAvoidanceScript, friendsNavigationScript, friendsAuthGuardScript, socialChatScript, videoControlsScript, videoNextScript, aiAssistantScript];
      let html = body.toString('utf8');
      const magicPrepaint = magicRoutePrepaintHead(requestPathname);
      if (magicPrepaint) html = html.replace('</head>', `${magicPrepaint}</head>`);
      if (standaloneSinglePlayer || standaloneMagicLobby) {
        html = html.replace('</head>', `${apiConfigScript}</head>`);
      }
      if (!standaloneAssistant && !standaloneRecords && !standaloneSinglePlayer && !standaloneMagicLobby && !html.includes('src="/zhiqu-recommendations.js"')) {
        html = html.replace('</head>', `${recommendationsScript}</head>`);
      }
      const tailScripts = standaloneRecords
        ? recordsReferenceScript
        : standaloneSinglePlayer
        ? ''
        : standaloneMagicLobby
          ? magicEntryNavigationScript
          : `${magicEntryNavigationScript}${rewardsBackScript}${navBackgroundScript}`;
      const magicRouteScript = standaloneAssistant || standaloneRecords || standaloneSinglePlayer ? '' : magicLandscapeScript;
      const magicLobbyScript = standaloneAssistant || standaloneRecords || standaloneSinglePlayer ? '' : magicReferenceScript;
      const magicRoomScript = standaloneAssistant || standaloneRecords || standaloneSinglePlayer || standaloneMagicLobby ? '' : magicRoomReferenceScript;
      const blindBoxRouteScript = standaloneAssistant || standaloneRecords || standaloneSinglePlayer || standaloneMagicLobby ? '' : blindBoxLandscapeScript;
      const recordsNavigation = standaloneRecords ? '' : recordsNavigationScript;
      body = Buffer.from(html.replace('</body>', `${scripts.join('')}${magicRouteScript}${blindBoxRouteScript}${magicLobbyScript}${magicRoomScript}${tailScripts}${recordsNavigation}</body>`));
    }
    response.writeHead(200, {
      'Content-Type': mime[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    response.end(body);
  } catch (error) {
    response.writeHead(500);
    response.end('Internal server error');
  }
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Zhiqu web demo listening at http://localhost:${port}`);
});
