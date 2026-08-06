(() => {
  const ATTR = 'data-zq-friends-exit';
  const STYLE_ID = 'zhiqu-friends-navigation-styles';

  function isFriendsRoute() {
    return /^\/friends(?:\/add)?(?:\.html)?\/?$/.test(location.pathname);
  }

  function installStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      [${ATTR}] {
        position: fixed;
        top: max(14px, env(safe-area-inset-top));
        right: max(14px, env(safe-area-inset-right));
        z-index: 2147483000;
        display: inline-grid;
        width: 42px;
        height: 42px;
        place-items: center;
        border: 1px solid #d8d0c1;
        border-radius: 50%;
        background: rgba(255, 253, 250, .96);
        color: #53616a;
        cursor: pointer;
        font: 400 28px/1 Arial, sans-serif;
        box-shadow: 0 4px 14px rgba(28, 39, 46, .12);
      }
      [${ATTR}]:hover { background: #ebe5da; color: #243139; }
      [${ATTR}]:focus-visible { outline: 2px solid #365c8d; outline-offset: 2px; }
    `;
    document.head.appendChild(style);
  }

  function navigateBack() {
    if (/^\/friends\/add/.test(location.pathname) && history.length > 1) {
      history.back();
      return;
    }
    location.assign('/');
  }

  function hasNativeBackButton() {
    return Boolean(document.querySelector(
      `a[aria-label$=", back"], a[aria-label*="返回"], button[aria-label*="返回"]:not([${ATTR}])`,
    ));
  }

  function enhance() {
    const existing = document.querySelector(`[${ATTR}]`);
    if (!isFriendsRoute()) {
      existing?.remove();
      return;
    }
    if (hasNativeBackButton()) {
      existing?.remove();
      return;
    }
    if (existing) return;
    installStyles();
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute(ATTR, 'true');
    button.setAttribute('aria-label', '返回上一页或退出好友页');
    button.title = '返回上一页或退出好友页';
    button.textContent = '×';
    button.addEventListener('click', navigateBack);
    document.body.appendChild(button);
  }

  const observer = new MutationObserver(enhance);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('popstate', enhance);
  window.addEventListener('zqroutechange', enhance);
  enhance();
})();
