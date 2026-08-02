(() => {
  const INPUT_SELECTOR = 'input[aria-label="生日"]';
  const ROOT_ID = 'zhiqu-birthday-wheel-root';
  const STYLE_ID = 'zhiqu-birthday-wheel-styles';
  const ROW_HEIGHT = 48;
  const VISIBLE_ROWS = 5;

  let activeInput = null;
  let previousFocus = null;
  let previousOverflow = null;
  let enhancementScheduled = false;

  function isEditRoute() {
    return /\/profile\/edit(?:\.html)?\/?$/.test(location.pathname);
  }

  function pad(value) {
    return String(value).padStart(2, '0');
  }

  function formatDate(year, month, day) {
    return `${year}-${pad(month)}-${pad(day)}`;
  }

  function daysInMonth(year, month) {
    return new Date(year, month, 0).getDate();
  }

  function parseDate(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '');
    const currentYear = new Date().getFullYear();
    const fallbackYear = Math.max(currentYear - 100, Math.min(2000, currentYear));
    if (!match) return { year: fallbackYear, month: 1, day: 1 };

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const minYear = currentYear - 100;
    if (year < minYear || year > currentYear || month < 1 || month > 12) {
      return { year: fallbackYear, month: 1, day: 1 };
    }

    return {
      year,
      month,
      day: Math.max(1, Math.min(day, daysInMonth(year, month))),
    };
  }

  function range(start, end) {
    return Array.from({ length: end - start + 1 }, (_, index) => start + index);
  }

  function installStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      ${INPUT_SELECTOR}[data-zhiqu-birthday-wheel] {
        padding-right: 46px !important;
        cursor: pointer !important;
        caret-color: transparent !important;
      }

      div:has(> ${INPUT_SELECTOR}[data-zhiqu-birthday-wheel])::after {
        content: "⌄";
        position: absolute;
        right: 16px;
        bottom: 13px;
        z-index: 1;
        color: #365c8d;
        font: 700 22px/22px Arial, sans-serif;
        pointer-events: none;
      }

      #${ROOT_ID} {
        position: fixed !important;
        inset: 0 !important;
        z-index: 2147483646 !important;
        display: flex !important;
        align-items: flex-end !important;
        justify-content: center !important;
        width: 100vw !important;
        height: 100vh !important;
        margin: 0 !important;
        padding: 0 !important;
        background: rgba(20, 29, 38, 0.48) !important;
        opacity: 0;
        backdrop-filter: blur(3px);
        -webkit-backdrop-filter: blur(3px);
        transition: opacity 180ms ease;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif;
      }

      #${ROOT_ID}.zq-birthday-open {
        opacity: 1;
      }

      #${ROOT_ID}.zq-birthday-closing {
        opacity: 0;
      }

      #${ROOT_ID} .zq-birthday-sheet {
        box-sizing: border-box;
        width: min(100%, 540px);
        max-height: calc(100vh - 24px);
        overflow: hidden;
        border-radius: 18px 18px 0 0;
        background: #fbfaf7;
        box-shadow: 0 -16px 48px rgba(21, 31, 40, 0.2);
        transform: translateY(22px);
        transition: transform 220ms ease;
      }

      #${ROOT_ID}.zq-birthday-open .zq-birthday-sheet {
        transform: translateY(0);
      }

      #${ROOT_ID} .zq-birthday-toolbar {
        box-sizing: border-box;
        display: grid;
        grid-template-columns: 72px minmax(0, 1fr) 72px;
        align-items: center;
        min-height: 58px;
        padding: 6px 12px;
        border-bottom: 1px solid #e5e0d6;
      }

      #${ROOT_ID} .zq-birthday-title {
        margin: 0;
        color: #26343c;
        font-size: 17px;
        font-weight: 800;
        line-height: 24px;
        text-align: center;
      }

      #${ROOT_ID} .zq-birthday-action {
        min-width: 64px;
        min-height: 42px;
        margin: 0;
        padding: 0 10px;
        border: 0;
        border-radius: 8px;
        background: transparent;
        cursor: pointer;
        font-size: 15px;
        font-weight: 700;
        line-height: 22px;
      }

      #${ROOT_ID} .zq-birthday-cancel {
        color: #6b7479;
        text-align: left;
      }

      #${ROOT_ID} .zq-birthday-confirm {
        color: #2f6097;
        text-align: right;
      }

      #${ROOT_ID} .zq-birthday-action:hover {
        background: #edf2f6;
      }

      #${ROOT_ID} .zq-birthday-action:focus-visible,
      #${ROOT_ID} .zq-birthday-wheel:focus-visible {
        outline: 2px solid #3a6d9f;
        outline-offset: -2px;
      }

      #${ROOT_ID} .zq-birthday-labels,
      #${ROOT_ID} .zq-birthday-wheels {
        display: grid;
        grid-template-columns: minmax(0, 1.35fr) minmax(0, 1fr) minmax(0, 1fr);
        gap: 8px;
      }

      #${ROOT_ID} .zq-birthday-labels {
        padding: 14px 22px 0;
      }

      #${ROOT_ID} .zq-birthday-label {
        color: #7b858a;
        font-size: 13px;
        font-weight: 700;
        line-height: 20px;
        text-align: center;
      }

      #${ROOT_ID} .zq-birthday-wheels {
        padding: 4px 22px max(18px, env(safe-area-inset-bottom));
      }

      #${ROOT_ID} .zq-birthday-wheel-shell {
        position: relative;
        min-width: 0;
        height: ${ROW_HEIGHT * VISIBLE_ROWS}px;
        overflow: hidden;
      }

      #${ROOT_ID} .zq-birthday-selection {
        position: absolute;
        top: ${ROW_HEIGHT * 2}px;
        right: 0;
        left: 0;
        height: ${ROW_HEIGHT}px;
        border-top: 1px solid #cdd8df;
        border-bottom: 1px solid #cdd8df;
        border-radius: 6px;
        background: rgba(226, 239, 248, 0.7);
        pointer-events: none;
      }

      #${ROOT_ID} .zq-birthday-wheel-shell::before,
      #${ROOT_ID} .zq-birthday-wheel-shell::after {
        content: "";
        position: absolute;
        right: 0;
        left: 0;
        z-index: 2;
        height: ${ROW_HEIGHT * 2}px;
        pointer-events: none;
      }

      #${ROOT_ID} .zq-birthday-wheel-shell::before {
        top: 0;
        background: linear-gradient(to bottom, #fbfaf7 10%, rgba(251, 250, 247, 0.2));
      }

      #${ROOT_ID} .zq-birthday-wheel-shell::after {
        bottom: 0;
        background: linear-gradient(to top, #fbfaf7 10%, rgba(251, 250, 247, 0.2));
      }

      #${ROOT_ID} .zq-birthday-wheel {
        position: relative;
        z-index: 1;
        box-sizing: border-box;
        width: 100%;
        height: ${ROW_HEIGHT * VISIBLE_ROWS}px;
        margin: 0;
        padding: ${ROW_HEIGHT * 2}px 0;
        overflow-x: hidden;
        overflow-y: auto;
        border: 0;
        border-radius: 6px;
        background: transparent;
        scrollbar-width: none;
        scroll-behavior: smooth;
        scroll-snap-type: y mandatory;
        overscroll-behavior: contain;
        -webkit-overflow-scrolling: touch;
      }

      #${ROOT_ID} .zq-birthday-wheel::-webkit-scrollbar {
        display: none;
      }

      #${ROOT_ID} .zq-birthday-option {
        box-sizing: border-box;
        display: flex;
        width: 100%;
        height: ${ROW_HEIGHT}px;
        align-items: center;
        justify-content: center;
        padding: 0 4px;
        color: #7c858a;
        cursor: pointer;
        font-size: 18px;
        font-weight: 500;
        line-height: ${ROW_HEIGHT}px;
        scroll-snap-align: center;
        transition: color 120ms ease, font-weight 120ms ease;
      }

      #${ROOT_ID} .zq-birthday-option[aria-selected="true"] {
        color: #23333d;
        font-size: 21px;
        font-weight: 800;
      }

      @media (min-width: 620px) {
        #${ROOT_ID} {
          padding: 12px !important;
        }

        #${ROOT_ID} .zq-birthday-sheet {
          margin-bottom: 0;
          border-radius: 18px;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        #${ROOT_ID},
        #${ROOT_ID} .zq-birthday-sheet {
          transition: none;
        }

        #${ROOT_ID} .zq-birthday-wheel {
          scroll-behavior: auto;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function enhanceBirthdayInput() {
    if (!isEditRoute()) return;
    const input = document.querySelector(INPUT_SELECTOR);
    if (!input || input.dataset.zhiquBirthdayWheel) return;

    installStyles();
    input.dataset.zhiquBirthdayWheel = 'true';
    input.readOnly = true;
    input.inputMode = 'none';
    input.setAttribute('inputmode', 'none');
    input.setAttribute('aria-haspopup', 'dialog');
    input.setAttribute('aria-expanded', 'false');
    input.setAttribute('autocomplete', 'off');
  }

  function scheduleEnhancement() {
    if (enhancementScheduled) return;
    enhancementScheduled = true;
    requestAnimationFrame(() => {
      enhancementScheduled = false;
      enhanceBirthdayInput();
    });
  }

  function restorePage() {
    if (previousOverflow) {
      document.documentElement.style.overflow = previousOverflow.html;
      document.body.style.overflow = previousOverflow.body;
      previousOverflow = null;
    }

    if (activeInput) activeInput.setAttribute('aria-expanded', 'false');
    if (previousFocus instanceof HTMLElement && document.contains(previousFocus)) {
      previousFocus.focus({ preventScroll: true });
    }
    previousFocus = null;
    activeInput = null;
  }

  function closePicker() {
    const root = document.getElementById(ROOT_ID);
    if (!root || root.classList.contains('zq-birthday-closing')) return;

    root.classList.add('zq-birthday-closing');
    root.classList.remove('zq-birthday-open');
    window.setTimeout(() => {
      root.remove();
      restorePage();
    }, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 180);
  }

  function setReactInputValue(input, value) {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    if (setter) setter.call(input, value);
    else input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function openPicker(input) {
    if (document.getElementById(ROOT_ID)) return;

    installStyles();
    activeInput = input;
    previousFocus = document.activeElement;
    previousOverflow = {
      html: document.documentElement.style.overflow,
      body: document.body.style.overflow,
    };
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    input.setAttribute('aria-expanded', 'true');

    const state = parseDate(input.value);
    const currentYear = new Date().getFullYear();
    const yearValues = range(currentYear - 100, currentYear);
    const monthValues = range(1, 12);

    const root = document.createElement('div');
    root.id = ROOT_ID;
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-labelledby', 'zhiqu-birthday-wheel-title');

    const sheet = document.createElement('div');
    sheet.className = 'zq-birthday-sheet';

    const toolbar = document.createElement('div');
    toolbar.className = 'zq-birthday-toolbar';

    const cancelButton = document.createElement('button');
    cancelButton.className = 'zq-birthday-action zq-birthday-cancel';
    cancelButton.type = 'button';
    cancelButton.textContent = '取消';

    const title = document.createElement('div');
    title.id = 'zhiqu-birthday-wheel-title';
    title.className = 'zq-birthday-title';
    title.textContent = '选择生日';

    const confirmButton = document.createElement('button');
    confirmButton.className = 'zq-birthday-action zq-birthday-confirm';
    confirmButton.type = 'button';
    confirmButton.textContent = '完成';

    toolbar.append(cancelButton, title, confirmButton);

    const labels = document.createElement('div');
    labels.className = 'zq-birthday-labels';
    ['年', '月', '日'].forEach((text) => {
      const label = document.createElement('div');
      label.className = 'zq-birthday-label';
      label.textContent = text;
      labels.appendChild(label);
    });

    const wheels = document.createElement('div');
    wheels.className = 'zq-birthday-wheels';
    const wheelRefs = {};
    const scrollTimers = {};

    function updateSelectedOption(wheel, selectedValue) {
      wheel.querySelectorAll('.zq-birthday-option').forEach((option) => {
        option.setAttribute('aria-selected', String(Number(option.dataset.value) === selectedValue));
      });
    }

    function syncWheel(kind) {
      const wheel = wheelRefs[kind];
      const values = wheel.zhiquValues || [];
      const index = Math.max(0, Math.min(values.length - 1, Math.round(wheel.scrollTop / ROW_HEIGHT)));
      const value = values[index];
      if (value == null) return;

      state[kind] = value;
      updateSelectedOption(wheel, value);
      wheel.setAttribute('aria-activedescendant', `zhiqu-birthday-${kind}-${value}`);

      if (kind === 'year' || kind === 'month') updateDayWheel();
    }

    function renderOptions(kind, values, selectedValue) {
      const wheel = wheelRefs[kind];
      wheel.zhiquValues = values;
      wheel.replaceChildren();

      values.forEach((value) => {
        const option = document.createElement('div');
        option.id = `zhiqu-birthday-${kind}-${value}`;
        option.className = 'zq-birthday-option';
        option.dataset.value = String(value);
        option.setAttribute('role', 'option');
        option.setAttribute('aria-selected', String(value === selectedValue));
        option.textContent = kind === 'year' ? String(value) : pad(value);
        wheel.appendChild(option);
      });

      const selectedIndex = Math.max(0, values.indexOf(selectedValue));
      const previousScrollBehavior = wheel.style.scrollBehavior;
      wheel.style.scrollBehavior = 'auto';
      wheel.scrollTop = selectedIndex * ROW_HEIGHT;
      requestAnimationFrame(() => {
        wheel.style.scrollBehavior = previousScrollBehavior;
      });
      wheel.setAttribute('aria-activedescendant', `zhiqu-birthday-${kind}-${values[selectedIndex]}`);
    }

    function updateDayWheel() {
      const maxDay = daysInMonth(state.year, state.month);
      state.day = Math.min(state.day, maxDay);
      renderOptions('day', range(1, maxDay), state.day);
    }

    function createWheel(kind, label) {
      const shell = document.createElement('div');
      shell.className = 'zq-birthday-wheel-shell';

      const selection = document.createElement('div');
      selection.className = 'zq-birthday-selection';

      const wheel = document.createElement('div');
      wheel.className = 'zq-birthday-wheel';
      wheel.tabIndex = 0;
      wheel.setAttribute('role', 'listbox');
      wheel.setAttribute('aria-label', label);
      wheel.dataset.kind = kind;
      wheelRefs[kind] = wheel;

      wheel.addEventListener('scroll', () => {
        window.clearTimeout(scrollTimers[kind]);
        scrollTimers[kind] = window.setTimeout(() => syncWheel(kind), 70);
      }, { passive: true });

      wheel.addEventListener('click', (event) => {
        const option = event.target.closest('.zq-birthday-option');
        if (!option) return;
        const values = wheel.zhiquValues || [];
        const index = values.indexOf(Number(option.dataset.value));
        if (index >= 0) wheel.scrollTo({ top: index * ROW_HEIGHT, behavior: 'smooth' });
      });

      wheel.addEventListener('keydown', (event) => {
        if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
        event.preventDefault();
        const values = wheel.zhiquValues || [];
        const currentIndex = Math.round(wheel.scrollTop / ROW_HEIGHT);
        const nextIndex = Math.max(0, Math.min(values.length - 1, currentIndex + (event.key === 'ArrowDown' ? 1 : -1)));
        wheel.scrollTo({ top: nextIndex * ROW_HEIGHT, behavior: 'smooth' });
      });

      shell.append(selection, wheel);
      wheels.appendChild(shell);
    }

    createWheel('year', '年份');
    createWheel('month', '月份');
    createWheel('day', '日期');

    sheet.append(toolbar, labels, wheels);
    root.appendChild(sheet);
    document.body.appendChild(root);

    renderOptions('year', yearValues, state.year);
    renderOptions('month', monthValues, state.month);
    renderOptions('day', range(1, daysInMonth(state.year, state.month)), state.day);

    cancelButton.addEventListener('click', closePicker);
    confirmButton.addEventListener('click', () => {
      Object.keys(wheelRefs).forEach(syncWheel);
      setReactInputValue(input, formatDate(state.year, state.month, state.day));
      closePicker();
    });
    root.addEventListener('click', (event) => {
      if (event.target === root) closePicker();
    });

    requestAnimationFrame(() => root.classList.add('zq-birthday-open'));
    confirmButton.focus({ preventScroll: true });
  }

  document.addEventListener('click', (event) => {
    if (!isEditRoute() || !(event.target instanceof Element)) return;
    const input = event.target.closest(INPUT_SELECTOR);
    if (!input) return;
    event.preventDefault();
    input.blur();
    openPicker(input);
  }, true);

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && document.getElementById(ROOT_ID)) {
      closePicker();
      return;
    }

    if ((event.key === 'Enter' || event.key === ' ') && event.target?.matches?.(INPUT_SELECTOR)) {
      event.preventDefault();
      openPicker(event.target);
    }
  });

  const observer = new MutationObserver(scheduleEnhancement);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  scheduleEnhancement();
})();
