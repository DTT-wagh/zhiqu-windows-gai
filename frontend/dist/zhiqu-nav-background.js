(() => {
  const STYLE_ID = 'zhiqu-nav-background-fix';
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = [
    '.zq-ai-composer{background:#f7f4ec!important}',
    '.zq-ai-global-nav{box-shadow:none!important}',
    '@media (min-width:761px){.zq-ai-sidebar{margin-bottom:calc(-1 * var(--zq-ai-nav-height))!important}}'
  ].join('');
  document.head.appendChild(style);
})();
