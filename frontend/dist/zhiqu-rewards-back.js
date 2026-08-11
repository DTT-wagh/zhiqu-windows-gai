(() => {
  const BUTTON_ID = 'zq-rewards-back';
  const STYLE_ID = 'zq-rewards-back-style';
  const REWARDS_PATH = '/rewards';
  const FALLBACK_PATH = '/magic?mode=create';

  function addStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${BUTTON_ID} {
        width: 44px;
        height: 44px;
        flex: 0 0 44px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        margin: 0;
        padding: 0;
        border: 0;
        border-radius: 50%;
        color: #243139;
        background: transparent;
        cursor: pointer;
        pointer-events: auto;
        appearance: none;
        -webkit-tap-highlight-color: transparent;
      }
      #${BUTTON_ID}:hover { background: rgba(36, 49, 57, 0.06); }
      #${BUTTON_ID}:active { background: rgba(36, 49, 57, 0.12); }
      #${BUTTON_ID}:focus-visible {
        outline: 2px solid #2457d6;
        outline-offset: 1px;
      }
      #${BUTTON_ID}::before {
        content: '';
        width: 11px;
        height: 11px;
        border-left: 2.5px solid currentColor;
        border-bottom: 2.5px solid currentColor;
        transform: rotate(45deg);
      }
    `;
    document.head.appendChild(style);
  }

  function goBack() {
    if (globalThis.history.length > 1) {
      globalThis.history.back();
      return;
    }
    globalThis.location.assign(FALLBACK_PATH);
  }

  function findRewardsHeading() {
    return Array.from(document.querySelectorAll('h1[role="heading"], h1')).find(
      (heading) => heading.textContent?.trim() === '个人成长'
    );
  }

  function hasNativeBackControl() {
    return document.querySelector(
      'a[aria-label="back"], a[aria-label$=", back"], [role="link"][aria-label="back"], [role="link"][aria-label$=", back"]'
    ) !== null;
  }

  function syncBackButton() {
    const existing = document.getElementById(BUTTON_ID);
    if (globalThis.location.pathname !== REWARDS_PATH) {
      existing?.remove();
      return;
    }

    const heading = findRewardsHeading();
    const headerRow = heading?.parentElement?.parentElement;
    const leftSlot = headerRow?.firstElementChild;
    if (!heading || !headerRow || !leftSlot) return;

    if (hasNativeBackControl()) {
      existing?.remove();
      return;
    }

    if (existing && existing.parentElement === leftSlot) return;
    existing?.remove();

    const button = document.createElement('button');
    button.id = BUTTON_ID;
    button.type = 'button';
    button.setAttribute('aria-label', '返回');
    button.title = '返回';
    button.addEventListener('click', goBack);
    leftSlot.appendChild(button);
  }

  function start() {
    addStyles();
    new MutationObserver(syncBackButton).observe(document.documentElement, {
      childList: true,
      subtree: true
    });
    globalThis.requestAnimationFrame(syncBackButton);
    globalThis.addEventListener('popstate', syncBackButton);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
