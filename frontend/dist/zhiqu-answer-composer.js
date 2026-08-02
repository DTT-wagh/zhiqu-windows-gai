(() => {
  const COMPOSER_ATTR = 'data-zhiqu-answer-composer';
  const SCROLL_ATTR = 'data-zhiqu-answer-scroll';
  const QUESTION_BACK_ATTR = 'data-zhiqu-question-back';
  const STYLE_ID = 'zhiqu-answer-composer-styles';
  const API_BASE = 'http://localhost:8080';
  const SESSION_KEY = 'zhiqu.auth.session.v1';
  const IMAGE_MARKER = /\[图片:([0-9a-f]{32}\.(?:jpg|png|gif|webp))\]/gi;
  const MAX_IMAGES = 9;
  const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
  let attachments = [];
  let uploadInProgress = false;
  let scheduled = false;
  let started = false;

  function isQuestionDetailRoute() {
    return /\/community\/questions\/[^/]+(?:\.html)?\/?$/.test(location.pathname);
  }

  function installStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      [${SCROLL_ATTR}] {
        padding-bottom: 100px !important;
      }

      [${SCROLL_ATTR}][data-zhiqu-answer-expanded="true"] {
        padding-bottom: 390px !important;
      }

      [${QUESTION_BACK_ATTR}] {
        display: inline-flex !important;
        width: 44px !important;
        height: 44px !important;
        align-items: center !important;
        justify-content: center !important;
        padding: 0 !important;
        border: 0 !important;
        border-radius: 8px !important;
        background: transparent !important;
        color: #365c8d !important;
        cursor: pointer !important;
        font: 700 28px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif !important;
      }

      [${QUESTION_BACK_ATTR}]:hover {
        background: rgba(54, 92, 141, 0.1) !important;
      }

      [${QUESTION_BACK_ATTR}]:focus-visible {
        outline: 2px solid #365c8d !important;
        outline-offset: 2px !important;
      }

      [${COMPOSER_ATTR}] {
        position: fixed !important;
        right: max(14px, env(safe-area-inset-right)) !important;
        bottom: max(14px, env(safe-area-inset-bottom)) !important;
        left: max(14px, env(safe-area-inset-left)) !important;
        z-index: 1005 !important;
        box-sizing: border-box !important;
        display: flex !important;
        width: min(100% - 28px, 980px) !important;
        min-height: 62px !important;
        margin: 0 auto !important;
        align-items: center !important;
        padding: 8px 10px !important;
        border: 1px solid #d8d2c5 !important;
        border-radius: 12px !important;
        background: rgba(255, 253, 250, 0.97) !important;
        box-shadow: 0 8px 28px rgba(36, 49, 57, 0.18) !important;
        backdrop-filter: blur(12px) !important;
        -webkit-backdrop-filter: blur(12px) !important;
      }

      [${COMPOSER_ATTR}].zq-answer-flow {
        position: absolute !important;
        top: var(--zq-answer-flow-top) !important;
        right: auto !important;
        bottom: auto !important;
        left: var(--zq-answer-flow-left) !important;
        width: var(--zq-answer-flow-width) !important;
        margin: 0 !important;
        transform: none !important;
      }

      [${COMPOSER_ATTR}].zq-answer-pinned {
        position: fixed !important;
      }

      [${COMPOSER_ATTR}].zq-answer-expanded {
        display: flex !important;
        max-height: min(72vh, 460px) !important;
        align-items: stretch !important;
        gap: 10px !important;
        padding: 14px !important;
        border-color: #365c8d !important;
      }

      [${COMPOSER_ATTR}] > .zq-answer-collapsed-trigger {
        display: flex !important;
        width: 100% !important;
        min-height: 44px !important;
        align-items: center !important;
        justify-content: flex-start !important;
        padding: 0 14px !important;
        border: 1px solid #d8d2c5 !important;
        border-radius: 22px !important;
        background: #fffdfa !important;
        color: #7a8389 !important;
        cursor: text !important;
        font: 600 15px/22px -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif !important;
        text-align: left !important;
      }

      [${COMPOSER_ATTR}] > .zq-answer-collapse-button {
        display: none !important;
      }

      [${COMPOSER_ATTR}].zq-answer-expanded > .zq-answer-collapsed-trigger {
        display: none !important;
      }

      [${COMPOSER_ATTR}] > :not(.zq-answer-collapsed-trigger):not(.zq-answer-collapse-button) {
        display: none !important;
      }

      [${COMPOSER_ATTR}].zq-answer-expanded > :not(.zq-answer-collapsed-trigger) {
        display: flex !important;
      }

      [${COMPOSER_ATTR}].zq-answer-expanded textarea[aria-label="回答正文"] {
        box-sizing: border-box !important;
        width: 100% !important;
        min-height: 140px !important;
        max-height: 250px !important;
        flex: 1 1 auto !important;
        padding: 14px !important;
        border: 1px solid #d8d2c5 !important;
        border-radius: 10px !important;
        background: #fffdfa !important;
        color: #243139 !important;
        font-size: 15px !important;
        line-height: 24px !important;
        resize: vertical !important;
      }

      [${COMPOSER_ATTR}] .zq-answer-image-tools {
        width: 100% !important;
        flex: 0 0 auto !important;
        flex-direction: column !important;
        gap: 9px !important;
      }

      [${COMPOSER_ATTR}] .zq-answer-image-toolbar {
        display: flex !important;
        min-height: 38px !important;
        align-items: center !important;
        justify-content: space-between !important;
        gap: 10px !important;
      }

      [${COMPOSER_ATTR}] .zq-answer-image-button {
        display: inline-flex !important;
        min-height: 38px !important;
        align-items: center !important;
        gap: 7px !important;
        padding: 0 12px !important;
        border: 1px solid #c8d1dc !important;
        border-radius: 8px !important;
        background: #f8fafc !important;
        color: #365c8d !important;
        cursor: pointer !important;
        font: 700 14px/20px -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif !important;
      }

      [${COMPOSER_ATTR}] .zq-answer-image-button:hover {
        background: #edf3f9 !important;
      }

      [${COMPOSER_ATTR}] .zq-answer-image-button:disabled {
        cursor: not-allowed !important;
        opacity: 0.55 !important;
      }

      [${COMPOSER_ATTR}] .zq-answer-image-help,
      [${COMPOSER_ATTR}] .zq-answer-image-status {
        color: #7a8389 !important;
        font: 600 12px/18px -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif !important;
      }

      [${COMPOSER_ATTR}] .zq-answer-image-status[data-tone="error"] {
        color: #b5223c !important;
      }

      [${COMPOSER_ATTR}] .zq-answer-image-status[data-tone="working"] {
        color: #365c8d !important;
      }

      [${COMPOSER_ATTR}] .zq-answer-image-list {
        display: grid !important;
        width: 100% !important;
        grid-template-columns: repeat(6, minmax(0, 1fr)) !important;
        gap: 8px !important;
      }

      [${COMPOSER_ATTR}] .zq-answer-image-item {
        position: relative !important;
        overflow: hidden !important;
        aspect-ratio: 1 !important;
        border: 1px solid #d8d2c5 !important;
        border-radius: 8px !important;
        background: #eef1f3 !important;
      }

      [${COMPOSER_ATTR}] .zq-answer-image-item img {
        width: 100% !important;
        height: 100% !important;
        object-fit: cover !important;
        cursor: zoom-in !important;
      }

      [${COMPOSER_ATTR}] .zq-answer-image-remove {
        position: absolute !important;
        top: 4px !important;
        right: 4px !important;
        display: inline-flex !important;
        width: 26px !important;
        height: 26px !important;
        align-items: center !important;
        justify-content: center !important;
        padding: 0 !important;
        border: 0 !important;
        border-radius: 50% !important;
        background: rgba(20, 27, 31, 0.78) !important;
        color: #fff !important;
        cursor: pointer !important;
        font: 700 17px/1 sans-serif !important;
      }

      .zq-answer-published-gallery {
        display: grid !important;
        width: min(100%, 620px) !important;
        grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
        gap: 8px !important;
        margin-top: 10px !important;
      }

      .zq-answer-published-gallery[data-count="1"] {
        grid-template-columns: minmax(0, 320px) !important;
      }

      .zq-answer-published-image {
        display: block !important;
        width: 100% !important;
        aspect-ratio: 1 !important;
        object-fit: cover !important;
        border: 1px solid #d8d2c5 !important;
        border-radius: 8px !important;
        background: #eef1f3 !important;
        cursor: zoom-in !important;
      }

      .zq-answer-image-modal {
        position: fixed !important;
        inset: 0 !important;
        z-index: 5000 !important;
        display: none !important;
        align-items: center !important;
        justify-content: center !important;
        padding: 56px 20px 28px !important;
        background: rgba(10, 14, 17, 0.92) !important;
      }

      .zq-answer-image-modal[data-open="true"] {
        display: flex !important;
      }

      .zq-answer-image-modal img {
        max-width: min(94vw, 1200px) !important;
        max-height: calc(100vh - 90px) !important;
        object-fit: contain !important;
      }

      .zq-answer-image-modal-close {
        position: absolute !important;
        top: max(14px, env(safe-area-inset-top)) !important;
        right: max(16px, env(safe-area-inset-right)) !important;
        display: inline-flex !important;
        width: 42px !important;
        height: 42px !important;
        align-items: center !important;
        justify-content: center !important;
        padding: 0 !important;
        border: 1px solid rgba(255, 255, 255, 0.35) !important;
        border-radius: 50% !important;
        background: rgba(25, 32, 36, 0.75) !important;
        color: #fff !important;
        cursor: pointer !important;
        font: 700 24px/1 sans-serif !important;
      }

      [${COMPOSER_ATTR}].zq-answer-expanded > :first-of-type:not(.zq-answer-collapsed-trigger) {
        display: block !important;
        min-height: 24px !important;
        color: #243139 !important;
        font-size: 16px !important;
        font-weight: 800 !important;
        line-height: 24px !important;
      }

      [${COMPOSER_ATTR}].zq-answer-expanded .zq-answer-collapse-button {
        position: absolute !important;
        top: 9px !important;
        right: 10px !important;
        z-index: 2 !important;
        display: inline-flex !important;
        min-height: 34px !important;
        align-items: center !important;
        padding: 0 10px !important;
        border: 0 !important;
        border-radius: 17px !important;
        background: transparent !important;
        color: #365c8d !important;
        cursor: pointer !important;
        font: 700 13px/20px -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif !important;
      }

      [${COMPOSER_ATTR}].zq-answer-expanded .zq-answer-collapse-button:hover {
        background: rgba(54, 92, 141, 0.1) !important;
      }

      [${COMPOSER_ATTR}].zq-answer-expanded button[aria-disabled="true"] {
        opacity: 0.58 !important;
      }

      @media (max-width: 640px) {
        [${COMPOSER_ATTR}].zq-answer-expanded {
          max-height: min(78vh, 520px) !important;
        }

        [${COMPOSER_ATTR}].zq-answer-expanded textarea[aria-label="回答正文"] {
          min-height: 120px !important;
        }

        [${COMPOSER_ATTR}] .zq-answer-image-list {
          grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
        }

        .zq-answer-published-gallery {
          grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function createButton(className, label, text) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    button.setAttribute('aria-label', label);
    button.textContent = text;
    return button;
  }

  function readSession() {
    try {
      const raw = window.localStorage.getItem(SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function imageUrl(key) {
    return `${API_BASE}/api/community/images/${encodeURIComponent(key)}`;
  }

  function setImageStatus(composer, message, tone) {
    const status = composer?.querySelector('.zq-answer-image-status');
    if (!status) return;
    status.textContent = message || '';
    if (tone) status.dataset.tone = tone;
    else status.removeAttribute('data-tone');
  }

  function updateImageTools(composer) {
    const list = composer?.querySelector('.zq-answer-image-list');
    const button = composer?.querySelector('.zq-answer-image-button');
    const help = composer?.querySelector('.zq-answer-image-help');
    if (!list || !button) return;
    list.replaceChildren();
    attachments.forEach((item, index) => {
      const wrapper = document.createElement('div');
      wrapper.className = 'zq-answer-image-item';
      const image = document.createElement('img');
      image.src = item.previewUrl || item.url;
      image.alt = item.file?.name || `回答图片 ${index + 1}`;
      image.addEventListener('click', () => openImageModal(image.src));
      const remove = createButton('zq-answer-image-remove', `删除第 ${index + 1} 张图片`, '×');
      remove.addEventListener('click', () => {
        const removed = attachments.splice(index, 1)[0];
        if (removed?.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(removed.previewUrl);
        updateImageTools(composer);
      });
      wrapper.append(image, remove);
      list.appendChild(wrapper);
    });
    button.disabled = uploadInProgress || attachments.length >= MAX_IMAGES;
    if (help) help.textContent = `${attachments.length}/${MAX_IMAGES} 张，单张不超过 5MB`;
  }

  function openImageModal(url) {
    let modal = document.querySelector('.zq-answer-image-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.className = 'zq-answer-image-modal';
      modal.setAttribute('role', 'dialog');
      modal.setAttribute('aria-label', '查看图片');
      const close = createButton('zq-answer-image-modal-close', '关闭图片预览', '×');
      const image = document.createElement('img');
      modal.append(close, image);
      close.addEventListener('click', () => modal.removeAttribute('data-open'));
      modal.addEventListener('click', (event) => {
        if (event.target === modal) modal.removeAttribute('data-open');
      });
      document.body.appendChild(modal);
    }
    const image = modal.querySelector('img');
    if (image) image.src = url;
    modal.setAttribute('data-open', 'true');
  }

  async function uploadImage(item) {
    if (item.url) return item;
    const session = readSession();
    if (!session?.accessToken) throw new Error('请先登录后再添加图片');
    const form = new FormData();
    form.append('image', item.file, item.file.name || 'answer-image');
    const response = await fetch(`${API_BASE}/api/community/images`, {
      method: 'POST',
      headers: { Accept: 'application/json', Authorization: `Bearer ${session.accessToken}` },
      body: form,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.url) {
      throw new Error(payload.message || '图片上传失败，请稍后重试');
    }
    item.url = payload.url;
    item.key = payload.url.substring(payload.url.lastIndexOf('/') + 1);
    return item;
  }

  async function prepareAnswerBody(body) {
    if (!attachments.length) return body;
    const composer = document.querySelector(`[${COMPOSER_ATTR}]`);
    uploadInProgress = true;
    updateImageTools(composer);
    setImageStatus(composer, '正在上传图片…', 'working');
    try {
      for (const item of attachments) await uploadImage(item);
      const markers = attachments.map((item) => `[图片:${item.key}]`).join('\n');
      return [body, markers].filter(Boolean).join('\n\n');
    } finally {
      uploadInProgress = false;
      updateImageTools(composer);
      setImageStatus(composer, '', null);
    }
  }

  function clearAnswerImages() {
    attachments.forEach((item) => {
      if (item.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(item.previewUrl);
    });
    attachments = [];
    uploadInProgress = false;
    const composer = document.querySelector(`[${COMPOSER_ATTR}]`);
    updateImageTools(composer);
  }

  async function loadProtectedImage(url) {
    const session = readSession();
    if (!session?.accessToken) return null;
    try {
      const response = await fetch(url, { headers: { Authorization: `Bearer ${session.accessToken}` } });
      if (!response.ok) return null;
      return URL.createObjectURL(await response.blob());
    } catch {
      return null;
    }
  }

  function renderPublishedAnswerImages() {
    const candidates = Array.from(document.querySelectorAll('div,span,p')).filter((node) =>
      !node.querySelector('.zq-answer-published-gallery')
      && Array.from(node.childNodes).some((child) => child.nodeType === Node.TEXT_NODE && (child.textContent || '').includes('[图片:'))
    );
    candidates.forEach((node) => {
      IMAGE_MARKER.lastIndex = 0;
      const matches = Array.from(node.textContent.matchAll(IMAGE_MARKER));
      if (!matches.length || node.parentElement?.querySelector('.zq-answer-published-gallery')) return;
      const keys = matches.map((match) => match[1]);
      node.textContent = node.textContent.replace(IMAGE_MARKER, '').replace(/\n{3,}/g, '\n\n').trim();
      const gallery = document.createElement('div');
      gallery.className = 'zq-answer-published-gallery';
      gallery.dataset.count = String(keys.length);
      node.insertAdjacentElement('afterend', gallery);
      keys.forEach(async (key) => {
        const image = document.createElement('img');
        image.className = 'zq-answer-published-image';
        image.alt = '回答图片';
        image.src = imageUrl(key);
        image.addEventListener('click', () => openImageModal(image.src));
        gallery.appendChild(image);
        const protectedUrl = await loadProtectedImage(image.src);
        if (protectedUrl) {
          image.src = protectedUrl;
        }
      });
    });
  }

  function findComposer() {
    const field = document.querySelector('textarea[aria-label="回答正文"]');
    const submit = Array.from(document.querySelectorAll('button')).find((button) => button.innerText.trim() === '提交回答');
    if (!field || !submit) return null;
    let composer = field.parentElement;
    while (composer && !composer.contains(submit)) composer = composer.parentElement;
    return composer;
  }

  function returnToCommunity() {
    try {
      const referrer = document.referrer ? new URL(document.referrer) : null;
      const cameFromCommunity = referrer?.origin === location.origin
        && /^\/community(?:\?.*)?$/.test(referrer.pathname + referrer.search);
      if (cameFromCommunity && window.history.length > 1) {
        window.history.back();
        return;
      }
    } catch {
      // A direct visit has no usable in-app referrer, so use the list fallback.
    }
    location.assign('/community');
  }

  function ensureQuestionBackButton() {
    const heading = Array.from(document.querySelectorAll('h1,[role="heading"]'))
      .find((node) => (node.textContent || '').trim() === '问题详情');
    const bar = heading?.parentElement?.parentElement;
    const slot = bar?.firstElementChild;
    if (!heading || !bar || !slot || !Array.from(bar.children).includes(heading.parentElement)) return;
    let button = slot.querySelector(`[${QUESTION_BACK_ATTR}]`);
    if (!button) {
      button = createButton('', '返回社区', '←');
      button.setAttribute(QUESTION_BACK_ATTR, 'true');
      button.title = '返回社区';
      button.addEventListener('click', returnToCommunity);
      slot.replaceChildren(button);
    }
  }

  function ensureImageTools(composer) {
    const field = composer?.querySelector('textarea[aria-label="回答正文"]');
    if (!field) return;
    let tools = composer.querySelector('.zq-answer-image-tools');
    if (!tools) {
      tools = document.createElement('div');
      tools.className = 'zq-answer-image-tools';
      const toolbar = document.createElement('div');
      toolbar.className = 'zq-answer-image-toolbar';
      const add = createButton('zq-answer-image-button', '添加图片', '添加图片');
      const help = document.createElement('span');
      help.className = 'zq-answer-image-help';
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/jpeg,image/png,image/gif,image/webp';
      input.multiple = true;
      input.hidden = true;
      input.setAttribute('aria-label', '选择回答图片');
      const list = document.createElement('div');
      list.className = 'zq-answer-image-list';
      const status = document.createElement('div');
      status.className = 'zq-answer-image-status';
      status.setAttribute('aria-live', 'polite');
      add.addEventListener('click', () => {
        if (!uploadInProgress) input.click();
      });
      input.addEventListener('change', () => {
        const selected = Array.from(input.files || []);
        input.value = '';
        if (!selected.length) return;
        const accepted = [];
        let error = '';
        for (const file of selected) {
          if (attachments.length + accepted.length >= MAX_IMAGES) {
            error = `一次最多添加 ${MAX_IMAGES} 张图片`;
            break;
          }
          if (!['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(file.type)) {
            error = '仅支持 JPG、PNG、GIF、WebP 图片';
            continue;
          }
          if (file.size > MAX_IMAGE_BYTES) {
            error = '单张图片不能超过 5MB';
            continue;
          }
          accepted.push({ file, previewUrl: URL.createObjectURL(file), key: null, url: null });
        }
        attachments.push(...accepted);
        setImageStatus(composer, error, error ? 'error' : null);
        updateImageTools(composer);
      });
      toolbar.append(add, help, input);
      tools.append(toolbar, list, status);
      field.insertAdjacentElement('afterend', tools);
    }
    updateImageTools(composer);
  }

  function findScrollParent(node) {
    let parent = node?.parentElement;
    while (parent) {
      const style = getComputedStyle(parent);
      if (/(auto|scroll)/.test(style.overflowY)) return parent;
      parent = parent.parentElement;
    }
    return null;
  }

  function findAnswerAnchor(composer) {
    const parent = composer?.parentElement;
    if (!parent) return null;
    for (const section of Array.from(parent.children)) {
      if (section === composer) continue;
      const heading = section.firstElementChild;
      if (heading && /^回答\s*\d+/.test((heading.textContent || '').trim())) {
        return { parent, section, heading };
      }
    }
    return null;
  }

  function setFlowSpacing(composer, anchor, active) {
    const answer = anchor?.section?.children?.[1];
    if (!answer) return;
    if (active) {
      if (!Object.prototype.hasOwnProperty.call(answer, '__zqAnswerComposerOriginalMarginTop')) {
        answer.__zqAnswerComposerOriginalMarginTop = answer.style.marginTop;
      }
      answer.style.marginTop = `${Math.ceil(composer.offsetHeight + 16)}px`;
    } else if (Object.prototype.hasOwnProperty.call(answer, '__zqAnswerComposerOriginalMarginTop')) {
      answer.style.marginTop = answer.__zqAnswerComposerOriginalMarginTop;
      delete answer.__zqAnswerComposerOriginalMarginTop;
    }
  }

  function updateComposerPosition(composer, scrollParent, anchor) {
    if (!composer || !scrollParent) return;
    const section = anchor?.section;
    const heading = anchor?.heading;
    const anchorTop = section && heading
      ? section.getBoundingClientRect().top + heading.getBoundingClientRect().height + 8
      : Number.NEGATIVE_INFINITY;
    const viewportTop = scrollParent.getBoundingClientRect().top;
    const keepExpandedFlow = composer.getAttribute('data-zq-answer-keep-flow') === 'true' && anchorTop > viewportTop;
    const pinned = !keepExpandedFlow && (composer.classList.contains('zq-answer-expanded') || anchorTop <= viewportTop);
    composer.classList.toggle('zq-answer-flow', !pinned);
    composer.classList.toggle('zq-answer-pinned', pinned);

    if (pinned) {
      setFlowSpacing(composer, anchor, false);
      composer.style.removeProperty('--zq-answer-flow-top');
      composer.style.removeProperty('--zq-answer-flow-left');
      composer.style.removeProperty('--zq-answer-flow-width');
      composer.style.removeProperty('top');
      composer.style.removeProperty('left');
      composer.style.removeProperty('width');
      composer.style.transform = `translate3d(0, ${scrollParent.scrollTop || 0}px, 0)`;
      return;
    }

    setFlowSpacing(composer, anchor, true);
    const top = section.offsetTop + heading.offsetTop + heading.offsetHeight + 8;
    composer.style.setProperty('--zq-answer-flow-top', `${top}px`);
    composer.style.setProperty('--zq-answer-flow-left', `${section.offsetLeft}px`);
    composer.style.setProperty('--zq-answer-flow-width', `${section.offsetWidth}px`);
    composer.style.removeProperty('transform');
  }

  function cleanup() {
    document.querySelectorAll(`[${QUESTION_BACK_ATTR}]`).forEach((button) => button.remove());
    document.querySelectorAll(`[${COMPOSER_ATTR}]`).forEach((composer) => {
      const anchor = composer.__zqAnswerComposerContext?.anchor;
      setFlowSpacing(composer, anchor, false);
      composer.classList.remove('zq-answer-expanded');
      composer.classList.remove('zq-answer-flow', 'zq-answer-pinned');
      composer.style.removeProperty('transform');
      composer.style.removeProperty('top');
      composer.style.removeProperty('left');
      composer.style.removeProperty('width');
      composer.style.removeProperty('--zq-answer-flow-top');
      composer.style.removeProperty('--zq-answer-flow-left');
      composer.style.removeProperty('--zq-answer-flow-width');
      delete composer.__zqAnswerComposerContext;
      delete composer.__zqAnswerKeepFlow;
      composer.removeAttribute('data-zq-answer-keep-flow');
      composer.removeAttribute(COMPOSER_ATTR);
      composer.querySelectorAll('.zq-answer-collapsed-trigger, .zq-answer-collapse-button').forEach((button) => button.remove());
    });
    document.querySelectorAll(`[${SCROLL_ATTR}]`).forEach((node) => {
      if (node.__zqAnswerComposerScrollHandler) {
        node.removeEventListener('scroll', node.__zqAnswerComposerScrollHandler);
        delete node.__zqAnswerComposerScrollHandler;
      }
      node.removeAttribute(SCROLL_ATTR);
      node.removeAttribute('data-zhiqu-answer-expanded');
    });
  }

  function bindScrollPosition(composer, scrollParent) {
    if (!scrollParent) return;
    const anchor = findAnswerAnchor(composer);
    composer.__zqAnswerComposerContext = { scrollParent, anchor };
    const sync = () => {
      updateComposerPosition(composer, scrollParent, composer.__zqAnswerComposerContext?.anchor);
    };
    if (!scrollParent.__zqAnswerComposerScrollHandler) {
      scrollParent.__zqAnswerComposerScrollHandler = () => {
        const current = document.querySelector(`[${COMPOSER_ATTR}]`);
        if (current) updateComposerPosition(current, scrollParent, current.__zqAnswerComposerContext?.anchor);
      };
      scrollParent.addEventListener('scroll', scrollParent.__zqAnswerComposerScrollHandler, { passive: true });
    }
    sync();
  }

  function enhance() {
    if (!isQuestionDetailRoute()) {
      cleanup();
      return;
    }

    installStyles();
    ensureQuestionBackButton();
    const composer = findComposer();
    if (!composer) {
      renderPublishedAnswerImages();
      return;
    }
    composer.setAttribute(COMPOSER_ATTR, 'true');

    const scrollParent = findScrollParent(composer);
    if (scrollParent) {
      scrollParent.setAttribute(SCROLL_ATTR, 'true');
      bindScrollPosition(composer, scrollParent);
    }

    if (!composer.querySelector('.zq-answer-collapsed-trigger')) {
      const trigger = createButton('zq-answer-collapsed-trigger', '写下你的回答', '参与讨论，写下你的回答…');
      composer.insertBefore(trigger, composer.firstChild);
    }
    if (!composer.querySelector('.zq-answer-collapse-button')) {
      const collapse = createButton('zq-answer-collapse-button', '收起回答编辑器', '收起');
      composer.appendChild(collapse);
    }
    ensureImageTools(composer);
    renderPublishedAnswerImages();
  }

  function setExpanded(expanded) {
    const composer = document.querySelector(`[${COMPOSER_ATTR}]`);
    if (!composer) return;
    const keepFlow = expanded && composer.classList.contains('zq-answer-flow');
    composer.__zqAnswerKeepFlow = keepFlow;
    if (keepFlow) composer.setAttribute('data-zq-answer-keep-flow', 'true');
    else composer.removeAttribute('data-zq-answer-keep-flow');
    composer.classList.toggle('zq-answer-expanded', expanded);
    const scrollParent = document.querySelector(`[${SCROLL_ATTR}]`);
    scrollParent?.setAttribute('data-zhiqu-answer-expanded', String(expanded));
    const context = composer.__zqAnswerComposerContext;
    if (context) updateComposerPosition(composer, context.scrollParent, context.anchor);
    if (expanded) {
      requestAnimationFrame(() => document.querySelector('textarea[aria-label="回答正文"]')?.focus());
    }
  }

  document.addEventListener('click', (event) => {
    if (!isQuestionDetailRoute() || !(event.target instanceof Element)) return;
    if (event.target.closest('.zq-answer-collapsed-trigger')) {
      event.preventDefault();
      event.stopImmediatePropagation();
      setExpanded(true);
    } else if (event.target.closest('.zq-answer-collapse-button')) {
      event.preventDefault();
      event.stopImmediatePropagation();
      setExpanded(false);
    }
  }, true);

  document.addEventListener('keydown', (event) => {
    const modal = document.querySelector('.zq-answer-image-modal[data-open="true"]');
    if (event.key === 'Escape' && modal) {
      event.preventDefault();
      modal.removeAttribute('data-open');
    } else if (event.key === 'Escape' && document.querySelector(`[${COMPOSER_ATTR}].zq-answer-expanded`)) {
      event.preventDefault();
      setExpanded(false);
    }
  });

  function schedule() {
    if (!started || scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      enhance();
    });
  }

  const observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('popstate', schedule);

  function start() {
    if (started) return;
    started = true;
    globalThis.__zqHasAnswerImages = () => attachments.length > 0;
    globalThis.__zqPrepareAnswerBody = prepareAnswerBody;
    globalThis.__zqAnswerSubmitSuccess = clearAnswerImages;
    schedule();
  }

  if (document.readyState === 'complete') {
    setTimeout(start, 80);
  } else {
    window.addEventListener('load', () => setTimeout(start, 80), { once: true });
  }
})();
