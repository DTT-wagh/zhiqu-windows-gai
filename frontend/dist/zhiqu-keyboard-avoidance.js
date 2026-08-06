(() => {
  if (globalThis.__zqKeyboardAvoidanceInstalled) return;
  globalThis.__zqKeyboardAvoidanceInstalled = true;

  const root = document.documentElement;
  const body = document.body;
  const viewport = globalThis.visualViewport;
  const originalBodyPaddingBottom = body.style.paddingBottom;
  const originalScrollPaddingBottom = root.style.scrollPaddingBottom;
  let scrollTimer;

  body.dataset.zqKeyboardAvoidance = 'installed';

  function isMobileViewport() {
    return window.innerWidth <= 768 || window.matchMedia('(pointer: coarse)').matches;
  }

  function isEditable(element) {
    if (!(element instanceof HTMLElement)) return false;
    if (element.matches('input, textarea, select')) return true;
    return element.isContentEditable;
  }

  function keyboardInset() {
    if (!viewport || !isMobileViewport()) return 0;
    return Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
  }

  function updateInset() {
    const inset = keyboardInset();
    if (inset > 0) {
      const padding = `${inset + 20}px`;
      root.style.scrollPaddingBottom = padding;
      body.style.paddingBottom = padding;
    } else {
      root.style.scrollPaddingBottom = originalScrollPaddingBottom;
      body.style.paddingBottom = originalBodyPaddingBottom;
    }
  }

  function scrollFocusedInput() {
    window.clearTimeout(scrollTimer);
    scrollTimer = window.setTimeout(() => {
      const active = document.activeElement;
      if (!isEditable(active) || !isMobileViewport()) return;

      const inset = keyboardInset();
      const rect = active.getBoundingClientRect();
      const viewportTop = viewport?.offsetTop ?? 0;
      const viewportBottom = viewportTop + (viewport?.height ?? window.innerHeight);
      const margin = Math.max(20, inset + 12);
      if (rect.top < viewportTop + 12 || rect.bottom > viewportBottom - margin) {
        active.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
      }
    }, 80);
  }

  function handleViewportChange() {
    updateInset();
    scrollFocusedInput();
  }

  document.addEventListener('focusin', scrollFocusedInput, true);
  document.addEventListener('focusout', updateInset, true);
  window.addEventListener('resize', handleViewportChange, { passive: true });
  viewport?.addEventListener('resize', handleViewportChange, { passive: true });
  viewport?.addEventListener('scroll', scrollFocusedInput, { passive: true });
  updateInset();
})();
