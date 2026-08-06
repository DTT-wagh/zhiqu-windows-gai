(() => {
  if (globalThis.__zqVideoControlsInstalled) return;
  globalThis.__zqVideoControlsInstalled = true;

  const SPEED_LABELS = ['0.75x', '1x', '1.25x', '1.5x', '2x'];
  const instances = new WeakMap();
  let scanScheduled = false;

  function formatTime(value) {
    if (!Number.isFinite(value) || value < 0) return '00:00';
    const total = Math.floor(value);
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;
    if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  function findControlsRoot(video) {
    const host = video.parentElement;
    const wrapper = host?.parentElement;
    if (!host || !wrapper) return null;
    return Array.from(wrapper.children).find((child) => child !== host && child.querySelector('button')) || null;
  }

  function nativeSubtitleOptions(video) {
    const tracks = Array.from(video.textTracks || []);
    const labels = tracks.map((track, index) => track.label || track.language || `字幕 ${index + 1}`);
    return labels.length ? ['关闭', ...labels] : [];
  }

  function capabilitiesFor(video) {
    const provider = globalThis.__zqVideoControlProvider;
    let supplied = {};
    if (typeof provider === 'function') {
      try { supplied = provider(video) || {}; } catch {}
    }
    return {
      qualityOptions: Array.isArray(supplied.qualityOptions) ? supplied.qualityOptions.map(String) : [],
      currentQuality: supplied.currentQuality || '',
      setQuality: typeof supplied.setQuality === 'function' ? supplied.setQuality : null,
      subtitleOptions: Array.isArray(supplied.subtitleOptions)
        ? supplied.subtitleOptions.map(String)
        : nativeSubtitleOptions(video),
      currentSubtitle: supplied.currentSubtitle || '',
      setSubtitle: typeof supplied.setSubtitle === 'function' ? supplied.setSubtitle : null,
    };
  }

  function createElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text != null) element.textContent = text;
    return element;
  }

  function createButton(className, label, text) {
    const button = createElement('button', className, text);
    button.type = 'button';
    button.setAttribute('aria-label', label);
    return button;
  }

  function addStyles() {
    if (document.getElementById('zq-video-controls-style')) return;
    const style = document.createElement('style');
    style.id = 'zq-video-controls-style';
    style.textContent = `
      .zq-video-host { position: relative !important; }
      .zq-video-host > video { cursor: pointer; }
      .zq-video-host > video::-webkit-media-controls { display: none !important; }
      .zq-video-original-controls { display: none !important; }
      .zq-video-controls {
        position: absolute;
        z-index: 10;
        left: 0;
        right: 0;
        bottom: 0;
        box-sizing: border-box;
        padding: 30px 12px 9px;
        color: #f8fafc;
        background: linear-gradient(180deg, rgba(9, 14, 24, 0), rgba(9, 14, 24, .9) 70%);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        opacity: 1;
        transition: opacity .18s ease;
        user-select: none;
      }
      .zq-video-controls.is-hidden { opacity: 0; pointer-events: none; }
      .zq-video-progress-row { display: flex; align-items: center; height: 18px; }
      .zq-video-progress {
        width: 100%;
        height: 4px;
        margin: 0;
        cursor: pointer;
        accent-color: #ef4f86;
      }
      .zq-video-progress::-webkit-slider-runnable-track { height: 4px; border-radius: 99px; background: linear-gradient(90deg, #ef4f86 var(--zq-progress, 0%), rgba(255,255,255,.32) var(--zq-progress, 0%)); }
      .zq-video-progress::-webkit-slider-thumb { width: 12px; height: 12px; margin-top: -4px; border: 2px solid #fff; border-radius: 50%; background: #ef4f86; appearance: none; }
      .zq-video-progress::-moz-range-track { height: 4px; border-radius: 99px; background: rgba(255,255,255,.32); }
      .zq-video-progress::-moz-range-progress { height: 4px; border-radius: 99px; background: #ef4f86; }
      .zq-video-progress::-moz-range-thumb { width: 10px; height: 10px; border: 2px solid #fff; border-radius: 50%; background: #ef4f86; }
      .zq-video-control-row { display: flex; align-items: center; gap: 4px; min-height: 34px; }
      .zq-video-left-controls, .zq-video-right-controls { display: flex; align-items: center; gap: 3px; }
      .zq-video-right-controls { margin-left: auto; }
      .zq-video-control-button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 34px;
        height: 32px;
        padding: 0 7px;
        border: 0;
        border-radius: 4px;
        color: inherit;
        background: transparent;
        font: inherit;
        font-size: 12px;
        font-weight: 650;
        line-height: 1;
        cursor: pointer;
      }
      .zq-video-control-button:hover, .zq-video-control-button:focus-visible { background: rgba(255,255,255,.18); outline: none; }
      .zq-video-play-button { font-size: 21px; }
      .zq-video-icon-button { font-size: 18px; }
      .zq-video-time { min-width: 86px; padding: 0 5px; color: rgba(255,255,255,.92); font-size: 12px; font-variant-numeric: tabular-nums; white-space: nowrap; }
      .zq-video-menu {
        position: absolute;
        right: 8px;
        bottom: 53px;
        display: flex;
        flex-direction: column;
        min-width: 92px;
        max-width: min(220px, calc(100% - 16px));
        padding: 5px;
        border: 1px solid rgba(255,255,255,.2);
        border-radius: 7px;
        background: rgba(12, 20, 34, .96);
        box-shadow: 0 8px 24px rgba(0,0,0,.28);
      }
      .zq-video-menu[hidden] { display: none; }
      .zq-video-menu-speed { right: 70px; }
      .zq-video-menu-quality { right: 8px; }
      .zq-video-menu button { min-height: 32px; padding: 0 11px; border: 0; border-radius: 4px; color: #eaf0f7; background: transparent; font: inherit; font-size: 12px; text-align: left; cursor: pointer; white-space: nowrap; }
      .zq-video-menu button:hover, .zq-video-menu button:focus-visible, .zq-video-menu button.is-active { color: #fff; background: rgba(239,79,134,.78); outline: none; }
      .zq-video-choice { display: inline-flex; align-items: center; gap: 4px; }
      .zq-video-choice strong { font-size: 11px; font-weight: 500; opacity: .9; }
      .zq-video-volume-control { position: relative; display: flex; align-items: center; }
      .zq-video-volume-panel {
        position: absolute;
        left: 50%;
        bottom: 36px;
        display: flex;
        flex-direction: column;
        align-items: center;
        width: 54px;
        height: 126px;
        padding: 9px 0 8px;
        border: 1px solid rgba(255,255,255,.2);
        border-radius: 7px;
        background: rgba(12, 20, 34, .96);
        box-shadow: 0 8px 24px rgba(0,0,0,.3);
        transform: translateX(-50%);
      }
      .zq-video-volume-panel[hidden] { display: none; }
      .zq-video-volume-value { min-height: 20px; color: #fff; font-size: 12px; font-weight: 700; font-variant-numeric: tabular-nums; line-height: 20px; }
      .zq-video-volume-slider {
        width: 18px;
        height: 82px;
        margin: 5px 0 0;
        accent-color: #ef4f86;
        cursor: pointer;
        direction: rtl;
        writing-mode: vertical-lr;
        -webkit-appearance: slider-vertical;
        appearance: slider-vertical;
      }
      @media (max-width: 560px) {
        .zq-video-controls { padding: 26px 7px 6px; }
        .zq-video-control-row { gap: 1px; }
        .zq-video-control-button { min-width: 29px; height: 29px; padding: 0 4px; font-size: 10px; }
        .zq-video-play-button { font-size: 18px; }
        .zq-video-icon-button { font-size: 16px; }
        .zq-video-time { min-width: 70px; padding: 0 3px; font-size: 10px; }
        .zq-video-choice { gap: 2px; }
        .zq-video-choice strong { font-size: 9px; }
        .zq-video-menu { bottom: 47px; }
        .zq-video-menu-speed { right: 53px; }
        .zq-video-volume-panel { bottom: 33px; width: 50px; height: 120px; }
      }
    `;
    document.head.appendChild(style);
  }

  function install(video) {
    if (!(video instanceof HTMLVideoElement)) return;
    const host = video.parentElement;
    if (!host) return;
    const existing = Array.from(host.children).find((child) => child.classList?.contains('zq-video-controls'));
    if (existing && instances.has(video)) {
      video.controls = false;
      video.removeAttribute('controls');
      return;
    }

    const controlsRoot = findControlsRoot(video);
    const capabilities = capabilitiesFor(video);
    const qualityOptions = capabilities.qualityOptions;
    const speedOptions = SPEED_LABELS;
    const subtitleOptions = capabilities.subtitleOptions;
    const initialQuality = capabilities.currentQuality || qualityOptions[0] || '';
    const rateLabel = speedOptions.find((label) => Math.abs(Number.parseFloat(label) - video.playbackRate) < 0.01);
    const initialSpeed = rateLabel || '1x';
    const initialSubtitle = capabilities.currentSubtitle || subtitleOptions[0] || '';

    addStyles();
    host.classList.add('zq-video-host');
    video.controls = false;
    video.removeAttribute('controls');
    if (controlsRoot) {
      controlsRoot.classList.add('zq-video-original-controls');
      controlsRoot.setAttribute('aria-hidden', 'true');
    }

    const overlay = createElement('div', 'zq-video-controls');
    overlay.setAttribute('role', 'group');
    overlay.setAttribute('aria-label', '视频控制栏');
    const progressRow = createElement('div', 'zq-video-progress-row');
    const progress = createElement('input', 'zq-video-progress');
    progress.type = 'range';
    progress.min = '0';
    progress.max = '1000';
    progress.step = '1';
    progress.value = '0';
    progress.setAttribute('aria-label', '视频进度');
    progressRow.appendChild(progress);

    const row = createElement('div', 'zq-video-control-row');
    const left = createElement('div', 'zq-video-left-controls');
    const play = createButton('zq-video-control-button zq-video-play-button', '播放', '▶');
    const time = createElement('span', 'zq-video-time', '00:00 / 00:00');
    left.append(play, time);
    const right = createElement('div', 'zq-video-right-controls');
    const volume = createButton('zq-video-control-button zq-video-icon-button', '音量，当前 100', '🔊');
    const volumeControl = createElement('div', 'zq-video-volume-control');
    const volumePanel = createElement('div', 'zq-video-volume-panel');
    volumePanel.hidden = true;
    volumePanel.setAttribute('role', 'group');
    volumePanel.setAttribute('aria-label', '音量设置');
    const volumeValue = createElement('span', 'zq-video-volume-value', '100');
    const volumeSlider = createElement('input', 'zq-video-volume-slider');
    volumeSlider.type = 'range';
    volumeSlider.min = '0';
    volumeSlider.max = '100';
    volumeSlider.step = '1';
    volumeSlider.value = '100';
    volumeSlider.setAttribute('aria-label', '音量');
    volumeSlider.setAttribute('orient', 'vertical');
    volumePanel.append(volumeValue, volumeSlider);
    volumeControl.append(volume, volumePanel);
    const subtitle = subtitleOptions.length ? createButton('zq-video-control-button zq-video-choice', '字幕', '字幕') : null;
    const quality = qualityOptions.length ? createButton('zq-video-control-button zq-video-choice', '清晰度', '清晰度') : null;
    const speed = createButton('zq-video-control-button zq-video-choice', '倍速', '倍速');
    const fullscreen = createButton('zq-video-control-button zq-video-icon-button', '全屏', '⛶');
    if (subtitle) right.appendChild(subtitle);
    if (quality) right.appendChild(quality);
    right.append(speed, volumeControl, fullscreen);
    row.append(left, right);
    overlay.append(progressRow, row);

    const menus = {};
    function createMenu(type, options) {
      if (!options.length) return null;
      const menu = createElement('div', `zq-video-menu zq-video-menu-${type}`);
      menu.hidden = true;
      menu.setAttribute('role', 'menu');
      options.forEach((option) => {
        const item = createButton('', option, option);
        item.dataset.option = option;
        item.setAttribute('role', 'menuitem');
        menu.appendChild(item);
      });
      overlay.appendChild(menu);
      menus[type] = menu;
      return menu;
    }
    createMenu('quality', qualityOptions);
    createMenu('speed', speedOptions);
    createMenu('subtitle', subtitleOptions);
    host.appendChild(overlay);

    const state = { currentQuality: initialQuality, currentSpeed: initialSpeed, currentSubtitle: initialSubtitle, hideTimer: null, volumeHideTimer: null };
    function updateProgress() {
      const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
      const current = Number.isFinite(video.currentTime) ? video.currentTime : 0;
      const ratio = duration ? Math.min(1, Math.max(0, current / duration)) : 0;
      progress.value = String(Math.round(ratio * 1000));
      progress.style.setProperty('--zq-progress', `${ratio * 100}%`);
      time.textContent = `${formatTime(current)} / ${formatTime(duration)}`;
    }
    function updatePlayButton() {
      const paused = video.paused || video.ended;
      play.textContent = paused ? '▶' : '❚❚';
      play.setAttribute('aria-label', paused ? '播放' : '暂停');
    }
    function updateVolumeButton() {
      const level = video.muted ? 0 : Math.round(video.volume * 100);
      volume.textContent = level === 0 ? '🔇' : level < 50 ? '🔉' : '🔊';
      volume.setAttribute('aria-label', `音量，当前 ${level}`);
      volume.setAttribute('title', `音量 ${level}`);
      volumeValue.textContent = String(level);
      volumeSlider.value = String(level);
    }
    function setChoice(button, title, value) {
      if (!button) return;
      button.replaceChildren();
      const label = createElement('strong', '', title);
      const selected = createElement('span', '', value || '自动');
      button.append(label, selected);
    }
    function setActive(menu, value) {
      if (!menu) return;
      Array.from(menu.querySelectorAll('button')).forEach((item) => item.classList.toggle('is-active', item.dataset.option === value));
    }
    function closeMenus() {
      Object.values(menus).forEach((menu) => { if (menu) menu.hidden = true; });
    }
    function closeVolumePanel() {
      volumePanel.hidden = true;
      if (state.volumeHideTimer) window.clearTimeout(state.volumeHideTimer);
    }
    function openVolumePanel() {
      closeMenus();
      volumePanel.hidden = false;
      if (state.volumeHideTimer) window.clearTimeout(state.volumeHideTimer);
    }
    function scheduleVolumePanelClose() {
      if (state.volumeHideTimer) window.clearTimeout(state.volumeHideTimer);
      state.volumeHideTimer = window.setTimeout(closeVolumePanel, 220);
    }
    function showMenu(type) {
      const menu = menus[type];
      if (!menu) return;
      const wasHidden = menu.hidden;
      closeMenus();
      closeVolumePanel();
      menu.hidden = !wasHidden;
    }
    function showControls() {
      overlay.classList.remove('is-hidden');
      if (state.hideTimer) window.clearTimeout(state.hideTimer);
      if (!video.paused && !video.ended) state.hideTimer = window.setTimeout(() => { closeMenus(); closeVolumePanel(); overlay.classList.add('is-hidden'); }, 2600);
    }
    function togglePlay() {
      if (video.paused || video.ended) video.play().catch(() => {});
      else video.pause();
      showControls();
    }
    function toggleFullscreen() {
      if (document.fullscreenElement === host) document.exitFullscreen?.();
      else if (host.requestFullscreen) host.requestFullscreen().catch(() => {});
      else if (video.webkitEnterFullscreen) video.webkitEnterFullscreen();
    }
    function chooseQuality(value) {
      state.currentQuality = value;
      try { capabilities.setQuality?.(value); } catch {}
      setChoice(quality, '清晰度', value);
      setActive(menus.quality, value);
      closeMenus();
      closeVolumePanel();
      showControls();
    }
    function chooseSpeed(value) {
      const rate = Number.parseFloat(value);
      if (Number.isFinite(rate)) video.playbackRate = rate;
      state.currentSpeed = value;
      setChoice(speed, '倍速', value);
      setActive(menus.speed, value);
      closeMenus();
      closeVolumePanel();
      showControls();
    }
    function chooseSubtitle(value) {
      state.currentSubtitle = value;
      try {
        if (capabilities.setSubtitle) {
          capabilities.setSubtitle(value);
        } else {
          const tracks = Array.from(video.textTracks || []);
          tracks.forEach((track, index) => {
            const label = track.label || track.language || `字幕 ${index + 1}`;
            track.mode = value !== '关闭' && label === value ? 'showing' : 'disabled';
          });
        }
      } catch {}
      setChoice(subtitle, '字幕', value);
      setActive(menus.subtitle, value);
      closeMenus();
      closeVolumePanel();
      showControls();
    }

    play.addEventListener('click', (event) => { event.stopPropagation(); togglePlay(); });
    volume.addEventListener('click', (event) => {
      event.stopPropagation();
      if (volumePanel.hidden) openVolumePanel();
      else closeVolumePanel();
      showControls();
    });
    volumeControl.addEventListener('pointerenter', (event) => {
      if (!event.pointerType || event.pointerType === 'mouse') openVolumePanel();
    });
    volumeControl.addEventListener('pointerleave', (event) => {
      if (!event.pointerType || event.pointerType === 'mouse') scheduleVolumePanelClose();
    });
    volumeControl.addEventListener('focusout', (event) => {
      if (!volumeControl.contains(event.relatedTarget)) closeVolumePanel();
    });
    volumeSlider.addEventListener('input', (event) => {
      event.stopPropagation();
      const level = Math.min(100, Math.max(0, Number(volumeSlider.value)));
      video.volume = level / 100;
      video.muted = level === 0;
      updateVolumeButton();
      openVolumePanel();
      showControls();
    });
    volumeSlider.addEventListener('pointerdown', (event) => { event.stopPropagation(); openVolumePanel(); showControls(); });
    fullscreen.addEventListener('click', (event) => { event.stopPropagation(); toggleFullscreen(); showControls(); });
    if (quality) quality.addEventListener('click', (event) => { event.stopPropagation(); showMenu('quality'); showControls(); });
    speed.addEventListener('click', (event) => { event.stopPropagation(); showMenu('speed'); showControls(); });
    if (subtitle) subtitle.addEventListener('click', (event) => { event.stopPropagation(); showMenu('subtitle'); showControls(); });
    Object.entries(menus).forEach(([type, menu]) => {
      if (!menu) return;
      menu.addEventListener('click', (event) => {
        const item = event.target.closest('button[data-option]');
        if (!item) return;
        event.stopPropagation();
        if (type === 'quality') chooseQuality(item.dataset.option);
        if (type === 'speed') chooseSpeed(item.dataset.option);
        if (type === 'subtitle') chooseSubtitle(item.dataset.option);
      });
    });
    progress.addEventListener('pointerdown', (event) => { event.stopPropagation(); showControls(); });
    progress.addEventListener('input', () => {
      const duration = Number.isFinite(video.duration) ? video.duration : 0;
      if (duration > 0) video.currentTime = duration * (Number(progress.value) / 1000);
      updateProgress();
    });
    video.addEventListener('click', togglePlay);
    video.addEventListener('dblclick', toggleFullscreen);
    host.addEventListener('pointermove', showControls);
    host.addEventListener('pointerdown', showControls);
    video.addEventListener('timeupdate', updateProgress);
    video.addEventListener('durationchange', updateProgress);
    video.addEventListener('loadedmetadata', updateProgress);
    video.addEventListener('play', () => { updatePlayButton(); showControls(); });
    video.addEventListener('pause', () => { updatePlayButton(); showControls(); });
    video.addEventListener('ended', () => { updatePlayButton(); showControls(); });
    video.addEventListener('volumechange', updateVolumeButton);

    if (quality) setChoice(quality, '清晰度', state.currentQuality || qualityOptions[0]);
    setChoice(speed, '倍速', state.currentSpeed || '1x');
    if (subtitle) setChoice(subtitle, '字幕', state.currentSubtitle || subtitleOptions[0]);
    setActive(menus.quality, state.currentQuality);
    setActive(menus.speed, state.currentSpeed);
    setActive(menus.subtitle, state.currentSubtitle);
    updateProgress();
    updatePlayButton();
    updateVolumeButton();
    instances.set(video, { overlay, controlsRoot });
    showControls();
  }

  function scan() {
    scanScheduled = false;
    document.querySelectorAll('video').forEach(install);
  }

  function scheduleScan() {
    if (scanScheduled) return;
    scanScheduled = true;
    window.requestAnimationFrame(scan);
  }

  const observer = new MutationObserver(scheduleScan);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('zqroutechange', scheduleScan);
  window.addEventListener('popstate', scheduleScan);
  window.addEventListener('hashchange', scheduleScan);
  for (const method of ['pushState', 'replaceState']) {
    const original = history[method];
    if (original.__zqVideoControlsWrapped) continue;
    const wrapped = function (...args) {
      const result = original.apply(this, args);
      window.dispatchEvent(new Event('zqroutechange'));
      return result;
    };
    wrapped.__zqVideoControlsWrapped = true;
    history[method] = wrapped;
  }
  scheduleScan();
})();
