(() => {
  const STYLE_ID = 'zhiqu-ask-body-styles';
  const FIELD_SELECTOR = 'textarea[aria-label^="问题正文"]';
  const MIN_HEIGHT = 280;
  const MAX_HEIGHT = 560;
  let scheduled = false;

  function isQuestionEditorRoute() {
    return /\/community\/(?:ask|questions\/[^/]+\/edit)(?:\.html)?\/?$/.test(location.pathname);
  }

  function installStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      ${FIELD_SELECTOR}[data-zhiqu-long-body] {
        box-sizing: border-box !important;
        width: 100% !important;
        min-height: ${MIN_HEIGHT}px !important;
        max-height: ${MAX_HEIGHT}px !important;
        padding: 16px !important;
        border-radius: 10px !important;
        line-height: 26px !important;
        resize: vertical !important;
        overflow-y: hidden !important;
      }
    `;
    document.head.appendChild(style);
  }

  function resizeField(field) {
    field.style.setProperty('height', 'auto', 'important');
    const height = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, field.scrollHeight));
    field.style.setProperty('height', `${height}px`, 'important');
    field.style.setProperty('overflow-y', field.scrollHeight > MAX_HEIGHT ? 'auto' : 'hidden', 'important');
  }

  function enhanceField() {
    if (!isQuestionEditorRoute()) return;
    const field = document.querySelector(FIELD_SELECTOR);
    if (!field) return;
    installStyles();
    field.dataset.zhiquLongBody = 'true';
    field.maxLength = 3000;
    field.setAttribute('maxlength', '3000');
    if (!field.dataset.zhiquLongBodyBound) {
      field.dataset.zhiquLongBodyBound = 'true';
      field.addEventListener('input', () => resizeField(field), { passive: true });
    }
    requestAnimationFrame(() => resizeField(field));
  }

  function scheduleEnhancement() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      enhanceField();
    });
  }

  const observer = new MutationObserver(scheduleEnhancement);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('popstate', scheduleEnhancement);
  scheduleEnhancement();
})();
