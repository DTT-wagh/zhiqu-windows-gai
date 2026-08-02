(() => {
  const ROOT_ID = 'zhiqu-avatar-preview-root';
  const STYLE_ID = 'zhiqu-avatar-preview-styles';
  const AVATAR_SELECTOR = 'img[alt="自定义头像"]';
  const DOUBLE_TAP_DELAY = 360;

  let lastTapTime = 0;
  let lastTapTarget = null;
  let previousFocus = null;
  let previousOverflow = null;

  function isProfileRoute() {
    return /\/profile(?:\.html)?\/?$/.test(location.pathname);
  }

  function findAvatar(target) {
    if (!isProfileRoute() || !(target instanceof Element)) return null;
    return target.closest(AVATAR_SELECTOR);
  }

  function installStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      ${AVATAR_SELECTOR} {
        cursor: zoom-in !important;
        -webkit-user-drag: none;
        user-select: none;
      }

      #${ROOT_ID} {
        position: fixed !important;
        inset: 0 !important;
        z-index: 2147483647 !important;
        display: grid !important;
        grid-template-rows: auto minmax(0, 1fr) !important;
        width: 100vw !important;
        height: 100vh !important;
        margin: 0 !important;
        padding: 0 !important;
        background: rgba(7, 12, 18, 0.94) !important;
        color: #fff !important;
        opacity: 0;
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        transition: opacity 180ms ease;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif;
      }

      #${ROOT_ID}.zq-avatar-preview-open {
        opacity: 1;
      }

      #${ROOT_ID}.zq-avatar-preview-closing {
        opacity: 0;
      }

      #${ROOT_ID} .zq-avatar-preview-header {
        box-sizing: border-box;
        display: grid;
        grid-template-columns: 44px minmax(0, 1fr) 44px;
        align-items: center;
        min-height: 68px;
        padding: max(10px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) 8px max(16px, env(safe-area-inset-left));
      }

      #${ROOT_ID} .zq-avatar-preview-title {
        grid-column: 2;
        margin: 0;
        overflow: hidden;
        color: #fff;
        font-size: 17px;
        font-weight: 700;
        line-height: 24px;
        text-align: center;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      #${ROOT_ID} .zq-avatar-preview-close {
        grid-column: 3;
        display: grid;
        place-items: center;
        width: 44px;
        height: 44px;
        margin: 0;
        padding: 0 0 3px;
        border: 0;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.12);
        color: #fff;
        cursor: pointer;
        font: 300 32px/1 Arial, sans-serif;
        transition: background-color 150ms ease, transform 150ms ease;
      }

      #${ROOT_ID} .zq-avatar-preview-close:hover {
        background: rgba(255, 255, 255, 0.2);
      }

      #${ROOT_ID} .zq-avatar-preview-close:active {
        transform: scale(0.94);
      }

      #${ROOT_ID} .zq-avatar-preview-close:focus-visible {
        outline: 2px solid #fff;
        outline-offset: 3px;
      }

      #${ROOT_ID} .zq-avatar-preview-stage {
        box-sizing: border-box;
        display: flex;
        min-width: 0;
        min-height: 0;
        align-items: center;
        justify-content: center;
        padding: 8px max(24px, env(safe-area-inset-right)) max(28px, env(safe-area-inset-bottom)) max(24px, env(safe-area-inset-left));
      }

      #${ROOT_ID} .zq-avatar-preview-image {
        display: block;
        width: auto;
        height: auto;
        max-width: min(92vw, 760px);
        max-height: calc(100vh - 112px);
        border-radius: 10px;
        object-fit: contain;
        box-shadow: 0 18px 54px rgba(0, 0, 0, 0.44);
        opacity: 0;
        transform: scale(0.96);
        transition: opacity 180ms ease, transform 220ms ease;
      }

      #${ROOT_ID}.zq-avatar-preview-open .zq-avatar-preview-image {
        opacity: 1;
        transform: scale(1);
      }

      @media (max-width: 700px) {
        #${ROOT_ID} .zq-avatar-preview-image {
          max-width: 94vw;
          max-height: calc(100vh - 104px);
          border-radius: 6px;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        #${ROOT_ID},
        #${ROOT_ID} .zq-avatar-preview-image,
        #${ROOT_ID} .zq-avatar-preview-close {
          transition: none;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function restorePage() {
    if (previousOverflow) {
      document.documentElement.style.overflow = previousOverflow.html;
      document.body.style.overflow = previousOverflow.body;
      previousOverflow = null;
    }

    if (previousFocus instanceof HTMLElement && document.contains(previousFocus)) {
      previousFocus.focus({ preventScroll: true });
    }
    previousFocus = null;
  }

  function closePreview() {
    const root = document.getElementById(ROOT_ID);
    if (!root || root.classList.contains('zq-avatar-preview-closing')) return;

    root.classList.add('zq-avatar-preview-closing');
    root.classList.remove('zq-avatar-preview-open');
    window.setTimeout(() => {
      root.remove();
      restorePage();
    }, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 180);
  }

  function openPreview(avatar) {
    if (document.getElementById(ROOT_ID)) return;

    const source = avatar.currentSrc || avatar.src;
    if (!source) return;

    installStyles();
    previousFocus = document.activeElement;
    previousOverflow = {
      html: document.documentElement.style.overflow,
      body: document.body.style.overflow,
    };
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';

    const root = document.createElement('div');
    root.id = ROOT_ID;
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-labelledby', 'zhiqu-avatar-preview-title');

    const header = document.createElement('div');
    header.className = 'zq-avatar-preview-header';

    const title = document.createElement('div');
    title.id = 'zhiqu-avatar-preview-title';
    title.className = 'zq-avatar-preview-title';
    title.textContent = '头像预览';

    const closeButton = document.createElement('button');
    closeButton.className = 'zq-avatar-preview-close';
    closeButton.type = 'button';
    closeButton.textContent = '×';
    closeButton.setAttribute('aria-label', '关闭头像预览');
    closeButton.title = '关闭';

    const stage = document.createElement('div');
    stage.className = 'zq-avatar-preview-stage';

    const image = document.createElement('img');
    image.className = 'zq-avatar-preview-image';
    image.src = source;
    image.alt = '放大的头像';
    image.draggable = false;

    header.append(title, closeButton);
    stage.appendChild(image);
    root.append(header, stage);
    document.body.appendChild(root);

    closeButton.addEventListener('click', closePreview);
    root.addEventListener('click', (event) => {
      if (event.target === root || event.target === header || event.target === stage) closePreview();
    });

    requestAnimationFrame(() => root.classList.add('zq-avatar-preview-open'));
    closeButton.focus({ preventScroll: true });
  }

  document.addEventListener('dblclick', (event) => {
    const avatar = findAvatar(event.target);
    if (!avatar) return;
    event.preventDefault();
    openPreview(avatar);
  }, true);

  document.addEventListener('pointerup', (event) => {
    if (event.pointerType === 'mouse') return;

    const avatar = findAvatar(event.target);
    if (!avatar) {
      lastTapTarget = null;
      lastTapTime = 0;
      return;
    }

    const now = Date.now();
    if (lastTapTarget === avatar && now - lastTapTime <= DOUBLE_TAP_DELAY) {
      event.preventDefault();
      lastTapTarget = null;
      lastTapTime = 0;
      openPreview(avatar);
      return;
    }

    lastTapTarget = avatar;
    lastTapTime = now;
  }, true);

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && document.getElementById(ROOT_ID)) closePreview();
  });
})();
