(() => {
  const BACK_SELECTOR = 'button[aria-label="返回个人页"]';
  const TOAST_ID = 'zhiqu-profile-edit-toast';
  const STYLE_ID = 'zhiqu-profile-edit-feedback-styles';
  const PROFILE_API_PATH = '/api/users/me';

  let dismissTimer = null;
  let redirectTimer = null;
  let saveSucceededAt = 0;

  function isEditRoute() {
    return /\/profile\/edit(?:\.html)?\/?$/.test(location.pathname);
  }

  function isProfileUpdate(input, init) {
    const method = String(init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
    const url = String(input instanceof Request ? input.url : input);
    if (method !== 'PUT') return false;

    try {
      return new URL(url, location.origin).pathname === PROFILE_API_PATH;
    } catch {
      return url.includes(PROFILE_API_PATH);
    }
  }

  function installStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${TOAST_ID} {
        position: fixed !important;
        left: 50% !important;
        bottom: max(28px, env(safe-area-inset-bottom)) !important;
        z-index: 2147483645 !important;
        box-sizing: border-box !important;
        display: flex !important;
        min-width: 178px !important;
        max-width: calc(100vw - 32px) !important;
        min-height: 48px !important;
        align-items: center !important;
        justify-content: center !important;
        gap: 9px !important;
        margin: 0 !important;
        padding: 11px 18px !important;
        border: 1px solid rgba(255, 255, 255, 0.24) !important;
        border-radius: 8px !important;
        background: #25343d !important;
        box-shadow: 0 10px 30px rgba(25, 38, 47, 0.24) !important;
        color: #fff !important;
        font: 700 14px/22px -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif !important;
        letter-spacing: 0 !important;
        text-align: center !important;
        opacity: 0 !important;
        transform: translate(-50%, 12px) !important;
        transition: opacity 160ms ease, transform 180ms ease !important;
        pointer-events: none !important;
      }

      #${TOAST_ID}.zq-profile-toast-visible {
        opacity: 1 !important;
        transform: translate(-50%, 0) !important;
      }

      #${TOAST_ID}[data-kind="success"] {
        background: #2f6247 !important;
      }

      #${TOAST_ID}[data-kind="error"] {
        background: #9b3f37 !important;
      }

      #${TOAST_ID} .zq-profile-toast-icon {
        flex: 0 0 auto !important;
        width: 20px !important;
        height: 20px !important;
        font: 800 17px/20px Arial, sans-serif !important;
      }

      #${TOAST_ID}[data-kind="loading"] .zq-profile-toast-icon {
        box-sizing: border-box !important;
        border: 2px solid rgba(255, 255, 255, 0.38) !important;
        border-top-color: #fff !important;
        border-radius: 50% !important;
        animation: zq-profile-toast-spin 700ms linear infinite !important;
      }

      @keyframes zq-profile-toast-spin {
        to { transform: rotate(360deg); }
      }

      @media (prefers-reduced-motion: reduce) {
        #${TOAST_ID} { transition: none !important; }
        #${TOAST_ID} .zq-profile-toast-icon { animation: none !important; }
      }
    `;
    document.head.appendChild(style);
  }

  function showToast(message, kind, duration = 0) {
    installStyles();
    window.clearTimeout(dismissTimer);

    let toast = document.getElementById(TOAST_ID);
    if (!toast) {
      toast = document.createElement('div');
      toast.id = TOAST_ID;
      toast.setAttribute('role', 'status');
      toast.setAttribute('aria-live', 'polite');
      toast.innerHTML = '<span class="zq-profile-toast-icon" aria-hidden="true"></span><span class="zq-profile-toast-message"></span>';
      document.body.appendChild(toast);
    }

    toast.dataset.kind = kind;
    toast.querySelector('.zq-profile-toast-icon').textContent = kind === 'success' ? '\u2713' : kind === 'error' ? '!' : '';
    toast.querySelector('.zq-profile-toast-message').textContent = message;
    requestAnimationFrame(() => toast.classList.add('zq-profile-toast-visible'));

    if (duration > 0) {
      dismissTimer = window.setTimeout(() => {
        toast.classList.remove('zq-profile-toast-visible');
        window.setTimeout(() => toast.remove(), 180);
      }, duration);
    }
  }

  async function getErrorMessage(response) {
    try {
      const payload = await response.clone().json();
      return payload?.message || payload?.error || '保存失败，请稍后重试';
    } catch {
      return '保存失败，请稍后重试';
    }
  }

  function openProfile() {
    window.clearTimeout(redirectTimer);
    location.assign('/profile');
  }

  function installFetchFeedback() {
    if (typeof window.fetch !== 'function' || window.fetch.zhiquProfileFeedback) return;

    const originalFetch = window.fetch.bind(window);
    const wrappedFetch = async (...args) => {
      const profileUpdate = isEditRoute() && isProfileUpdate(args[0], args[1]);
      if (profileUpdate) showToast('正在保存资料...', 'loading');

      try {
        const response = await originalFetch(...args);
        if (!profileUpdate) return response;

        if (!response.ok) {
          showToast(await getErrorMessage(response), 'error', 3200);
          return response;
        }

        saveSucceededAt = Date.now();
        showToast('资料保存成功', 'success');
        redirectTimer = window.setTimeout(openProfile, 650);
        return response;
      } catch (error) {
        if (profileUpdate) showToast('网络异常，资料保存失败', 'error', 3200);
        throw error;
      }
    };

    wrappedFetch.zhiquProfileFeedback = true;
    window.fetch = wrappedFetch;
  }

  document.addEventListener('click', (event) => {
    if (!isEditRoute() || !(event.target instanceof Element)) return;

    const backButton = event.target.closest(BACK_SELECTOR);
    if (backButton) {
      event.preventDefault();
      event.stopImmediatePropagation();
      openProfile();
      return;
    }

    const button = event.target.closest('button');
    if (button?.textContent?.trim() === '保存资料') {
      showToast('正在保存资料...', 'loading');
    }
  }, true);

  window.addEventListener('popstate', () => {
    if (Date.now() - saveSucceededAt < 3000 && location.pathname !== '/profile') {
      location.replace('/profile');
    }
  });

  installFetchFeedback();
})();
