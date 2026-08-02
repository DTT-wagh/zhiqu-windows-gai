(() => {
  const placeholders = [
    { title: '新游戏一', duration: '内容筹备中' },
    { title: '新游戏二', duration: '内容筹备中' },
    { title: '新游戏三', duration: '内容筹备中' },
    { title: '新游戏四', duration: '内容筹备中' },
  ];

  let updateScheduled = false;

  function isGamesRoute() {
    const communityRoute = location.pathname.endsWith('/community') || location.pathname.endsWith('/community.html');
    return communityRoute && new URLSearchParams(location.search).get('section') === 'games';
  }

  function findLeafDiv(text, excludedContainer) {
    return Array.from(document.querySelectorAll('div')).find((node) =>
      node.children.length === 0 &&
      (node.textContent || '').trim() === text &&
      (!excludedContainer || !node.closest(excludedContainer))
    );
  }

  function updateCard(button, placeholder) {
    const textNodes = Array.from(button.querySelectorAll('div[dir="auto"]')).filter(
      (node) => node.children.length === 0
    );

    if (textNodes.length < 5) return false;

    textNodes[0].textContent = placeholder.title;
    textNodes[1].textContent = placeholder.duration;
    textNodes[2].textContent = '玩法内容待定，新的 AI 实践挑战正在设计中。';
    textNodes[3].textContent = '通过观察、提问和验证，在游戏中练习使用 AI。';
    textNodes[4].textContent = '敬请期待';

    button.setAttribute('aria-label', `${placeholder.title}，敬请期待`);
    button.setAttribute('aria-disabled', 'true');
    button.tabIndex = -1;
    button.dataset.zhiquPlaceholderCard = 'true';
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    return true;
  }

  function addPlaceholderGames() {
    if (!isGamesRoute()) {
      document.querySelectorAll('[data-zhiqu-placeholder-games]').forEach((section) => section.remove());
      return false;
    }

    if (document.querySelector('[data-zhiqu-placeholder-games]')) return true;

    const originalHeading = findLeafDiv('四款 AI 实践游戏', '[data-zhiqu-placeholder-games]');
    const originalSection = originalHeading?.parentElement?.parentElement;
    const publicHeading = findLeafDiv('公开房间');
    const publicSection = publicHeading?.parentElement?.parentElement;

    if (!originalSection || !publicSection || originalSection === publicSection) return false;

    const clonedSection = originalSection.cloneNode(true);
    const cards = Array.from(clonedSection.querySelectorAll('button'));
    if (cards.length !== placeholders.length) return false;

    if (!cards.every((card, index) => updateCard(card, placeholders[index]))) return false;

    clonedSection.dataset.zhiquPlaceholderGames = 'true';
    clonedSection.setAttribute('role', 'region');
    clonedSection.setAttribute('aria-label', '四款 AI 实践游戏，内容筹备中');
    clonedSection.querySelectorAll('[id]').forEach((node) => node.removeAttribute('id'));

    publicSection.parentElement.insertBefore(clonedSection, publicSection);
    return true;
  }

  function scheduleUpdate() {
    if (updateScheduled) return;
    updateScheduled = true;
    requestAnimationFrame(() => {
      updateScheduled = false;
      addPlaceholderGames();
    });
  }

  const observer = new MutationObserver(scheduleUpdate);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('popstate', scheduleUpdate);
  scheduleUpdate();
})();
