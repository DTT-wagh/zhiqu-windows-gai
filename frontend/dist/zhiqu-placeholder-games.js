(() => {
  if (globalThis.__zqPlaceholderGamesInstalled) return;
  globalThis.__zqPlaceholderGamesInstalled = true;

  const placeholders = [
    {
      code: 'prompt-writer',
      title: '提示词小作家',
      duration: '语文 · 约 6 分钟',
      description: '观察 AI 怎样从一句话中提取对象、动作、地点和条件。',
      goal: '比较原始信息、AI 提取结果和一次信息变化。'
    },
    {
      code: 'image-detective',
      title: '图片侦探',
      duration: '艺术 · 约 7 分钟',
      description: '比较画面、视觉模型识别和自己的观察。',
      goal: '用主体、形状、位置和关系证据核对判断。'
    },
    {
      code: 'sound-conductor',
      title: '声音小指挥',
      duration: '音乐 · 约 6 分钟',
      description: '听 AI 怎样测量速度、力度、音色和节拍。',
      goal: '用可听见、可看见的声音特征说明依据。'
    },
    {
      code: 'route-and-conditions',
      title: '路线与条件',
      duration: '数学 · 约 7 分钟',
      description: '读取抽象地图的数字和限制，再比较候选路线。',
      goal: '用确定性计算核对 AI 生成的路线条件。'
    },
  ];

  let updateScheduled = false;
  let retryTimer = null;

  function isGamesRoute() {
    const communityRoute = /^\/community(?:\.html)?\/?$/.test(location.pathname);
    return communityRoute && new URLSearchParams(location.search).get('section') === 'games';
  }

  function isRendered(node) {
    if (!node || !node.isConnected) return false;
    const rect = node.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function findLeafDiv(text, excludedContainer) {
    return Array.from(document.querySelectorAll('div')).filter((node) =>
      node.children.length === 0 &&
      (node.textContent || '').trim() === text &&
      (!excludedContainer || !node.closest(excludedContainer))
    ).find(isRendered);
  }

  function updateCard(button, placeholder) {
    const textNodes = Array.from(button.querySelectorAll('div[dir="auto"]')).filter(
      (node) => node.children.length === 0
    );

    if (textNodes.length < 5) return false;

    textNodes[0].textContent = placeholder.title;
    textNodes[1].textContent = placeholder.duration;
    textNodes[2].textContent = placeholder.description;
    textNodes[3].textContent = placeholder.goal;
    textNodes[4].textContent = '单人游戏';

    button.setAttribute('aria-label', `${placeholder.title}，进入单人游戏`);
    button.removeAttribute('aria-disabled');
    button.tabIndex = 0;
    button.dataset.zhiquSinglePlayerCard = placeholder.code;
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      window.location.assign(`/single-player-game?game=${encodeURIComponent(placeholder.code)}`);
    });
    return true;
  }

  function addPlaceholderGames() {
    if (!isGamesRoute()) {
      document.querySelectorAll('[data-zhiqu-single-player-games]').forEach((section) => section.remove());
      return false;
    }

    const existingSections = Array.from(document.querySelectorAll('[data-zhiqu-single-player-games]'));
    const visibleExisting = existingSections.find(isRendered);
    existingSections.filter((section) => section !== visibleExisting).forEach((section) => section.remove());
    if (visibleExisting) return true;

    const originalHeading = findLeafDiv('四款 AI 实践游戏', '[data-zhiqu-single-player-games]');
    const originalSection = originalHeading?.parentElement?.parentElement;
    const publicHeading = findLeafDiv('公开房间');
    const publicSection = publicHeading?.parentElement?.parentElement;

    if (!originalSection || !publicSection || originalSection === publicSection) return false;

    const clonedSection = originalSection.cloneNode(true);
    const cards = Array.from(clonedSection.querySelectorAll('button'));
    if (cards.length !== placeholders.length) return false;

    if (!cards.every((card, index) => updateCard(card, placeholders[index]))) return false;

    clonedSection.dataset.zhiquSinglePlayerGames = 'true';
    clonedSection.setAttribute('role', 'region');
    clonedSection.setAttribute('aria-label', '四款 AI 单人观察游戏');
    clonedSection.querySelectorAll('[id]').forEach((node) => node.removeAttribute('id'));

    publicSection.parentElement.insertBefore(clonedSection, publicSection);
    return true;
  }

  function scheduleUpdate() {
    if (updateScheduled) return;
    updateScheduled = true;
    requestAnimationFrame(() => {
      updateScheduled = false;
      const updated = addPlaceholderGames();
      if (!updated && isGamesRoute()) {
        window.clearTimeout(retryTimer);
        retryTimer = window.setTimeout(scheduleUpdate, 160);
      }
    });
  }

  const observer = new MutationObserver(scheduleUpdate);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('popstate', scheduleUpdate);
  window.addEventListener('hashchange', scheduleUpdate);
  window.addEventListener('zqroutechange', scheduleUpdate);
  for (const method of ['pushState', 'replaceState']) {
    const original = history[method];
    history[method] = function (...args) {
      const result = original.apply(this, args);
      window.dispatchEvent(new Event('zqroutechange'));
      return result;
    };
  }
  scheduleUpdate();
})();
