(() => {
  const STYLE_ID = 'zhiqu-ask-navigation-styles';
  const NAV_ATTR = 'data-zhiqu-ask-navigation';
  let scheduled = false;

  function isAskRoute() {
    return /\/community\/ask(?:\.html)?\/?$/.test(location.pathname);
  }

  function installStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      [${NAV_ATTR}] {
        min-height: 64px !important;
        border-bottom: 1px solid rgba(216, 216, 216, 0.72) !important;
        background: rgba(247, 244, 236, 0.96) !important;
      }

      [${NAV_ATTR}] > :first-child,
      [${NAV_ATTR}] > :last-child {
        display: flex !important;
        width: 76px !important;
        min-width: 76px !important;
        min-height: 52px !important;
        align-items: center !important;
        justify-content: center !important;
        margin: 0 !important;
      }

      [${NAV_ATTR}] .zq-ask-navigation-button {
        box-sizing: border-box !important;
        display: inline-flex !important;
        min-width: 52px !important;
        min-height: 44px !important;
        align-items: center !important;
        justify-content: center !important;
        padding: 0 12px !important;
        border: 0 !important;
        border-radius: 22px !important;
        background: transparent !important;
        color: #365c8d !important;
        cursor: pointer !important;
        font: 700 15px/22px -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif !important;
        white-space: nowrap !important;
      }

      [${NAV_ATTR}] .zq-ask-navigation-back {
        padding: 0 !important;
        color: #243139 !important;
        font: 400 34px/38px Arial, sans-serif !important;
      }

      [${NAV_ATTR}] .zq-ask-navigation-button:hover {
        background: rgba(54, 92, 141, 0.1) !important;
      }

      [${NAV_ATTR}] .zq-ask-navigation-button:focus-visible {
        outline: 2px solid #365c8d !important;
        outline-offset: 2px !important;
      }
    `;
    document.head.appendChild(style);
  }

  function navigateBack() {
    location.assign('/community');
  }

  function createButton(className, label, text) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `zq-ask-navigation-button ${className}`;
    button.setAttribute('aria-label', label);
    button.textContent = text;
    return button;
  }

  function enhanceNavigation() {
    if (!isAskRoute()) return;
    const heading = Array.from(document.querySelectorAll('h1')).find((node) => node.textContent?.trim() === '提问题');
    const bar = heading?.parentElement?.parentElement;
    if (!bar || bar.getAttribute(NAV_ATTR) === 'true') return;

    installStyles();
    bar.setAttribute(NAV_ATTR, 'true');
    const leftSlot = bar.firstElementChild;
    const rightSlot = bar.lastElementChild;
    if (!leftSlot || !rightSlot || leftSlot === rightSlot) return;

    const backButton = createButton('zq-ask-navigation-back', '返回社区', '←');
    const cancelButton = createButton('zq-ask-navigation-cancel', '取消编辑', '取消');
    leftSlot.replaceChildren(backButton);
    rightSlot.replaceChildren(cancelButton);
  }

  function scheduleEnhancement() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      enhanceNavigation();
    });
  }

  document.addEventListener('click', (event) => {
    if (!isAskRoute() || !(event.target instanceof Element)) return;
    if (event.target.closest('.zq-ask-navigation-button')) {
      event.preventDefault();
      event.stopImmediatePropagation();
      navigateBack();
    }
  }, true);

  const observer = new MutationObserver(scheduleEnhancement);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('popstate', scheduleEnhancement);
  scheduleEnhancement();
})();
